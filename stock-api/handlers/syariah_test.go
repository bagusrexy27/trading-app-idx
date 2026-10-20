package handlers

import (
	"testing"
	"time"
)

func TestSyariahListDESPeriodI2026(t *testing.T) {
	if n := len(syariahSet); n != 622 {
		t.Errorf("DES Periode I 2026 has 622 stocks, got %d", n)
	}
	for sym, want := range map[string]bool{"BRIS": true, "TLKM": true, "ADRO": true, "ASII": false, "GOTO": false, "BBCA": false} {
		if isSyariah(sym) != want {
			t.Errorf("isSyariah(%s) = %v, want %v", sym, !want, want)
		}
	}
	if syariahStale(time.Date(2026, 11, 30, 12, 0, 0, 0, time.UTC)) || !syariahStale(time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)) {
		t.Error("staleness boundary should be after 2026-11-30")
	}
}
