package analysis

import (
	"encoding/json"
	"os"
	"testing"

	"stock-api/models"
)

// loadFixture reads a real data file from ../data for verification.
func loadFixture(t *testing.T, sym string) []models.StockPrice {
	t.Helper()
	b, err := os.ReadFile("../data/" + sym + ".json")
	if err != nil {
		t.Skipf("no data file for %s: %v", sym, err)
	}
	var sd models.StockData
	if err := json.Unmarshal(b, &sd); err != nil {
		t.Fatalf("parse %s: %v", sym, err)
	}
	return sd.Prices
}

// TestAdvisorRealData runs the advisor over several holdings and asserts the
// verdict is one of the known values, R/R is sane, and stop < entry < target.
// Also prints a human-readable summary.
func TestAdvisorRealData(t *testing.T) {
	valid := map[string]bool{"STRONG_BUY": true, "BUY": true, "WAIT": true, "REDUCE": true, "AVOID": true}
	for _, sym := range []string{"TPIA", "VKTR", "DEWA", "BBCA", "UNVR", "TINS"} {
		prices := loadFixture(t, sym)
		a := Advisor(prices)
		if !valid[a.Verdict] {
			t.Errorf("%s: unexpected verdict %q", sym, a.Verdict)
		}
		if a.Stop >= a.Entry {
			t.Errorf("%s: stop %.0f should be below entry %.0f", sym, a.Stop, a.Entry)
		}
		if a.Target < a.Entry {
			t.Errorf("%s: target %.0f should not be below entry %.0f", sym, a.Target, a.Entry)
		}
		if a.RiskReward < 0 {
			t.Errorf("%s: negative R/R %.2f", sym, a.RiskReward)
		}
		t.Logf("%-5s %-11s conf=%-6s trend=%-8s lok=%-16s candle=%-22s vol=%-6s | entry=%.0f stop=%.0f(%.1f%%) tgt=%.0f RR=%.1f",
			sym, a.Verdict, a.Confidence, a.Trend, a.Location, a.Candle, a.VolumeState,
			a.Entry, a.Stop, a.StopPct, a.Target, a.RiskReward)
		t.Logf("      -> %s", a.Action)
	}
}
