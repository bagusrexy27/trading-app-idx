package analysis

import (
	"fmt"
	"math"
	"sort"
	"time"

	"stock-api/models"
)

// ── Valuation: 3-year PBV band + quality screen ──────────────────────────────
//
// Technique from the Astronacci "5 Undervalued Stock" report (18 Oct 2026):
// a stock is cheap when today's PBV sits below its own 3-year mean PBV
// (−1 / −2 standard deviations = clearly / deeply cheap), but only counts as
// "undervalued" when it also passes all four quality filters — otherwise a
// falling PBV may just be a business getting worse.
//
// ponytail: book value uses the report's period-end date (asOfDate), not its
// publication date (~1–2 months later). The band is a slow 3-year average, so
// the small look-ahead doesn't move it meaningfully.

const (
	ValuationYears  = 3
	MinListingYears = 10
	MinDivYieldPct  = 5.0
	MinAvgROEPct    = 12.0
	minProfitYears  = 3 // need at least this many annual reports to judge quality
	ValuationWeight = 10
	minBandSamples  = 250 // ~1 year of daily PBV before the band is trusted
)

// FinPoint is one reported value at a period-end date.
type FinPoint struct {
	Date  string  `json:"date"` // YYYY-MM-DD
	Value float64 `json:"value"`
}

// ValuationInput is everything fetched from Yahoo for one stock.
type ValuationInput struct {
	Prices       []models.StockPrice // ≥ 3 years of daily closes
	Equity       []FinPoint          // stockholders' equity (annual + quarterly)
	Shares       []FinPoint          // ordinary shares outstanding (annual + quarterly)
	NetIncome    []FinPoint          // annual net income
	AnnualEquity []FinPoint          // annual equity, for ROE
	Dividends    []FinPoint          // cash dividends per share by ex date
	FirstTrade   string              // first trading date Yahoo knows
	// FX converts the report currency to IDR per date (e.g. USDIDR closes);
	// nil when the reports are already in IDR. ADRO, ITMG, ESSA… report in USD.
	FX []models.StockPrice
}

// ValuationBand is the cached part — slow-moving, refreshed weekly.
type ValuationBand struct {
	BVPS      float64 `json:"bvps"`      // latest book value per share
	Mean      float64 `json:"mean"`      // 3-year mean PBV
	SD        float64 `json:"sd"`        // 3-year PBV standard deviation
	Samples   int     `json:"samples"`   // daily PBV points in the band
	Div12m    float64 `json:"div_12m"`   // cash dividends per share, last 12 months
	AvgROE    float64 `json:"avg_roe"`   // mean annual ROE %, over the reports Yahoo has
	ROEYears  int     `json:"roe_years"` // number of annual reports used
	AllProfit bool    `json:"all_profit"`
	Listed    string  `json:"listed"` // first trade date
	AsOf      string  `json:"as_of"`  // last price date used
}

// Valuation is the live view: the cached band evaluated at today's close.
type Valuation struct {
	ValuationBand
	PBV        float64    `json:"pbv"`
	Z          float64    `json:"z"`     // (PBV − mean) / SD
	Lines      [5]float64 `json:"lines"` // PBV at −2, −1, mean, +1, +2 SD
	Zone       string     `json:"zone"`  // sangat murah | murah | di bawah rata-rata | di atas rata-rata | mahal | sangat mahal
	DivYield   float64    `json:"div_yield"`
	ListedYrs  float64    `json:"listed_years"`
	Checks     []Check    `json:"checks"`
	Quality    bool       `json:"quality"`    // passed all four filters
	Undervalue bool       `json:"undervalue"` // quality && PBV below its 3-year mean
}

type Check struct {
	Name string `json:"name"`
	Pass bool   `json:"pass"`
	Note string `json:"note"`
}

// BuildBand computes the 3-year PBV band from fetched data. ok=false when
// there's no usable book value or too little history.
func BuildBand(in ValuationInput) (ValuationBand, bool) {
	var b ValuationBand
	n := len(in.Prices)
	if n == 0 {
		return b, false
	}
	bvps := bookPerShare(in.Equity, in.Shares)
	if len(bvps) == 0 {
		return b, false
	}
	fx := func(string) float64 { return 1 }
	if in.FX != nil {
		rates := make([]FinPoint, 0, len(in.FX))
		for _, p := range in.FX {
			rates = append(rates, FinPoint{p.Date, p.Close})
		}
		fx = func(d string) float64 { return valueAt(rates, d) }
	}
	last := in.Prices[n-1].Date
	from := shiftYears(last, -ValuationYears)
	var pbvs []float64
	for _, p := range in.Prices {
		if p.Date < from || p.Close <= 0 {
			continue
		}
		if bv := valueAt(bvps, p.Date) * fx(p.Date); bv > 0 {
			pbvs = append(pbvs, p.Close/bv)
		}
	}
	if len(pbvs) < minBandSamples {
		return b, false
	}
	b.Mean, b.SD = meanSD(pbvs)
	b.Samples = len(pbvs)
	// ponytail: for USD reporters BVPS is frozen at the refresh day's rate; a weekly
	// refresh keeps it close. Evaluate per day with live FX if rupiah swings matter.
	b.BVPS = R2(bvps[len(bvps)-1].Value * fx(last))
	b.AsOf = last
	b.Listed = in.FirstTrade

	yearAgo := shiftYears(last, -1)
	for _, d := range in.Dividends {
		if d.Date > yearAgo {
			b.Div12m += d.Value
		}
	}

	b.AllProfit = len(in.NetIncome) > 0
	eq := map[string]float64{}
	for _, e := range in.AnnualEquity {
		eq[e.Date] = e.Value
	}
	var roeSum float64
	for _, ni := range in.NetIncome {
		if ni.Value <= 0 {
			b.AllProfit = false
		}
		if e := eq[ni.Date]; e > 0 {
			roeSum += ni.Value / e * 100
			b.ROEYears++
		}
	}
	if b.ROEYears > 0 {
		b.AvgROE = R2(roeSum / float64(b.ROEYears))
	}
	b.Mean, b.SD = R2(b.Mean), R2(b.SD)
	return b, true
}

// Evaluate places today's close inside the band and runs the quality screen.
func (b ValuationBand) Evaluate(close float64, today string) *Valuation {
	if b.BVPS <= 0 || b.SD <= 0 || close <= 0 {
		return nil
	}
	v := &Valuation{ValuationBand: b}
	v.PBV = R2(close / b.BVPS)
	v.Z = R2((close/b.BVPS - b.Mean) / b.SD)
	for i, k := range []float64{-2, -1, 0, 1, 2} {
		v.Lines[i] = R2(b.Mean + k*b.SD)
	}
	v.Zone = zoneOf(v.Z)
	v.DivYield = R2(b.Div12m / close * 100)
	if b.Listed != "" {
		v.ListedYrs = R2(daysBetween(b.Listed, today) / 365.25)
	}

	enough := b.ROEYears >= minProfitYears
	v.Checks = []Check{
		{"Listing > 10 tahun", v.ListedYrs > MinListingYears, fmt.Sprintf("%.0f tahun (sejak %s)", v.ListedYrs, b.Listed)},
		{"Dividend yield ≥ 5%", v.DivYield >= MinDivYieldPct, fmt.Sprintf("%.1f%% (12 bulan terakhir)", v.DivYield)},
		{"Rata-rata ROE > 12%", enough && b.AvgROE > MinAvgROEPct, fmt.Sprintf("%.1f%% (%d tahun)", b.AvgROE, b.ROEYears)},
		{"Laba bersih selalu positif", enough && b.AllProfit, fmt.Sprintf("%d tahun laporan", b.ROEYears)},
	}
	v.Quality = true
	for _, c := range v.Checks {
		v.Quality = v.Quality && c.Pass
	}
	v.Undervalue = v.Quality && v.Z < 0
	if b.Listed == "" {
		v.Checks[0].Note = "tanggal listing tidak diketahui"
	}
	return v
}

// scoreValuation maps the band position to 0–100 for the decision engine.
// Only quality stocks get a valuation factor: for the rest a low PBV is as
// likely a value trap as a bargain, so the factor stays out (ok=false).
func scoreValuation(v *Valuation) (score int, note string, ok bool) {
	if v == nil || !v.Quality {
		return 0, "", false
	}
	switch {
	case v.Z <= -2:
		score = 90
	case v.Z <= -1:
		score = 75
	case v.Z < 0:
		score = 60
	case v.Z < 1:
		score = 45
	case v.Z < 2:
		score = 30
	default:
		score = 15
	}
	return score, fmt.Sprintf("PBV %.2fx vs rata-rata 3th %.2fx (%+.1f SD, %s)", v.PBV, v.Mean, v.Z, v.Zone), true
}

func zoneOf(z float64) string {
	switch {
	case z <= -2:
		return "sangat murah"
	case z <= -1:
		return "murah"
	case z < 0:
		return "di bawah rata-rata"
	case z < 1:
		return "di atas rata-rata"
	case z < 2:
		return "mahal"
	}
	return "sangat mahal"
}

// bookPerShare pairs each equity report with the share count of the same
// period (falling back to the latest earlier count), sorted by date.
func bookPerShare(equity, shares []FinPoint) []FinPoint {
	sh := append([]FinPoint(nil), shares...)
	sort.Slice(sh, func(i, j int) bool { return sh[i].Date < sh[j].Date })
	seen := map[string]bool{}
	var out []FinPoint
	for _, e := range equity {
		if seen[e.Date] || e.Value <= 0 {
			continue
		}
		if s := valueAt(sh, e.Date); s > 0 {
			seen[e.Date] = true
			out = append(out, FinPoint{e.Date, e.Value / s})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out
}

// valueAt returns the latest point on or before date (0 if none) — pts sorted asc.
func valueAt(pts []FinPoint, date string) float64 {
	i := sort.Search(len(pts), func(i int) bool { return pts[i].Date > date })
	if i == 0 {
		return 0
	}
	return pts[i-1].Value
}

func meanSD(xs []float64) (float64, float64) {
	var sum float64
	for _, x := range xs {
		sum += x
	}
	m := sum / float64(len(xs))
	var ss float64
	for _, x := range xs {
		ss += (x - m) * (x - m)
	}
	return m, math.Sqrt(ss / float64(len(xs)))
}

// shiftYears moves a YYYY-MM-DD date by whole years (string compare stays valid).
func shiftYears(date string, years int) string {
	if len(date) < 4 {
		return date
	}
	y := 0
	fmt.Sscanf(date[:4], "%d", &y)
	return fmt.Sprintf("%04d%s", y+years, date[4:])
}

func daysBetween(a, b string) float64 {
	ta, err1 := time.Parse("2006-01-02", a)
	tb, err2 := time.Parse("2006-01-02", b)
	if err1 != nil || err2 != nil {
		return 0
	}
	return tb.Sub(ta).Hours() / 24
}
