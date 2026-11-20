package main

import (
	"fmt"
	"math"
	"math/rand"
	"sort"
)

// Fase 6 #3 statistics (docs/rapor-indikator-plan.md). Fixed seeds so a
// re-run gives the same numbers.
const (
	bootN     = 2000 // block-bootstrap resamples
	randomN   = 1000 // random-entry simulations
	seed      = 42
	qMax      = 0.05 // Benjamini–Hochberg false-discovery rate
	minNEff   = 24   // months: below this an indicator can't reach A
	minTestNE = 6    // TEST months needed to call an overfit
)

// Random is the random-entry benchmark: the same number of trades at random
// liquid (stock, day) pairs, randomN times.
type Random struct {
	P50   float64 `json:"p50"`
	P95   float64 `json:"p95"`
	Beats bool    `json:"beats_p95"`
}

// monthly averages observations per calendar month — the block unit for the
// bootstrap (signals in one month share the same market move).
func monthly(o []obs) []float64 {
	by := map[string][]float64{}
	for _, x := range o {
		by[x.date[:7]] = append(by[x.date[:7]], x.v)
	}
	keys := make([]string, 0, len(by))
	for k := range by {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]float64, len(keys))
	for i, k := range keys {
		out[i] = mean(by[k])
	}
	return out
}

// bootP is the two-sided block-bootstrap p-value that the mean of the
// monthly means is zero (blocks = months, resampled with replacement).
func bootP(m []float64, rng *rand.Rand) float64 {
	if len(m) < 3 {
		return 1
	}
	below, above := 0, 0
	for b := 0; b < bootN; b++ {
		s := 0.0
		for range m {
			s += m[rng.Intn(len(m))]
		}
		if s <= 0 {
			below++
		}
		if s >= 0 {
			above++
		}
	}
	p := 2 * float64(min(below, above)) / bootN
	return math.Max(math.Min(p, 1), 1.0/bootN)
}

func randomEntry(pool []float64, n int, rng *rand.Rand) *Random {
	if n == 0 || len(pool) == 0 {
		return nil
	}
	means := make([]float64, randomN)
	for k := range means {
		s := 0.0
		for i := 0; i < n; i++ {
			s += pool[rng.Intn(len(pool))]
		}
		means[k] = s / float64(n)
	}
	sort.Float64s(means)
	return &Random{P50: r3(means[randomN/2]), P95: r3(means[randomN*95/100])}
}

// bh fills Q with Benjamini–Hochberg adjusted p-values across all results.
func bh(rs []Result) {
	idx := make([]int, len(rs))
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return rs[idx[a]].P < rs[idx[b]].P })
	m := float64(len(rs))
	prev := 1.0
	for k := len(idx) - 1; k >= 0; k-- {
		q := math.Min(prev, rs[idx[k]].P*m/float64(k+1))
		rs[idx[k]].Q = round(q, 10000)
		prev = q
	}
}

// finalGrade applies the A–F scale fixed in the plan before this code ran.
// r must carry its observations (r.obs, r.netObs), P/Q, NEff, Random.
func finalGrade(r *Result) {
	dir := r.dir
	all := make([]float64, len(r.obs))
	var ins, test []obs
	for i, x := range r.obs {
		all[i] = x.v * dir
		if splitOf(x.date) == "TEST" {
			test = append(test, obs{x.date, x.v * dir})
		} else {
			ins = append(ins, obs{x.date, x.v * dir})
		}
	}
	r.InSample, r.Holdout = r3(meanObs(ins)), r3(meanObs(test))
	insP := bootP(monthly(ins), rand.New(rand.NewSource(seed)))

	r.EdgeNet = map[string]float64{}
	net := map[string][]float64{}
	for _, x := range r.netObs {
		net[splitOf(x.date)] = append(net[splitOf(x.date)], x.v-costPct)
	}
	allNet, netPos := []float64{}, 0
	for _, s := range splits {
		if len(net[s]) > 0 {
			r.EdgeNet[s] = r3(mean(net[s]))
			if r.EdgeNet[s] > 0 {
				netPos++
			}
		}
		allNet = append(allNet, net[s]...)
	}
	netMean := mean(allNet)
	sig := r.Q < qMax
	why := func(f string, a ...any) { r.Reasons = append(r.Reasons, fmt.Sprintf(f, a...)) }
	why("q = %.3f (%s)", r.Q, map[bool]string{true: "signifikan", false: "tidak signifikan"}[sig])

	switch {
	case insP < qMax && r.InSample > 0 && len(monthly(test)) >= minTestNE && r.Holdout < 0.5*r.InSample:
		r.Grade = "F"
		why("in-sample %.3f → TEST %.3f: turun > 50%% (indikasi overfit)", r.InSample, r.Holdout)
	case r.Kind == "signal" && sig && mean(all) < 0:
		r.Grade = "E"
		why("sinyal beli signifikan lebih jelek dari pasar")
	case !sig:
		r.Grade = "D"
	case !(netMean > 0):
		r.Grade = "C"
		why("ada daya prediksi, tapi edge setelah biaya %.3f ≤ 0", netMean)
	default:
		r.Grade = "B"
		why("edge setelah biaya %.3f > 0", netMean)
		var miss []string
		if netPos < 3 {
			miss = append(miss, "tidak untung di ketiga periode")
		}
		if !r.yearsOK {
			miss = append(miss, "menang < 5/7 tahun")
		}
		if r.Kind == "signal" && (r.Random == nil || !r.Random.Beats) {
			miss = append(miss, "tidak mengalahkan p95 random entry")
		}
		if r.NEff < minNEff {
			miss = append(miss, fmt.Sprintf("hanya %d bulan data", r.NEff))
		}
		if r.Stable == nil {
			miss = append(miss, "stabilitas parameter belum diuji")
		} else if !*r.Stable {
			miss = append(miss, "tidak stabil di parameter tetangga")
		}
		if len(miss) == 0 {
			r.Grade = "A"
		} else {
			why("belum A: %v", miss)
		}
	}
}

func meanObs(o []obs) float64 {
	v := make([]float64, len(o))
	for i, x := range o {
		v[i] = x.v
	}
	return mean(v)
}
