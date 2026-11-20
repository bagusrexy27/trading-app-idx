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
