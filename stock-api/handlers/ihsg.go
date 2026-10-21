package handlers

import (
	"net/http"
	"sync"
	"time"

	"stock-api/fetcher"
	"stock-api/models"
)

// IHSG handler — fetches ^JKSE (Jakarta Composite Index) from Yahoo Finance.
// Yahoo returns daily bars; the latest bar reflects the current trading session
// (data is delayed ~15 minutes on the free Yahoo endpoint).

type ihsgPayload struct {
	Symbol    string              `json:"symbol"` // "^JKSE"
	Exchange  string              `json:"exchange"`
	Last      float64             `json:"last"`       // latest close
	PrevClose float64             `json:"prev_close"` // previous trading day close
	Change    float64             `json:"change"`     // last - prev
	ChangePct float64             `json:"change_pct"` // (last - prev) / prev * 100
	Open      float64             `json:"open"`
	High      float64             `json:"high"`
	Low       float64             `json:"low"`
	Volume    int64               `json:"volume"`
	Date      string              `json:"date"`    // YYYY-MM-DD of latest bar
	History   []models.StockPrice `json:"history"` // last ~30 bars for sparkline
	FetchedAt string              `json:"fetched_at"`
	Delayed   bool                `json:"delayed"` // true = Yahoo free tier (~15min delay)
}

// jkse is the one ^JKSE fetch shared by /api/ihsg, the calibration regime and
// the auto-update holiday check: 2 years of daily bars, cached 60s.
var jkse struct {
	mu       sync.Mutex
	bars     []models.StockPrice
	exchange string
	fetched  time.Time
}

const jkseTTL = 60 * time.Second

func jkseBars() ([]models.StockPrice, string, error) {
	jkse.mu.Lock()
	defer jkse.mu.Unlock()
	if time.Since(jkse.fetched) < jkseTTL && len(jkse.bars) > 0 {
		return jkse.bars, jkse.exchange, nil
	}
	bars, exchange, err := fetcher.Fetch("^JKSE", time.Now().AddDate(-2, 0, 0))
	if err != nil {
		return nil, "", err
	}
	jkse.bars, jkse.exchange, jkse.fetched = bars, exchange, time.Now()
	return bars, exchange, nil
}

// GET /api/ihsg — current IHSG snapshot + last 30 days of bars.
func (h *Handler) IHSG(w http.ResponseWriter, r *http.Request) {
	prices, exchange, err := jkseBars()
	if err != nil {
		respond(w, 502, false, "fetch IHSG: "+err.Error(), nil)
		return
	}
	if len(prices) < 2 {
		respond(w, 502, false, "IHSG: not enough data points", nil)
		return
	}

	last := prices[len(prices)-1]
	prev := prices[len(prices)-2]
	change := last.Close - prev.Close
	var pct float64
	if prev.Close != 0 {
		pct = change / prev.Close * 100
	}

	history := prices
	if len(history) > 30 {
		history = history[len(history)-30:]
	}

	respond(w, 200, true, "ok", ihsgPayload{
		Symbol:    "^JKSE",
		Exchange:  exchange,
		Last:      last.Close,
		PrevClose: prev.Close,
		Change:    change,
		ChangePct: pct,
		Open:      last.Open,
		High:      last.High,
		Low:       last.Low,
		Volume:    last.Volume,
		Date:      last.Date,
		History:   history,
		FetchedAt: time.Now().Format(time.RFC3339),
		Delayed:   true,
	})
}
