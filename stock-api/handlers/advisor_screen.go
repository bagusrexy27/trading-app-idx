package handlers

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"stock-api/analysis"
	"stock-api/storage"
)

// screenFilters holds query params for /api/advisor/screen.
type screenFilters struct {
	Mode        string
	MinTurnover float64
	SyariahOnly bool
	Index       string // "" | "idx30" | "lq45"
	Undervalue  bool   // only quality stocks below their 3-year mean PBV
}

func parseScreenFilters(r *http.Request) screenFilters {
	q := r.URL.Query()
	mode := q.Get("mode")
	if mode == "" {
		mode = "buy"
	}
	f := screenFilters{Mode: mode, MinTurnover: 2.0}
	if n, err := strconv.ParseFloat(q.Get("min_turnover"), 64); err == nil {
		f.MinTurnover = n
	}
	f.SyariahOnly = q.Get("syariah") == "true"
	f.Index = strings.ToLower(q.Get("index"))
	f.Undervalue = q.Get("undervalue") == "true"
	return f
}

// screenRow is one screener result.
type screenRow struct {
	Symbol      string              `json:"symbol"`
	Close       float64             `json:"close"`
	Signal      string              `json:"signal"` // BUY | WAIT | SELL (analysis.Saran)
	Trend       analysis.TrendSet   `json:"trend"`
	EntryIdeal  float64             `json:"entry_ideal"`
	Stop        float64             `json:"stop"`
	Target      float64             `json:"target"`
	RiskReward  float64             `json:"risk_reward"`
	TurnoverBn  float64             `json:"turnover_bn"`
	Syariah     bool                `json:"syariah"`
	IDX30       bool                `json:"idx30"`
	LQ45        bool                `json:"lq45"`
	Note        string              `json:"note,omitempty"`
	Calibration *calibrationFor     `json:"calibration,omitempty"` // measured history for this verdict + regime
	Valuation   *analysis.Valuation `json:"valuation,omitempty"`   // 3-year PBV band + quality screen
}

// filterScreenRows applies the fact filters. mode=buy keeps Tren naik only.
func filterScreenRows(rows []screenRow, f screenFilters) []screenRow {
	out := make([]screenRow, 0, len(rows))
	for _, row := range rows {
		if f.Mode == "buy" && row.Signal != "BUY" {
			continue
		}
		if f.Undervalue && (row.Valuation == nil || !row.Valuation.Undervalue) {
			continue
		}
		if f.SyariahOnly && !row.Syariah {
			continue
		}
		if (f.Index == "idx30" && !row.IDX30) || (f.Index == "lq45" && !row.LQ45) {
			continue
		}
		out = append(out, row)
	}
	return out
}

// AdvisorScreen — GET /api/advisor/screen?mode=buy&min_turnover=2
//
// Runs Saran across every tracked stock and returns the rows sorted by
// turnover: fact filters, no "best stock" ranking (the old score had no
// edge). `mode=buy` (default) keeps Tren naik only; `mode=all` returns every
// stock. `min_turnover` (billion IDR/day) filters out illiquid names (default 2).
func (h *AnalysisHandler) AdvisorScreen(w http.ResponseWriter, r *http.Request) {
	f := parseScreenFilters(r)
	if !validIndex(f.Index) {
		respond(w, 400, false, "index harus idx30 atau lq45", nil)
		return
	}

	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	calib, regime := currentCalibration()
	rows := make([]screenRow, 0, len(symbols))
	scanned := 0
	for _, sym := range symbols {
		d, err := storage.Load(sym)
		if err != nil || d == nil || len(d.Prices) < 60 {
			continue
		}
		scanned++

		n := len(d.Prices)
		turnover := avgTurnoverBn(d.Prices, 20)
		if turnover < f.MinTurnover {
			continue
		}

		dec := decide(sym, d.Prices)
		target := 0.0 // Tren turun carries no plan
		if len(dec.TakeProfit) > 0 {
			target = dec.TakeProfit[0].Price
		}
		rows = append(rows, screenRow{
			Symbol: sym, Close: d.Prices[n-1].Close,
			Signal: dec.Signal, Trend: dec.Trend,
			EntryIdeal: dec.EntryZone.Ideal, Stop: dec.StopLoss, Target: target, RiskReward: dec.RiskReward,
			TurnoverBn: analysis.R2(turnover),
			Syariah:    isSyariah(sym), IDX30: isIDX30(sym), LQ45: isLQ45(sym), Note: dec.Note,
			Calibration: lookupCalibration(calib, regime, sym, dec.Signal, d.Prices),
			Valuation:   dec.Valuation,
		})
	}

	sort.Slice(rows, func(i, j int) bool { return rows[i].TurnoverBn > rows[j].TurnoverBn })
	out := filterScreenRows(rows, f)

	respond(w, 200, true, "", map[string]interface{}{
		"mode":          f.Mode,
		"min_turnover":  f.MinTurnover,
		"syariah":       f.SyariahOnly,
		"index":         f.Index,
		"index_stale":   indexStale(time.Now()), // daftar IDX30/LQ45 lewat periode
		"index_until":   indexValidUntil,
		"syariah_stale": syariahStale(time.Now()), // DES OJK lewat periode
		"syariah_until": syariahValidUntil,
		"undervalue":    f.Undervalue,
		"regime":        regime, // IHSG vs SMA50: up | down | unknown
		"scanned":       scanned,
		"matched":       len(out),
		"results":       out,
	})
}
