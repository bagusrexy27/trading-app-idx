package handlers

import (
	"net/http"
	"strconv"
	"sync"

	"stock-api/analysis"
	"stock-api/models"
	"stock-api/storage"
)

// calibCache holds the Decision Engine calibration table. It is rebuilt when
// the newest stored bar or the number of stocks changes (update / add / remove),
// ~2s for ~80 stocks.
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

	key += "|" + strconv.Itoa(len(series)) // a newly added stock with old data must still trigger a rebuild

	calibCache.mu.Lock()
	defer calibCache.mu.Unlock()
	if calibCache.c != nil && calibCache.key == key {
		return calibCache.c, calibCache.regime
	}

	var regime analysis.RegimeFunc
	current := "unknown"
	idx, _, err := jkseBars()
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
	Stock      *analysis.CalibStat `json:"stock,omitempty"`      // this stock's own score ≥ 60 days
	Projection []analysis.ProjView `json:"projection,omitempty"` // measured bull/side/bear per horizon
}

func lookupCalibration(c *analysis.Calibration, regime, symbol string, score int, prices []models.StockPrice) *calibrationFor {
	l := c.Lookup(score, regime)
	if l == nil {
		return nil
	}
	out := &calibrationFor{CalibLookup: l, Stock: c.PerSymbol[symbol]}
	if atr := analysis.ATR(prices, 14); len(atr) > 0 {
		out.Projection = c.Project(score, regime, atr[len(atr)-1].Value/prices[len(prices)-1].Close*100)
	}
	return out
}

// Calibration — GET /api/calibration
//
// Historical outcome table of the Decision Engine: per score bucket and IHSG
// regime, how often the plan (entry next open → TP1 before stop, 20 bars)
// actually worked, plus the bull/side/bear projection per horizon.
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
