package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"sort"
	"time"

	"stock-api/analysis"
	"stock-api/models"
)

// Fase 6 #4: lapis 3 (portfolio after costs) + lapis 4 (robustness:
// parameter neighbours, sector, liquidity quartile, market regime).
// Breakdowns are descriptive only — they never raise a grade (slicing until
// something looks good is exactly the data mining the grade guards against).

// ── L3: portfolio ────────────────────────────────────────────────────────────

const slots = 10 // concurrent positions, equal weight 1/slots of equity at entry

type Portfolio struct {
	CAGR         float64 `json:"cagr_pct"`
	Sharpe       float64 `json:"sharpe"`
	MaxDD        float64 `json:"max_dd_pct"`
	ProfitFactor float64 `json:"profit_factor"`
	WinRate      float64 `json:"win_rate_pct"`
	AvgWin       float64 `json:"avg_win_pct"`
	AvgLoss      float64 `json:"avg_loss_pct"`
	Trades       int     `json:"trades"`
	Exposure     float64 `json:"exposure_pct"` // share of slot-days actually holding a position
	From, To     string  `json:"-"`
}

type ptrade struct {
	entry, exit string
	pnl         float64
}

// simulate runs the ATR-bracket trades through a 10-slot book: a signal is
// taken only when a slot is free; equity is realised at exits (so drawdown is
// measured on closed trades — intraday swings of open positions not included).
func simulate(trades []ptrade, rng *rand.Rand) *Portfolio {
	if len(trades) == 0 {
		return nil
	}
	rng.Shuffle(len(trades), func(a, b int) { trades[a], trades[b] = trades[b], trades[a] }) // random order within a day
	sort.SliceStable(trades, func(a, b int) bool { return trades[a].entry < trades[b].entry })
	type pos struct {
		exit       string
		stake, pnl float64
	}
	var open []pos
	cash, equity, peak, maxDD := 1.0, 1.0, 1.0, 0.0
	var wins, losses []float64
	monthEq := map[string]float64{}
	slotDays := 0.0
	realize := func(upTo string) {
		kept := open[:0]
		for _, p := range open {
			if p.exit <= upTo {
				cash += p.stake * (1 + p.pnl/100)
				equity += p.stake * p.pnl / 100
				peak = math.Max(peak, equity)
				maxDD = math.Max(maxDD, 1-equity/peak)
				monthEq[p.exit[:7]] = equity
				if p.pnl > 0 {
					wins = append(wins, p.pnl)
				} else {
					losses = append(losses, p.pnl)
				}
			} else {
				kept = append(kept, p)
			}
		}
		open = kept
	}
	for _, t := range trades {
		realize(t.entry)
		if len(open) >= slots {
			continue
		}
		stake := equity / slots
		cash -= stake
		open = append(open, pos{t.exit, stake, t.pnl})
		slotDays += days(t.entry, t.exit)
	}
	realize("9999")
	from, to := trades[0].entry, trades[len(trades)-1].exit
	years := days(from, to) / 365.25
	p := &Portfolio{Trades: len(wins) + len(losses), MaxDD: r2(maxDD * 100), From: from, To: to}
	if years > 0 && equity > 0 {
		p.CAGR = r2((math.Pow(equity, 1/years) - 1) * 100)
		p.Exposure = r2(slotDays / (days(from, to) * slots) * 100)
	}
	sumW, sumL := 0.0, 0.0
	for _, w := range wins {
		sumW += w
	}
	for _, l := range losses {
		sumL += l
	}
	if p.Trades > 0 {
		p.WinRate = r2(float64(len(wins)) / float64(p.Trades) * 100)
	}
	if len(wins) > 0 {
		p.AvgWin = r2(sumW / float64(len(wins)))
	}
	if len(losses) > 0 {
		p.AvgLoss = r2(sumL / float64(len(losses)))
		p.ProfitFactor = r2(sumW / -sumL)
	}
	p.Sharpe = r2(monthlySharpe(monthEq))
	return p
}

func monthlySharpe(eq map[string]float64) float64 {
	keys := make([]string, 0, len(eq))
	for k := range eq {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var rets []float64
	prev := 1.0
	for _, k := range keys {
		rets = append(rets, eq[k]/prev-1)
		prev = eq[k]
	}
	if len(rets) < 3 {
		return math.NaN()
	}
	mu := mean(rets)
	ss := 0.0
	for _, r := range rets {
		ss += (r - mu) * (r - mu)
	}
	sd := math.Sqrt(ss / float64(len(rets)-1))
	if sd == 0 {
		return math.NaN()
	}
	return mu / sd * math.Sqrt(12)
}

func days(a, b string) float64 {
	ta, _ := time.Parse("2006-01-02", a)
	tb, _ := time.Parse("2006-01-02", b)
	return tb.Sub(ta).Hours() / 24
}

// benchmark: IHSG buy-and-hold over the same window.
func benchmark(idx []models.StockPrice, from, to string) (cagr, maxDD float64) {
	var first, last float64
	peak := 0.0
	for _, p := range idx {
		if p.Date < from || p.Date > to || p.Close <= 0 {
			continue
		}
		if first == 0 {
			first = p.Close
		}
		last = p.Close
		peak = math.Max(peak, p.Close)
		maxDD = math.Max(maxDD, 1-p.Close/peak)
	}
	if y := days(from, to) / 365.25; first > 0 && y > 0 {
		cagr = (math.Pow(last/first, 1/y) - 1) * 100
	}
	return r2(cagr), r2(maxDD * 100)
}

// ── L4: groups ───────────────────────────────────────────────────────────────

type GroupStat struct {
	Excess float64 `json:"excess"`
	N      int     `json:"n"`
}

// tagged is one signal event with the labels it can be grouped by.
type tagged struct {
	date, sector, liq string
	x                 float64
}

func groupBy(ev []tagged, key func(tagged) string) map[string]GroupStat {
	vs := map[string][]float64{}
	for _, e := range ev {
		vs[key(e)] = append(vs[key(e)], e.x)
	}
	out := map[string]GroupStat{}
	for k, v := range vs {
		out[k] = GroupStat{r3(mean(v)), len(v)}
	}
	return out
}

// regimes labels each ^JKSE date by trend (close vs SMA200) × volatility
// (20-day stdev of daily returns vs its expanding median — point-in-time).
func regimes(idx []models.StockPrice) map[string]string {
	sma := map[string]float64{}
	for _, p := range analysis.SMA(idx, 200) {
		sma[p.Date] = p.Value
	}
	out := map[string]string{}
	var vols []float64
	for i := 21; i < len(idx); i++ {
		var r []float64
		for j := i - 19; j <= i; j++ {
			r = append(r, idx[j].Close/idx[j-1].Close-1)
		}
		mu, ss := mean(r), 0.0
		for _, x := range r {
			ss += (x - mu) * (x - mu)
		}
		v := math.Sqrt(ss / 19)
		vols = append(vols, v)
		s, ok := sma[idx[i].Date]
		if !ok {
			continue
		}
		sorted := append([]float64(nil), vols...)
		sort.Float64s(sorted)
		trend := map[bool]string{true: "IHSG > MA200", false: "IHSG < MA200"}[idx[i].Close > s]
		vol := map[bool]string{true: "bergejolak", false: "tenang"}[v > sorted[len(sorted)/2]]
		out[idx[i].Date] = trend + ", " + vol
	}
	return out
}

// liqQuartiles labels each (date, stock) by its turnover quartile among the
// liquid stocks of that date: Q1 = least traded … Q4 = most traded.
func liqQuartiles(res []stockOut) map[string][]float64 {
	by := map[string][]float64{}
	for _, o := range res {
		if o.s == nil {
			continue
		}
		for i := 0; i < o.s.n; i++ {
			if o.s.liquid[i] {
				by[o.s.date[i]] = append(by[o.s.date[i]], o.s.to20[i])
			}
		}
	}
	for _, v := range by {
		sort.Float64s(v)
	}
	return by
}

func quartile(sorted []float64, x float64) string {
	if len(sorted) < 4 {
		return "?"
	}
	k := sort.SearchFloat64s(sorted, x)
	return fmt.Sprintf("Q%d", min(3, k*4/len(sorted))+1)
}

// sectors returns Yahoo's sector per symbol, cached in research/out/sector.json.
func sectors(syms []string) map[string]string {
	path := filepath.Join("research", "out", "sector.json")
	cache := map[string]string{}
	if b, err := os.ReadFile(path); err == nil {
		json.Unmarshal(b, &cache)
	}
	var missing []string
	for _, s := range syms {
		if _, ok := cache[s]; !ok {
			missing = append(missing, s)
		}
	}
	if len(missing) == 0 {
		return cache
	}
	jar, _ := cookiejar.New(nil)
	cl := &http.Client{Jar: jar, Timeout: 20 * time.Second}
	get := func(url string) (*http.Response, error) {
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
		return cl.Do(req)
	}
	if r, err := get("https://fc.yahoo.com"); err == nil {
		r.Body.Close()
	}
	r, err := get("https://query2.finance.yahoo.com/v1/test/getcrumb")
	if err != nil {
		return cache
	}
	crumb := make([]byte, 64)
	n, _ := r.Body.Read(crumb)
	r.Body.Close()
	for _, s := range missing {
		resp, err := get(fmt.Sprintf("https://query2.finance.yahoo.com/v10/finance/quoteSummary/%s.JK?modules=assetProfile&crumb=%s", s, crumb[:n]))
		if err != nil {
			continue
		}
		var v struct {
			QuoteSummary struct {
				Result []struct {
					AssetProfile struct {
						Sector string `json:"sector"`
					} `json:"assetProfile"`
				} `json:"result"`
			} `json:"quoteSummary"`
		}
		json.NewDecoder(resp.Body).Decode(&v)
		resp.Body.Close()
		if len(v.QuoteSummary.Result) > 0 && v.QuoteSummary.Result[0].AssetProfile.Sector != "" {
			cache[s] = v.QuoteSummary.Result[0].AssetProfile.Sector
		}
		time.Sleep(300 * time.Millisecond)
	}
	os.MkdirAll(filepath.Dir(path), 0o755)
	b, _ := json.MarshalIndent(cache, "", " ")
	os.WriteFile(path, b, 0o644)
	return cache
}

// ── L4: parameter neighbours (±30%) ─────────────────────────────────────────

type variant struct {
	base, label string
	sig         func(s *series) []bool
}

// ParamCell is one neighbour's mean 20-day excess return.
type ParamCell struct {
	Label  string  `json:"label"`
	Excess float64 `json:"excess"`
	N      int     `json:"n"`
}

func variants() []variant {
	var v []variant
	add := func(base, label string, f func(s *series) []bool) { v = append(v, variant{base, label, f}) }
	for _, n := range []int{10, 14, 18} {
		for _, lv := range []float64{21, 30, 39} {
			n, lv := n, lv
			add("RSI naik lewat 30 (keluar oversold)", fmt.Sprintf("RSI(%d) lewat %.0f", n, lv),
				func(s *series) []bool { return crossUpK(s.align(analysis.RSI(s.p, n)), lv) })
		}
		n := n
		add("RSI tembus 50", fmt.Sprintf("RSI(%d) lewat 50", n), func(s *series) []bool { return crossUpK(s.align(analysis.RSI(s.p, n)), 50) })
	}
	for _, m := range []float64{0.7, 1, 1.3} {
		f, sl, sg := int(math.Round(12*m)), int(math.Round(26*m)), int(math.Round(9*m))
		add("MACD cross naik", fmt.Sprintf("MACD(%d,%d,%d)", f, sl, sg), func(s *series) []bool {
			pts := analysis.MACD(s.p, f, sl, sg)
			d := func(p analysis.MACDPoint) string { return p.Date }
			return crossUp(appPts(s, pts, d, func(p analysis.MACDPoint) float64 { return p.MACD }),
				appPts(s, pts, d, func(p analysis.MACDPoint) float64 { return p.Signal }))
		})
		a, b := int(math.Round(20*m)), int(math.Round(50*m))
		add("SMA golden cross 20/50", fmt.Sprintf("SMA %d/%d", a, b), func(s *series) []bool {
			return crossUp(s.align(analysis.SMA(s.p, a)), s.align(analysis.SMA(s.p, b)))
		})
		n := int(math.Round(20 * m))
		add("Breakout high 20 hari (Donchian)", fmt.Sprintf("high %d hari", n), func(s *series) []bool { return crossUp(s.c, shift(rollMax(s.h, n), 1)) })
		k := 2 * m
		add("Volume spike 2× + candle hijau", fmt.Sprintf("volume > %.1f×", k), func(s *series) []bool {
			avg := shift(rollMean(s.v, 20), 1)
			return where(s.n, func(i int) bool { return s.v[i] > k*avg[i] && green(s, i) })
		})
		for _, mult := range []float64{1.4, 2, 2.6} {
			n, mult := int(math.Round(20*m)), mult
			bb := func(s *series) (lo, up []float64) {
				pts := analysis.Bollinger(s.p, n, mult)
				d := func(p analysis.BollingerPoint) string { return p.Date }
				return appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.Lower }),
					appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.Upper })
			}
			add("Bollinger mantul band bawah", fmt.Sprintf("BB(%d, %.1f)", n, mult), func(s *series) []bool { lo, _ := bb(s); return crossUp(s.c, lo) })
			add("Bollinger tembus band atas", fmt.Sprintf("BB(%d, %.1f)", n, mult), func(s *series) []bool { _, up := bb(s); return crossUp(s.c, up) })
		}
		for _, lv := range []float64{14, 20, 26} {
			n, lv := int(math.Round(14*m)), lv
			add("Stochastic cross naik di bawah 20", fmt.Sprintf("Stoch(%d) < %.0f", n, lv), func(s *series) []bool {
				pts := analysis.Stochastic(s.p, n, 3)
				d := func(p analysis.StochPoint) string { return p.Date }
				k := appPts(s, pts, d, func(p analysis.StochPoint) float64 { return p.K })
				dd := appPts(s, pts, d, func(p analysis.StochPoint) float64 { return p.D })
				x := crossUp(k, dd)
				return where(s.n, func(i int) bool { return x[i] && k[i] < lv })
			})
			add("MFI naik lewat 20", fmt.Sprintf("MFI(%d) lewat %.0f", n, lv), func(s *series) []bool { return crossUpK(s.align(analysis.MFI(s.p, n)), lv) })
		}
	}
	return v
}

// stable: every neighbour points the same way as the default and keeps at
// least half its effect. nil when the indicator has no neighbours.
func stable(base float64, cells []ParamCell) *bool {
	if len(cells) == 0 {
		return nil
	}
	ok := true
	for _, c := range cells {
		if c.N == 0 || c.Excess*base <= 0 || math.Abs(c.Excess) < 0.5*math.Abs(base) {
			ok = false
		}
	}
	return &ok
}

func orQ(s string) string {
	if s == "" {
		return "?"
	}
	return s
}

// regimeGroups splits date-level observations by market regime.
func regimeGroups(o []obs, reg map[string]string) map[string]GroupStat {
	ev := make([]tagged, len(o))
	for i, x := range o {
		ev[i] = tagged{date: x.date, x: x.v}
	}
	return groupBy(ev, func(e tagged) string { return orQ(reg[e.date]) })
}
