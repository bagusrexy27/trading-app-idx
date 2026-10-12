package analysis

import (
	"math"
	"sort"

	"stock-api/models"
)

// ── Calibration ──────────────────────────────────────────────────────────────
//
// Calibration replays the Decision Engine over every tracked stock's history
// (no look-ahead) and records what actually happened to each day's plan:
// enter at next open, WIN if TP1 is hit before the stop within Horizon bars,
// LOSS if the stop is hit first (same-bar touch counts as LOSS — conservative),
// TIMEOUT if neither. Results are bucketed by score and by market regime
// (IHSG close vs its SMA50 on the signal day).
//
// ponytail: broker flow is left out of the replay (nil) — stored broker days
// are recent/mock and would leak future data. Live scores include it (8%).

const (
	CalibHorizon    = 20 // trading days a plan is given to resolve
	calibBucketSize = 10 // score bucket width
	calibMinSamples = 30 // below this a bucket's rate is not trusted
)

// ── Projection ───────────────────────────────────────────────────────────────
//
// Besides the plan outcome, every replayed day records where price actually
// was h bars later. The move is normalised by the stock's own volatility unit
// (ATR14% × √h) so calm and wild stocks share one scale (z). z > +k = Bullish,
// z < −k = Bearish, else Sideways. Quantiles of z give the "normal range",
// converted back to % with the live stock's ATR.
//
// ponytail: k = 0.5 is a calibration knob — on a pure random walk it splits
// roughly 30/40/30. Raise it if too few cases land in Sideways.

var ProjHorizons = []int{5, 10, 20}

const projK = 0.5

// ProjStat is the scenario split for one regime × horizon × score bucket.
// Quantiles are in z units (volatility-normalised).
type ProjStat struct {
	Samples  int        `json:"samples"`
	Bullish  float64    `json:"bullish"`  // % of cases
	Sideways float64    `json:"sideways"` // % of cases
	Bearish  float64    `json:"bearish"`  // % of cases
	Z        [5]float64 `json:"z"`        // p10, p25, p50, p75, p90
	zs       []float64
}

func (p *ProjStat) finalize() {
	n := len(p.zs)
	if n == 0 {
		return
	}
	sort.Float64s(p.zs)
	var bull, bear int
	for _, z := range p.zs {
		if z > projK {
			bull++
		} else if z < -projK {
			bear++
		}
	}
	p.Samples = n
	p.Bullish = R2(float64(bull) / float64(n) * 100)
	p.Bearish = R2(float64(bear) / float64(n) * 100)
	p.Sideways = R2(100 - p.Bullish - p.Bearish)
	for i, q := range []float64{0.1, 0.25, 0.5, 0.75, 0.9} {
		p.Z[i] = quantile(p.zs, q)
	}
	p.zs = nil
}

// quantile of an ascending slice, linear interpolation.
func quantile(s []float64, q float64) float64 {
	pos := q * float64(len(s)-1)
	lo := int(pos)
	if lo+1 >= len(s) {
		return s[lo]
	}
	return s[lo] + (s[lo+1]-s[lo])*(pos-float64(lo))
}

// ProjView is one horizon's projection for a live stock, in % from today's close.
type ProjView struct {
	Horizon   int        `json:"horizon"`
	Regime    string     `json:"regime"`
	Samples   int        `json:"samples"`
	Reliable  bool       `json:"reliable"`
	Bullish   float64    `json:"bullish"`
	Sideways  float64    `json:"sideways"`
	Bearish   float64    `json:"bearish"`
	Threshold float64    `json:"threshold_pct"` // |move| beyond this = Bullish/Bearish for this stock
	Band      [5]float64 `json:"band_pct"`      // p10, p25, p50, p75, p90 return %
}

type CalibStat struct {
	Samples   int     `json:"samples"`
	Wins      int     `json:"wins"`
	Losses    int     `json:"losses"`
	Timeouts  int     `json:"timeouts"`
	WinRate   float64 `json:"win_rate"`    // wins / samples, %
	AvgPnLPct float64 `json:"avg_pnl_pct"` // mean outcome incl. timeouts (exit at horizon close)
	pnlSum    float64
}

func (s *CalibStat) add(result string, pnl float64) {
	s.Samples++
	s.pnlSum += pnl
	switch result {
	case "WIN":
		s.Wins++
	case "LOSS":
		s.Losses++
	default:
		s.Timeouts++
	}
	s.WinRate = R2(float64(s.Wins) / float64(s.Samples) * 100)
	s.AvgPnLPct = R2(s.pnlSum / float64(s.Samples))
}

// Calibration is the per-bucket outcome table. Regime keys: "all", "up"
// (IHSG ≥ SMA50), "down" (IHSG < SMA50). Bucket key = score / 10 * 10.
type Calibration struct {
	Horizon   int                           `json:"horizon"`
	AsOf      string                        `json:"as_of"`
	Stocks    int                           `json:"stocks"`
	Buckets   map[string]map[int]*CalibStat `json:"buckets"`
	BuyCalls  map[string]*CalibStat         `json:"buy_calls"`  // score ≥ 60 (BUY/STRONG_BUY band), per regime
	PerSymbol map[string]*CalibStat         `json:"per_symbol"` // score ≥ 60 days, per stock, all regimes
	// Projection: regime → horizon → score bucket.
	Projection map[string]map[int]map[int]*ProjStat `json:"projection"`
}

// CalibLookup is what a single live decision gets attached.
type CalibLookup struct {
	Regime    string  `json:"regime"` // up | down | unknown
	ScoreLo   int     `json:"score_lo"`
	ScoreHi   int     `json:"score_hi"`
	Horizon   int     `json:"horizon"`
	Samples   int     `json:"samples"`
	WinRate   float64 `json:"win_rate"`
	AvgPnLPct float64 `json:"avg_pnl_pct"`
	Reliable  bool    `json:"reliable"` // samples ≥ calibMinSamples
}

// RegimeFunc maps a date to "up", "down" or "" (unknown).
type RegimeFunc func(date string) string

// IndexRegime builds a RegimeFunc from index bars: close vs SMA50, using the
// latest index bar on or before the asked date.
func IndexRegime(index []models.StockPrice) RegimeFunc {
	sma := SMA(index, 50)
	dates := make([]string, len(sma))
	up := make([]bool, len(sma))
	closes := make(map[string]float64, len(index))
	for _, p := range index {
		closes[p.Date] = p.Close
	}
	for i, pt := range sma {
		dates[i] = pt.Date
		up[i] = closes[pt.Date] >= pt.Value
	}
	return func(date string) string {
		i := sort.SearchStrings(dates, date)
		if i < len(dates) && dates[i] == date {
			// exact
		} else {
			i-- // latest bar before date
		}
		if i < 0 {
			return ""
		}
		if up[i] {
			return "up"
		}
		return "down"
	}
}

// Calibrate replays DecisionEngine on every series. regime may be nil.
// Cost: one engine run per bar per stock — seconds for ~80 stocks × ~1.5y.
func Calibrate(series map[string][]models.StockPrice, regime RegimeFunc) *Calibration {
	c := &Calibration{
		Horizon:    CalibHorizon,
		Buckets:    map[string]map[int]*CalibStat{"all": {}, "up": {}, "down": {}},
		BuyCalls:   map[string]*CalibStat{"all": {}, "up": {}, "down": {}},
		PerSymbol:  map[string]*CalibStat{},
		Projection: map[string]map[int]map[int]*ProjStat{},
	}
	for _, r := range []string{"all", "up", "down"} {
		c.Projection[r] = map[int]map[int]*ProjStat{}
		for _, h := range ProjHorizons {
			c.Projection[r][h] = map[int]*ProjStat{}
		}
	}
	for sym, prices := range series {
		n := len(prices)
		if n < 61 {
			continue
		}
		c.Stocks++
		if last := prices[n-1].Date; last > c.AsOf {
			c.AsOf = last
		}
		atr := ATR(prices, 14) // atr[k] belongs to prices[k+14]
		for i := 59; i < n-1; i++ {
			dec := DecisionEngine(prices[:i+1])
			b := scoreBucket(dec.Score)
			keys := []string{"all"}
			if regime != nil {
				if r := regime(prices[i].Date); r != "" {
					keys = append(keys, r)
				}
			}
			if atrPct := atr[i-14].Value / prices[i].Close * 100; atrPct > 0 {
				for _, h := range ProjHorizons {
					if i+h >= n {
						continue
					}
					z := (prices[i+h].Close/prices[i].Close - 1) * 100 / (atrPct * math.Sqrt(float64(h)))
					for _, k := range keys {
						if c.Projection[k][h][b] == nil {
							c.Projection[k][h][b] = &ProjStat{}
						}
						c.Projection[k][h][b].zs = append(c.Projection[k][h][b].zs, z)
					}
				}
			}
			result, pnl, ok := planOutcome(prices, i, dec.StopLoss, firstTP(dec))
			if !ok {
				continue
			}
			if dec.Score >= 60 {
				if c.PerSymbol[sym] == nil {
					c.PerSymbol[sym] = &CalibStat{}
				}
				c.PerSymbol[sym].add(result, pnl)
			}
			for _, k := range keys {
				if c.Buckets[k][b] == nil {
					c.Buckets[k][b] = &CalibStat{}
				}
				c.Buckets[k][b].add(result, pnl)
				if dec.Score >= 60 {
					c.BuyCalls[k].add(result, pnl)
				}
			}
		}
	}
	for _, byH := range c.Projection {
		for _, byB := range byH {
			for _, p := range byB {
				p.finalize()
			}
		}
	}
	return c
}

// Lookup returns the historical record for a live score in the given regime,
// falling back to "all" when the regime bucket is too thin.
func (c *Calibration) Lookup(score int, regime string) *CalibLookup {
	if c == nil {
		return nil
	}
	b := scoreBucket(score)
	key := regime
	if key != "up" && key != "down" {
		key, regime = "all", "unknown"
	}
	s := c.Buckets[key][b]
	if (s == nil || s.Samples < calibMinSamples) && key != "all" {
		key = "all"
		s = c.Buckets[key][b]
	}
	out := &CalibLookup{Regime: regime, ScoreLo: b, ScoreHi: b + calibBucketSize - 1, Horizon: c.Horizon}
	if s != nil {
		out.Samples, out.WinRate, out.AvgPnLPct = s.Samples, s.WinRate, s.AvgPnLPct
		out.Reliable = s.Samples >= calibMinSamples
	}
	return out
}

// Project returns, per horizon, the measured scenario split for a live score
// in the given regime (falling back to "all" when thin), with the normal range
// converted to % using this stock's current ATR% (ATR14 / close × 100).
func (c *Calibration) Project(score int, regime string, atrPct float64) []ProjView {
	if c == nil || atrPct <= 0 {
		return nil
	}
	b := scoreBucket(score)
	key := regime
	if key != "up" && key != "down" {
		key, regime = "all", "unknown"
	}
	out := make([]ProjView, 0, len(ProjHorizons))
	for _, h := range ProjHorizons {
		k := key
		p := c.Projection[k][h][b]
		if (p == nil || p.Samples < calibMinSamples) && k != "all" {
			k = "all"
			p = c.Projection[k][h][b]
		}
		if p == nil {
			continue
		}
		unit := atrPct * math.Sqrt(float64(h))
		v := ProjView{
			Horizon: h, Regime: regime, Samples: p.Samples, Reliable: p.Samples >= calibMinSamples,
			Bullish: p.Bullish, Sideways: p.Sideways, Bearish: p.Bearish,
			Threshold: R2(projK * unit),
		}
		if k != key {
			v.Regime = "all"
		}
		for i, z := range p.Z {
			v.Band[i] = R2(z * unit)
		}
		out = append(out, v)
	}
	return out
}

func scoreBucket(score int) int {
	if score >= 100 {
		score = 99
	}
	if score < 0 {
		score = 0
	}
	return score / calibBucketSize * calibBucketSize
}

func firstTP(d Decision) float64 {
	if len(d.TakeProfit) == 0 {
		return 0
	}
	return d.TakeProfit[0].Price
}

// planOutcome resolves the plan made at the close of bar i. ok=false when the
// plan is invalid or the horizon runs past the end of the data unresolved.
func planOutcome(prices []models.StockPrice, i int, stop, target float64) (result string, pnlPct float64, ok bool) {
	n := len(prices)
	entry := prices[i+1].Open
	if entry <= 0 {
		entry = prices[i+1].Close
	}
	if entry <= 0 || stop <= 0 || target <= entry || stop >= entry {
		return "", 0, false
	}
	end := i + CalibHorizon
	for j := i + 1; j <= end; j++ {
		if j >= n {
			return "", 0, false
		}
		if prices[j].Low <= stop {
			exit := stop
			if prices[j].Open < stop { // gapped through the stop
				exit = prices[j].Open
			}
			return "LOSS", (exit/entry - 1) * 100, true
		}
		if prices[j].High >= target {
			return "WIN", (target/entry - 1) * 100, true
		}
	}
	return "TIMEOUT", (prices[end].Close/entry - 1) * 100, true
}
