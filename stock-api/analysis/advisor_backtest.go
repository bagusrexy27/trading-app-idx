package analysis

import "stock-api/models"

// ── Advisor Backtest ─────────────────────────────────────────────────────────
//
// Replays history: at each bar the Advisor decision tree runs on data up to
// that bar only (no look-ahead). On STRONG_BUY/BUY it "enters" at next open,
// then holds until the entry-time stop or target is hit intrabar. One position
// at a time. This measures how the exact advice shown in the Saran tab would
// have performed on this stock.

type AdvisorTrade struct {
	EntryDate  string  `json:"entry_date"`
	EntryPrice float64 `json:"entry_price"`
	ExitDate   string  `json:"exit_date"`
	ExitPrice  float64 `json:"exit_price"`
	Verdict    string  `json:"verdict"` // verdict that triggered entry
	Result     string  `json:"result"`  // TARGET | STOP | OPEN
	PnLPct     float64 `json:"pnl_pct"`
}

type AdvisorBacktestResult struct {
	Trades        []AdvisorTrade `json:"trades"`
	Total         int            `json:"total"` // closed trades
	Wins          int            `json:"wins"`
	Losses        int            `json:"losses"`
	OpenTrades    int            `json:"open_trades"`    // still running at end of data
	WinRate       float64        `json:"win_rate"`       // % of closed trades
	AvgWinPct     float64        `json:"avg_win_pct"`
	AvgLossPct    float64        `json:"avg_loss_pct"`
	ExpectancyPct float64        `json:"expectancy_pct"` // mean PnL per closed trade
}

// BacktestAdvisor walks the price history and simulates Advisor-driven trades.
// Needs ≥ 61 bars (60 warmup + 1 to trade).
func BacktestAdvisor(prices []models.StockPrice) AdvisorBacktestResult {
	res := AdvisorBacktestResult{Trades: []AdvisorTrade{}}
	n := len(prices)
	if n < 61 {
		return res
	}

	i := 60
	for i < n-1 {
		a := Advisor(prices[:i+1])
		if a.Verdict != "STRONG_BUY" && a.Verdict != "BUY" {
			i++
			continue
		}

		// Enter at next bar's open (fallback to close if open is 0).
		entryIdx := i + 1
		entry := prices[entryIdx].Open
		if entry <= 0 {
			entry = prices[entryIdx].Close
		}
		stop, target := a.Stop, a.Target

		exitIdx, exitPrice, result := -1, 0.0, ""
		for j := entryIdx; j < n; j++ {
			// Stop checked first: conservative when both hit in one bar.
			if prices[j].Low <= stop {
				exitIdx, exitPrice, result = j, stop, "STOP"
				break
			}
			if prices[j].High >= target {
				exitIdx, exitPrice, result = j, target, "TARGET"
				break
			}
		}
		if exitIdx == -1 { // never hit either — mark open at last close
			exitIdx, exitPrice, result = n-1, prices[n-1].Close, "OPEN"
		}

		pnl := 0.0
		if entry > 0 {
			pnl = (exitPrice/entry - 1) * 100
		}
		res.Trades = append(res.Trades, AdvisorTrade{
			EntryDate: prices[entryIdx].Date, EntryPrice: R2(entry),
			ExitDate: prices[exitIdx].Date, ExitPrice: R2(exitPrice),
			Verdict: a.Verdict, Result: result, PnLPct: R2(pnl),
		})

		i = exitIdx + 1
	}

	// Summary over closed trades only.
	var winSum, lossSum, pnlSum float64
	for _, t := range res.Trades {
		if t.Result == "OPEN" {
			res.OpenTrades++
			continue
		}
		res.Total++
		pnlSum += t.PnLPct
		if t.PnLPct > 0 {
			res.Wins++
			winSum += t.PnLPct
		} else {
			res.Losses++
			lossSum += t.PnLPct
		}
	}
	if res.Total > 0 {
		res.WinRate = R2(float64(res.Wins) / float64(res.Total) * 100)
		res.ExpectancyPct = R2(pnlSum / float64(res.Total))
	}
	if res.Wins > 0 {
		res.AvgWinPct = R2(winSum / float64(res.Wins))
	}
	if res.Losses > 0 {
		res.AvgLossPct = R2(lossSum / float64(res.Losses))
	}
	return res
}
