package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"stock-api/analysis"
)

// Decision — GET /api/analysis/{symbol}/decision
//
// Weighted multi-factor decision engine: 5-level signal, numeric confidence,
// multi-timeframe trend, S/R zones, entry zone, tiered TP, plus the measured
// calibration (win rate + bull/side/bear projection) for this score & regime.
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
		"calibration": lookupCalibration(c, regime, symbol, d.Score, prices),
	})
}

// DecisionBacktest — GET /api/analysis/{symbol}/decision-backtest
//
// Replays the Decision Engine over history (no look-ahead) and reports
// win rate / expectancy of its STRONG_BUY & BUY calls on this stock.
func (h *AnalysisHandler) DecisionBacktest(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	brokerDays := LoadBrokerDays(symbol)
	result := analysis.BacktestDecisionWithBroker(prices, brokerDays)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":   symbol,
		"backtest": result,
	})
}
