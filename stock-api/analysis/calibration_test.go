package analysis

import (
	"fmt"
	"testing"

	"stock-api/models"
)

// flatBars: n bars at 100 (O=H=L=C), so nothing resolves unless edited.
func flatBars(n int) []models.StockPrice {
	out := make([]models.StockPrice, n)
	for i := range out {
		out[i] = models.StockPrice{Date: fmt.Sprintf("2024-%03d", i), Open: 100, High: 100, Low: 100, Close: 100}
	}
	return out
}

func TestPlanOutcome(t *testing.T) {
	n := CalibHorizon + 5

	p := flatBars(n)
	p[3].High = 110
	if r, pnl, ok := planOutcome(p, 0, 95, 110); !ok || r != "WIN" || R2(pnl) != 10 {
		t.Errorf("win: got %s %.2f %v", r, pnl, ok)
	}

	p = flatBars(n)
	p[3].Low, p[3].High = 95, 110 // both touched same bar → conservative LOSS
	if r, _, _ := planOutcome(p, 0, 95, 110); r != "LOSS" {
		t.Errorf("same-bar: got %s, want LOSS", r)
	}

	p = flatBars(n)
	p[3].Open, p[3].Low = 90, 90 // gap through stop exits at the open
	if r, pnl, _ := planOutcome(p, 0, 95, 110); r != "LOSS" || R2(pnl) != -10 {
		t.Errorf("gap: got %s %.2f, want LOSS -10", r, pnl)
	}

	if r, _, ok := planOutcome(flatBars(n), 0, 95, 110); !ok || r != "TIMEOUT" {
		t.Errorf("timeout: got %s %v", r, ok)
	}

	if _, _, ok := planOutcome(flatBars(5), 0, 95, 110); ok {
		t.Error("unresolved at end of data must be skipped")
	}
	if _, _, ok := planOutcome(flatBars(n), 0, 101, 110); ok {
		t.Error("stop above entry must be skipped")
	}
}

func TestCalibLookupFallsBackToAll(t *testing.T) {
	c := &Calibration{Horizon: CalibHorizon, Buckets: map[string]map[int]*CalibStat{
		"all":  {60: {Samples: 100, WinRate: 55}},
		"down": {60: {Samples: 5, WinRate: 20}}, // too thin
	}}
	l := c.Lookup(64, "down")
	if l.Samples != 100 || !l.Reliable || l.Regime != "down" || l.ScoreLo != 60 || l.ScoreHi != 69 {
		t.Errorf("got %+v", l)
	}
	if l := c.Lookup(64, ""); l.Regime != "unknown" {
		t.Errorf("unknown regime: got %+v", l)
	}
	if (*Calibration)(nil).Lookup(50, "up") != nil {
		t.Error("nil calibration must return nil")
	}
}

func TestIndexRegime(t *testing.T) {
	idx := flatBars(60)
	for i := 55; i < 60; i++ {
		idx[i].Close = 50 // drop below SMA50
	}
	r := IndexRegime(idx)
	if got := r(idx[52].Date); got != "up" {
		t.Errorf("before drop: got %q", got)
	}
	if got := r("9999-12-31"); got != "down" {
		t.Errorf("latest: got %q", got)
	}
	if got := r("2000-01-01"); got != "" {
		t.Errorf("before history: got %q", got)
	}
}
