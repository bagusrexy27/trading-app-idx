package handlers

import (
	"log"
	"strings"
	"time"

	"stock-api/fetcher"
	"stock-api/storage"
)

var wib = time.FixedZone("WIB", 7*3600)

// StartAutoUpdate refreshes every tracked stock once at startup, then every
// 15 minutes while IDX is trading. Outside the window (weekends, before 09:00,
// after 16:15 WIB) and on exchange holidays it does nothing.
func StartAutoUpdate() {
	go func() {
		runAutoUpdate("startup")
		for range time.Tick(15 * time.Minute) {
			now := time.Now()
			if !inMarketWindow(now) {
				continue
			}
			if !tradedToday(now) {
				continue // holiday: ^JKSE has no bar for today
			}
			runAutoUpdate("15m")
		}
	}()
}

func runAutoUpdate(reason string) {
	symbols, err := storage.List()
	if err != nil {
		log.Printf("auto-update (%s): %v", reason, err)
		return
	}
	start := time.Now()
	added, failed := 0, 0
	for _, r := range updateAll(symbols) {
		added += r.Added
		if strings.HasPrefix(r.Status, "error") {
			failed++
		}
	}
	log.Printf("auto-update (%s): %d stocks, %d new bars, %d errors, %s",
		reason, len(symbols), added, failed, time.Since(start).Round(time.Second))
}

// inMarketWindow: Mon–Fri 09:00–16:15 WIB. The extra 15 min after the 16:00
// close catches the final candle, since Yahoo lags ~10–15 min.
// ponytail: lunch break (12:00–13:30, Fri 11:30–14:00) still polls; cheap, bars just don't change.
func inMarketWindow(t time.Time) bool {
	t = t.In(wib)
	if t.Weekday() == time.Saturday || t.Weekday() == time.Sunday {
		return false
	}
	m := t.Hour()*60 + t.Minute()
	return m >= 9*60 && m <= 16*60+15
}

// tradedToday asks Yahoo whether ^JKSE has a bar dated today — false on
// exchange holidays (and in the first minutes after the open, given Yahoo's lag).
func tradedToday(now time.Time) bool {
	prices, _, err := fetcher.Fetch("^JKSE", now.AddDate(0, 0, -5))
	if err != nil || len(prices) == 0 {
		return false
	}
	return prices[len(prices)-1].Date == now.In(wib).Format("2006-01-02")
}
