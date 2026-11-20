package main

import (
	"math"
	"math/rand"
	"testing"
)

// The A–F rules are pre-registered in docs/rapor-indikator-plan.md (Fase 6) —
// if any of these change, the report card silently means something else.
func TestFinalGradeRules(t *testing.T) {
	months := func(v float64, from, to int) []obs { // one obs per month, years from..to
		var o []obs
		for y := from; y <= to; y++ {
			for m := 1; m <= 12; m++ {
				o = append(o, obs{itoa4(y) + "-" + two(m) + "-15", v + 0.1*float64(m%3-1)})
			}
		}
		return o
	}
	yes := true
	cases := []struct {
		name string
		r    Result
		want string
	}{
		{"not significant is D", Result{Kind: "signal", Q: 0.2, obs: months(1, 2020, 2026), netObs: months(1, 2020, 2026)}, "D"},
		{"significant but costs eat it is C", Result{Kind: "signal", Q: 0.01, obs: months(0.3, 2020, 2026), netObs: months(0.3, 2020, 2026)}, "C"},
		{"significant, net > 0, not param-tested is B", Result{Kind: "signal", Q: 0.01, NEff: 84, yearsOK: true,
			Random: &Random{Beats: true}, obs: months(1, 2020, 2026), netObs: months(1, 2020, 2026)}, "B"},
		{"everything passes is A", Result{Kind: "signal", Q: 0.01, NEff: 84, yearsOK: true, Stable: &yes,
			Random: &Random{Beats: true}, obs: months(1, 2020, 2026), netObs: months(1, 2020, 2026)}, "A"},
		{"significantly worse than market is E", Result{Kind: "signal", Q: 0.01, obs: months(-1, 2020, 2026), netObs: months(-1, 2020, 2026)}, "E"},
		{"strong in-sample, collapses in TEST is F", Result{Kind: "signal", Q: 0.01,
			obs: append(months(2, 2020, 2024), months(-0.5, 2026, 2026)...), netObs: months(2, 2020, 2025)}, "F"},
	}
	for _, c := range cases {
		r := c.r
		if r.dir == 0 {
			r.dir = 1
		}
		finalGrade(&r)
		if r.Grade != c.want {
			t.Errorf("%s: got %s (%v), want %s", c.name, r.Grade, r.Reasons, c.want)
		}
	}
}

func TestBenjaminiHochberg(t *testing.T) {
	rs := []Result{{P: 0.01}, {P: 0.04}, {P: 0.03}, {P: 0.5}}
	bh(rs)
	// sorted p .01 .03 .04 .5 → q = min over tail of p·m/rank: .04 .0533 .0533 .5
	want := []float64{0.04, 0.0533, 0.0533, 0.5}
	for i, w := range want {
		if math.Abs(rs[i].Q-w) > 1e-4 {
			t.Fatalf("q[%d] = %v, want %v", i, rs[i].Q, w)
		}
	}
}

func TestBootPSeparatesSignalFromNoise(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	strong, noise := make([]float64, 60), make([]float64, 60)
	for i := range strong {
		strong[i] = 1 + rng.NormFloat64()*0.5
		noise[i] = rng.NormFloat64()
	}
	if p := bootP(strong, rand.New(rand.NewSource(seed))); p > 0.01 {
		t.Fatalf("clear effect should be significant, p=%v", p)
	}
	if p := bootP(noise, rand.New(rand.NewSource(seed))); p < 0.05 {
		t.Fatalf("pure noise should not be significant, p=%v", p)
	}
}

func TestSpearmanTiesAndDirection(t *testing.T) {
	if r := spearman([]float64{1, 2, 3, 4}, []float64{10, 20, 30, 40}); math.Abs(r-1) > 1e-9 {
		t.Fatalf("monotone up = 1, got %v", r)
	}
	if r := spearman([]float64{1, 2, 3, 4}, []float64{4, 3, 2, 1}); math.Abs(r+1) > 1e-9 {
		t.Fatalf("monotone down = -1, got %v", r)
	}
	if r := ranks([]float64{5, 1, 5, 3}); r[0] != 3.5 || r[2] != 3.5 || r[1] != 1 || r[3] != 2 {
		t.Fatalf("ties get the average rank, got %v", r)
	}
}

func TestCrossUpNeedsPriorBelow(t *testing.T) {
	got := crossUpK([]float64{math.NaN(), 29, 31, 32, 28, 33}, 30)
	want := []bool{false, false, true, false, false, true}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("bar %d: got %v want %v", i, got[i], want[i])
		}
	}
}

// Value indicators: summarize must pick the better direction.
func TestSummarizeValueDirection(t *testing.T) {
	var o []obs
	for y := 2020; y <= 2026; y++ {
		for m := 1; m <= 12; m++ {
			o = append(o, obs{itoa4(y) + "-" + two(m) + "-15", -0.05 + 0.01*float64(m%4-2)})
		}
	}
	r := Result{Kind: "value"}
	summarize(&r, o, map[string]string{}, 1)
	if r.Direction != "rendah" || r.dir != -1 || !r.yearsOK || r.NEff != 84 {
		t.Fatalf("consistently negative IC = useful the other way, got %s dir=%v yearsOK=%v neff=%d", r.Direction, r.dir, r.yearsOK, r.NEff)
	}
}

func itoa4(y int) string {
	return string(rune('0'+y/1000)) + string(rune('0'+y/100%10)) + string(rune('0'+y/10%10)) + string(rune('0'+y%10))
}
func two(m int) string { return string(rune('0'+m/10)) + string(rune('0'+m%10)) }
