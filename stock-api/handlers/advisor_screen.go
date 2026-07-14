package handlers

import (
	"net/http"
	"sort"
	"strconv"

	"stock-api/analysis"
	"stock-api/storage"
)

// AdvisorScreen — GET /api/advisor/screen?mode=buy&min_turnover=2
//
// Runs the weighted Decision Engine across every tracked stock and returns a
// ranked list. `mode=buy` (default) keeps only actionable long setups
// (STRONG_BUY/BUY); `mode=all` returns every stock. `min_turnover` (in billion
// IDR/day) filters out illiquid names (default 2).
func (h *AnalysisHandler) AdvisorScreen(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "buy"
	}
	minTurnover := 2.0
	if v := r.URL.Query().Get("min_turnover"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			minTurnover = f
		}
	}

	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	type Row struct {
		Symbol      string               `json:"symbol"`
		Close       float64              `json:"close"`
		Signal      string               `json:"signal"`
		Score       int                  `json:"score"`
		Confidence  int                  `json:"confidence"`
		Trend       analysis.TrendSet    `json:"trend"`
		Structure   string               `json:"structure"`
		VolumeState string               `json:"volume_state"`
		EntryLow    float64              `json:"entry_low"`
		EntryHigh   float64              `json:"entry_high"`
		EntryIdeal  float64              `json:"entry_ideal"`
		Stop        float64              `json:"stop"`
		Target      float64              `json:"target"`
		RiskReward  float64              `json:"risk_reward"`
		Probability analysis.Probability `json:"probability"`
		TurnoverBn  float64              `json:"turnover_bn"`
		Syariah     bool                 `json:"syariah"`
	}

	rows := make([]Row, 0, len(symbols))
	scanned := 0
	for _, sym := range symbols {
		d, err := storage.Load(sym)
		if err != nil || d == nil || len(d.Prices) < 60 {
			continue
		}
		scanned++

		// Liquidity = avg(close*volume) over last 20 bars, in billion IDR.
		n := len(d.Prices)
		var sum float64
		for i := n - 20; i < n; i++ {
			sum += d.Prices[i].Close * float64(d.Prices[i].Volume)
		}
		turnover := sum / 20 / 1e9
		if turnover < minTurnover {
			continue
		}

		dec := analysis.DecisionEngine(d.Prices)
		rows = append(rows, Row{
			Symbol: sym, Close: d.Prices[n-1].Close,
			Signal: dec.Signal, Score: dec.Score, Confidence: dec.Confidence,
			Trend: dec.Trend, Structure: dec.MarketStructure.State, VolumeState: dec.Volume.Status,
			EntryLow: dec.EntryZone.Buy[0], EntryHigh: dec.EntryZone.Buy[1], EntryIdeal: dec.EntryZone.Ideal,
			Stop: dec.StopLoss, Target: dec.TakeProfit[0].Price, RiskReward: dec.RiskReward,
			Probability: dec.Probability, TurnoverBn: analysis.R2(turnover),
			Syariah: isSyariah(sym),
		})
	}

	// Rank: decision score → confidence → risk/reward.
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		if rows[i].Confidence != rows[j].Confidence {
			return rows[i].Confidence > rows[j].Confidence
		}
		return rows[i].RiskReward > rows[j].RiskReward
	})

	// Filter for buy mode.
	out := rows
	if mode == "buy" {
		out = out[:0]
		for _, row := range rows {
			if row.Signal == "STRONG_BUY" || row.Signal == "BUY" {
				out = append(out, row)
			}
		}
	}

	respond(w, 200, true, "", map[string]interface{}{
		"mode":         mode,
		"min_turnover": minTurnover,
		"scanned":      scanned,
		"matched":      len(out),
		"results":      out,
	})
}
