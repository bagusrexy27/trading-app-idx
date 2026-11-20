package main

import "testing"

// Review 2026-11-20: the newest 3 bars were always flagged "end of month"
// because the next trading days don't exist yet. Mid-month must stay false.
func TestLastOfMonthAtSeriesEnd(t *testing.T) {
	jk := dateSeries{dates: []string{"2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"}, close: []float64{1, 1, 1, 1}}
	var c timingCond
	for _, x := range timingConds(jk, nil, nil, map[string]dateSeries{}, jk.dates) {
		if x.Name == "3 hari bursa terakhir tiap bulan" {
			c = x
		}
	}
	if c.on("2026-11-20") {
		t.Fatal("2026-11-20 (Friday, 6 weekdays left) is not the end of November")
	}
	if weekdaysLeftInMonth("2026-11-26") != 2 || weekdaysLeftInMonth("2026-11-30") != 0 { // Thu 26 Nov: Fri 27 + Mon 30 left
		t.Fatalf("weekdays left: 26 Nov = %d (want 2), 30 Nov = %d (want 0)", weekdaysLeftInMonth("2026-11-26"), weekdaysLeftInMonth("2026-11-30"))
	}
}
