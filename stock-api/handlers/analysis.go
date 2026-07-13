package handlers

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/gorilla/mux"
	"stock-api/analysis"
	"stock-api/models"
	"stock-api/storage"
)

// AnalysisHandler groups all technical-analysis HTTP handlers.
type AnalysisHandler struct{}

func NewAnalysis() *AnalysisHandler { return &AnalysisHandler{} }

// ── shared helpers ────────────────────────────────────────────────────────────

func loadPrices(w http.ResponseWriter, symbol string) ([]models.StockPrice, bool) {
	data, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return nil, false
	}
	if data == nil {
		respond(w, 404, false, fmt.Sprintf("stock %s not found — add it first with POST /api/stocks", symbol), nil)
		return nil, false
	}
	if len(data.Prices) == 0 {
		respond(w, 422, false, "no price data available yet", nil)
		return nil, false
	}
	return data.Prices, true
}

func intParam(r *http.Request, key string, def int) int {
	if v := r.URL.Query().Get(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

func lastPoint(pts []analysis.Point) float64 {
	if len(pts) == 0 {
		return 0
	}
	return pts[len(pts)-1].Value
}

func tailPoints(pts []analysis.Point, n int) []analysis.Point {
	if n <= 0 || n >= len(pts) {
		return pts
	}
	return pts[len(pts)-n:]
}

func avgVol(prices []models.StockPrice, n int) int64 {
	if n > len(prices) {
		n = len(prices)
	}
	var sum int64
	for _, p := range prices[len(prices)-n:] {
		sum += p.Volume
	}
	return sum / int64(n)
}

func trendLabel(close, sma20, sma50 float64) string {
	if sma20 == 0 || sma50 == 0 {
		return "insufficient_data"
	}
	if close > sma20 && sma20 > sma50 {
		return "bullish"
	}
	if close < sma20 && sma20 < sma50 {
		return "bearish"
	}
	return "neutral"
}

func scoreToSignal(score, max int) (overall, strength string) {
	if max == 0 {
		return "NEUTRAL", "0.00"
	}
	ratio := float64(score) / float64(max)
	strength = fmt.Sprintf("%.2f", analysis.R2(ratio))
	switch {
	case ratio >= 0.6:
		overall = "STRONG BUY"
	case ratio >= 0.2:
		overall = "BUY"
	case ratio <= -0.6:
		overall = "STRONG SELL"
	case ratio <= -0.2:
		overall = "SELL"
	default:
		overall = "NEUTRAL"
	}
	return
}

// ── GET /api/analysis/{symbol}/summary ───────────────────────────────────────

func (h *AnalysisHandler) Summary(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	data, _ := storage.Load(symbol)
	latest := prices[len(prices)-1]

	pctChange := func(daysAgo int) (chg, pct float64) {
		if len(prices) <= daysAgo {
			return
		}
		ref := prices[len(prices)-1-daysAgo].Close
		if ref == 0 {
			return
		}
		return analysis.R2(latest.Close - ref), analysis.R2((latest.Close-ref)/ref*100)
	}
	c1, p1 := pctChange(1)
	c5, p5 := pctChange(5)
	c22, p22 := pctChange(22)
	c66, p66 := pctChange(66)

	// 52-week range
	lookback := 252
	if len(prices) < lookback {
		lookback = len(prices)
	}
	hi52, lo52 := prices[len(prices)-lookback].High, prices[len(prices)-lookback].Low
	for _, p := range prices[len(prices)-lookback:] {
		if p.High > hi52 {
			hi52 = p.High
		}
		if p.Low < lo52 {
			lo52 = p.Low
		}
	}

	vol20 := avgVol(prices, 20)
	volRatio := 0.0
	if vol20 > 0 {
		volRatio = analysis.R2(float64(latest.Volume) / float64(vol20))
	}

	sma20 := lastPoint(analysis.SMA(prices, 20))
	sma50 := lastPoint(analysis.SMA(prices, 50))
	sma200 := lastPoint(analysis.SMA(prices, 200))
	rsi14 := lastPoint(analysis.RSI(prices, 14))

	macdPts := analysis.MACD(prices, 12, 26, 9)
	var macdNow map[string]float64
	if len(macdPts) > 0 {
		m := macdPts[len(macdPts)-1]
		macdNow = map[string]float64{"macd": m.MACD, "signal": m.Signal, "histogram": m.Histogram}
	}

	bollPts := analysis.Bollinger(prices, 20, 2.0)
	var bollNow *analysis.BollingerPoint
	if len(bollPts) > 0 {
		b := bollPts[len(bollPts)-1]
		bollNow = &b
	}

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":       data.Symbol,
		"exchange":     data.Exchange,
		"last_updated": data.LastUpdated,
		"total_bars":   len(prices),
		"price": map[string]interface{}{
			"date": latest.Date, "open": latest.Open, "high": latest.High,
			"low": latest.Low, "close": latest.Close, "volume": latest.Volume,
		},
		"changes": map[string]interface{}{
			"1d": map[string]interface{}{"change": c1, "pct": p1},
			"5d": map[string]interface{}{"change": c5, "pct": p5},
			"1m": map[string]interface{}{"change": c22, "pct": p22},
			"3m": map[string]interface{}{"change": c66, "pct": p66},
		},
		"52_week": map[string]interface{}{
			"high":          hi52,
			"low":           lo52,
			"pct_from_high": analysis.R2((latest.Close-hi52)/hi52*100),
			"pct_from_low":  analysis.R2((latest.Close-lo52)/lo52*100),
		},
		"volume": map[string]interface{}{
			"current": latest.Volume, "avg_20d": vol20, "ratio_vs_avg": volRatio,
		},
		"moving_averages": map[string]interface{}{
			"sma_20": sma20, "sma_50": sma50, "sma_200": sma200,
			"trend": trendLabel(latest.Close, sma20, sma50),
		},
		"indicators": map[string]interface{}{
			"rsi_14": rsi14, "macd": macdNow, "bollinger": bollNow,
		},
	})
}

// ── GET /api/analysis/{symbol}/indicators ─────────────────────────────────────

func (h *AnalysisHandler) Indicators(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	latest := prices[len(prices)-1]

	sma20 := lastPoint(analysis.SMA(prices, 20))
	sma50 := lastPoint(analysis.SMA(prices, 50))
	sma200 := lastPoint(analysis.SMA(prices, 200))
	ema12 := lastPoint(analysis.EMA(prices, 12))
	ema26 := lastPoint(analysis.EMA(prices, 26))
	rsi14 := lastPoint(analysis.RSI(prices, 14))

	macdPts := analysis.MACD(prices, 12, 26, 9)
	var macdLatest *analysis.MACDPoint
	if len(macdPts) > 0 {
		m := macdPts[len(macdPts)-1]
		macdLatest = &m
	}

	bollPts := analysis.Bollinger(prices, 20, 2.0)
	var bollLatest *analysis.BollingerPoint
	if len(bollPts) > 0 {
		b := bollPts[len(bollPts)-1]
		bollLatest = &b
	}

	stochPts := analysis.Stochastic(prices, 14, 3)
	var stochLatest *analysis.StochPoint
	if len(stochPts) > 0 {
		s := stochPts[len(stochPts)-1]
		stochLatest = &s
	}

	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"date":   latest.Date,
		"close":  latest.Close,
		"moving_averages": map[string]interface{}{
			"sma_20": sma20, "sma_50": sma50, "sma_200": sma200,
			"ema_12": ema12, "ema_26": ema26,
			"trend": trendLabel(latest.Close, sma20, sma50),
		},
		"rsi_14":     rsi14,
		"macd":       macdLatest,
		"bollinger":  bollLatest,
		"stochastic": stochLatest,
	})
}

// ── GET /api/analysis/{symbol}/signals ───────────────────────────────────────

type signalEntry struct {
	Indicator string  `json:"indicator"`
	Value     float64 `json:"value"`
	Signal    string  `json:"signal"`
	Reason    string  `json:"reason"`
	Score     int     `json:"score"`
}

type signalResult struct {
	Signal    string
	Strength  string
	Score     int
	MaxScore  int
	Breakdown []signalEntry
}

func calcSignals(prices []models.StockPrice) signalResult {
	if len(prices) < 2 {
		return signalResult{}
	}
	latest := prices[len(prices)-1]
	entries := make([]signalEntry, 0, 5)
	total := 0

	// RSI(14)
	if pts := analysis.RSI(prices, 14); len(pts) > 0 {
		v := pts[len(pts)-1].Value
		e := signalEntry{Indicator: "RSI(14)", Value: v}
		switch {
		case v <= 30:
			e.Signal, e.Score, e.Reason = "BUY", 1, "oversold (≤30)"
		case v <= 40:
			e.Signal, e.Score, e.Reason = "BUY", 1, "approaching oversold (≤40)"
		case v >= 70:
			e.Signal, e.Score, e.Reason = "SELL", -1, "overbought (≥70)"
		case v >= 60:
			e.Signal, e.Score, e.Reason = "SELL", -1, "approaching overbought (≥60)"
		default:
			e.Signal, e.Score, e.Reason = "NEUTRAL", 0, "neutral zone (40–60)"
		}
		entries = append(entries, e)
		total += e.Score
	}

	// MACD(12,26,9)
	if pts := analysis.MACD(prices, 12, 26, 9); len(pts) >= 2 {
		cur, prev := pts[len(pts)-1], pts[len(pts)-2]
		e := signalEntry{Indicator: "MACD(12,26,9)", Value: cur.Histogram}
		switch {
		case cur.MACD > cur.Signal && prev.MACD <= prev.Signal:
			e.Signal, e.Score, e.Reason = "BUY", 1, "bullish crossover"
		case cur.MACD < cur.Signal && prev.MACD >= prev.Signal:
			e.Signal, e.Score, e.Reason = "SELL", -1, "bearish crossover"
		case cur.Histogram > 0:
			e.Signal, e.Score, e.Reason = "BUY", 1, "histogram positive"
		case cur.Histogram < 0:
			e.Signal, e.Score, e.Reason = "SELL", -1, "histogram negative"
		default:
			e.Signal, e.Score, e.Reason = "NEUTRAL", 0, "flat"
		}
		entries = append(entries, e)
		total += e.Score
	}

	// MA trend
	sma20 := lastPoint(analysis.SMA(prices, 20))
	sma50 := lastPoint(analysis.SMA(prices, 50))
	if sma20 > 0 && sma50 > 0 {
		e := signalEntry{Indicator: "SMA(20) vs SMA(50)", Value: analysis.R2(sma20 - sma50)}
		switch {
		case sma20 > sma50 && latest.Close > sma20:
			e.Signal, e.Score, e.Reason = "BUY", 1, "price > SMA20 > SMA50 (uptrend)"
		case sma20 < sma50 && latest.Close < sma20:
			e.Signal, e.Score, e.Reason = "SELL", -1, "price < SMA20 < SMA50 (downtrend)"
		default:
			e.Signal, e.Score, e.Reason = "NEUTRAL", 0, "mixed trend"
		}
		entries = append(entries, e)
		total += e.Score
	}

	// Bollinger Bands
	if pts := analysis.Bollinger(prices, 20, 2.0); len(pts) > 0 {
		b := pts[len(pts)-1]
		e := signalEntry{Indicator: "Bollinger(20,2)", Value: b.PercentB}
		switch {
		case b.PercentB <= 5:
			e.Signal, e.Score, e.Reason = "BUY", 1, "%B ≤5% — near lower band"
		case b.PercentB >= 95:
			e.Signal, e.Score, e.Reason = "SELL", -1, "%B ≥95% — near upper band"
		default:
			e.Signal, e.Score, e.Reason = "NEUTRAL", 0, fmt.Sprintf("%%B = %.1f%%", b.PercentB)
		}
		entries = append(entries, e)
		total += e.Score
	}

	// Stochastic(14,3)
	if pts := analysis.Stochastic(prices, 14, 3); len(pts) >= 2 {
		cur, prev := pts[len(pts)-1], pts[len(pts)-2]
		e := signalEntry{Indicator: "Stochastic(14,3)", Value: cur.K}
		switch {
		case cur.K <= 20 && cur.K > prev.K:
			e.Signal, e.Score, e.Reason = "BUY", 1, "%K turning up in oversold zone"
		case cur.K >= 80 && cur.K < prev.K:
			e.Signal, e.Score, e.Reason = "SELL", -1, "%K turning down in overbought zone"
		case cur.K <= 20:
			e.Signal, e.Score, e.Reason = "BUY", 1, "oversold (K ≤20)"
		case cur.K >= 80:
			e.Signal, e.Score, e.Reason = "SELL", -1, "overbought (K ≥80)"
		default:
			e.Signal, e.Score, e.Reason = "NEUTRAL", 0, "neutral zone"
		}
		entries = append(entries, e)
		total += e.Score
	}

	overall, strength := scoreToSignal(total, len(entries))
	return signalResult{
		Signal:    overall,
		Strength:  strength,
		Score:     total,
		MaxScore:  len(entries),
		Breakdown: entries,
	}
}

func (h *AnalysisHandler) Signals(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	if len(prices) < 2 {
		respond(w, 422, false, "need at least 2 bars for signals", nil)
		return
	}
	latest := prices[len(prices)-1]
	sig := calcSignals(prices)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":    symbol,
		"date":      latest.Date,
		"close":     latest.Close,
		"signal":    sig.Signal,
		"strength":  sig.Strength,
		"score":     sig.Score,
		"max_score": sig.MaxScore,
		"breakdown": sig.Breakdown,
	})
}

// ── GET /api/analysis/{symbol}/sma?period=20&limit=30 ────────────────────────

func (h *AnalysisHandler) SMA(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 20)
	pts := tailPoints(analysis.SMA(prices, period), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/ema?period=20&limit=30 ────────────────────────

func (h *AnalysisHandler) EMA(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 20)
	pts := tailPoints(analysis.EMA(prices, period), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/rsi?period=14&limit=30 ────────────────────────

func (h *AnalysisHandler) RSI(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 14)
	pts := tailPoints(analysis.RSI(prices, period), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period,
		"overbought": 70, "oversold": 30,
		"count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/macd?fast=12&slow=26&signal=9&limit=30 ─────────

func (h *AnalysisHandler) MACD(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	fast := intParam(r, "fast", 12)
	slow := intParam(r, "slow", 26)
	sig := intParam(r, "signal", 9)

	pts := analysis.MACD(prices, fast, slow, sig)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"params": map[string]int{"fast": fast, "slow": slow, "signal": sig},
		"count":  len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/bollinger?period=20&mult=2&limit=30 ────────────

func (h *AnalysisHandler) Bollinger(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 20)
	mult := 2.0
	if v := r.URL.Query().Get("mult"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			mult = f
		}
	}
	pts := analysis.Bollinger(prices, period, mult)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"params": map[string]interface{}{"period": period, "mult": mult},
		"count":  len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/stochastic?k=14&d=3&limit=30 ──────────────────

func (h *AnalysisHandler) Stochastic(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	k := intParam(r, "k", 14)
	d := intParam(r, "d", 3)
	pts := analysis.Stochastic(prices, k, d)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"params": map[string]int{"k": k, "d": d},
		"overbought": 80, "oversold": 20,
		"count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/atr?period=14&limit=300 ────────────────────────

func (h *AnalysisHandler) ATR(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 14)
	pts := tailPoints(analysis.ATR(prices, period), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/obv?limit=300 ──────────────────────────────────

func (h *AnalysisHandler) OBV(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pts := tailPoints(analysis.OBV(prices), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/adx?period=14&limit=300 ────────────────────────

func (h *AnalysisHandler) ADX(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 14)
	pts := analysis.ADX(prices, period)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/vwap?limit=300 ─────────────────────────────────

func (h *AnalysisHandler) VWAP(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pts := tailPoints(analysis.VWAP(prices), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/sar?limit=300 ──────────────────────────────────

func (h *AnalysisHandler) SAR(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pts := tailPoints(analysis.SAR(prices), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/ichimoku?limit=300 ─────────────────────────────

func (h *AnalysisHandler) Ichimoku(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pts := analysis.Ichimoku(prices)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/fibonacci?lookback=100 ─────────────────────────

func (h *AnalysisHandler) Fibonacci(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	lookback := intParam(r, "lookback", 100)
	levels := analysis.Fibonacci(prices, lookback)
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "lookback": lookback, "levels": levels,
	})
}

// ── GET /api/analysis/{symbol}/fvg?lookback=200&min_gap=0.3 ──────────────────

func (h *AnalysisHandler) FVG(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	lookback := intParam(r, "lookback", 200)
	minGap := 0.3
	if v := r.URL.Query().Get("min_gap"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
			minGap = f
		}
	}
	zones := analysis.FVG(prices, lookback, minGap)

	// Active zones (active + inverted), nearest to last close first.
	lastClose := prices[len(prices)-1].Close
	active := make([]analysis.FVGZone, 0, len(zones))
	for _, z := range zones {
		if z.Status != "filled" {
			active = append(active, z)
		}
	}
	sort.Slice(active, func(i, j int) bool {
		di := math.Abs((active[i].Top+active[i].Bottom)/2 - lastClose)
		dj := math.Abs((active[j].Top+active[j].Bottom)/2 - lastClose)
		return di < dj
	})

	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol,
		"params": map[string]interface{}{"lookback": lookback, "min_gap": minGap},
		"count":  len(zones),
		"zones":  zones,
		"active": active,
	})
}

// ── GET /api/analysis/{symbol}/adline?limit=300 ──────────────────────────────

func (h *AnalysisHandler) ADLine(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pts := tailPoints(analysis.ADLine(prices), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/cmf?period=20&limit=300 ───────────────────────

func (h *AnalysisHandler) CMF(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 20)
	pts := tailPoints(analysis.CMF(prices, period), intParam(r, "limit", 9999))
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period,
		"bullish_threshold": 0.05, "bearish_threshold": -0.05,
		"count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/mfi?period=14&limit=300 ───────────────────────

func (h *AnalysisHandler) MFI(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	period := intParam(r, "period", 14)
	pts := analysis.MFI(prices, period)
	limit := intParam(r, "limit", 9999)
	if limit < len(pts) {
		pts = pts[len(pts)-limit:]
	}
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "period": period,
		"overbought": 80, "oversold": 20,
		"count": len(pts), "data": pts,
	})
}

// ── GET /api/analysis/{symbol}/amd?accum=10&lookback=200 ─────────────────────

func (h *AnalysisHandler) AMD(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	accumPeriod := intParam(r, "accum", 10)
	lookback := intParam(r, "lookback", 200)
	result := analysis.AMD(prices, accumPeriod, lookback)
	respond(w, 200, true, "", map[string]interface{}{
		"symbol":        symbol,
		"params":        map[string]int{"accum_period": accumPeriod, "lookback": lookback},
		"current_phase": result.CurrentPhase,
		"current_zone":  result.CurrentZone,
		"zones":         result.Zones,
		"bar_phases":    result.BarPhases,
	})
}

// ── GET /api/analysis/{symbol}/pivots ─────────────────────────────────────────

func (h *AnalysisHandler) Pivots(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}
	pivots := analysis.Pivots(prices)
	respond(w, 200, true, "", map[string]interface{}{
		"symbol": symbol, "pivots": pivots,
	})
}

// ── GET /api/overview ─────────────────────────────────────────────────────────

type overviewItem struct {
	Symbol   string  `json:"symbol"`
	Close    float64 `json:"close"`
	Date     string  `json:"date"`
	Pct1D    float64 `json:"pct_1d"`
	Pct5D    float64 `json:"pct_5d"`
	Pct1M    float64 `json:"pct_1m"`
	RSI      float64 `json:"rsi"`
	Trend    string  `json:"trend"`
	Signal   string  `json:"signal"`
	Score    int     `json:"score"`
	MaxScore int     `json:"max_score"`
	VolRatio float64 `json:"vol_ratio"`
}

func (h *AnalysisHandler) Overview(w http.ResponseWriter, r *http.Request) {
	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if len(symbols) == 0 {
		respond(w, 200, true, "", []interface{}{})
		return
	}

	type res struct {
		item overviewItem
		ok   bool
	}
	ch := make(chan res, len(symbols))

	for _, sym := range symbols {
		sym := sym
		go func() {
			data, loadErr := storage.Load(sym)
			if loadErr != nil || data == nil || len(data.Prices) == 0 {
				ch <- res{}
				return
			}
			prices := data.Prices
			latest := prices[len(prices)-1]

			pct := func(daysAgo int) float64 {
				if len(prices) <= daysAgo {
					return 0
				}
				ref := prices[len(prices)-1-daysAgo].Close
				if ref == 0 {
					return 0
				}
				return analysis.R2((latest.Close - ref) / ref * 100)
			}

			sma20 := lastPoint(analysis.SMA(prices, 20))
			sma50 := lastPoint(analysis.SMA(prices, 50))
			rsi14 := lastPoint(analysis.RSI(prices, 14))
			vol20 := avgVol(prices, 20)
			volRatio := 0.0
			if vol20 > 0 {
				volRatio = analysis.R2(float64(latest.Volume) / float64(vol20))
			}
			sig := calcSignals(prices)

			ch <- res{ok: true, item: overviewItem{
				Symbol:   sym,
				Close:    latest.Close,
				Date:     latest.Date,
				Pct1D:    pct(1),
				Pct5D:    pct(5),
				Pct1M:    pct(22),
				RSI:      rsi14,
				Trend:    trendLabel(latest.Close, sma20, sma50),
				Signal:   sig.Signal,
				Score:    sig.Score,
				MaxScore: sig.MaxScore,
				VolRatio: volRatio,
			}}
		}()
	}

	items := make([]overviewItem, 0, len(symbols))
	for range symbols {
		r := <-ch
		if r.ok {
			items = append(items, r.item)
		}
	}

	// Sort: highest score first, then alphabetically
	sort.Slice(items, func(i, j int) bool {
		if items[i].Score != items[j].Score {
			return items[i].Score > items[j].Score
		}
		return items[i].Symbol < items[j].Symbol
	})

	respond(w, 200, true, "", items)
}

// ── GET /api/session ──────────────────────────────────────────────────────────

type candlePattern struct {
	Name        string `json:"name"`
	Type        string `json:"type"`        // bullish | bearish | neutral
	Description string `json:"description"`
}

func detectPattern(prices []models.StockPrice) candlePattern {
	if len(prices) < 2 {
		return candlePattern{Name: "N/A", Type: "neutral", Description: "Data tidak cukup"}
	}
	cur := prices[len(prices)-1]
	prev := prices[len(prices)-2]

	rng := cur.High - cur.Low
	if rng < 0.001 {
		return candlePattern{Name: "Doji", Type: "neutral", Description: "Pasar ragu-ragu"}
	}

	body := math.Abs(cur.Close - cur.Open)
	bodyPct := body / rng * 100
	upperWick := cur.High - math.Max(cur.Open, cur.Close)
	lowerWick := math.Min(cur.Open, cur.Close) - cur.Low
	bullish := cur.Close >= cur.Open

	// Doji family
	if bodyPct < 10 {
		if lowerWick > 0.6*rng {
			return candlePattern{Name: "Dragonfly Doji", Type: "bullish", Description: "Potensi reversal naik dari support"}
		}
		if upperWick > 0.6*rng {
			return candlePattern{Name: "Gravestone Doji", Type: "bearish", Description: "Potensi reversal turun dari resistance"}
		}
		return candlePattern{Name: "Doji", Type: "neutral", Description: "Pasar ragu-ragu, tunggu konfirmasi"}
	}

	// Engulfing (2-candle pattern — checked early for priority)
	prevBullish := prev.Close >= prev.Open
	if bullish && !prevBullish {
		if cur.Open <= prev.Close && cur.Close >= prev.Open {
			return candlePattern{Name: "Bullish Engulfing", Type: "bullish", Description: "Sinyal reversal kuat ke atas"}
		}
	}
	if !bullish && prevBullish {
		if cur.Open >= prev.Close && cur.Close <= prev.Open {
			return candlePattern{Name: "Bearish Engulfing", Type: "bearish", Description: "Sinyal reversal kuat ke bawah"}
		}
	}

	// Marubozu (body >= 80%, no significant wicks)
	if bodyPct >= 80 {
		if bullish {
			return candlePattern{Name: "Bullish Marubozu", Type: "bullish", Description: "Tekanan beli sangat kuat, momentum positif"}
		}
		return candlePattern{Name: "Bearish Marubozu", Type: "bearish", Description: "Tekanan jual sangat kuat, momentum negatif"}
	}

	// Hammer / Shooting Star (body < 40%)
	if bodyPct < 40 {
		if lowerWick >= 2*body && upperWick <= 0.3*body {
			return candlePattern{Name: "Hammer", Type: "bullish", Description: "Sinyal reversal naik, buyer menolak level rendah"}
		}
		if upperWick >= 2*body && lowerWick <= 0.3*body {
			return candlePattern{Name: "Shooting Star", Type: "bearish", Description: "Sinyal reversal turun, seller menolak level tinggi"}
		}
		if lowerWick >= 1.5*body && upperWick >= 1.5*body {
			return candlePattern{Name: "Spinning Top", Type: "neutral", Description: "Kekuatan seimbang, belum ada arah jelas"}
		}
	}

	// Three White Soldiers / Three Black Crows (3-candle)
	if len(prices) >= 3 {
		p1 := prices[len(prices)-3]
		p2 := prices[len(prices)-2]
		// p3 is `cur` already
		if p1.Close > p1.Open && p2.Close > p2.Open && cur.Close > cur.Open {
			if p2.Close > p1.Close && cur.Close > p2.Close {
				return candlePattern{Name: "Three White Soldiers", Type: "bullish", Description: "3 candle bullish berturut, momentum naik kuat"}
			}
		}
		if p1.Close < p1.Open && p2.Close < p2.Open && cur.Close < cur.Open {
			if p2.Close < p1.Close && cur.Close < p2.Close {
				return candlePattern{Name: "Three Black Crows", Type: "bearish", Description: "3 candle bearish berturut, momentum turun kuat"}
			}
		}
		// Morning Star (gap down then recovery)
		prevBear := p1.Close < p1.Open
		bigBody1 := math.Abs(p1.Close-p1.Open)/rng >= 0.5
		smallBody2 := math.Abs(p2.Close-p2.Open) < 0.3*math.Abs(p1.Close-p1.Open)
		if prevBear && bigBody1 && smallBody2 && bullish && bodyPct >= 40 {
			return candlePattern{Name: "Morning Star", Type: "bullish", Description: "Reversal bullish 3-candle, sinyal pembalikan naik"}
		}
		// Evening Star
		prevBull := p1.Close > p1.Open
		if prevBull && bigBody1 && smallBody2 && !bullish && bodyPct >= 40 {
			return candlePattern{Name: "Evening Star", Type: "bearish", Description: "Reversal bearish 3-candle, sinyal pembalikan turun"}
		}
	}

	// Harami (inside candle)
	prevBodyHigh := math.Max(prev.Open, prev.Close)
	prevBodyLow  := math.Min(prev.Open, prev.Close)
	curBodyHigh  := math.Max(cur.Open, cur.Close)
	curBodyLow   := math.Min(cur.Open, cur.Close)
	if curBodyHigh < prevBodyHigh && curBodyLow > prevBodyLow {
		prevBullish := prev.Close >= prev.Open
		if !prevBullish && bullish {
			return candlePattern{Name: "Bullish Harami", Type: "bullish", Description: "Candle kecil di dalam candle besar bearish, potensi reversal"}
		}
		if prevBullish && !bullish {
			return candlePattern{Name: "Bearish Harami", Type: "bearish", Description: "Candle kecil di dalam candle besar bullish, potensi reversal"}
		}
	}

	// Inside Bar
	if cur.High <= prev.High && cur.Low >= prev.Low {
		return candlePattern{Name: "Inside Bar", Type: "neutral", Description: "Konsolidasi dalam range candle sebelumnya, tunggu breakout"}
	}

	// Generic
	if bullish {
		return candlePattern{Name: "Candle Bullish", Type: "bullish", Description: "Pembeli lebih kuat dari penjual"}
	}
	return candlePattern{Name: "Candle Bearish", Type: "bearish", Description: "Penjual lebih kuat dari pembeli"}
}

type sessionItem struct {
	Symbol       string        `json:"symbol"`
	Date         string        `json:"date"`
	Open         float64       `json:"open"`
	High         float64       `json:"high"`
	Low          float64       `json:"low"`
	Close        float64       `json:"close"`
	Volume       int64         `json:"volume"`
	PrevClose    float64       `json:"prev_close"`
	Change       float64       `json:"change"`
	ChangePct    float64       `json:"change_pct"`
	BodyPct      float64       `json:"body_pct"`
	UpperWickPct float64       `json:"upper_wick_pct"`
	LowerWickPct float64       `json:"lower_wick_pct"`
	VolRatio     float64       `json:"vol_ratio"`
	Pattern      candlePattern `json:"pattern"`
	Signal       string        `json:"signal"`
	Score        int           `json:"score"`
	MaxScore     int           `json:"max_score"`
}

func (h *AnalysisHandler) Session(w http.ResponseWriter, r *http.Request) {
	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if len(symbols) == 0 {
		respond(w, 200, true, "", []interface{}{})
		return
	}

	type res struct {
		item sessionItem
		ok   bool
	}
	ch := make(chan res, len(symbols))

	for _, sym := range symbols {
		sym := sym
		go func() {
			data, loadErr := storage.Load(sym)
			if loadErr != nil || data == nil || len(data.Prices) < 2 {
				ch <- res{}
				return
			}
			prices := data.Prices
			cur := prices[len(prices)-1]
			prev := prices[len(prices)-2]

			rng := cur.High - cur.Low
			body := math.Abs(cur.Close - cur.Open)
			upperWick := cur.High - math.Max(cur.Open, cur.Close)
			lowerWick := math.Min(cur.Open, cur.Close) - cur.Low

			bodyPct, upperWickPct, lowerWickPct := 0.0, 0.0, 0.0
			if rng > 0 {
				bodyPct = analysis.R2(body / rng * 100)
				upperWickPct = analysis.R2(upperWick / rng * 100)
				lowerWickPct = analysis.R2(lowerWick / rng * 100)
			}

			change := analysis.R2(cur.Close - prev.Close)
			changePct := 0.0
			if prev.Close > 0 {
				changePct = analysis.R2((cur.Close - prev.Close) / prev.Close * 100)
			}

			vol20 := avgVol(prices, 20)
			volRatio := 0.0
			if vol20 > 0 {
				volRatio = analysis.R2(float64(cur.Volume) / float64(vol20))
			}

			sig := calcSignals(prices)

			ch <- res{ok: true, item: sessionItem{
				Symbol:       sym,
				Date:         cur.Date,
				Open:         cur.Open,
				High:         cur.High,
				Low:          cur.Low,
				Close:        cur.Close,
				Volume:       cur.Volume,
				PrevClose:    prev.Close,
				Change:       change,
				ChangePct:    changePct,
				BodyPct:      bodyPct,
				UpperWickPct: upperWickPct,
				LowerWickPct: lowerWickPct,
				VolRatio:     volRatio,
				Pattern:      detectPattern(prices),
				Signal:       sig.Signal,
				Score:        sig.Score,
				MaxScore:     sig.MaxScore,
			}}
		}()
	}

	items := make([]sessionItem, 0, len(symbols))
	for range symbols {
		r := <-ch
		if r.ok {
			items = append(items, r.item)
		}
	}

	// Sort by absolute change% descending (biggest movers first)
	sort.Slice(items, func(i, j int) bool {
		return math.Abs(items[i].ChangePct) > math.Abs(items[j].ChangePct)
	})

	respond(w, 200, true, "", items)
}
