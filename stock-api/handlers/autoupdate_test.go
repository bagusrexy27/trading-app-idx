package handlers

import (
	"testing"
	"time"

	"stock-api/models"
	"stock-api/storage"
)

func TestInMarketWindow(t *testing.T) {
	cases := map[string]bool{
		"2026-10-20T08:59:00+07:00": false, // Tue, before open
		"2026-10-20T09:00:00+07:00": true,
		"2026-10-20T12:30:00+07:00": true,  // lunch break still polls
		"2026-10-20T16:15:00+07:00": true,  // catch final candle
		"2026-10-20T16:16:00+07:00": false, // after close
		"2026-10-24T10:00:00+07:00": false, // Saturday
		"2026-10-25T10:00:00+07:00": false, // Sunday
		"2026-10-20T03:00:00Z":      true,  // 10:00 WIB given in UTC
	}
	for s, want := range cases {
		tm, _ := time.Parse(time.RFC3339, s)
		if got := inMarketWindow(tm); got != want {
			t.Errorf("%s: got %v want %v", s, got, want)
		}
	}
}

func TestHasFinalCandle(t *testing.T) {
	old := storage.DataDir
	storage.DataDir = t.TempDir()
	defer func() { storage.DataDir = old }()

	d := &models.StockData{Symbol: "TEST", Prices: []models.StockPrice{{Date: "2026-10-20", Close: 100}}}
	if err := storage.Save(d); err != nil {
		t.Fatal(err)
	}
	closed := time.Now().Add(-time.Hour) // file written after the close
	if !hasFinalCandle("TEST", "2026-10-20", closed) {
		t.Error("current bar written after close must count as final")
	}
	if hasFinalCandle("TEST", "2026-10-21", closed) {
		t.Error("older last bar must be stale")
	}
	if hasFinalCandle("TEST", "2026-10-20", time.Now().Add(time.Hour)) {
		t.Error("file written before the close holds a partial candle")
	}
	if hasFinalCandle("NOPE", "2026-10-20", closed) {
		t.Error("missing stock must be stale")
	}
}
