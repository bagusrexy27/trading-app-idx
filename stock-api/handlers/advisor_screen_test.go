package handlers

import "testing"

func TestFilterScreenRowsBuyModeExcludesLowRR(t *testing.T) {
	rows := []screenRow{
		{Symbol: "GOOD", Signal: "BUY", RiskReward: 2.5, Confidence: 70, Syariah: true},
		{Symbol: "BAD", Signal: "BUY", RiskReward: 0.6, Confidence: 80, Syariah: false},
		{Symbol: "WAIT", Signal: "WAIT", RiskReward: 3, Confidence: 90},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "buy"})
	if len(out) != 1 || out[0].Symbol != "GOOD" {
		t.Fatalf("expected only GOOD, got %+v", out)
	}
}

func TestFilterScreenRowsMinRR(t *testing.T) {
	rows := []screenRow{
		{Symbol: "A", Signal: "BUY", RiskReward: 1.2},
		{Symbol: "B", Signal: "BUY", RiskReward: 2.0},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "buy", MinRR: 1.5, IncludeLowRR: true})
	if len(out) != 1 || out[0].Symbol != "B" {
		t.Fatalf("expected B only, got %+v", out)
	}
}

func TestFilterScreenRowsSyariah(t *testing.T) {
	rows := []screenRow{
		{Symbol: "A", Signal: "BUY", RiskReward: 2, Syariah: true},
		{Symbol: "B", Signal: "BUY", RiskReward: 2, Syariah: false},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "buy", SyariahOnly: true, IncludeLowRR: true})
	if len(out) != 1 || out[0].Symbol != "A" {
		t.Fatalf("expected syariah only, got %+v", out)
	}
}

func TestFilterScreenRowsAllMode(t *testing.T) {
	rows := []screenRow{
		{Symbol: "A", Signal: "WAIT", RiskReward: 0.5},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "all"})
	if len(out) != 1 {
		t.Fatalf("all mode should keep WAIT rows, got %+v", out)
	}
}
