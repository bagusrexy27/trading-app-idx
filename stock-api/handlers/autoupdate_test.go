package handlers

import (
	"testing"
	"time"
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
