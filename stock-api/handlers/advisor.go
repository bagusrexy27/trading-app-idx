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
