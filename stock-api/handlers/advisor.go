package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"stock-api/analysis"
)

// Decision — GET /api/analysis/{symbol}/decision
//
// Saran verdict (Tren naik / Tunggu / Tren turun) with its 4-check breakdown,
// trend, S/R, ATR plan, plus the measured calibration (win rate +
// bull/side/bear projection) for this verdict & regime.
func (h *AnalysisHandler) Decision(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	d := decide(symbol, prices)
	c, regime := currentCalibration()

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":      symbol,
		"decision":    d,
		"syariah":     isSyariah(symbol),
		"close":       prices[len(prices)-1].Close,
		"calibration": lookupCalibration(c, regime, symbol, d.Signal, prices),
	})
}

// DecisionBacktest — GET /api/analysis/{symbol}/decision-backtest
//
// Replays Saran over history (no look-ahead) and reports win rate /
// expectancy of its Tren naik calls on this stock.
func (h *AnalysisHandler) DecisionBacktest(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol":   symbol,
		"backtest": analysis.BacktestDecision(prices),
	})
}
