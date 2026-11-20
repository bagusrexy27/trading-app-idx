package main

import (
	"math"
	"sort"
	"strconv"
)

var splits = []string{"TRAIN", "VALID", "TEST"}

func splitOf(date string) string {
	switch {
	case date < "2024-01-01":
		return "TRAIN"
	case date < "2025-12-01":
		return "VALID"
	}
	return "TEST"
}

// obs is one measurement on one date: a signal's excess return, or a value
// indicator's cross-sectional IC on that date.
type obs struct {
	date string
	v    float64
}

type Result struct {
	Name      string                          `json:"name"`
	Category  string                          `json:"category"`
	Kind      string                          `json:"kind"` // signal | value | timing
	InApp     bool                            `json:"in_app"`
	Explain   string                          `json:"explain"`
	Note      string                          `json:"note,omitempty"`
	Grade     string                          `json:"grade"`               // A..F (see finalGrade)
	Direction string                          `json:"direction,omitempty"` // value: tinggi|rendah is better · timing: baik|buruk time to buy
	N         int                             `json:"n"`                   // signal: events · value: dates
	Split     map[string]float64              `json:"split"`               // signal: excess 20d % · value: IC 20d
	SplitN    map[string]int                  `json:"split_n"`
	Horizons  map[string]float64              `json:"horizons"` // "5","10","20","60"
	T         float64                         `json:"t"`
	YearsWon  string                          `json:"years_won"`
	ByYear    map[string]float64              `json:"by_year"`
	ByMood    map[string]float64              `json:"by_mood"`
	MoodN     map[string]int                  `json:"mood_n"`
	Trade     map[string]float64              `json:"trade_atr,omitempty"`    // signal: ATR-bracket P&L % per split
	Hit       float64                         `json:"hit_pct,omitempty"`      // signal: % events that beat the market over 20d
	Forward   *Forward                        `json:"forward,omitempty"`      // forward test since the first log (research/forward/)
	EdgeNet   map[string]float64              `json:"edge_net"`               // after costs, direction-adjusted, per split
	P         float64                         `json:"p"`                      // block bootstrap (month blocks), two-sided
	Q         float64                         `json:"q"`                      // Benjamini-Hochberg across all indicators
	NEff      int                             `json:"n_eff"`                  // distinct months with observations
	Random    *Random                         `json:"random_entry,omitempty"` // signal: random-entry benchmark
	InSample  float64                         `json:"in_sample"`              // TRAIN+VALID mean, direction-adjusted
	Holdout   float64                         `json:"holdout"`                // TEST mean, direction-adjusted
	Stable    *bool                           `json:"stable,omitempty"`       // parameter neighbours agree; nil = not tested
	Reasons   []string                        `json:"reasons"`
	Portfolio *Portfolio                      `json:"portfolio,omitempty"` // signal: 10-slot book with ATR exits, after costs + ARB/ARA
	Groups    map[string]map[string]GroupStat `json:"groups,omitempty"`    // sektor / likuiditas / rezim → mean 20d excess
	Params    []ParamCell                     `json:"params,omitempty"`    // parameter neighbours (±30%)

	dir     float64 // +1, or -1 when lower values / these days are the useful side
	obs     []obs   // 20-day observations (excess %, IC, or market deviation)
	netObs  []obs   // gross edge per trade/date before costs (finalGrade subtracts costPct)
	yearsOK bool
}

func mean(x []float64) float64 {
	s, k := 0.0, 0
	for _, v := range x {
		if !math.IsNaN(v) {
			s += v
			k++
		}
	}
	if k == 0 {
		return math.NaN()
	}
	return s / float64(k)
}

// monthT is the t-stat of the monthly means — observations inside one month
// are not independent (same market move), so the month is the unit.
func monthT(o []obs) float64 {
	by := map[string][]float64{}
	for _, x := range o {
		by[x.date[:7]] = append(by[x.date[:7]], x.v)
	}
	m := make([]float64, 0, len(by))
	for _, v := range by {
		m = append(m, mean(v))
	}
	if len(m) < 3 {
		return math.NaN()
	}
	mu := mean(m)
	ss := 0.0
	for _, v := range m {
		ss += (v - mu) * (v - mu)
	}
	sd := math.Sqrt(ss / float64(len(m)-1))
	if sd == 0 {
		return math.NaN()
	}
	return mu / sd * math.Sqrt(float64(len(m)))
}

func groupMean(o []obs, key func(string) string) (map[string]float64, map[string]int) {
	vs := map[string][]float64{}
	for _, x := range o {
		k := key(x.date)
		vs[k] = append(vs[k], x.v)
	}
	m, n := map[string]float64{}, map[string]int{}
	for k, v := range vs {
		m[k], n[k] = r3(mean(v)), len(v)
	}
	return m, n
}

// summarize fills the shared statistics from the 20-day observations.
func summarize(r *Result, o20 []obs, mood map[string]string, minYearN int) {
	r.N = len(o20)
	r.Split, r.SplitN = groupMean(o20, splitOf)
	r.T = r3(monthT(o20))
	byYear, yearN := groupMean(o20, func(d string) string { return d[:4] })
	r.ByYear = byYear
	r.ByMood, r.MoodN = groupMean(o20, func(d string) string {
		if m, ok := mood[d]; ok {
			return m
		}
		return "?"
	})
	dir := 1.0
	if r.Kind != "signal" {
		// the useful direction is picked WITHOUT the TEST period, so TEST stays
		// out-of-sample for the sign too (review 2026-11-20); all data only
		// when there is nothing before TEST
		var pre, all []float64
		for _, x := range o20 {
			all = append(all, x.v)
			if splitOf(x.date) != "TEST" {
				pre = append(pre, x.v)
			}
		}
		if len(pre) == 0 {
			pre = all
		}
		if mean(pre) < 0 {
			dir = -1
		}
		r.Direction = map[bool]string{true: "tinggi", false: "rendah"}[dir > 0]
		if r.Kind == "timing" {
			r.Direction = map[bool]string{true: "baik", false: "buruk"}[dir > 0]
		}
	}
	won, years := 0, 0
	for y, v := range byYear {
		if yearN[y] < minYearN {
			continue
		}
		years++
		if v*dir > 0 {
			won++
		}
	}
	r.YearsWon = strconv.Itoa(won) + "/" + strconv.Itoa(years)
	r.dir, r.obs, r.yearsOK = dir, o20, years > 0 && won*7 >= 5*years
	r.NEff = len(monthly(o20))
}

// spearman is the rank correlation of a and b (ties get the average rank).
func spearman(a, b []float64) float64 {
	ra, rb := ranks(a), ranks(b)
	ma, mb := mean(ra), mean(rb)
	var sab, saa, sbb float64
	for i := range ra {
		da, db := ra[i]-ma, rb[i]-mb
		sab, saa, sbb = sab+da*db, saa+da*da, sbb+db*db
	}
	if saa == 0 || sbb == 0 {
		return math.NaN()
	}
	return sab / math.Sqrt(saa*sbb)
}

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
		avg := float64(i+j)/2 + 1
		for k := i; k <= j; k++ {
			r[idx[k]] = avg
		}
		i = j + 1
	}
	return r
}

func r2(x float64) float64 { return round(x, 100) }
func r3(x float64) float64 { return round(x, 1000) }

func round(x, k float64) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return 0
	}
	return math.Round(x*k) / k
}
