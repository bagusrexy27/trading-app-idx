package handlers

import (
	"net/http"

	"github.com/gorilla/mux"
	"stock-api/analysis"
)

// Advisor — GET /api/analysis/{symbol}/advisor
//
// Rule-based price-action recommendation (trend → location → candle → volume →
// risk/reward) with an entry/stop/target plan, checklist, and what-if scenarios.
func (h *AnalysisHandler) Advisor(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	advice := analysis.Advisor(prices)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"advice": advice,
	})
}

// Decision — GET /api/analysis/{symbol}/decision
//
// Weighted multi-factor decision engine: 5-level signal, numeric confidence,
// multi-timeframe trend, S/R zones, entry zone, tiered TP, and a
// bullish/sideways/bearish probability distribution.
func (h *AnalysisHandler) Decision(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	d := analysis.DecisionEngine(prices)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":   symbol,
		"decision": d,
		"syariah":  isSyariah(symbol),
	})
}

// AdvisorBacktest — GET /api/analysis/{symbol}/advisor-backtest
//
// Replays the Advisor decision tree over history (no look-ahead) and reports
// win rate / expectancy of its STRONG_BUY & BUY calls on this stock.
func (h *AnalysisHandler) AdvisorBacktest(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	result := analysis.BacktestAdvisor(prices)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":   symbol,
		"backtest": result,
	})
}
