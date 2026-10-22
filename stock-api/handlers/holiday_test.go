package handlers

import (
	"testing"
	"time"

	"stock-api/models"
)

func TestDropHolidayFillers(t *testing.T) {
	jkse.mu.Lock()
	jkse.bars = []models.StockPrice{{Date: "2026-05-13"}, {Date: "2026-05-18"}, {Date: "2026-05-19"}}
	jkse.fetched = time.Now()
	jkse.mu.Unlock()
	defer func() { jkse.mu.Lock(); jkse.fetched = time.Time{}; jkse.mu.Unlock() }()

	flat := func(d string) models.StockPrice {
		return models.StockPrice{Date: d, Open: 100, High: 100, Low: 100, Close: 100}
	}
	in := []models.StockPrice{
		{Date: "2026-05-13", Open: 100, High: 105, Low: 99, Close: 104, Volume: 10},
		flat("2026-05-14"), // holiday filler → dropped
		{Date: "2026-05-15", Open: 104, High: 106, Low: 103, Close: 105, Volume: 0}, // index closed but bar moves: keep
		flat("2026-05-18"), // illiquid no-trade day, index traded → keep
		flat("2026-05-20"), // after the newest index bar (Yahoo lag) → keep
	}
	got := dropHolidayFillers(in)
	var dates []string
	for _, p := range got {
		dates = append(dates, p.Date)
	}
	want := []string{"2026-05-13", "2026-05-15", "2026-05-18", "2026-05-20"}
	if len(dates) != len(want) {
		t.Fatalf("got %v, want %v", dates, want)
	}
	for i := range want {
		if dates[i] != want[i] {
			t.Fatalf("got %v, want %v", dates, want)
		}
	}
}
