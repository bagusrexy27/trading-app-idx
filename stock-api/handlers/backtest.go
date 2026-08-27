package handlers

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"stock-api/analysis"
)

// BacktestHandler handles the backtesting endpoint.
type BacktestHandler struct{}

func NewBacktest() *BacktestHandler { return &BacktestHandler{} }

type btTrade struct {
	EntryDate  string  `json:"entry_date"`
	ExitDate   string  `json:"exit_date"`
	EntryPrice float64 `json:"entry_price"`
	ExitPrice  float64 `json:"exit_price"`
	ReturnPct  float64 `json:"return_pct"`
	Win        bool    `json:"win"`
}

type btSummary struct {
	TotalTrades    int     `json:"total_trades"`
	WinRate        float64 `json:"win_rate_pct"`
	AvgReturnPct   float64 `json:"avg_return_pct"`
	TotalReturnPct float64 `json:"total_return_pct"`
	MaxDrawdownPct float64 `json:"max_drawdown_pct"`
	BestTradePct   float64 `json:"best_trade_pct"`
	WorstTradePct  float64 `json:"worst_trade_pct"`
}

// Backtest simulates trades based on composite signal changes.
// Strategy: BUY signal → enter at next open; SELL/NEUTRAL → exit at next open.
func (h *BacktestHandler) Backtest(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	if len(prices) < 60 {
		respond(w, 422, false, "butuh minimal 60 bar untuk backtest", nil)
		return
	}

	trades := []btTrade{}
	inTrade := false
	var entryDate string
	var entryPrice float64
	totalReturn := 1.0
	maxEquity := 1.0
	maxDrawdown := 0.0

	// Compute signals for rolling windows
	for i := 26; i < len(prices)-1; i++ {
		slice := prices[:i+1]
		sig := calcSignals(slice)

		nextOpen := prices[i+1].Open
		nextDate := prices[i+1].Date

		if !inTrade && (sig.Signal == "BUY" || sig.Signal == "STRONG_BUY") {
			inTrade = true
			entryDate = nextDate
			entryPrice = nextOpen
		} else if inTrade && (sig.Signal == "SELL" || sig.Signal == "STRONG_SELL" || sig.Signal == "NEUTRAL") {
			ret := analysis.R2((nextOpen - entryPrice) / entryPrice * 100)
			win := ret > 0
			trades = append(trades, btTrade{
				EntryDate:  entryDate,
				ExitDate:   nextDate,
				EntryPrice: entryPrice,
				ExitPrice:  nextOpen,
				ReturnPct:  ret,
				Win:        win,
			})
			totalReturn *= (1 + ret/100)
			if totalReturn > maxEquity {
				maxEquity = totalReturn
			}
			dd := (maxEquity - totalReturn) / maxEquity * 100
			if dd > maxDrawdown {
				maxDrawdown = dd
			}
			inTrade = false
		}
	}

	// Close any open trade at last price
	if inTrade && len(prices) > 0 {
		last := prices[len(prices)-1]
		ret := analysis.R2((last.Close - entryPrice) / entryPrice * 100)
		trades = append(trades, btTrade{
			EntryDate:  entryDate,
			ExitDate:   last.Date + " (open)",
			EntryPrice: entryPrice,
			ExitPrice:  last.Close,
			ReturnPct:  ret,
			Win:        ret > 0,
		})
	}

	if len(trades) == 0 {
		respond(w, 200, true, "", map[string]interface{}{
			"symbol":  symbol,
			"trades":  []btTrade{},
			"summary": btSummary{},
			"note":    "Tidak ada sinyal BUY yang dihasilkan dalam periode ini",
		})
		return
	}

	wins := 0
	sumRet, best, worst := 0.0, trades[0].ReturnPct, trades[0].ReturnPct
	for _, t := range trades {
		sumRet += t.ReturnPct
		if t.Win { wins++ }
		if t.ReturnPct > best { best = t.ReturnPct }
		if t.ReturnPct < worst { worst = t.ReturnPct }
	}
	n := float64(len(trades))

	summary := btSummary{
		TotalTrades:    len(trades),
		WinRate:        analysis.R2(float64(wins) / n * 100),
		AvgReturnPct:   analysis.R2(sumRet / n),
		TotalReturnPct: analysis.R2((totalReturn - 1) * 100),
		MaxDrawdownPct: analysis.R2(maxDrawdown),
		BestTradePct:   best,
		WorstTradePct:  worst,
	}

	// Limit to last 50 trades in response to keep payload small
	displayed := trades
	if len(trades) > 50 {
		displayed = trades[len(trades)-50:]
	}

	respond(w, 200, true, fmt.Sprintf("backtest selesai: %d trades", len(trades)), map[string]interface{}{
		"symbol":  symbol,
		"trades":  displayed,
		"summary": summary,
	})
}
