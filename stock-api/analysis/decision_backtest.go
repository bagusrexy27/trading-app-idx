package analysis

import "stock-api/models"

// DecisionTrade is one simulated trade driven by the Decision Engine.
type DecisionTrade struct {
	EntryDate  string  `json:"entry_date"`
	EntryPrice float64 `json:"entry_price"`
	ExitDate   string  `json:"exit_date"`
	ExitPrice  float64 `json:"exit_price"`
	Signal     string  `json:"signal"` // STRONG_BUY | BUY that triggered entry
	Result     string  `json:"result"` // WIN | LOSS | TIMEOUT | OPEN (see planOutcome)
	PnLPct     float64 `json:"pnl_pct"`
	RiskReward float64 `json:"risk_reward"` // planned R/R at entry
}

// DecisionBacktestResult summarizes Decision Engine replay performance.
// Total = wins + losses + timeouts; WinRate = wins / total and ExpectancyPct =
// mean P&L incl. timeouts — the same definitions as CalibStat.
type DecisionBacktestResult struct {
	Trades        []DecisionTrade `json:"trades"`
	Total         int             `json:"total"` // resolved trades
	Wins          int             `json:"wins"`
	Losses        int             `json:"losses"`
	Timeouts      int             `json:"timeouts"`
	OpenTrades    int             `json:"open_trades"`
	WinRate       float64         `json:"win_rate"`
	AvgWinPct     float64         `json:"avg_win_pct"`  // mean of P&L > 0
	AvgLossPct    float64         `json:"avg_loss_pct"` // mean of P&L ≤ 0
	ExpectancyPct float64         `json:"expectancy_pct"`
	AvgRR         float64         `json:"avg_rr"` // mean planned R/R of entries
}

// BacktestDecision replays history using DecisionEngine (no look-ahead).
// Each STRONG_BUY/BUY plan is resolved by planOutcome (same rules as
// Calibrate); trades don't overlap — the next signal is looked for after exit.
func BacktestDecision(prices []models.StockPrice) DecisionBacktestResult {
	return BacktestDecisionWithBroker(prices, nil)
}

// BacktestDecisionWithBroker is BacktestDecision with optional broker flow data.
func BacktestDecisionWithBroker(prices []models.StockPrice, brokerDays []BrokerDay) DecisionBacktestResult {
	res := DecisionBacktestResult{Trades: []DecisionTrade{}}
	n := len(prices)
	if n < 61 {
		return res
	}

	for i := 59; i < n-1; i++ {
		dec := DecisionEngineWithBroker(prices[:i+1], brokerDaysUpTo(brokerDays, prices[i].Date))
		if dec.Signal != "STRONG_BUY" && dec.Signal != "BUY" {
			continue
		}
		result, pnl, exit, _ := planOutcome(prices, i, dec.StopLoss, firstTP(dec))
		if result == "" {
			continue
		}
		entry := prices[i+1].Open
		if entry <= 0 {
			entry = prices[i+1].Close
		}
		res.Trades = append(res.Trades, DecisionTrade{
			EntryDate: prices[i+1].Date, EntryPrice: R2(entry),
			ExitDate: prices[exit].Date, ExitPrice: R2(entry * (1 + pnl/100)),
			Signal: dec.Signal, Result: result, PnLPct: R2(pnl),
			RiskReward: dec.RiskReward,
		})
		i = exit // loop's i++ resumes the scan on the bar after exit
	}

	var winSum, lossSum, pnlSum, rrSum float64
	var nWin, nLoss int
	for _, t := range res.Trades {
		rrSum += t.RiskReward
		switch t.Result {
		case "OPEN":
			res.OpenTrades++
			continue
		case "WIN":
			res.Wins++
		case "LOSS":
			res.Losses++
		default:
			res.Timeouts++
		}
		res.Total++
		pnlSum += t.PnLPct
		if t.PnLPct > 0 {
			nWin++
			winSum += t.PnLPct
		} else {
			nLoss++
			lossSum += t.PnLPct
		}
	}
	if res.Total > 0 {
		res.WinRate = R2(float64(res.Wins) / float64(res.Total) * 100)
		res.ExpectancyPct = R2(pnlSum / float64(res.Total))
	}
	if nWin > 0 {
		res.AvgWinPct = R2(winSum / float64(nWin))
	}
	if nLoss > 0 {
		res.AvgLossPct = R2(lossSum / float64(nLoss))
	}
	if len(res.Trades) > 0 {
		res.AvgRR = R2(rrSum / float64(len(res.Trades)))
	}
	return res
}

// brokerDaysUpTo drops broker days after date so a replay cannot see the future.
func brokerDaysUpTo(days []BrokerDay, date string) []BrokerDay {
	out := days[:0:0]
	for _, d := range days {
		if d.Date <= date {
			out = append(out, d)
		}
	}
	return out
}
