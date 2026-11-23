package handlers

import (
	"testing"
	"time"
)

func TestFilterScreenRowsBuyModeKeepsTrenNaikOnly(t *testing.T) {
	rows := []screenRow{
		{Symbol: "GOOD", Signal: "BUY"},
		{Symbol: "WAIT", Signal: "WAIT"},
		{Symbol: "DOWN", Signal: "SELL"},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "buy"})
	if len(out) != 1 || out[0].Symbol != "GOOD" {
		t.Fatalf("expected only GOOD, got %+v", out)
	}
}

func TestFilterScreenRowsSyariah(t *testing.T) {
	rows := []screenRow{
		{Symbol: "A", Signal: "BUY", RiskReward: 2, Syariah: true},
		{Symbol: "B", Signal: "BUY", RiskReward: 2, Syariah: false},
	}
	out := filterScreenRows(rows, screenFilters{Mode: "buy", SyariahOnly: true})
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

func TestFilterScreenRowsIndex(t *testing.T) {
	rows := []screenRow{
		{Symbol: "A", Signal: "WAIT", IDX30: true, LQ45: true},
		{Symbol: "B", Signal: "WAIT", LQ45: true},
		{Symbol: "C", Signal: "WAIT"},
	}
	if out := filterScreenRows(rows, screenFilters{Mode: "all", Index: "idx30"}); len(out) != 1 || out[0].Symbol != "A" {
		t.Fatalf("idx30: got %+v", out)
	}
	if out := filterScreenRows(rows, screenFilters{Mode: "all", Index: "lq45"}); len(out) != 2 {
		t.Fatalf("lq45: got %+v", out)
	}
}

func TestIndexValidation(t *testing.T) {
	if !validIndex("") || !validIndex("lq45") || validIndex("IDX30") || validIndex("foo") {
		t.Fatal("validIndex wrong")
	}
	if indexStale(time.Date(2026, 10, 30, 23, 0, 0, 0, time.UTC)) || !indexStale(time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)) {
		t.Fatal("indexStale boundary wrong")
	}
}

func TestIndexSets(t *testing.T) {
	if len(idx30Set) != 30 || len(lq45Set) != 45 {
		t.Fatalf("idx30=%d lq45=%d", len(idx30Set), len(lq45Set))
	}
	for s := range idx30Set {
		if !lq45Set[s] {
			t.Fatalf("%s in IDX30 but not LQ45", s)
		}
	}
}
