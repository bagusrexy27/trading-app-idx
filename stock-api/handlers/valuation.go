package handlers

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"stock-api/analysis"
	"stock-api/fetcher"
	"stock-api/models"
	"stock-api/storage"
)

// Valuation cache: the 3-year PBV band per stock, refreshed weekly in the
// background (two Yahoo calls per stock) and stored under data/valuation/ —
// a subdir, so storage.List never mistakes it for a ticker. Requests only
// read the cache; a stock without one simply has no valuation factor.

const valuationTTL = 7 * 24 * time.Hour

type valuationEntry struct {
	Fetched string                  `json:"fetched"` // RFC3339
	OK      bool                    `json:"ok"`      // false = Yahoo had no usable book value / history
	Band    *analysis.ValuationBand `json:"band,omitempty"`
}

var valuations = struct {
	sync.Mutex
	m map[string]*valuationEntry
}{m: map[string]*valuationEntry{}}

func valuationPath(sym string) string {
	return filepath.Join(storage.DataDir, "valuation", sym+".json")
}

func loadValuationEntry(sym string) *valuationEntry {
	valuations.Lock()
	defer valuations.Unlock()
	if e, ok := valuations.m[sym]; ok {
		return e
	}
	var e *valuationEntry
	if raw, err := os.ReadFile(valuationPath(sym)); err == nil {
		e = &valuationEntry{}
		if json.Unmarshal(raw, e) != nil {
			e = nil
		}
	}
	valuations.m[sym] = e
	return e
}

func (e *valuationEntry) stale(now time.Time) bool {
	if e == nil {
		return true
	}
	t, err := time.Parse(time.RFC3339, e.Fetched)
	return err != nil || now.Sub(t) > valuationTTL
}

// valuationOf evaluates the cached band at the latest stored close.
func valuationOf(sym string, prices []models.StockPrice) *analysis.Valuation {
	e := loadValuationEntry(sym)
	if e == nil || !e.OK || e.Band == nil || len(prices) == 0 {
		return nil
	}
	last := prices[len(prices)-1]
	return e.Band.Evaluate(last.Close, last.Date)
}

// decide is the one way handlers get a verdict: price action + broker flow +
// valuation. Every view that shows BUY/SELL must call this so they agree.
func decide(sym string, prices []models.StockPrice) analysis.Decision {
	return analysis.DecisionEngineFull(prices, LoadBrokerDays(sym), valuationOf(sym, prices))
}

// refreshValuation fetches Yahoo data and rewrites the cache for one stock.
// A failed fetch keeps the old entry (and is retried next round).
func refreshValuation(sym string) error {
	prices, divs, first, err := fetcher.FetchLongHistory(sym, analysis.ValuationYears)
	if err != nil {
		return err
	}
	f, err := fetcher.FetchFundamentals(sym)
	if err != nil {
		return err
	}
	var fx []models.StockPrice
	if f.Currency != "" && f.Currency != "IDR" {
		if fx, _, _, err = fetcher.FetchLongHistory(f.Currency+"IDR=X", analysis.ValuationYears); err != nil {
			return err
		}
	}
	conv := func(ps ...[]fetcher.Point) []analysis.FinPoint {
		var out []analysis.FinPoint
		for _, p := range ps {
			for _, x := range p {
				out = append(out, analysis.FinPoint{Date: x.Date, Value: x.Value})
			}
		}
		return out
	}
	band, ok := analysis.BuildBand(analysis.ValuationInput{
		Prices:       prices,
		Equity:       conv(f.AnnualEquity, f.QuarterEquity),
		Shares:       conv(f.AnnualShares, f.QuarterShares),
		NetIncome:    conv(f.AnnualNetIncome),
		AnnualEquity: conv(f.AnnualEquity),
		Dividends:    conv(divs),
		FirstTrade:   first,
		FX:           fx,
	})
	e := &valuationEntry{Fetched: time.Now().Format(time.RFC3339), OK: ok}
	if ok {
		e.Band = &band
	}
	if err := storage.WriteJSON(valuationPath(sym), e); err != nil {
		return err
	}
	valuations.Lock()
	valuations.m[sym] = e
	valuations.Unlock()
	return nil
}

// refreshValuations updates every stale cache entry, sequentially so Yahoo
// sees one stock at a time. Cheap when nothing is stale (file reads only).
func refreshValuations() {
	symbols, err := storage.List()
	if err != nil {
		return
	}
	now := time.Now()
	done, failed := 0, 0
	for _, sym := range symbols {
		if !loadValuationEntry(sym).stale(now) {
			continue
		}
		if err := refreshValuation(sym); err != nil {
			failed++
			continue
		}
		done++
	}
	if done+failed > 0 {
		logf("valuation: %d refreshed, %d errors, %s", done, failed, time.Since(now).Round(time.Second))
	}
}
