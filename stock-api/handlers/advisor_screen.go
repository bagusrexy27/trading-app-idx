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
// Runs the price-action Advisor across every tracked stock and returns a ranked
// list. `mode=buy` (default) keeps only actionable long setups (STRONG_BUY/BUY);
// `mode=all` returns every stock. `min_turnover` (in billion IDR/day) filters
// out illiquid names where price action is unreliable (default 2).
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
		Symbol      string  `json:"symbol"`
		Close       float64 `json:"close"`
		Verdict     string  `json:"verdict"`
		Confidence  string  `json:"confidence"`
		Trend       string  `json:"trend"`
		Location    string  `json:"location"`
		Candle      string  `json:"candle"`
		VolumeState string  `json:"volume_state"`
		RSI         float64 `json:"rsi"`
		Entry       float64 `json:"entry"`
		Stop        float64 `json:"stop"`
		Target      float64 `json:"target"`
		StopPct     float64 `json:"stop_pct"`
		TargetPct   float64 `json:"target_pct"`
		RiskReward  float64 `json:"risk_reward"`
		TurnoverBn  float64 `json:"turnover_bn"`
		PassCount   int     `json:"pass_count"`
		Action      string  `json:"action"`
	}

	// Verdict ranking weight (higher = surfaced first).
	weight := map[string]int{"STRONG_BUY": 5, "BUY": 4, "REDUCE": 3, "WAIT": 2, "AVOID": 1}

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

		a := analysis.Advisor(d.Prices)
		pass := 0
		for _, c := range a.Checklist {
			if c.Pass {
				pass++
			}
		}
		rows = append(rows, Row{
			Symbol: sym, Close: a.Close, Verdict: a.Verdict, Confidence: a.Confidence,
			Trend: a.Trend, Location: a.Location, Candle: a.Candle, VolumeState: a.VolumeState,
			RSI: a.RSI, Entry: a.Entry, Stop: a.Stop, Target: a.Target,
			StopPct: a.StopPct, TargetPct: a.TargetPct, RiskReward: a.RiskReward,
			TurnoverBn: analysis.R2(turnover), PassCount: pass, Action: a.Action,
		})
	}

	// Rank: verdict weight → checklist passes → risk/reward.
	sort.Slice(rows, func(i, j int) bool {
		if weight[rows[i].Verdict] != weight[rows[j].Verdict] {
			return weight[rows[i].Verdict] > weight[rows[j].Verdict]
		}
		if rows[i].PassCount != rows[j].PassCount {
			return rows[i].PassCount > rows[j].PassCount
		}
		return rows[i].RiskReward > rows[j].RiskReward
	})

	// Filter for buy mode.
	out := rows
	if mode == "buy" {
		out = out[:0]
		for _, row := range rows {
			if row.Verdict == "STRONG_BUY" || row.Verdict == "BUY" {
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
