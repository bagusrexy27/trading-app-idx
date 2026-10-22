package analysis

import (
	"fmt"
	"math"
	"testing"

	"stock-api/models"
)

// TestADXMatchesWilder checks ADX against a direct transcription of Wilder's
// definition on a short, choppy series (where a bad seed shows up clearly).
func TestADXMatchesWilder(t *testing.T) {
	var prices []models.StockPrice
	c := 1000.0
	for i := 0; i < 60; i++ {
		c += float64((i*37)%23) - 11 // deterministic chop
		prices = append(prices, models.StockPrice{Date: fmt.Sprintf("2024-%03d", i), High: c + float64(i%5) + 3, Low: c - float64(i%7) - 2, Close: c})
	}
	got := ADX(prices, 14)

	// reference: rma() seeded with SMA, exactly as TradingView's ta.rma
	rma := func(x []float64) []float64 {
		out := make([]float64, len(x))
		s := 0.0
		for i, v := range x {
			if i < 14 {
				s += v
				out[i] = math.NaN()
				if i == 13 {
					out[i] = s / 14
				}
				continue
			}
			out[i] = (out[i-1]*13 + v) / 14
		}
		return out
	}
	var trs, ps, ms []float64
	for i := 1; i < len(prices); i++ {
		up, dn := prices[i].High-prices[i-1].High, prices[i-1].Low-prices[i].Low
		p, m := 0.0, 0.0
		if up > dn && up > 0 {
			p = up
		}
		if dn > up && dn > 0 {
			m = dn
		}
		trs = append(trs, math.Max(prices[i].High-prices[i].Low, math.Max(math.Abs(prices[i].High-prices[i-1].Close), math.Abs(prices[i].Low-prices[i-1].Close))))
		ps, ms = append(ps, p), append(ms, m)
	}
	tr, p, m := rma(trs), rma(ps), rma(ms)
	var dx []float64
	for i := 13; i < len(tr); i++ {
		pd, md := 100*p[i]/tr[i], 100*m[i]/tr[i]
		dx = append(dx, 100*math.Abs(pd-md)/(pd+md))
	}
	want := rma(dx)
	if len(got) != len(dx)-13 {
		t.Fatalf("got %d points, want %d", len(got), len(dx)-13)
	}
	for j, g := range got {
		w := want[j+13]
		if g.ADX < 0 || g.ADX > 100 || math.Abs(g.ADX-w) > 0.01 {
			t.Fatalf("point %d (%s): ADX %.2f, want %.2f", j, g.Date, g.ADX, w)
		}
	}
}

func TestVWAPRollingWindow(t *testing.T) {
	// 2 bars at TP 100 (vol 1), then TP 200 (vol 3): 2-bar VWAP = (100+600)/4
	p := []models.StockPrice{
		{Date: "a", High: 100, Low: 100, Close: 100, Volume: 1},
		{Date: "b", High: 100, Low: 100, Close: 100, Volume: 1},
		{Date: "c", High: 200, Low: 200, Close: 200, Volume: 3},
	}
	got := VWAP(p, 2)
	if len(got) != 2 || got[0].Value != 100 || got[1].Value != 175 {
		t.Errorf("got %+v", got)
	}
}

func TestIchimokuIsDisplaced(t *testing.T) {
	var p []models.StockPrice
	for i := 0; i < 120; i++ {
		v := float64(1000 + i*10) // steady uptrend: midpoint of n bars ending at j = close[j] - 5(n-1)
		p = append(p, models.StockPrice{Date: fmt.Sprintf("2024-%03d", i), High: v, Low: v, Close: v})
	}
	pts := Ichimoku(p)
	first := pts[0] // date index 77, cloud computed at bar 51
	if first.Date != p[77].Date || first.SpanB != 1255 || *first.Chikou != p[103].Close {
		t.Errorf("first: %+v chikou=%v", first, *first.Chikou)
	}
	if pts[len(pts)-1].Chikou != nil {
		t.Error("chikou of the last bar is in the future")
	}
}
