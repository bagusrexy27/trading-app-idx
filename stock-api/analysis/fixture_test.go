package analysis

import (
	"encoding/json"
	"os"
	"testing"

	"stock-api/models"
)

// loadFixture reads a frozen copy of real OHLCV from testdata/ — not ../data,
// which the auto-updater rewrites every 15 min and would make tests drift.
func loadFixture(t *testing.T, sym string) []models.StockPrice {
	t.Helper()
	b, err := os.ReadFile("testdata/" + sym + ".json")
	if err != nil {
		t.Fatalf("missing fixture testdata/%s.json: %v", sym, err)
	}
	var sd models.StockData
	if err := json.Unmarshal(b, &sd); err != nil {
		t.Fatalf("parse %s: %v", sym, err)
	}
	return sd.Prices
}
