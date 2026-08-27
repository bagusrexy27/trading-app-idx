package analysis

import (
	"testing"

	"stock-api/models"
)

func TestAVWAPFromAnchor(t *testing.T) {
	prices := []models.StockPrice{
		{Date: "2024-01-01", High: 110, Low: 90, Close: 100, Volume: 1000},
		{Date: "2024-01-02", High: 120, Low: 100, Close: 110, Volume: 2000},
		{Date: "2024-01-03", High: 130, Low: 110, Close: 120, Volume: 3000},
	}
	pts := AVWAP(prices, "2024-01-02")
	if len(pts) != 2 {
		t.Fatalf("expected 2 points, got %d", len(pts))
	}
	if pts[0].Date != "2024-01-02" || pts[0].Value <= 0 {
		t.Fatalf("unexpected first point: %+v", pts[0])
	}
}

func TestAVWAPMissingAnchor(t *testing.T) {
	prices := []models.StockPrice{
		{Date: "2024-01-01", High: 110, Low: 90, Close: 100, Volume: 1000},
	}
	if AVWAP(prices, "2024-06-01") != nil {
		t.Fatal("expected nil for missing anchor")
	}
}

func TestScoreFVGConfluenceNeutral(t *testing.T) {
	sc, note := scoreFVGConfluence([]models.StockPrice{}, 1000)
	if sc != 50 {
		t.Fatalf("expected neutral 50, got %d", sc)
	}
	if note == "" {
		t.Fatal("expected note")
	}
}

func TestScoreBandarmologyNoData(t *testing.T) {
	sc, note := scoreBandarmology(nil)
	if sc != 50 || note == "" {
		t.Fatalf("expected neutral with note, got %d %q", sc, note)
	}
}

func TestDecisionEngineComponentWeightsSum100(t *testing.T) {
	prices := synthUptrend(80)
	dec := DecisionEngine(prices)
	sum := 0
	for _, c := range dec.Components {
		sum += c.Weight
	}
	if sum != 100 {
		t.Fatalf("component weights sum to %d, want 100", sum)
	}
}
