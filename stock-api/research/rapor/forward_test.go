package main

import (
	"os"
	"path/filepath"
	"testing"

	"stock-api/storage"
)

// The forward test is only evidence if a log can't be quietly edited later.
func TestForwardChainDetectsEdits(t *testing.T) {
	forwardDir = t.TempDir()
	write := func(l fwdLog) {
		if err := storage.WriteJSON(filepath.Join(forwardDir, l.Date+".json"), l); err != nil {
			t.Fatal(err)
		}
	}
	write(fwdLog{Date: "2026-11-20", Signals: map[string][]string{"X": {"BBCA"}}})
	b, _ := os.ReadFile(filepath.Join(forwardDir, "2026-11-20.json"))
	write(fwdLog{Date: "2026-11-23", Prev: sha(b)})

	if _, _, broken := readForward(); len(broken) != 0 {
		t.Fatalf("intact chain reported broken: %v", broken)
	}
	write(fwdLog{Date: "2026-11-20", Signals: map[string][]string{"X": {"BBRI"}}}) // tamper
	if _, _, broken := readForward(); len(broken) != 1 || broken[0] != "2026-11-23" {
		t.Fatalf("edit of 2026-11-20 must break the link from 2026-11-23, got %v", broken)
	}
}

// A partial update-all must hold the newest session back instead of logging
// it with a subset of stocks; a suspended stock (2+ sessions behind) must not
// block the log.
func TestLaggingHoldsBackPartialUpdate(t *testing.T) {
	days := []string{"2026-11-18", "2026-11-19", "2026-11-20"}
	st := func(sym string, last int) stockOut {
		return stockOut{s: &series{sym: sym, n: last + 1, date: days[:last+1]}}
	}
	res := []stockOut{st("BBCA", 2), st("BBRI", 1), st("SUSP", 0), {}}
	if got := lagging(res, days, "2026-11-20"); len(got) != 1 || got[0] != "BBRI" {
		t.Fatalf("want [BBRI] lagging, got %v", got)
	}
	res[1] = st("BBRI", 2)
	if got := lagging(res, days, "2026-11-20"); len(got) != 0 {
		t.Fatalf("all caught up (SUSP is suspended), got %v", got)
	}
	if got := lagging(res, days, "2026-11-21"); got != nil {
		t.Fatalf("asOf not a trading day must not hold back, got %v", got)
	}
}
