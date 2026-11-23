package handlers

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"stock-api/analysis"
	"stock-api/models"
	"stock-api/storage"
)

// calibCache holds the Saran calibration table. It goes stale when
// the newest stored bar or the number of stocks changes (update / add /
// remove). A rebuild replays the engine on every bar since 2020 (~10s on a
// multi-core box, longer on a small VM), so a stale table keeps being served
// while the new one is built in the background; only the very first build
// blocks. StartAutoUpdate warms it at boot.
//
// ponytail: if the IHSG fetch fails the table is built without regimes and
// the key is not stored, so the next call rebuilds.
var calibCache struct {
	mu       sync.Mutex
	key      string
	c        *analysis.Calibration
	regime   string // current IHSG regime: up | down | unknown
	building bool
}

// calibBuild serialises rebuilds so concurrent first callers build once.
var calibBuild sync.Mutex

// currentCalibration returns the table plus the current market regime.
func currentCalibration() (*analysis.Calibration, string) {
	series, key, err := calibrationSeries()
	if err != nil {
		return nil, "unknown"
	}

	calibCache.mu.Lock()
	if calibCache.c != nil && (calibCache.key == key || calibCache.building) {
		c, r := calibCache.c, calibCache.regime
		calibCache.mu.Unlock()
		return c, r
	}
	if calibCache.c != nil { // stale: serve it, rebuild behind it
		calibCache.building = true
		c, r := calibCache.c, calibCache.regime
		calibCache.mu.Unlock()
		go rebuildCalibration(series, key)
		return c, r
	}
	calibCache.mu.Unlock()
	return rebuildCalibration(series, key) // first build: nothing to serve yet
}

func calibrationSeries() (map[string][]models.StockPrice, string, error) {
	symbols, err := storage.List()
	if err != nil {
		return nil, "", err
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
	// a newly added stock with old data must still trigger a rebuild
	return series, key + "|" + strconv.Itoa(len(series)), nil
}

func rebuildCalibration(series map[string][]models.StockPrice, key string) (*analysis.Calibration, string) {
	calibBuild.Lock()
	defer calibBuild.Unlock()
	calibCache.mu.Lock()
	if calibCache.c != nil && calibCache.key == key { // built while we waited
		c, r := calibCache.c, calibCache.regime
		calibCache.building = false
		calibCache.mu.Unlock()
		return c, r
	}
	calibCache.mu.Unlock()

	start := time.Now()
	var regime analysis.RegimeFunc
	current := "unknown"
	if idx, _, err := jkseBars(); err == nil && len(idx) > 50 {
		regime = analysis.IndexRegime(idx)
		if r := regime("9999-12-31"); r != "" { // latest index bar
			current = r
		}
	}
	c := analysis.Calibrate(series, regime)

	calibCache.mu.Lock()
	defer calibCache.mu.Unlock()
	calibCache.c, calibCache.regime, calibCache.building = c, current, false
	if regime != nil {
		calibCache.key = key
	}
	logf("calibration rebuilt: %d stocks, %s", c.Stocks, time.Since(start).Round(time.Second))
	return c, current
}

// calibrationFor is the per-stock view attached to decision/screen rows.
type calibrationFor struct {
	*analysis.CalibLookup
	Stock      *analysis.CalibStat `json:"stock,omitempty"`      // this stock's own Tren naik days
	Projection []analysis.ProjView `json:"projection,omitempty"` // measured bull/side/bear per horizon
}

func lookupCalibration(c *analysis.Calibration, regime, symbol, signal string, prices []models.StockPrice) *calibrationFor {
	l := c.Lookup(signal, regime)
	if l == nil {
		return nil
	}
	out := &calibrationFor{CalibLookup: l, Stock: c.PerSymbol[symbol]}
	if atr := analysis.ATR(prices, 14); len(atr) > 0 {
		out.Projection = c.Project(signal, regime, atr[len(atr)-1].Value/prices[len(prices)-1].Close*100)
	}
	return out
}

// Calibration — GET /api/calibration
//
// Historical outcome table of Saran: per verdict and IHSG regime, how often
// the ATR plan (entry next open → target before stop, 20 bars) actually
// worked, plus the bull/side/bear projection per horizon.
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
