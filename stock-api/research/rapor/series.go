package main

import (
	"math"
	"sort"
	"time"

	"stock-api/analysis"
	"stock-api/models"
)

var nan = math.NaN()

// series is one stock with everything the indicators need, aligned bar by bar.
// Every value at index i uses only bars <= i (no look-ahead).
type series struct {
	sym           string
	p             []models.StockPrice
	n             int
	date          []string
	o, h, l, c, v []float64
	atr           []float64           // app ATR(14)
	to20          []float64           // 20-day average turnover, Rp bn
	dec           []analysis.Decision // DecisionEngine(p[:i+1]); zero value before warm-up
	idx           []float64           // ^JKSE close on the same date (NaN when missing)
	fw            map[int][]float64   // forward total return % (price + dividends), net of cost, entry next open
	liquid        []bool
	fund          *fundData // annual reports + dividends (nil when unavailable)
	fx            []float64 // USD/IDR on the same date (forward-filled)
	div           []float64 // cash dividend per share going ex on bar i
	written       time.Time // data file mtime: the last bar is final only if written after its 16:15 close
}

const (
	costPct  = 0.4 // 0.15% buy + 0.25% sell
	warmup   = 120 // bars before a day can count
	decStart = 60  // first bar the decision engine is evaluated on
)

var horizons = []int{5, 10, 20, 60}

func newSeries(sym string, p []models.StockPrice, idxClose map[string]float64, minTO float64, fund *fundData, fxClose map[string]float64) *series {
	n := len(p)
	s := &series{sym: sym, p: p, n: n, date: make([]string, n),
		o: make([]float64, n), h: make([]float64, n), l: make([]float64, n), c: make([]float64, n), v: make([]float64, n),
		to20: make([]float64, n), idx: make([]float64, n), fw: map[int][]float64{}, liquid: make([]bool, n),
		fund: fund, fx: make([]float64, n), div: make([]float64, n)}
	lastFX := nan
	for i, b := range p {
		if x, ok := fxClose[b.Date]; ok && x > 0 {
			lastFX = x
		}
		s.fx[i] = lastFX
		s.date[i], s.o[i], s.h[i], s.l[i], s.c[i], s.v[i] = b.Date, b.Open, b.High, b.Low, b.Close, float64(b.Volume)
		if x, ok := idxClose[b.Date]; ok {
			s.idx[i] = x
		} else {
			s.idx[i] = nan
		}
	}
	if fund != nil { // map each ex date to the first bar on/after it
		for _, d := range fund.Divs {
			k := sort.SearchStrings(s.date, d.Date)
			if k < n {
				s.div[k] += d.Value
			}
		}
	}
	s.atr = s.align(analysis.ATR(p, 14))
	sum := 0.0
	for i := 0; i < n; i++ {
		sum += s.c[i] * s.v[i]
		if i >= 20 {
			sum -= s.c[i-20] * s.v[i-20]
		}
		if i >= 19 {
			s.to20[i] = sum / 20 / 1e9
		}
		s.liquid[i] = i >= warmup && s.to20[i] >= minTO
	}
	for _, hz := range horizons {
		f := make([]float64, n)
		for i := range f {
			f[i] = nan
			if i+hz < n {
				j, e := s.entryAt(i)
				if j > 0 && j < i+hz && e > 0 {
					// total return: dividends going ex after the entry bar belong to the buyer
					d := 0.0
					for k := j + 1; k <= i+hz; k++ {
						d += s.div[k]
					}
					f[i] = ((s.c[i+hz]+d)/e-1)*100 - costPct
				}
			}
		}
		s.fw[hz] = f
	}
	s.dec = make([]analysis.Decision, n)
	for i := decStart; i < n; i++ {
		s.dec[i] = analysis.DecisionEngine(p[:i+1])
	}
	return s
}

// IDX auto-rejection locks. A bar is treated as locked when it traded at one
// price all day, or closed at its low/high after moving at least 6.9% — the
// smallest ARB ever in force (2020–2023), so this flags too many locks rather
// than too few (conservative: orders fail more often than in reality).
const lockMove = 0.069

func (s *series) lockedUp(j int) bool {
	if j < 1 || j >= s.n {
		return false
	}
	r := s.c[j]/s.c[j-1] - 1
	return (s.h[j] == s.l[j] && r > 0) || (s.o[j] == s.h[j] && s.c[j] == s.h[j] && r >= lockMove)
}

func (s *series) lockedDown(j int) bool {
	if j < 1 || j >= s.n {
		return false
	}
	r := s.c[j]/s.c[j-1] - 1
	return (s.h[j] == s.l[j] && r < 0) || (s.c[j] == s.l[j] && r <= -lockMove)
}

// entryAt is the fill for a signal on bar i: the open of the first bar after
// i that is not ARA-locked (a buy at the open of a locked bar doesn't fill;
// it is retried next day, at most 5 days). j = −1 when it never fills.
func (s *series) entryAt(i int) (j int, price float64) {
	for j = i + 1; j < s.n && j <= i+5; j++ {
		if s.lockedUp(j) {
			continue
		}
		if s.o[j] > 0 {
			return j, s.o[j]
		}
		return j, s.c[j]
	}
	return -1, 0
}

// align maps an app indicator's points onto this stock's bar index.
func (s *series) align(pts []analysis.Point) []float64 {
	m := make(map[string]float64, len(pts))
	for _, p := range pts {
		m[p.Date] = p.Value
	}
	out := make([]float64, s.n)
	for i, d := range s.date {
		if x, ok := m[d]; ok {
			out[i] = x
		} else {
			out[i] = nan
		}
	}
	return out
}

// window returns the last `size` bars ending at i (inclusive).
func (s *series) window(i, size int) []models.StockPrice {
	lo := i + 1 - size
	if lo < 0 {
		lo = 0
	}
	return s.p[lo : i+1]
}

// trade replays the ATR bracket used across research/: entry next open (ARA
// retry), stop -1.5 ATR, target +3 ATR, time exit at the close of bar i+20.
// A stop or time exit on an ARB-locked bar can't sell: it sells at the open
// of the next unlocked bar (up to 10 more bars). Price only (no dividends).
// NaN when unresolved.
func (s *series) trade(i int) float64 { pnl, _, _ := s.tradeFull(i); return pnl }

// tradeFull also returns the entry and exit bars (−1 when unresolved).
func (s *series) tradeFull(i int) (pnl float64, entry, exit int) {
	j0, e := s.entryAt(i)
	a := s.atr[i]
	if j0 < 0 || e <= 0 || math.IsNaN(a) || i+20 >= s.n {
		return nan, -1, -1
	}
	stop, tp := e-1.5*a, e+3*a
	out := func(px float64, k int) (float64, int, int) { return (px/e-1)*100 - costPct, j0, k }
	sellNext := func(from int) (float64, int, int) {
		for k := from; k < s.n && k <= from+10; k++ {
			if !s.lockedDown(k) {
				return out(s.o[k], k)
			}
		}
		return nan, -1, -1
	}
	for j := j0; j <= i+20; j++ {
		if s.l[j] <= stop {
			if s.lockedDown(j) {
				return sellNext(j + 1)
			}
			return out(math.Min(stop, s.o[j]), j)
		}
		if s.h[j] >= tp {
			return out(math.Max(tp, s.o[j]), j)
		}
	}
	if s.lockedDown(i + 20) {
		return sellNext(i + 21)
	}
	return out(s.c[i+20], i+20)
}

// ── small series helpers ────────────────────────────────────────────────────

func crossUp(a, b []float64) []bool {
	out := make([]bool, len(a))
	for i := 1; i < len(a); i++ {
		out[i] = a[i] > b[i] && a[i-1] <= b[i-1] // NaN compares false
	}
	return out
}

func crossUpK(a []float64, k float64) []bool {
	return crossUp(a, constant(len(a), k))
}

func constant(n int, k float64) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = k
	}
	return out
}

func and(xs ...[]bool) []bool {
	out := make([]bool, len(xs[0]))
	for i := range out {
		out[i] = true
		for _, x := range xs {
			out[i] = out[i] && x[i]
		}
	}
	return out
}

func where(n int, f func(i int) bool) []bool {
	out := make([]bool, n)
	for i := range out {
		out[i] = f(i)
	}
	return out
}

func values(n int, f func(i int) float64) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = f(i)
	}
	return out
}

func rollMax(x []float64, n int) []float64 { return roll(x, n, math.Max, math.Inf(-1)) }
func rollMin(x []float64, n int) []float64 { return roll(x, n, math.Min, math.Inf(1)) }

func roll(x []float64, n int, f func(a, b float64) float64, init float64) []float64 {
	out := make([]float64, len(x))
	for i := range x {
		out[i] = nan
		if i+1 < n {
			continue
		}
		m := init
		for j := i + 1 - n; j <= i; j++ {
			m = f(m, x[j])
		}
		out[i] = m
	}
	return out
}

func rollMean(x []float64, n int) []float64 {
	out := make([]float64, len(x))
	for i := range x {
		out[i] = nan
		if i+1 < n {
			continue
		}
		sum := 0.0
		for j := i + 1 - n; j <= i; j++ {
			sum += x[j]
		}
		out[i] = sum / float64(n)
	}
	return out
}

func rollStd(x []float64, n int) []float64 {
	m := rollMean(x, n)
	out := make([]float64, len(x))
	for i := range x {
		out[i] = nan
		if math.IsNaN(m[i]) {
			continue
		}
		ss := 0.0
		for j := i + 1 - n; j <= i; j++ {
			ss += (x[j] - m[i]) * (x[j] - m[i])
		}
		out[i] = math.Sqrt(ss / float64(n-1))
	}
	return out
}

func ema(x []float64, n int) []float64 {
	out := make([]float64, len(x))
	k := 2 / float64(n+1)
	prev := nan
	for i, v := range x {
		switch {
		case math.IsNaN(v):
			out[i] = prev
		case math.IsNaN(prev):
			prev = v
			out[i] = v
		default:
			prev = prev + k*(v-prev)
			out[i] = prev
		}
	}
	return out
}

func shift(x []float64, k int) []float64 {
	out := make([]float64, len(x))
	for i := range x {
		out[i] = nan
		if i-k >= 0 && i-k < len(x) {
			out[i] = x[i-k]
		}
	}
	return out
}

func ret(x []float64, k int) []float64 {
	return values(len(x), func(i int) float64 {
		if i < k || x[i-k] <= 0 {
			return nan
		}
		return x[i]/x[i-k] - 1
	})
}
