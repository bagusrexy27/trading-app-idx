package analysis

import (
	"fmt"
	"math"
	"testing"

	"stock-api/models"
)

// synthetic 120-bar series: downtrend then recovery (HH+HL at the end).
func synthPrices(n int) []models.StockPrice {
	out := make([]models.StockPrice, n)
	price := 1000.0
	for i := 0; i < n; i++ {
		if i < n/2 {
			price -= 4 // fall
		} else {
			price += 6 // recover
		}
		wave := 15 * math.Sin(float64(i)/4) // swings so fractals exist
		c := price + wave
		out[i] = models.StockPrice{
			Date: fmt.Sprintf("2026-%02d-%02d", 1+i/28, 1+i%28),
			Open: c - 5, High: c + 10, Low: c - 10, Close: c,
			Volume: 1_000_000 + int64(i)*10_000,
		}
	}
	return out
}

func TestDecisionEngineInvariants(t *testing.T) {
	d := DecisionEngine(synthPrices(120))

	if got := d.Probability.Bullish + d.Probability.Sideways + d.Probability.Bearish; got != 100 {
		t.Errorf("probability must sum to 100, got %d", got)
	}
	valid := map[string]bool{"STRONG_BUY": true, "BUY": true, "WAIT": true, "SELL": true, "STRONG_SELL": true}
	if !valid[d.Signal] {
		t.Errorf("invalid signal %q", d.Signal)
	}
	if d.Score < 0 || d.Score > 100 || d.Confidence < 0 || d.Confidence > 100 {
		t.Errorf("score/confidence out of range: %d / %d", d.Score, d.Confidence)
	}
	if len(d.Support) == 0 || len(d.Resistance) == 0 {
		t.Error("support/resistance must never be empty (fallback exists)")
	}
	if d.EntryZone.Buy[0] > d.EntryZone.Buy[1] {
		t.Errorf("entry zone inverted: %v", d.EntryZone.Buy)
	}
	if d.StopLoss >= d.EntryZone.Buy[0] {
		t.Errorf("stop %v must be below entry zone %v", d.StopLoss, d.EntryZone.Buy)
	}
	if len(d.TakeProfit) == 0 {
		t.Error("take profit empty")
	}
	wsum := 0
	for _, c := range d.Components {
		wsum += c.Weight
	}
	if wsum != 100 {
		t.Errorf("component weights must sum to 100, got %d", wsum)
	}
}

// The gate is what stops the engine from calling a direction the factors do
// not agree on — if it ever stops firing, WAIT-on-conflict is silently gone.
func TestDecisionEngineLowConfidenceGate(t *testing.T) {
	d := DecisionEngine(synthPrices(120))
	if d.Confidence < 45 && d.Signal != "WAIT" {
		t.Errorf("confidence %d < 45 must be gated to WAIT, got %s", d.Confidence, d.Signal)
	}
	if d.Note != "" && d.Signal != "WAIT" {
		t.Errorf("gate note set but signal is %s, want WAIT", d.Signal)
	}
}

func TestDecisionEngineHasNewFactors(t *testing.T) {
	d := DecisionEngine(synthPrices(120))
	want := map[string]bool{"Money Flow": false, "Trend Strength": false}
	for _, c := range d.Components {
		if _, ok := want[c.Name]; ok {
			want[c.Name] = true
			if c.Score < 0 || c.Score > 100 {
				t.Errorf("%s score out of range: %d", c.Name, c.Score)
			}
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("missing factor %q", name)
		}
	}
}

// A stock that collapsed leaves swing levels stranded far above price. Without
// capping, that reads as unlimited upside: perfect S/R score and absurd R/R.
func TestDecisionEngineCapsStrandedTargets(t *testing.T) {
	p := synthPrices(120)
	// Drop the last 30 bars to a fraction of their price, leaving the old
	// highs far overhead — the TPIA shape.
	for i := len(p) - 30; i < len(p); i++ {
		p[i].Open *= 0.4
		p[i].High *= 0.4
		p[i].Low *= 0.4
		p[i].Close *= 0.4
	}
	d := DecisionEngine(p)

	last := p[len(p)-1].Close
	if d.TakeProfit[0].Price > last*2 {
		t.Errorf("TP1 %v is more than 2x price %v — target not capped", d.TakeProfit[0].Price, last)
	}
	if len(d.TakeProfit) > 1 && d.TakeProfit[1].Price <= d.TakeProfit[0].Price {
		t.Errorf("TP tiers out of order: %v", d.TakeProfit)
	}
	if d.RiskReward > rrImplausible {
		for _, c := range d.Components {
			if c.Name == "Risk/Reward" && c.Score > 50 {
				t.Errorf("implausible R/R %.1f scored %d, want ≤50", d.RiskReward, c.Score)
			}
		}
	}
}

func TestDecisionEngineInsufficientData(t *testing.T) {
	d := DecisionEngine(synthPrices(30))
	if d.Signal != "WAIT" || d.Confidence != 0 {
		t.Errorf("short data must be WAIT/0, got %s/%d", d.Signal, d.Confidence)
	}
}

func TestRoundTick(t *testing.T) {
	cases := map[float64]float64{153: 153, 333: 334, 1234: 1235, 3333: 3330, 7777: 7775}
	for in, want := range cases {
		if got := roundTick(in); got != want {
			t.Errorf("roundTick(%v) = %v, want %v", in, got, want)
		}
	}
}
