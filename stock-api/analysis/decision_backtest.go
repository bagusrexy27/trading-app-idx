package analysis

import "stock-api/models"

// DecisionTrade is one simulated trade driven by the Decision Engine.
type DecisionTrade struct {
	EntryDate  string  `json:"entry_date"`
	EntryPrice float64 `json:"entry_price"`
	ExitDate   string  `json:"exit_date"`
	ExitPrice  float64 `json:"exit_price"`
	Signal     string  `json:"signal"` // STRONG_BUY | BUY that triggered entry
	Result     string  `json:"result"` // TARGET | STOP | OPEN
	PnLPct     float64 `json:"pnl_pct"`
	RiskReward float64 `json:"risk_reward"` // planned R/R at entry
}

// DecisionBacktestResult summarizes Decision Engine replay performance.
type DecisionBacktestResult struct {
	Trades        []DecisionTrade `json:"trades"`
	Total         int             `json:"total"` // closed trades
	Wins          int             `json:"wins"`
	Losses        int             `json:"losses"`
	OpenTrades    int             `json:"open_trades"`
	WinRate       float64         `json:"win_rate"`
	AvgWinPct     float64         `json:"avg_win_pct"`
	AvgLossPct    float64         `json:"avg_loss_pct"`
	ExpectancyPct float64         `json:"expectancy_pct"`
	AvgRR         float64         `json:"avg_rr"` // mean planned R/R of entries
}

// BacktestDecision replays history using DecisionEngine (no look-ahead).
// Enters on STRONG_BUY/BUY at next open; exits on stop/target intrabar.
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

	i := 60
	for i < n-1 {
		dec := DecisionEngineWithBroker(prices[:i+1], brokerDays)
		if dec.Signal != "STRONG_BUY" && dec.Signal != "BUY" {
			i++
			continue
		}

		entryIdx := i + 1
		entry := prices[entryIdx].Open
		if entry <= 0 {
			entry = prices[entryIdx].Close
		}
		stop := dec.StopLoss
		target := dec.TakeProfit[0].Price
		if stop <= 0 || target <= 0 || target <= entry {
			i++
			continue
		}

		exitIdx, exitPrice, result := -1, 0.0, ""
		for j := entryIdx; j < n; j++ {
			if prices[j].Low <= stop {
				exitIdx, exitPrice, result = j, stop, "STOP"
				break
			}
			if prices[j].High >= target {
				exitIdx, exitPrice, result = j, target, "TARGET"
				break
			}
		}
		if exitIdx == -1 {
			exitIdx, exitPrice, result = n-1, prices[n-1].Close, "OPEN"
		}

		pnl := 0.0
		if entry > 0 {
			pnl = (exitPrice/entry - 1) * 100
		}
		res.Trades = append(res.Trades, DecisionTrade{
			EntryDate: prices[entryIdx].Date, EntryPrice: R2(entry),
			ExitDate: prices[exitIdx].Date, ExitPrice: R2(exitPrice),
			Signal: dec.Signal, Result: result, PnLPct: R2(pnl),
			RiskReward: dec.RiskReward,
		})

		i = exitIdx + 1
	}

	var winSum, lossSum, pnlSum, rrSum float64
	for _, t := range res.Trades {
		rrSum += t.RiskReward
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
	if len(res.Trades) > 0 {
		res.AvgRR = R2(rrSum / float64(len(res.Trades)))
	}
	return res
}
