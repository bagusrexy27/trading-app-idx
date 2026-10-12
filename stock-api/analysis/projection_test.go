package analysis

import (
	"fmt"
	"testing"

	"stock-api/models"
)

func TestProjStatFinalize(t *testing.T) {
	p := &ProjStat{zs: []float64{2, -2, 0, 1, -1, 0.2, -0.2, 0.6, -0.6, 0}}
	p.finalize()
	// z > 0.5: 2, 1, 0.6 → 30%; z < -0.5: -2, -1, -0.6 → 30%; rest 40%
	if p.Samples != 10 || p.Bullish != 30 || p.Bearish != 30 || p.Sideways != 40 {
		t.Fatalf("split = %+v", p)
	}
	if p.Z[2] != 0 || p.Z[0] >= p.Z[1] || p.Z[3] >= p.Z[4] {
		t.Fatalf("quantiles = %v", p.Z)
	}
}

func TestProjectScalesBandByATR(t *testing.T) {
	c := &Calibration{Projection: map[string]map[int]map[int]*ProjStat{"all": {}}}
	for _, h := range ProjHorizons {
		c.Projection["all"][h] = map[int]*ProjStat{60: {Samples: 50, Z: [5]float64{-1, -0.5, 0, 0.5, 1}}}
	}
	v := c.Project(65, "up", 2) // regime "up" missing → falls back to "all"
	if len(v) != 3 || v[2].Horizon != 20 || v[2].Regime != "all" {
		t.Fatalf("views = %+v", v)
	}
	// unit = 2% × √20 ≈ 8.94 → p90 ≈ +8.94%, threshold ≈ 4.47%
	if v[2].Band[4] != 8.94 || v[2].Threshold != 4.47 {
		t.Fatalf("band = %v threshold = %v", v[2].Band, v[2].Threshold)
	}
}

// End-to-end: a series rising 1%/bar with a ±1% daily range must land every
// projection case in Bullish (20-bar move ≈ +22% vs threshold ≈ 0.5×2%×√20 ≈ 4.5%),
// and each horizon must count exactly the bars that have h bars of future.
func TestCalibrateProjectionSteadyRise(t *testing.T) {
	const n = 120
	prices := make([]models.StockPrice, n)
	c := 1000.0
	for i := range prices {
		prev := c
		c *= 1.01
		prices[i] = models.StockPrice{
			Date: fmt.Sprintf("2026-%02d-%02d", 1+i/28, 1+i%28),
			Open: prev, High: c * 1.01, Low: c * 0.99, Close: c, Volume: 1_000_000,
		}
	}
	cal := Calibrate(map[string][]models.StockPrice{"TEST": prices}, nil)
	for _, h := range ProjHorizons {
		samples := 0
		for b, p := range cal.Projection["all"][h] {
			samples += p.Samples
			if p.Bullish != 100 {
				t.Errorf("h=%d bucket %d: bullish %.2f%%, want 100", h, b, p.Bullish)
			}
		}
		// replay runs i = 59 … n-2; a case needs i+h < n
		if want := n - h - 59; samples != want {
			t.Errorf("h=%d: %d samples, want %d", h, samples, want)
		}
	}
	if len(cal.Projection["up"][20]) != 0 {
		t.Error("nil regime must not fill regime buckets")
	}
}
