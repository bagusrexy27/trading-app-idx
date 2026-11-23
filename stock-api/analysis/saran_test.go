package analysis

import "testing"

// Saran on every bar of a real fixture: BUY exactly when all four checks pass,
// SELL never carries a plan, every plan is close / −1.5 ATR / +3 ATR (R:R 2
// before tick rounding). Also guards that each verdict actually occurs.
func TestSaranRule(t *testing.T) {
	seen := map[string]int{}
	for _, sym := range []string{"BBCA", "DEWA", "TINS"} {
		p := loadFixture(t, sym)
		for i := 60; i <= len(p); i += 3 {
			d := Saran(p[:i])
			seen[d.Signal]++
			all := len(d.Components) == 4
			for _, c := range d.Components {
				all = all && c.Score == 100
			}
			if (d.Signal == "BUY") != all {
				t.Fatalf("%s bar %d: signal %s but checks %+v", sym, i, d.Signal, d.Components)
			}
			if d.Signal == "SELL" && (d.StopLoss != 0 || d.TakeProfit != nil) {
				t.Fatalf("%s bar %d: SELL must not carry a plan", sym, i)
			}
			if d.Signal == "SELL" || d.StopLoss == 0 {
				continue
			}
			entry := d.EntryZone.Ideal
			if !(d.StopLoss < entry && entry < d.TakeProfit[0].Price) {
				t.Fatalf("%s bar %d: plan out of order %v / %v / %v", sym, i, d.StopLoss, entry, d.TakeProfit[0].Price)
			}
			if d.RiskReward < 1.8 || d.RiskReward > 2.2 {
				t.Fatalf("%s bar %d: R:R %v, want ≈2", sym, i, d.RiskReward)
			}
		}
	}
	for _, s := range []string{"BUY", "WAIT", "SELL"} {
		if seen[s] == 0 {
			t.Errorf("verdict %s never occurred: %v", s, seen)
		}
	}
	if d := Saran(synthPrices(30)); d.Signal != "WAIT" || d.StopLoss != 0 {
		t.Errorf("short history must be WAIT without plan, got %+v", d)
	}
}

func TestWarnRegime(t *testing.T) {
	buy := Decision{Signal: "BUY", StopLoss: 90}
	if got := WarnRegime(buy, "down"); got.Note != RegimeWarnNote || got.Signal != "BUY" || got.StopLoss != 90 {
		t.Fatalf("down regime must warn but hide nothing, got %+v", got)
	}
	for _, r := range []string{"up", ""} {
		if got := WarnRegime(buy, r); got.Note != "" {
			t.Fatalf("regime %q must not warn, got %+v", r, got)
		}
	}
	if got := WarnRegime(Decision{Signal: "WAIT"}, "down"); got.Note != "" {
		t.Fatalf("only BUY is warned, got %+v", got)
	}
}
