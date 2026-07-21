package analysis

import (
	"fmt"
	"math"

	"stock-api/models"
)

// ── Decision Engine ──────────────────────────────────────────────────────────
//
// Weighted multi-factor scoring engine. Unlike the Advisor (hard if/else price
// action tree), this scores every factor 0–100, combines them with fixed
// weights, and outputs a transparent decision: 5-level signal, numeric
// confidence, multi-timeframe trend, S/R zones, entry zone, tiered take
// profit, and a bullish/sideways/bearish probability distribution.
//
// Weights:
//   Market Structure 25% · Trend EMA 18% · Money Flow 12% · Volume 12%
//   Support/Resistance 12% · Momentum 8% · Trend Strength 5% · Candlestick 4%
//   Risk/Reward 4%
//
// A low-confidence result (factors disagreeing sharply) is downgraded to WAIT
// rather than emitting a BUY/SELL the components do not actually support.

type TrendSet struct {
	Long    string `json:"long"`    // EMA50 vs EMA200
	Medium  string `json:"medium"`  // EMA20 vs EMA50
	Short   string `json:"short"`   // EMA10 vs EMA20
	Overall string `json:"overall"` // weighted 0.5·long + 0.3·medium + 0.2·short
}

type StructInfo struct {
	State    string `json:"state"` // e.g. "HH + HL", "LH + LL", "HH + LL (mixed)"
	Strength int    `json:"strength"`
}

type StatusScore struct {
	Status string `json:"status"`
	Score  int    `json:"score"`
}

type EntryZone struct {
	Buy   [2]float64 `json:"buy"`
	Ideal float64    `json:"ideal"`
}

type TPLevel struct {
	Price   float64 `json:"price"`
	Portion string  `json:"portion"`
}

type Probability struct {
	Bullish  int `json:"bullish"`
	Sideways int `json:"sideways"`
	Bearish  int `json:"bearish"`
}

// FactorScore is one row of the transparent scoring breakdown.
type FactorScore struct {
	Name   string `json:"name"`
	Score  int    `json:"score"`  // 0–100 (50 = neutral)
	Weight int    `json:"weight"` // percent
	Note   string `json:"note"`
}

type Decision struct {
	Signal          string        `json:"signal"` // STRONG_BUY | BUY | WAIT | SELL | STRONG_SELL
	Confidence      int           `json:"confidence"`
	Score           int           `json:"score"` // weighted decision score 0–100
	Trend           TrendSet      `json:"trend"`
	MarketStructure StructInfo    `json:"market_structure"`
	Volume          StatusScore   `json:"volume"`
	Momentum        StatusScore   `json:"momentum"`
	Support         []float64     `json:"support"`
	Resistance      []float64     `json:"resistance"`
	EntryZone       EntryZone     `json:"entry_zone"`
	StopLoss        float64       `json:"stop_loss"`
	TakeProfit      []TPLevel     `json:"take_profit"`
	RiskReward      float64       `json:"risk_reward"`
	Probability     Probability   `json:"probability"`
	Components      []FactorScore `json:"components"`
	Note            string        `json:"note,omitempty"` // set when the signal was gated down
}

// Calibration knobs. These are tuned against IDX behaviour (crash gaps leave
// swing levels stranded far above price), not universal constants — adjust
// them if the engine starts over- or under-rating stretched setups.
const (
	srNearMaxPct  = 15.0 // beyond this a level stops counting as a nearby reference
	srNoStructPct = 25.0 // no resistance within this = no structural target at all
	tp1ATRMult    = 3.0  // first target ceiling, in ATR from close
	tp2ATRMult    = 5.0  // second target ceiling
	rrImplausible = 6.0  // R/R above this usually means the target isn't real
)

// ── IDX tick size ────────────────────────────────────────────────────────────

func tickSize(p float64) float64 {
	switch {
	case p < 200:
		return 1
	case p < 500:
		return 2
	case p < 2000:
		return 5
	case p < 5000:
		return 10
	default:
		return 25
	}
}

func roundTick(p float64) float64 {
	if p <= 0 {
		return 0
	}
	t := tickSize(p)
	return math.Round(p/t) * t
}

// ── swing detection (2-left 2-right fractal) ─────────────────────────────────

type swingPt struct {
	price float64
	high  bool
}

func fractalSwings(prices []models.StockPrice, lookback int) []swingPt {
	n := len(prices)
	start := n - lookback
	if start < 0 {
		start = 0
	}
	p := prices[start:]
	var out []swingPt
	for i := 2; i < len(p)-2; i++ {
		isHigh, isLow := true, true
		for j := i - 2; j <= i+2; j++ {
			if p[j].High > p[i].High {
				isHigh = false
			}
			if p[j].Low < p[i].Low {
				isLow = false
			}
		}
		if isHigh {
			out = append(out, swingPt{price: p[i].High, high: true})
		}
		if isLow {
			out = append(out, swingPt{price: p[i].Low, high: false})
		}
	}
	return out
}

// clusterLevels groups swing prices within 1.5% tolerance.
func clusterLevels(swings []swingPt) []float64 {
	type cluster struct {
		price   float64
		touches int
	}
	var cl []*cluster
	for _, s := range swings {
		var hit *cluster
		for _, c := range cl {
			if math.Abs(c.price-s.price)/c.price < 0.015 {
				hit = c
				break
			}
		}
		if hit != nil {
			hit.price = (hit.price*float64(hit.touches) + s.price) / float64(hit.touches+1)
			hit.touches++
		} else {
			cl = append(cl, &cluster{price: s.price, touches: 1})
		}
	}
	out := make([]float64, len(cl))
	for i, c := range cl {
		out[i] = roundTick(c.price)
	}
	return out
}

// ── trend labelling ──────────────────────────────────────────────────────────

func trendFrom(close, fast, slow float64) string {
	if fast == 0 || slow == 0 {
		return "Sideways"
	}
	gap := (fast - slow) / slow * 100
	switch {
	case gap > 0.5 && close > fast:
		return "Bullish"
	case gap > 0.5:
		return "Weak Bullish"
	case gap < -0.5 && close < fast:
		return "Bearish"
	case gap < -0.5:
		return "Weak Bearish"
	default:
		return "Sideways"
	}
}

func trendScore(label string) int {
	switch label {
	case "Bullish":
		return 90
	case "Weak Bullish":
		return 65
	case "Weak Bearish":
		return 35
	case "Bearish":
		return 10
	default:
		return 50
	}
}

// overallTrendLabel is the inverse of trendScore, applied to the blended score.
func overallTrendLabel(score int) string {
	switch {
	case score >= 78:
		return "Bullish"
	case score >= 58:
		return "Weak Bullish"
	case score >= 42:
		return "Sideways"
	case score >= 22:
		return "Weak Bearish"
	default:
		return "Bearish"
	}
}

func clampScore(v float64) int {
	return int(math.Round(math.Max(0, math.Min(100, v))))
}

// DecisionEngine runs the weighted scoring model. Needs ≥ 60 bars.
func DecisionEngine(prices []models.StockPrice) Decision {
	n := len(prices)
	if n < 60 {
		return Decision{Signal: "WAIT", Confidence: 0,
			Trend:      TrendSet{"Sideways", "Sideways", "Sideways", "Sideways"},
			Components: []FactorScore{{Name: "Data", Score: 0, Weight: 100, Note: "Data belum cukup (butuh ≥60 hari)"}}}
	}

	last := prices[n-1]
	close := last.Close

	ema10 := lastVal(EMA(prices, 10))
	ema20 := lastVal(EMA(prices, 20))
	ema50 := lastVal(EMA(prices, 50))
	ema200 := lastVal(EMA(prices, 200))
	rsi := lastVal(RSI(prices, 14))
	atr := lastVal(ATR(prices, 14))
	macdHist := 0.0
	if m := MACD(prices, 12, 26, 9); len(m) > 0 {
		macdHist = m[len(m)-1].Histogram
	}

	// ── Trend (long falls back to EMA20/50 when <200 bars) ──────────────────
	longT := trendFrom(close, ema50, ema200)
	if ema200 == 0 {
		longT = trendFrom(close, ema20, ema50)
	}
	trend := TrendSet{
		Long:   longT,
		Medium: trendFrom(close, ema20, ema50),
		Short:  trendFrom(close, ema10, ema20),
	}
	trendSc := clampScore(0.5*float64(trendScore(trend.Long)) +
		0.3*float64(trendScore(trend.Medium)) +
		0.2*float64(trendScore(trend.Short)))
	// Label the blend the engine actually scores — a single timeframe read on
	// its own misrepresents the verdict (medium can be red while the setup is
	// bullish overall).
	trend.Overall = overallTrendLabel(trendSc)

	// ── Market structure from fractal swings ─────────────────────────────────
	swings := fractalSwings(prices, 90)
	var highsSeq, lowsSeq []float64
	for _, s := range swings {
		if s.high {
			highsSeq = append(highsSeq, s.price)
		} else {
			lowsSeq = append(lowsSeq, s.price)
		}
	}
	hState, lState := "?", "?"
	if len(highsSeq) >= 2 {
		hState = cond(highsSeq[len(highsSeq)-1] > highsSeq[len(highsSeq)-2], "HH", "LH")
	}
	if len(lowsSeq) >= 2 {
		lState = cond(lowsSeq[len(lowsSeq)-1] > lowsSeq[len(lowsSeq)-2], "HL", "LL")
	}
	structState := hState + " + " + lState
	structSc := 50
	switch {
	case hState == "HH" && lState == "HL":
		structSc = 90
	case hState == "LH" && lState == "LL":
		structSc = 10
	case hState == "HH" || lState == "HL":
		structSc = 65
		structState += " (mixed)"
	case hState == "LH" || lState == "LL":
		structSc = 35
		structState += " (mixed)"
	}
	structStrength := clampScore(math.Abs(float64(structSc)-50) * 2)

	// ── Support / Resistance zones from clustered swings ─────────────────────
	levels := clusterLevels(swings)
	var supports, resistances []float64
	for _, lv := range levels {
		if lv < close {
			supports = append(supports, lv)
		} else if lv > close {
			resistances = append(resistances, lv)
		}
	}
	sortDesc(supports)  // nearest support first
	sortAsc(resistances) // nearest resistance first
	if len(supports) > 3 {
		supports = supports[:3]
	}
	if len(resistances) > 3 {
		resistances = resistances[:3]
	}
	// fallbacks when price sits at the extreme of its range
	if len(supports) == 0 {
		supports = []float64{roundTick(minLow(prices, 20))}
	}
	if len(resistances) == 0 {
		resistances = []float64{roundTick(close + 2*atr), roundTick(close + 3.5*atr)}
	}

	s1 := supports[0]
	r1 := resistances[0]
	distSup := pctDiff(close, s1)
	distRes := pctDiff(r1, close)
	// Distances are capped before scoring: a level 70% away is not "room to
	// run", it is the gap a crash left behind. Past srNoStructPct there is no
	// usable reference at all, so the score is pulled back toward neutral
	// instead of reading as a perfect setup.
	nearDist := func(d float64) float64 { return math.Min(d, srNearMaxPct) }
	srSc := clampScore(50 + (nearDist(distRes)-nearDist(distSup))*3)
	srNote := fmt.Sprintf("support -%.1f%% / resistance +%.1f%%", distSup, distRes)
	if distRes > srNoStructPct {
		srSc = clampScore(50 + float64(srSc-50)*0.4)
		srNote += " (tanpa resistance terdekat)"
	}

	// ── Volume (direction-aware: high volume only bullish on an up move) ─────
	v5 := avgVol(prices, 5, 0)
	v20 := avgVol(prices, 20, 5)
	vr := 1.0
	if v20 > 0 {
		vr = v5 / v20
	}
	volStatus := "Normal"
	switch {
	case vr >= 1.2:
		volStatus = "Above Average"
	case vr < 0.8:
		volStatus = "Below Average"
	}
	// Arah pakai 5 hari terakhir — sama dengan timeframe rasio volume (v5/v20).
	dir := 1.0
	if close < prices[n-6].Close {
		dir = -1
	}
	volSc := clampScore(50 + (vr-1)*50*dir)

	// ── Momentum (RSI + MACD histogram) ──────────────────────────────────────
	// Overbought dilipat jadi penalti: RSI 70 = puncak skor, di atasnya turun
	// (80→50, 90→30) supaya tidak dorong BUY di pucuk.
	momRaw := rsi
	if rsi > 70 {
		momRaw = 70 - 2*(rsi-70)
	}
	momAdj := -10.0
	if macdHist > 0 {
		momAdj = 10
	}
	momSc := clampScore(momRaw + momAdj)
	momStatus := "Neutral"
	switch {
	case momSc > 60:
		momStatus = "Bullish"
	case momSc < 40:
		momStatus = "Bearish"
	}

	// ── Money Flow (CMF + MFI) ───────────────────────────────────────────────
	// Orthogonal to the price-only factors: answers "is volume actually being
	// accumulated or distributed", which price structure alone cannot see.
	// Both fall back to neutral 50 when there aren't enough bars.
	cmfSc, mfiSc := 50.0, 50.0
	cmf, mfi := 0.0, 0.0
	if pts := CMF(prices, 20); len(pts) > 0 {
		cmf = pts[len(pts)-1].Value
		cmfSc = float64(clampScore(50 + cmf*250)) // ±0.20 saturates
	}
	if pts := MFI(prices, 14); len(pts) > 0 {
		mfi = pts[len(pts)-1].Value
		raw := mfi
		if mfi > 80 { // overbought money flow folds back down, same as RSI
			raw = 80 - 2*(mfi-80)
		}
		mfiSc = float64(clampScore(raw))
	}
	flowSc := clampScore(0.6*cmfSc + 0.4*mfiSc)
	flowStatus := "Netral"
	switch {
	case flowSc > 60:
		flowStatus = "Akumulasi"
	case flowSc < 40:
		flowStatus = "Distribusi"
	}

	// ── Trend Strength (ADX + DI direction) ──────────────────────────────────
	// ADX below ~20 means no real trend: the score stays near neutral so a
	// choppy market cannot be scored as a confident directional call.
	adxSc, adxVal := 50, 0.0
	if pts := ADX(prices, 14); len(pts) > 0 {
		a := pts[len(pts)-1]
		adxVal = a.ADX
		strength := math.Min(a.ADX, 40) / 40 // 0–1, saturates at ADX 40
		adxDir := -1.0
		if a.PlusDI > a.MinusDI {
			adxDir = 1
		}
		adxSc = clampScore(50 + adxDir*strength*50)
	}

	// ── Candlestick (confirmation only) ──────────────────────────────────────
	candleLabel, candleDir := candlePattern(prices, n-1)
	strongCandle := candleLabel != "Bar hijau" && candleLabel != "Bar merah" && candleLabel != "-"
	candleSc := 50
	switch candleDir {
	case "bull":
		candleSc = 65
		if strongCandle {
			candleSc = 85
		}
	case "bear":
		candleSc = 35
		if strongCandle {
			candleSc = 15
		}
	}

	// ── Entry zone / SL / TP from support + ATR ──────────────────────────────
	idealF := math.Max(s1, close-0.5*atr)
	lo := roundTick(idealF - 0.25*atr)
	hi := roundTick(idealF + 0.25*atr)
	ideal := roundTick(idealF)
	stop := roundTick(s1 - 0.5*atr)
	if stop >= lo {
		stop = roundTick(lo * 0.97)
	}

	// Targets are capped at what ATR says is reachable. A resistance stranded
	// far above by an earlier collapse makes a nonsense first target and an
	// inflated R/R.
	tp1 := math.Min(resistances[0], close+tp1ATRMult*atr)
	var tp []TPLevel
	if len(resistances) >= 2 {
		tp2 := math.Min(resistances[1], close+tp2ATRMult*atr)
		if tp2 <= tp1 {
			tp2 = tp1 + atr // keep the tiers ordered after capping
		}
		tp = []TPLevel{{roundTick(tp1), "50%"}, {roundTick(tp2), "50%"}}
	} else {
		tp = []TPLevel{{roundTick(tp1), "100%"}}
	}

	rr := 0.0
	if ideal-stop > 0 {
		rr = (tp[0].Price - ideal) / (ideal - stop)
	}
	rrSc := 25
	switch {
	case rr > rrImplausible:
		rrSc = 50 // too good to be structural — treat as unknown, not excellent
	case rr >= 3:
		rrSc = 90
	case rr >= 2:
		rrSc = 75
	case rr >= 1.5:
		rrSc = 60
	case rr >= 1:
		rrSc = 45
	}

	// ── Weighted total → signal ──────────────────────────────────────────────
	comps := []FactorScore{
		{Name: "Market Structure", Score: structSc, Weight: 25, Note: structState},
		{Name: "Trend EMA", Score: trendSc, Weight: 18, Note: fmt.Sprintf("L:%s M:%s S:%s", trend.Long, trend.Medium, trend.Short)},
		{Name: "Money Flow", Score: flowSc, Weight: 12, Note: fmt.Sprintf("%s (CMF %+.2f, MFI %.0f)", flowStatus, cmf, mfi)},
		{Name: "Volume", Score: volSc, Weight: 12, Note: fmt.Sprintf("%s (%.2f× rata-rata 20D)", volStatus, vr)},
		{Name: "Support/Resistance", Score: srSc, Weight: 12, Note: srNote},
		{Name: "Momentum", Score: momSc, Weight: 8, Note: fmt.Sprintf("RSI %.0f, MACD hist %+.1f", rsi, macdHist)},
		{Name: "Trend Strength", Score: adxSc, Weight: 5, Note: fmt.Sprintf("ADX %.0f (%s)", adxVal, adxLabel(adxVal))},
		{Name: "Candlestick", Score: candleSc, Weight: 4, Note: candleLabel},
		{Name: "Risk/Reward", Score: rrSc, Weight: 4, Note: fmt.Sprintf("R/R %.1f", rr)},
	}
	total := 0.0
	for _, c := range comps {
		total += float64(c.Score) * float64(c.Weight) / 100
	}
	score := clampScore(total)

	signal := "WAIT"
	switch {
	case score >= 75:
		signal = "STRONG_BUY"
	case score >= 60:
		signal = "BUY"
	case score < 25:
		signal = "STRONG_SELL"
	case score < 40:
		signal = "SELL"
	}

	// Confidence = factor agreement: low weighted deviation between component
	// scores and the total means the factors point the same way. Deviation
	// tops out near 50, so it is doubled to use the full 0–100 range instead
	// of never reporting below 50.
	dev := 0.0
	for _, c := range comps {
		dev += math.Abs(float64(c.Score)-total) * float64(c.Weight) / 100
	}
	confidence := clampScore(100 - 2*dev)

	// Disagreement gate: an actionable call needs the factors to actually
	// agree. When they don't, say WAIT instead of guessing a direction.
	note := ""
	if confidence < 45 && signal != "WAIT" {
		note = fmt.Sprintf("Sinyal %s diturunkan ke WAIT — faktor saling bertentangan (keyakinan %d%%). Tunggu konfirmasi.", signal, confidence)
		signal = "WAIT"
	}

	// Probability distribution (always sums to 100).
	sideways := 20 + int(math.Round((50-math.Abs(total-50))*0.4))
	bullish := int(math.Round(float64(100-sideways) * total / 100))
	bearish := 100 - sideways - bullish

	return Decision{
		Signal:          signal,
		Confidence:      confidence,
		Score:           score,
		Trend:           trend,
		MarketStructure: StructInfo{State: structState, Strength: structStrength},
		Volume:          StatusScore{Status: volStatus, Score: volSc},
		Momentum:        StatusScore{Status: momStatus, Score: momSc},
		Support:         supports,
		Resistance:      resistances,
		EntryZone:       EntryZone{Buy: [2]float64{lo, hi}, Ideal: ideal},
		StopLoss:        stop,
		TakeProfit:      tp,
		RiskReward:      R2(rr),
		Probability:     Probability{Bullish: bullish, Sideways: sideways, Bearish: bearish},
		Components:      comps,
		Note:            note,
	}
}

func adxLabel(v float64) string {
	switch {
	case v >= 40:
		return "sangat kuat"
	case v >= 25:
		return "kuat"
	case v >= 20:
		return "mulai tren"
	default:
		return "sideways"
	}
}

// ── tiny sort helpers (avoid pulling in sort for 3-element slices) ───────────

func sortAsc(v []float64) {
	for i := 1; i < len(v); i++ {
		for j := i; j > 0 && v[j] < v[j-1]; j-- {
			v[j], v[j-1] = v[j-1], v[j]
		}
	}
}

func sortDesc(v []float64) {
	sortAsc(v)
	for i, j := 0, len(v)-1; i < j; i, j = i+1, j-1 {
		v[i], v[j] = v[j], v[i]
	}
}
