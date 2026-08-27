package handlers

import (
	"net/http"
	"sort"
	"strconv"

	"stock-api/analysis"
	"stock-api/storage"
)

// screenFilters holds query params for /api/advisor/screen.
type screenFilters struct {
	Mode           string
	MinTurnover    float64
	MinRR          float64
	MinConfidence  int
	SyariahOnly    bool
	IncludeLowRR   bool
}

func parseScreenFilters(r *http.Request) screenFilters {
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "buy"
	}
	f := screenFilters{Mode: mode, MinTurnover: 2.0}
	if v := r.URL.Query().Get("min_turnover"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			f.MinTurnover = n
		}
	}
	if v := r.URL.Query().Get("min_rr"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			f.MinRR = n
		}
	}
	if v := r.URL.Query().Get("min_confidence"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.MinConfidence = n
		}
	}
	f.SyariahOnly = r.URL.Query().Get("syariah") == "true"
	f.IncludeLowRR = r.URL.Query().Get("include_low_rr") == "true"
	return f
}

// screenRow is one ranked screener result.
type screenRow struct {
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
	Note        string               `json:"note,omitempty"`
}

// filterScreenRows applies mode and quality gates to ranked rows.
func filterScreenRows(rows []screenRow, f screenFilters) []screenRow {
	out := make([]screenRow, 0, len(rows))
	for _, row := range rows {
		if f.Mode == "buy" && row.Signal != "STRONG_BUY" && row.Signal != "BUY" {
			continue
		}
		if f.SyariahOnly && !row.Syariah {
			continue
		}
		if f.MinConfidence > 0 && row.Confidence < f.MinConfidence {
			continue
		}
		if f.MinRR > 0 && row.RiskReward < f.MinRR {
			continue
		}
		// Default buy mode excludes sub-1 R/R unless explicitly allowed.
		if f.Mode == "buy" && !f.IncludeLowRR && f.MinRR <= 0 && row.RiskReward < 1 {
			continue
		}
		out = append(out, row)
	}
	return out
}

// AdvisorScreen — GET /api/advisor/screen?mode=buy&min_turnover=2
//
// Runs the weighted Decision Engine across every tracked stock and returns a
// ranked list. `mode=buy` (default) keeps only actionable long setups
// (STRONG_BUY/BUY); `mode=all` returns every stock. `min_turnover` (in billion
// IDR/day) filters out illiquid names (default 2).
func (h *AnalysisHandler) AdvisorScreen(w http.ResponseWriter, r *http.Request) {
	f := parseScreenFilters(r)

	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	rows := make([]screenRow, 0, len(symbols))
	scanned := 0
	for _, sym := range symbols {
		d, err := storage.Load(sym)
		if err != nil || d == nil || len(d.Prices) < 60 {
			continue
		}
		scanned++

		n := len(d.Prices)
		var sum float64
		for i := n - 20; i < n; i++ {
			sum += d.Prices[i].Close * float64(d.Prices[i].Volume)
		}
		turnover := sum / 20 / 1e9
		if turnover < f.MinTurnover {
			continue
		}

		brokerDays := LoadBrokerDays(sym)
		dec := analysis.DecisionEngineWithBroker(d.Prices, brokerDays)
		rows = append(rows, screenRow{
			Symbol: sym, Close: d.Prices[n-1].Close,
			Signal: dec.Signal, Score: dec.Score, Confidence: dec.Confidence,
			Trend: dec.Trend, Structure: dec.MarketStructure.State, VolumeState: dec.Volume.Status,
			EntryLow: dec.EntryZone.Buy[0], EntryHigh: dec.EntryZone.Buy[1], EntryIdeal: dec.EntryZone.Ideal,
			Stop: dec.StopLoss, Target: dec.TakeProfit[0].Price, RiskReward: dec.RiskReward,
			Probability: dec.Probability, TurnoverBn: analysis.R2(turnover),
			Syariah: isSyariah(sym), Note: dec.Note,
		})
	}

	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		if rows[i].Confidence != rows[j].Confidence {
			return rows[i].Confidence > rows[j].Confidence
		}
		return rows[i].RiskReward > rows[j].RiskReward
	})

	out := filterScreenRows(rows, f)

	respond(w, 200, true, "", map[string]interface{}{
		"mode":            f.Mode,
		"min_turnover":    f.MinTurnover,
		"min_rr":          f.MinRR,
		"min_confidence":  f.MinConfidence,
		"syariah":         f.SyariahOnly,
		"include_low_rr":  f.IncludeLowRR,
		"scanned":         scanned,
		"matched":         len(out),
		"results":         out,
	})
}
