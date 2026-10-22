package handlers

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"stock-api/storage"
)

var wib = time.FixedZone("WIB", 7*3600)

// StartAutoUpdate refreshes stale stocks once at startup, then every
// 15 minutes while IDX is trading. Outside the window (weekends, before 09:00,
// after 16:15 WIB) and on exchange holidays it does nothing.
func StartAutoUpdate() {
	go func() {
		runAutoUpdate("startup")
		currentCalibration() // warm the table before the first request needs it
		refreshValuations()
		for range time.Tick(15 * time.Minute) {
			refreshValuations() // weekly per stock; a no-op on most ticks
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
	if !updateMu.TryLock() {
		logf("auto-update (%s): skipped, an update is already running", reason)
		return
	}
	defer updateMu.Unlock()
	symbols, err := storage.List()
	if err != nil {
		logf("auto-update (%s): %v", reason, err)
		return
	}
	if reason == "startup" {
		symbols = staleAtStartup(symbols, time.Now())
	}
	start := time.Now()
	added, failed := 0, 0
	for _, r := range updateAll(symbols) {
		added += r.Added
		if strings.HasPrefix(r.Status, "error") {
			failed++
		}
	}
	logf("auto-update (%s): %d stocks, %d new bars, %d errors, %s",
		reason, len(symbols), added, failed, time.Since(start).Round(time.Second))
}

// logf prefixes a WIB clock time: main.go clears log flags for its own request log.
func logf(format string, args ...any) {
	log.Printf(time.Now().In(wib).Format("15:04:05")+" "+format, args...)
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

// tradedToday reports whether ^JKSE has a bar dated today — false on
// exchange holidays (and in the first minutes after the open, given Yahoo's lag).
func tradedToday(now time.Time) bool {
	bars, _, err := jkseBars()
	if err != nil || len(bars) == 0 {
		return false
	}
	return bars[len(bars)-1].Date == now.In(wib).Format("2006-01-02")
}

// staleAtStartup drops stocks that already hold the final candle of the latest
// session, so a Fly cold start outside market hours doesn't re-pull ~90 symbols
// from Yahoo. Inside the market window (or if ^JKSE can't be fetched) every
// stock is stale.
func staleAtStartup(symbols []string, now time.Time) []string {
	if inMarketWindow(now) {
		return symbols
	}
	bars, _, err := jkseBars()
	if err != nil || len(bars) == 0 {
		return symbols
	}
	session := bars[len(bars)-1].Date
	closed, err := time.ParseInLocation("2006-01-02 15:04", session+" 16:15", wib)
	if err != nil {
		return symbols
	}
	var stale []string
	for _, sym := range symbols {
		if !hasFinalCandle(sym, session, closed) {
			stale = append(stale, sym)
		}
	}
	return stale
}

// hasFinalCandle: newest stored bar is the session's and the file was written
// after that session closed (so the bar isn't a partial intraday candle).
func hasFinalCandle(sym, session string, closed time.Time) bool {
	d, err := storage.Load(sym)
	if err != nil || d == nil || len(d.Prices) == 0 || d.Prices[len(d.Prices)-1].Date < session {
		return false
	}
	fi, err := os.Stat(filepath.Join(storage.DataDir, sym+".json"))
	return err == nil && fi.ModTime().After(closed)
}
