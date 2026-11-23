// Command blindtest is the decision engine's honest report card: freeze the
// verdicts the engine would have given on a past date, then score them against
// what actually happened. Run from stock-api/:
//
//	go run ./research/blindtest analyze  -cutoff 2025-11-28   verdicts from bars <= cutoff → research/frozen/<cutoff>.json
//	go run ./research/blindtest validate -cutoff 2025-11-28   score the frozen verdicts against later bars
//	go run ./research/blindtest export                        engine on every bar of every stock → research/out/export.csv
//
// analyze never reads a bar after the cutoff (the calibration table and the
// projection bands are rebuilt from bars <= cutoff too) and refuses to
// overwrite an existing frozen file: a pre-registered prediction is never
// edited after the fact. validate never re-runs the engine. Broker flow and
// valuation are left out (no point-in-time copy of either exists).
// export feeds research/panel.py + research/research.py.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"stock-api/analysis"
	"stock-api/fetcher"
	"stock-api/models"
)

const (
	minTurnover = 2.0 // Rp bn/day, same default as the screener / cek-ombak
	frozenDir   = "research/frozen"
	outDir      = "research/out"
)

var (
	dataDir = "data"
	cutoff  = "2025-11-28"
)

type Row struct {
	Symbol     string                `json:"symbol"`
	Close      float64               `json:"close"`
	Signal     string                `json:"signal"`
	Score      int                   `json:"score"`
	Confidence int                   `json:"confidence"`
	Trend      analysis.TrendSet     `json:"trend"`
	Structure  string                `json:"structure"`
	Volume     string                `json:"volume_state"`
	EntryLow   float64               `json:"entry_low"`
	EntryHigh  float64               `json:"entry_high"`
	EntryIdeal float64               `json:"entry_ideal"`
	Stop       float64               `json:"stop"`
	Target     float64               `json:"target"`
	RR         float64               `json:"risk_reward"`
	TurnoverBn float64               `json:"turnover_bn"`
	ATRPct     float64               `json:"atr_pct"`
	Candidate  bool                  `json:"candidate"`           // Saran BUY (weighted-engine freezes: BUY/STRONG_BUY, R/R >= 1)
	BaseStop   float64               `json:"base_stop,omitempty"` // ATR plan for every stock (analysis.SaranPlan) = random-entry baseline
	BaseTarget float64               `json:"base_target,omitempty"`
	Calib      *analysis.CalibLookup `json:"calibration"`
	Stock      *analysis.CalibStat   `json:"stock_record"`
	Proj       []analysis.ProjView   `json:"projection"`
}

type Frozen struct {
	Cutoff   string                         `json:"cutoff"`
	MadeAt   string                         `json:"made_at"`
	IHSG     map[string]float64             `json:"ihsg"`
	Regime   string                         `json:"regime"`
	BuyCalls map[string]*analysis.CalibStat `json:"buy_calls_asof_cutoff"`
	Counts   map[string]int                 `json:"counts"`
	Rows     []Row                          `json:"rows"`
	Excluded []string                       `json:"excluded"` // no data / <60 bars at cutoff
	Criteria []string                       `json:"criteria"`
}

// criteria for Saran freezes (from 2026-11-30), fixed in docs/DECISIONS.md on
// 2026-11-23 before any result. Older frozen files carry their own criteria
// (K1–K6 of the weighted engine) inside the file.
var criteria = []string{
	"S1: gabungan freeze 30 Nov 2026, 31 Des 2026, 30 Jan 2027 berisi >= 30 saran Tren naik (BUY); kurang dari 30 -> diperpanjang per bulan, bukan diputuskan",
	"S2: rencana Tren naik (entry open besok, stop -1,5 ATR, target +3 ATR, timeout 20 bar, biaya 0,4%): rata-rata hasil > 0",
	"S3: rata-rata hasil S2 > rata-rata rencana yang sama pada semua saham likuid di tanggal yang sama (entry acak, base_stop/base_target)",
	"LULUS = S1 dan S2 dan S3. GAGAL -> saran diganti fakta saja (tanpa label saran)",
}

func frozenPath() string { return filepath.Join(frozenDir, cutoff+".json") }

func loadAll() map[string][]models.StockPrice {
	out := map[string][]models.StockPrice{}
	files, _ := filepath.Glob(filepath.Join(dataDir, "*.json"))
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var d models.StockData
		if json.Unmarshal(b, &d) != nil || len(d.Prices) == 0 {
			continue
		}
		out[strings.TrimSuffix(filepath.Base(f), ".json")] = d.Prices
	}
	return out
}

// upto returns bars with Date <= date.
func upto(p []models.StockPrice, date string) []models.StockPrice {
	i := sort.Search(len(p), func(i int) bool { return p[i].Date > date })
	return p[:i]
}

func turnover(p []models.StockPrice, n int) float64 {
	n = min(n, len(p))
	var s float64
	for _, x := range p[len(p)-n:] {
		s += x.Close * float64(x.Volume)
	}
	return s / float64(n) / 1e9
}

// jkse fetches ^JKSE since 2020 and caches it in research/out/jkse.json (the
// Python panel reads it); the cache is the fallback when Yahoo is unreachable.
func jkse() []models.StockPrice {
	cache := filepath.Join(outDir, "jkse.json")
	p, _, err := fetcher.Fetch("^JKSE", time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC))
	if err == nil && len(p) > 0 {
		os.MkdirAll(outDir, 0o755)
		b, _ := json.Marshal(p)
		os.WriteFile(cache, b, 0o644)
		return p
	}
	b, rerr := os.ReadFile(cache)
	if rerr == nil && json.Unmarshal(b, &p) == nil && len(p) > 0 {
		return p
	}
	fail("fetch ^JKSE: %v", err)
	return nil
}

func pct(a, b float64) float64 { return (b/a - 1) * 100 }

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
	os.Exit(1)
}

func analyze() {
	if _, err := os.Stat(frozenPath()); err == nil {
		fail("%s already exists — a frozen prediction is never overwritten. Pick another -cutoff or delete it on purpose.", frozenPath())
	}
	all := loadAll()
	idx := upto(jkse(), cutoff)
	if len(idx) < 70 {
		fail("not enough ^JKSE bars before %s", cutoff)
	}
	cut := idx[len(idx)-1]
	regimeFn := analysis.IndexRegime(idx)
	regime := regimeFn(cut.Date)
	sma50 := analysis.SMA(idx, 50)
	ihsg := map[string]float64{
		"close": cut.Close, "sma50": sma50[len(sma50)-1].Value,
		"chg_1m_pct": pct(idx[len(idx)-21].Close, cut.Close),
		"chg_3m_pct": pct(idx[len(idx)-64].Close, cut.Close),
	}
	if prev := upto(idx, fmt.Sprintf("%d-12-31", mustYear(cut.Date)-1)); len(prev) > 0 {
		ihsg["chg_ytd_pct"] = pct(prev[len(prev)-1].Close, cut.Close)
	}
	hi, lo := 0.0, math.MaxFloat64
	for _, x := range idx[max(0, len(idx)-250):] {
		hi, lo = math.Max(hi, x.High), math.Min(lo, x.Low)
	}
	ihsg["high_52w"], ihsg["low_52w"] = hi, lo

	series := map[string][]models.StockPrice{}
	var excluded []string
	for sym, p := range all {
		t := upto(p, cutoff)
		if len(t) < 60 || t[len(t)-1].Date != cut.Date {
			excluded = append(excluded, sym)
			continue
		}
		series[sym] = t
	}
	sort.Strings(excluded)
	calib := analysis.Calibrate(series, regimeFn) // only bars <= cutoff exist here

	var rows []Row
	for sym, p := range series {
		to := turnover(p, 20)
		if to < minTurnover {
			continue
		}
		d := analysis.Saran(p)
		n := len(p)
		atr := analysis.ATR(p, 14)
		atrNow := atr[len(atr)-1].Value
		atrPct := atrNow / p[n-1].Close * 100
		r := Row{
			Symbol: sym, Close: p[n-1].Close, Signal: d.Signal, Trend: d.Trend,
			EntryIdeal: d.EntryZone.Ideal, Stop: d.StopLoss, RR: d.RiskReward,
			TurnoverBn: analysis.R2(to), ATRPct: analysis.R2(atrPct),
			Calib: calib.Lookup(d.Signal, regime), Stock: calib.PerSymbol[sym],
			Proj:      calib.Project(d.Signal, regime, atrPct),
			Candidate: d.Signal == "BUY",
		}
		r.BaseStop, r.BaseTarget = analysis.SaranPlan(p[n-1].Close, atrNow)
		if len(d.TakeProfit) > 0 {
			r.Target = d.TakeProfit[0].Price
		}
		rows = append(rows, r)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].TurnoverBn > rows[j].TurnoverBn })
	counts := map[string]int{}
	for _, r := range rows {
		counts[r.Signal]++
		if r.Candidate {
			counts["candidates"]++
		}
	}
	fz := Frozen{Cutoff: cut.Date, MadeAt: time.Now().Format(time.RFC3339), IHSG: ihsg, Regime: regime,
		BuyCalls: calib.BuyCalls, Counts: counts, Rows: rows, Excluded: excluded, Criteria: criteria}
	b, _ := json.MarshalIndent(fz, "", " ")
	os.MkdirAll(frozenDir, 0o755)
	if err := os.WriteFile(frozenPath(), b, 0o644); err != nil {
		fail("write %s: %v", frozenPath(), err)
	}

	// ── print (cutoff data only) ──
	fmt.Printf("CUTOFF %s  IHSG %.0f  SMA50 %.0f  regime %s  1M %+.1f%%  3M %+.1f%%  YTD %+.1f%%  52w %.0f-%.0f\n",
		cut.Date, cut.Close, ihsg["sma50"], regime, ihsg["chg_1m_pct"], ihsg["chg_3m_pct"], ihsg["chg_ytd_pct"], lo, hi)
	fmt.Printf("calib as-of cutoff: stocks=%d buy_calls %s\n", calib.Stocks, js(calib.BuyCalls))
	fmt.Printf("scanned=%d excluded(%d)=%v  counts=%v\n", len(series), len(excluded), excluded, counts)
	for _, r := range rows {
		fmt.Printf("%-5s %-5s c=%-6.0f T=%s/%s/%s to=%.1f\n",
			r.Symbol, r.Signal, r.Close, r.Trend.Long, r.Trend.Medium, r.Trend.Short, r.TurnoverBn)
		if r.Signal == "BUY" {
			fmt.Printf("      entry %.0f stop %.0f tp %.0f | calib %s | stock %s\n", r.EntryIdeal, r.Stop, r.Target, js(r.Calib), js(r.Stock))
			for _, p := range r.Proj {
				if p.Horizon == 20 {
					fmt.Printf("      proj20 %s\n", js(p))
				}
			}
		}
	}
	fmt.Printf("FROZEN %s sha256=%x\n", frozenPath(), sha256.Sum256(b))
}

func mustYear(date string) int {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		fail("bad date %q", date)
	}
	return t.Year()
}

func js(v any) string { b, _ := json.Marshal(v); return string(b) }

// planOutcome mirrors analysis.planOutcome (enter next open, LOSS on stop incl.
// same-bar touch and gaps, WIN on TP1, TIMEOUT at the close of bar i+20).
func planOutcome(p []models.StockPrice, i int, stop, target float64) (string, float64) {
	n := len(p)
	if i+1 >= n {
		return "NODATA", 0
	}
	entry := p[i+1].Open
	if entry <= 0 {
		entry = p[i+1].Close
	}
	if entry <= 0 || stop <= 0 || target <= entry || stop >= entry {
		return "INVALID", 0
	}
	end := i + analysis.CalibHorizon
	for j := i + 1; j <= end; j++ {
		if j >= n {
			return "OPEN", pct(entry, p[n-1].Close)
		}
		if p[j].Low <= stop {
			exit := stop
			if p[j].Open < stop {
				exit = p[j].Open
			}
			return "LOSS", pct(entry, exit)
		}
		if p[j].High >= target {
			return "WIN", pct(entry, target)
		}
	}
	return "TIMEOUT", pct(entry, p[end].Close)
}

func validate() {
	b, err := os.ReadFile(frozenPath())
	if err != nil {
		fail("read %s: %v (run analyze first)", frozenPath(), err)
	}
	fmt.Printf("frozen %s sha256=%x\n", frozenPath(), sha256.Sum256(b))
	var fz Frozen
	if err := json.Unmarshal(b, &fz); err != nil {
		fail("parse %s: %v", frozenPath(), err)
	}
	all := loadAll()
	idx := jkse()
	k := sort.Search(len(idx), func(i int) bool { return idx[i].Date > fz.Cutoff }) - 1
	hs := []int{5, 10, 20, 40, 60}
	fmt.Printf("IHSG cutoff %s %.0f\n", idx[k].Date, idx[k].Close)
	for _, h := range hs {
		if k+h < len(idx) {
			fmt.Printf("  IHSG +%dd (%s): %.0f  %+.2f%%\n", h, idx[k+h].Date, idx[k+h].Close, pct(idx[k].Close, idx[k+h].Close))
		}
	}
	if k+20 < len(idx) {
		lo, hi := math.MaxFloat64, 0.0
		for j := k + 1; j <= k+20; j++ {
			lo, hi = math.Min(lo, idx[j].Low), math.Max(hi, idx[j].High)
		}
		fmt.Printf("  IHSG range next 20 bars: %.0f-%.0f; regime at +20: %s\n", lo, hi, analysis.IndexRegime(idx[:k+21])(idx[k+20].Date))
	}

	type res struct {
		Row
		Ret      map[int]float64
		Plan     string
		PlanPnL  float64
		InBand   bool
		Realized string
		BasePlan string
		BasePnL  float64
	}
	var rs []res
	for _, r := range fz.Rows {
		p := all[r.Symbol]
		i := sort.Search(len(p), func(i int) bool { return p[i].Date > fz.Cutoff }) - 1
		if i < 0 || p[i].Date != fz.Cutoff || p[i].Close != r.Close {
			fmt.Println("MISMATCH (stored data changed since freeze)", r.Symbol)
			continue
		}
		x := res{Row: r, Ret: map[int]float64{}}
		for _, h := range hs {
			if i+h < len(p) {
				x.Ret[h] = pct(p[i].Close, p[i+h].Close)
			}
		}
		x.Plan, x.PlanPnL = planOutcome(p, i, r.Stop, r.Target)
		x.BasePlan, x.BasePnL = planOutcome(p, i, r.BaseStop, r.BaseTarget)
		for _, pv := range r.Proj {
			if v, ok := x.Ret[20]; ok && pv.Horizon == 20 {
				x.InBand = v >= pv.Band[0] && v <= pv.Band[4]
				switch {
				case v > pv.Threshold:
					x.Realized = "bull"
				case v < -pv.Threshold:
					x.Realized = "bear"
				default:
					x.Realized = "side"
				}
			}
		}
		rs = append(rs, x)
	}

	group := func(name string, f func(res) bool) []res {
		var g []res
		for _, x := range rs {
			if f(x) {
				g = append(g, x)
			}
		}
		line := fmt.Sprintf("%-24s n=%-3d", name, len(g))
		for _, h := range hs {
			var s []float64
			for _, x := range g {
				if v, ok := x.Ret[h]; ok {
					s = append(s, v)
				}
			}
			if len(s) > 0 {
				line += fmt.Sprintf(" | +%dd avg %+6.2f med %+6.2f up %3.0f%%", h, mean(s), median(s), upShare(s))
			}
		}
		fmt.Println(line)
		return g
	}
	isBuy := func(x res) bool { return x.Signal == "BUY" || x.Signal == "STRONG_BUY" }
	isSell := func(x res) bool { return x.Signal == "SELL" || x.Signal == "STRONG_SELL" }
	fmt.Println("── returns from cutoff close ──")
	cands := group("kandidat BUY (RR>=1)", func(x res) bool { return x.Candidate })
	recPos := group("kandidat, rekam jejak>0", func(x res) bool { return x.Candidate && x.Stock != nil && x.Stock.AvgPnLPct > 0 })
	recNeg := group("kandidat, rekam jejak<=0", func(x res) bool { return x.Candidate && (x.Stock == nil || x.Stock.AvgPnLPct <= 0) })
	group("semua BUY/STRONG_BUY", isBuy)
	group("WAIT", func(x res) bool { return x.Signal == "WAIT" })
	group("SELL/STRONG_SELL", isSell)
	group("semua", func(res) bool { return true })
	sorted := append([]res(nil), rs...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Score > sorted[j].Score })
	top, bot := map[string]bool{}, map[string]bool{}
	for i := 0; i < 10 && i < len(sorted); i++ {
		top[sorted[i].Symbol] = true
		bot[sorted[len(sorted)-1-i].Symbol] = true
	}
	group("10 skor tertinggi", func(x res) bool { return top[x.Symbol] })
	group("10 skor terendah", func(x res) bool { return bot[x.Symbol] })

	fmt.Println("── Spearman skor vs return ──")
	for _, h := range hs {
		var a, b []float64
		for _, x := range rs {
			if v, ok := x.Ret[h]; ok {
				a, b = append(a, float64(x.Score)), append(b, v)
			}
		}
		if len(a) > 2 {
			fmt.Printf("  +%dd rho=%+.3f n=%d\n", h, spearman(a, b), len(a))
		}
	}

	fmt.Println("── plan outcome (entry next open, TP1 vs stop, 20 bars) ──")
	plan := func(name string, g []res) {
		var pnl []float64
		c := map[string]int{}
		for _, x := range g {
			c[x.Plan]++
			if x.Plan == "WIN" || x.Plan == "LOSS" || x.Plan == "TIMEOUT" {
				pnl = append(pnl, x.PlanPnL)
			}
		}
		fmt.Printf("  %-24s %v avg pnl %+.2f%%\n", name, c, mean(pnl))
	}
	plan("kandidat BUY", cands)
	plan("kandidat, rekam jejak>0", recPos)
	plan("kandidat, rekam jejak<=0", recNeg)
	var buys, waits, sells []res
	for _, x := range rs {
		switch {
		case isBuy(x):
			buys = append(buys, x)
		case isSell(x):
			sells = append(sells, x)
		default:
			waits = append(waits, x)
		}
	}
	plan("semua BUY", buys)
	plan("WAIT", waits)
	plan("SELL (kalau dibeli)", sells)

	// S1–S3 (Saran freezes only; older files have no base plan). Net of
	// cost here — the gross plan() lines above stay comparable with K1–K6.
	resolved := func(r string) bool { return r == "WIN" || r == "LOSS" || r == "TIMEOUT" }
	var buyNet, baseNet []float64
	for _, x := range rs {
		if x.Signal == "BUY" && resolved(x.Plan) {
			buyNet = append(buyNet, x.PlanPnL-analysis.RoundTripCostPct)
		}
		if resolved(x.BasePlan) {
			baseNet = append(baseNet, x.BasePnL-analysis.RoundTripCostPct)
		}
	}
	if len(baseNet) > 0 {
		fmt.Println("── Saran S1–S3 (net biaya 0,4%; gabungkan semua freeze untuk vonis) ──")
		fmt.Printf("  S1 Tren naik selesai: n=%d (butuh >= 30 gabungan)  sum %+.2f\n", len(buyNet), sum(buyNet))
		fmt.Printf("  S2 rata-rata Tren naik: %+.2f%% (lulus jika > 0)\n", mean(buyNet))
		fmt.Printf("  S3 entry acak semua likuid: n=%d avg %+.2f%%  sum %+.2f (lulus jika S2 > ini)\n", len(baseNet), mean(baseNet), sum(baseNet))
	}

	fmt.Println("── projection 20d check ──")
	var nb, inb, rb, rsd, rbr int
	var pb, ps, pbr float64
	for _, x := range rs {
		if x.Realized == "" {
			continue
		}
		nb++
		if x.InBand {
			inb++
		}
		switch x.Realized {
		case "bull":
			rb++
		case "side":
			rsd++
		default:
			rbr++
		}
		for _, pv := range x.Proj {
			if pv.Horizon == 20 {
				pb, ps, pbr = pb+pv.Bullish, ps+pv.Sideways, pbr+pv.Bearish
			}
		}
	}
	if nb > 0 {
		fn := float64(nb)
		fmt.Printf("  in p10-p90 band: %d/%d = %.0f%%\n", inb, nb, float64(inb)/fn*100)
		fmt.Printf("  predicted avg bull/side/bear: %.0f/%.0f/%.0f  realized: %.0f/%.0f/%.0f\n",
			pb/fn, ps/fn, pbr/fn, float64(rb)/fn*100, float64(rsd)/fn*100, float64(rbr)/fn*100)
	}

	fmt.Println("── per stock (score order) ──")
	for _, x := range sorted {
		fmt.Printf("%-5s %-11s sc=%2d cand=%-5v c=%-6.0f +5 %+6.1f +20 %+6.1f +60 %+6.1f plan=%-7s %+6.1f band=%v real=%s\n",
			x.Symbol, x.Signal, x.Score, x.Candidate, x.Close, x.Ret[5], x.Ret[20], x.Ret[60], x.Plan, x.PlanPnL, x.InBand, x.Realized)
	}
}

// export replays the engine on every bar of every stock (no look-ahead: bar i
// sees prices[:i+1] only) and writes one CSV row per (symbol, date).
var compNames = []string{"Market Structure", "Trend EMA", "Money Flow", "Volume", "Support/Resistance",
	"Momentum", "Trend Strength", "Candlestick", "Risk/Reward", "FVG Confluence", "Bandarmology"}

func export() {
	all := loadAll()
	jkse() // refresh research/out/jkse.json for the Python panel
	type job struct {
		sym string
		p   []models.StockPrice
	}
	jobs := make(chan job)
	out := make(chan []string, 1024)
	done := make(chan bool)
	go func() {
		f, err := os.Create(filepath.Join(outDir, "export.csv"))
		if err != nil {
			fail("create export.csv: %v", err)
		}
		defer f.Close()
		head := []string{"sym", "date", "score", "signal", "conf", "rr", "stop", "tp1", "tlong", "tmed", "tshort", "struct", "volst"}
		for _, c := range compNames {
			head = append(head, "c_"+strings.NewReplacer(" ", "_", "/", "_").Replace(c))
		}
		fmt.Fprintln(f, strings.Join(head, ","))
		for r := range out {
			fmt.Fprintln(f, strings.Join(r, ","))
		}
		done <- true
	}()
	workers := 12
	finished := make(chan bool)
	for w := 0; w < workers; w++ {
		go func() {
			for j := range jobs {
				for i := 59; i < len(j.p); i++ {
					d := analysis.DecisionEngine(j.p[:i+1])
					comp := map[string]int{}
					for _, c := range d.Components {
						comp[c.Name] = c.Score
					}
					tp := 0.0
					if len(d.TakeProfit) > 0 {
						tp = d.TakeProfit[0].Price
					}
					row := []string{j.sym, j.p[i].Date, fmt.Sprint(d.Score), d.Signal, fmt.Sprint(d.Confidence),
						fmt.Sprint(d.RiskReward), fmt.Sprint(d.StopLoss), fmt.Sprint(tp),
						d.Trend.Long, d.Trend.Medium, d.Trend.Short, strings.ReplaceAll(d.MarketStructure.State, ",", ";"), d.Volume.Status}
					for _, c := range compNames {
						if v, ok := comp[c]; ok {
							row = append(row, fmt.Sprint(v))
						} else {
							row = append(row, "")
						}
					}
					out <- row
				}
			}
			finished <- true
		}()
	}
	for sym, p := range all {
		if len(p) >= 60 {
			jobs <- job{sym, p}
		}
	}
	close(jobs)
	for w := 0; w < workers; w++ {
		<-finished
	}
	close(out)
	<-done
	fmt.Println("wrote", filepath.Join(outDir, "export.csv"))
}

func mean(s []float64) float64 {
	if len(s) == 0 {
		return math.NaN()
	}
	return sum(s) / float64(len(s))
}

func sum(s []float64) float64 {
	t := 0.0
	for _, v := range s {
		t += v
	}
	return t
}

func median(s []float64) float64 {
	c := append([]float64(nil), s...)
	sort.Float64s(c)
	n := len(c)
	if n%2 == 1 {
		return c[n/2]
	}
	return (c[n/2-1] + c[n/2]) / 2
}

func upShare(s []float64) float64 {
	u := 0
	for _, v := range s {
		if v > 0 {
			u++
		}
	}
	return float64(u) / float64(len(s)) * 100
}

// ranks returns 1-based ranks, ties averaged.
func ranks(v []float64) []float64 {
	idx := make([]int, len(v))
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return v[idx[a]] < v[idx[b]] })
	r := make([]float64, len(v))
	for i := 0; i < len(idx); {
		j := i
		for j+1 < len(idx) && v[idx[j+1]] == v[idx[i]] {
			j++
		}
		for k := i; k <= j; k++ {
			r[idx[k]] = float64(i+j)/2 + 1
		}
		i = j + 1
	}
	return r
}

func spearman(a, b []float64) float64 {
	ra, rb := ranks(a), ranks(b)
	ma, mb := mean(ra), mean(rb)
	var num, da, db float64
	for i := range ra {
		num += (ra[i] - ma) * (rb[i] - mb)
		da += (ra[i] - ma) * (ra[i] - ma)
		db += (rb[i] - mb) * (rb[i] - mb)
	}
	return num / math.Sqrt(da*db)
}

func main() {
	if len(os.Args) < 2 {
		fail("usage: blindtest analyze|validate|export [-cutoff YYYY-MM-DD] [-data dir]")
	}
	fs := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	fs.StringVar(&cutoff, "cutoff", cutoff, "last trading day the engine may see (YYYY-MM-DD)")
	fs.StringVar(&dataDir, "data", dataDir, "OHLCV directory (stock-api/data)")
	fs.Parse(os.Args[2:])
	mustYear(cutoff)
	switch os.Args[1] {
	case "analyze":
		analyze()
	case "validate":
		validate()
	case "export":
		os.MkdirAll(outDir, 0o755)
		export()
	default:
		fail("unknown command %q", os.Args[1])
	}
}
