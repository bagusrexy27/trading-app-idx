// Command rapor is the indicator report card (docs/rapor-indikator-plan.md):
// every indicator's textbook BUY signal (or its value, ranked across stocks) is
// replayed on every tracked stock since 2020 and graded A–E with rules fixed
// before any result was seen. Indicators come from the app's own analysis
// package wherever the app has them, so the grade is for the code users see.
// Run from stock-api/:
//
//	go run ./research/rapor                     → research/rapor/<last date>.json
//	go run ./research/rapor -minto 5 -out x.json   sensitivity run (looser liquidity)
//
// Market-neutral: each signal's forward return minus the mean forward return
// of every liquid stock on the same date. Entry = next open, cost 0.4% round
// trip, a stock's signal re-firing within 10 bars is dropped. Survivorship:
// only stocks still listed today are in data/ — noted in the report.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"sync"
	"time"

	"stock-api/analysis"
	"stock-api/fetcher"
	"stock-api/models"
	"stock-api/storage"
)

type stockOut struct {
	s     *series
	sigs  [][]bool
	vals  [][]float64
	vsigs [][]bool // parameter neighbours (variants())
}

type Report struct {
	AsOf        string   `json:"as_of"`
	MadeAt      string   `json:"made_at"`
	Stocks      int      `json:"stocks"`
	MinTurnover float64  `json:"min_turnover_bn"`
	From        string   `json:"from"`
	Universe    string   `json:"universe,omitempty"` // "" = all liquid stocks · "sehat" = healthy subset
	BenchCAGR   float64  `json:"ihsg_cagr_pct"`      // IHSG buy-and-hold over the report window
	BenchMaxDD  float64  `json:"ihsg_max_dd_pct"`    // its worst peak-to-trough fall
	Notes       []string `json:"notes"`
	Indicators  []Result `json:"indicators"`
}

const (
	dedupeBars = 20 // = the 20-day horizon: one stock's signals never overlap
	minICCross = 10 // stocks needed on a date for its IC to count
)

func main() {
	minTO := flag.Float64("minto", 20, "minimum 20-day average turnover, Rp bn, for a day to count")
	out := flag.String("out", "", "output file (default research/rapor/<as_of>.json)")
	universe := flag.String("universe", "", `"sehat" = only healthy stocks: top 40 by turnover that day, price >= Rp500, ATR <= 4% (baseline = same set)`)
	sehatN := flag.Int("sehatn", 40, "with -universe sehat: how many top-turnover stocks per day (sensitivity: 30/50 write to research/out/)")
	flag.Parse()
	if *universe != "" && *universe != "sehat" {
		fail("unknown -universe %q (only \"sehat\")", *universe)
	}

	start := time.Now()
	idx := jkse()
	idxClose := make(map[string]float64, len(idx))
	for _, p := range idx {
		idxClose[p.Date] = p.Close
	}
	mood := moods(idx)

	ext := map[string]dateSeries{} // other markets, for timing conditions + USD reporters
	for _, sym := range []string{"USDIDR=X", "^GSPC", "^VIX", "CL=F", "GC=F"} {
		p, _, err := fetcher.Fetch(sym, time.Date(2019, 6, 1, 0, 0, 0, 0, time.UTC))
		if err != nil {
			fmt.Fprintf(os.Stderr, "makro %s: %v\n", sym, err)
			continue
		}
		ext[sym] = newDateSeries(p)
	}
	fxClose := map[string]float64{}
	for k, d := range ext["USDIDR=X"].dates {
		fxClose[d] = ext["USDIDR=X"].close[k]
	}

	syms, err := storage.List()
	if err != nil {
		fail("list stocks: %v", err)
	}
	cat := append(append(append([]indicator{}, catalogue...), components()...), fundamentals()...)

	funds := make([]*fundData, len(syms)) // sequential + paced: Yahoo rate-limits bursts
	for k, sym := range syms {
		f, fetched := loadFund(sym)
		funds[k] = f
		if fetched {
			time.Sleep(300 * time.Millisecond)
		}
	}

	vars := variants()
	sec := sectors(syms)
	res := make([]stockOut, len(syms))
	var wg sync.WaitGroup
	jobs := make(chan int)
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for k := range jobs {
				d, err := storage.Load(syms[k])
				if err != nil || d == nil || len(d.Prices) < 150 {
					continue
				}
				s := newSeries(syms[k], d.Prices, idxClose, *minTO, funds[k], fxClose)
				if st, err := os.Stat(filepath.Join(storage.DataDir, syms[k]+".json")); err == nil {
					s.written = st.ModTime()
				}
				o := stockOut{s: s, sigs: make([][]bool, len(cat)), vals: make([][]float64, len(cat)), vsigs: make([][]bool, len(vars))}
				for j, ind := range cat {
					if ind.sig != nil {
						o.sigs[j] = ind.sig(s)
					} else {
						o.vals[j] = ind.val(s)
					}
				}
				for j, v := range vars {
					o.vsigs[j] = v.sig(s)
				}
				res[k] = o
				fmt.Fprintf(os.Stderr, ".")
			}
		}()
	}
	for k := range syms {
		jobs <- k
	}
	close(jobs)
	wg.Wait()
	fmt.Fprintf(os.Stderr, "\n%d stocks computed in %s\n", len(syms), time.Since(start).Round(time.Second))
	if *universe == "sehat" {
		healthyOnly(res, *sehatN)
	}

	// market mean forward return per date and horizon (all liquid stocks)
	type acc struct{ sum, n float64 }
	mkt := map[int]map[string]*acc{}
	for _, h := range horizons {
		mkt[h] = map[string]*acc{}
	}
	asOf, nStocks := "", 0
	for _, o := range res {
		if o.s == nil {
			continue
		}
		nStocks++
		s := o.s
		if d := s.date[s.n-1]; d > asOf {
			asOf = d
		}
		for i := 0; i < s.n; i++ {
			if !s.liquid[i] {
				continue
			}
			for _, h := range horizons {
				if f := s.fw[h][i]; !math.IsNaN(f) {
					a := mkt[h][s.date[i]]
					if a == nil {
						a = &acc{}
						mkt[h][s.date[i]] = a
					}
					a.sum += f
					a.n++
				}
			}
		}
	}
	excess := func(s *series, h, i int) float64 {
		a := mkt[h][s.date[i]]
		f := s.fw[h][i]
		if a == nil || math.IsNaN(f) {
			return math.NaN()
		}
		return f - a.sum/a.n
	}

	// random-entry pool: every liquid (stock, day) with a resolved 20-day outcome
	var pool []float64
	for _, o := range res {
		if o.s == nil {
			continue
		}
		for i := 0; i < o.s.n; i++ {
			if x := excess(o.s, 20, i); o.s.liquid[i] && !math.IsNaN(x) {
				pool = append(pool, x)
			}
		}
	}
	rng := rand.New(rand.NewSource(seed))
	liqQ, reg := liqQuartiles(res), regimes(idx)
	// meanSignal is the mean 20-day excess of a signal series under the same
	// rules as the report (liquid, deduped, resolved) — for parameter neighbours.
	meanSignal := func(sig func(o stockOut) []bool) ParamCell {
		var xs []float64
		for _, o := range res {
			if o.s == nil {
				continue
			}
			s, last := o.s, -dedupeBars
			for i, on := range sig(o) {
				if on && s.liquid[i] && i-last >= dedupeBars {
					last = i
					if x := excess(s, 20, i); !math.IsNaN(x) {
						xs = append(xs, x)
					}
				}
			}
		}
		return ParamCell{Excess: r3(mean(xs)), N: len(xs)}
	}

	results := make([]Result, 0, len(cat))
	for j, ind := range cat {
		r := Result{Name: ind.Name, Category: ind.Cat, Kind: ind.kind(), InApp: ind.InApp, Explain: ind.Explain,
			Note: ind.Note, Horizons: map[string]float64{}}
		if ind.sig != nil {
			var o20, tr []obs
			var ev []tagged
			var book []ptrade
			hz := map[int][]float64{}
			hit := 0
			for _, o := range res {
				if o.s == nil {
					continue
				}
				s, last := o.s, -dedupeBars
				for i, on := range o.sigs[j] {
					if !on || !s.liquid[i] || i-last < dedupeBars {
						continue
					}
					last = i
					x20 := excess(s, 20, i)
					if math.IsNaN(x20) {
						continue // not resolved yet
					}
					o20 = append(o20, obs{s.date[i], x20})
					if x20 > 0 {
						hit++
					}
					for _, h := range horizons {
						hz[h] = append(hz[h], excess(s, h, i))
					}
					if t, in, out := s.tradeFull(i); !math.IsNaN(t) {
						tr = append(tr, obs{s.date[i], t})
						book = append(book, ptrade{s.date[in], s.date[out], t})
					}
					sector := sec[s.sym]
					if sector == "" {
						sector = "?"
					}
					ev = append(ev, tagged{s.date[i], sector, quartile(liqQ[s.date[i]], s.to20[i]), x20})
				}
			}
			r.Portfolio = simulate(book, rand.New(rand.NewSource(seed)))
			r.Groups = map[string]map[string]GroupStat{
				"sektor":     groupBy(ev, func(e tagged) string { return e.sector }),
				"likuiditas": groupBy(ev, func(e tagged) string { return e.liq }),
				"rezim":      groupBy(ev, func(e tagged) string { return orQ(reg[e.date]) }),
			}
			for k, v := range vars {
				if v.base == ind.Name {
					c := meanSignal(func(o stockOut) []bool { return o.vsigs[k] })
					c.Label = v.label
					r.Params = append(r.Params, c)
				}
			}
			for _, h := range horizons {
				r.Horizons[strconv.Itoa(h)] = r2(mean(hz[h]))
			}
			summarize(&r, o20, mood, 10)
			r.netObs = o20
			if r.Random = randomEntry(pool, len(o20), rng); r.Random != nil {
				r.Random.Beats = meanObs(o20) > r.Random.P95
			}
			r.Stable = stable(meanObs(o20), r.Params)
			r.Trade, _ = groupMean(tr, splitOf)
			if len(o20) > 0 {
				r.Hit = r2(float64(hit) / float64(len(o20)) * 100)
			}
		} else {
			var o20 []obs
			for _, h := range horizons {
				ics := icByDate(res, j, h)
				vals := make([]float64, len(ics))
				for k, x := range ics {
					vals[k] = x.v
				}
				r.Horizons[strconv.Itoa(h)] = r3(mean(vals))
				if h == 20 {
					o20 = ics
				}
			}
			summarize(&r, o20, mood, 50)
			r.netObs = topFrac(res, j, r.dir, excess, 0.2, 20)
			base := meanObs(r.netObs)
			for _, fr := range []float64{0.2, 1.0 / 3} { // neighbours: cheapest 20% / 33%, held 10 / 20 / 60 days
				for _, h := range []int{10, 20, 60} {
					if fr == 0.2 && h == 20 {
						continue
					}
					o := topFrac(res, j, r.dir, excess, fr, h)
					r.Params = append(r.Params, ParamCell{Label: fmt.Sprintf("top %.0f%%, %d hari", fr*100, h),
						Excess: r3(meanObs(o) * 20 / float64(h)), N: len(o)})
				}
			}
			r.Stable = stable(base, r.Params)
			r.Groups = map[string]map[string]GroupStat{"rezim": regimeGroups(r.netObs, reg)}
		}
		results = append(results, r)
	}

	// timing: market-level conditions, graded on the mean liquid-stock 20d return
	m20 := map[string]float64{}
	for d, a := range mkt[20] {
		m20[d] = a.sum / a.n
	}
	above, tot := map[string]float64{}, map[string]float64{}
	for _, o := range res {
		if o.s == nil {
			continue
		}
		e := ema(o.s.c, 50)
		for i := 0; i < o.s.n; i++ {
			if o.s.liquid[i] {
				tot[o.s.date[i]]++
				if o.s.c[i] > e[i] {
					above[o.s.date[i]]++
				}
			}
		}
	}
	breadth := map[string]float64{}
	for d, n := range tot {
		if n >= minICCross {
			breadth[d] = above[d] / n * 100
		}
	}
	jk := newDateSeries(idx)
	conds := timingConds(jk, mood, breadth, ext, jk.dates)
	results = append(results, timingResults(conds, m20, mood, reg)...)

	forwardDir = filepath.Join("research", "forward", *universe) // each universe keeps its own hash chain
	written, ferr := 0, error(nil)
	if *minTO == 20 && *out == "" && *sehatN == 40 { // sensitivity runs (-minto, -out, -sehatn) never touch the forward log
		written, ferr = writeForward(res, cat, conds, jk.dates, asOf)
	}
	if ferr != nil {
		fail("forward log: %v", ferr)
	}
	for k := range results { // significance: month-block bootstrap, then BH across all
		results[k].P = round(bootP(monthly(results[k].obs), rand.New(rand.NewSource(seed))), 10000)
	}
	bh(results)
	for k := range results {
		finalGrade(&results[k])
	}

	logs, _, broken := readForward()
	scoreForward(results, logs, res, excess, m20)

	order := map[string]int{"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
	sort.SliceStable(results, func(a, b int) bool {
		if order[results[a].Grade] != order[results[b].Grade] {
			return order[results[a].Grade] < order[results[b].Grade]
		}
		return results[a].Q < results[b].Q // closest to significant first
	})

	bc, bdd := benchmark(idx, "2020-06-01", asOf)
	rep := Report{AsOf: asOf, MadeAt: time.Now().Format(time.RFC3339), Stocks: nStocks, MinTurnover: *minTO, From: "2020-01-01",
		BenchCAGR: bc, BenchMaxDD: bdd,
		Notes: []string{
			"Market-neutral: hasil sinyal dikurangi rata-rata semua saham likuid di tanggal yang sama.",
			"Entry = open hari berikutnya; biaya 0,4% bolak-balik; sinyal berulang < 20 hari pada saham yang sama dibuang; ARB/ARA: order di hari terkunci tidak tereksekusi.",
			"Periode: TRAIN 2020–2023 · VALID 2024–Nov 2025 · TEST Des 2025+.",
			"Bias survivorship: hanya saham yang masih tercatat hari ini.",
			"t dihitung dari rata-rata per bulan; horizon 20 hari tumpang tindih antar bulan sehingga t sedikit terlalu optimis.",
		}, Indicators: results}
	if len(logs) > 0 {
		rep.Notes = append(rep.Notes, fmt.Sprintf("Uji maju (forward test): %d hari tercatat sejak %s; sinyal baru dinilai setelah 20 hari bursa.", len(logs), logs[0].Date))
	}
	if len(broken) > 0 {
		rep.Notes = append(rep.Notes, fmt.Sprintf("⚠️ Rantai hash log uji maju rusak pada: %v — ada file yang diubah setelah ditulis.", broken))
	}
	if *universe == "sehat" {
		rep.Universe = "sehat"
		rep.Notes = append(rep.Notes, "Universe 'saham sehat': per tanggal hanya 40 saham dengan transaksi 20 hari terbesar, harga ≥ Rp500, ATR ≤ 4%; pembanding = rata-rata saham sehat di tanggal yang sama.")
	}
	if *out == "" {
		*out = filepath.Join("research", "rapor", *universe, asOf+".json") // sehat → research/rapor/sehat/ (the app serves research/rapor/*.json)
		if *sehatN != 40 {
			*out = filepath.Join("research", "out", fmt.Sprintf("rapor-sehat%d-%s.json", *sehatN, asOf)) // sensitivity: scratch only
		}
	}
	if err := storage.WriteJSON(*out, rep); err != nil {
		fail("write %s: %v", *out, err)
	}
	printTable(results)
	fmt.Fprintf(os.Stderr, "forward: %d new day(s) logged, %d total\n", written, len(logs))
	fmt.Fprintf(os.Stderr, "wrote %s (%d indicators, %d stocks) in %s\n", *out, len(results), nStocks, time.Since(start).Round(time.Second))
}

// icByDate is the cross-sectional Spearman IC of indicator j against the
// h-day forward return, one number per date with enough liquid stocks.
// (A date constant doesn't change ranks, so raw returns equal excess here.)
func icByDate(res []stockOut, j, h int) []obs {
	type pt struct{ v, f float64 }
	by := map[string][]pt{}
	for _, o := range res {
		if o.s == nil {
			continue
		}
		s, vals := o.s, o.vals[j]
		for i := 0; i < s.n; i++ {
			v, f := vals[i], s.fw[h][i]
			if s.liquid[i] && !math.IsNaN(v) && !math.IsInf(v, 0) && !math.IsNaN(f) {
				by[s.date[i]] = append(by[s.date[i]], pt{v, f})
			}
		}
	}
	out := make([]obs, 0, len(by))
	for d, ps := range by {
		if len(ps) < minICCross {
			continue
		}
		a, b := make([]float64, len(ps)), make([]float64, len(ps))
		for k, p := range ps {
			a[k], b[k] = p.v, p.f
		}
		if ic := spearman(a, b); !math.IsNaN(ic) {
			out = append(out, obs{d, ic})
		}
	}
	sort.Slice(out, func(a, b int) bool { return out[a].date < out[b].date })
	return out
}

func printTable(rs []Result) {
	fmt.Printf("%-46s %-5s %-6s %5s %4s %8s %8s %8s %7s %7s %8s %s\n", "indikator", "nilai", "jenis", "n", "bln", "TRAIN", "VALID", "TEST", "q", "net", "rnd95", "app")
	for _, r := range rs {
		app := ""
		if r.InApp {
			app = "✓"
		}
		rnd := ""
		if r.Random != nil {
			rnd = fmt.Sprintf("%.3f", r.Random.P95)
		}
		net := 0.0
		for _, v := range r.EdgeNet {
			net += v / float64(len(r.EdgeNet))
		}
		fmt.Printf("%-46s %-5s %-6s %5d %4d %8.3f %8.3f %8.3f %7.4f %7.3f %8s %s\n", trunc(r.Name, 46), r.Grade, r.Kind, r.N, r.NEff,
			r.Split["TRAIN"], r.Split["VALID"], r.Split["TEST"], r.Q, net, rnd, app)
	}
}

func trunc(s string, n int) string {
	if len([]rune(s)) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}

// moods maps each ^JKSE date to its market mood from the index's RSI(14).
func moods(idx []models.StockPrice) map[string]string {
	m := map[string]string{}
	for _, p := range analysis.RSI(idx, 14) {
		switch v := p.Value; {
		case v < 40:
			m[p.Date] = "panik"
		case v < 50:
			m[p.Date] = "takut"
		case v < 60:
			m[p.Date] = "tenang"
		case v < 70:
			m[p.Date] = "optimis"
		default:
			m[p.Date] = "euforia"
		}
	}
	return m
}

// jkse fetches ^JKSE since 2020, falling back to the cache blindtest writes.
func jkse() []models.StockPrice {
	cache := filepath.Join("research", "out", "jkse.json")
	p, _, err := fetcher.Fetch("^JKSE", time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC))
	if err == nil && len(p) > 0 {
		return p
	}
	b, rerr := os.ReadFile(cache)
	if rerr == nil && json.Unmarshal(b, &p) == nil && len(p) > 0 {
		return p
	}
	fail("fetch ^JKSE: %v", err)
	return nil
}

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "rapor: "+format+"\n", a...)
	os.Exit(1)
}

// topFrac is the value-indicator "trade": on each date, buy the best frac of
// liquid stocks by the indicator (in its useful direction) and hold h days.
// Returns the per-date mean excess return (before costs).
func topFrac(res []stockOut, j int, dir float64, excess func(*series, int, int) float64, frac float64, h int) []obs {
	type pt struct{ v, x float64 }
	by := map[string][]pt{}
	for _, o := range res {
		if o.s == nil {
			continue
		}
		for i := 0; i < o.s.n; i++ {
			v, x := o.vals[j][i], excess(o.s, h, i)
			if o.s.liquid[i] && !math.IsNaN(v) && !math.IsInf(v, 0) && !math.IsNaN(x) {
				by[o.s.date[i]] = append(by[o.s.date[i]], pt{v * dir, x})
			}
		}
	}
	var out []obs
	for d, ps := range by {
		if len(ps) < minICCross {
			continue
		}
		sort.Slice(ps, func(a, b int) bool { return ps[a].v > ps[b].v })
		k := int(float64(len(ps)) * frac)
		xs := make([]float64, k)
		for q := 0; q < k; q++ {
			xs[q] = ps[q].x
		}
		out = append(out, obs{d, mean(xs)})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].date < out[b].date })
	return out
}
