package handlers

import (
	"net/http"
	"sync"
	"time"

	"stock-api/analysis"
	"stock-api/fetcher"
	"stock-api/models"
	"stock-api/storage"
)

// calibCache holds the Decision Engine calibration table. It is rebuilt when
// the newest stored bar changes (i.e. after an update), ~2s for ~80 stocks.
//
// ponytail: global lock, rebuild blocks concurrent callers — fine single-user.
// If the IHSG fetch fails the table is built without regimes and the key is
// not stored, so the next call retries.
var calibCache struct {
	mu     sync.Mutex
	key    string
	c      *analysis.Calibration
	regime string // current IHSG regime: up | down | unknown
}

// currentCalibration returns the table plus the current market regime.
func currentCalibration() (*analysis.Calibration, string) {
	symbols, err := storage.List()
	if err != nil {
		return nil, "unknown"
	}
	series := make(map[string][]models.StockPrice, len(symbols))
	key := ""
	for _, sym := range symbols {
		d, err := storage.Load(sym)
		if err != nil || d == nil || len(d.Prices) == 0 {
			continue
		}
		series[sym] = d.Prices
		if last := d.Prices[len(d.Prices)-1].Date; last > key {
			key = last
		}
	}

	calibCache.mu.Lock()
	defer calibCache.mu.Unlock()
	if calibCache.c != nil && calibCache.key == key {
		return calibCache.c, calibCache.regime
	}

	var regime analysis.RegimeFunc
	current := "unknown"
	idx, _, err := fetcher.Fetch("^JKSE", time.Now().AddDate(-2, 0, 0))
	if err == nil && len(idx) > 50 {
		regime = analysis.IndexRegime(idx)
		if r := regime("9999-12-31"); r != "" { // latest index bar
			current = r
		}
	}
	c := analysis.Calibrate(series, regime)
	calibCache.c, calibCache.regime = c, current
	if regime != nil {
		calibCache.key = key
	}
	return c, current
}

// calibrationFor is the per-stock view attached to decision/screen rows.
type calibrationFor struct {
	*analysis.CalibLookup
	Stock *analysis.CalibStat `json:"stock,omitempty"` // this stock's own score ≥ 60 days
}

func lookupCalibration(c *analysis.Calibration, regime, symbol string, score int) *calibrationFor {
	l := c.Lookup(score, regime)
	if l == nil {
		return nil
	}
	return &calibrationFor{CalibLookup: l, Stock: c.PerSymbol[symbol]}
}

// Calibration — GET /api/calibration
//
// Historical outcome table of the Decision Engine: per score bucket and IHSG
// regime, how often the plan (entry next open → TP1 before stop, 20 bars)
// actually worked. This is the measured counterpart of Decision.Probability.
func (h *AnalysisHandler) Calibration(w http.ResponseWriter, r *http.Request) {
	c, regime := currentCalibration()
	if c == nil {
		respond(w, 500, false, "calibration unavailable", nil)
		return
	}
	respond(w, 200, true, "", map[string]interface{}{
		"regime":      regime,
		"calibration": c,
	})
}
