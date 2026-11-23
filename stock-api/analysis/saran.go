package analysis

import (
	"fmt"

	"stock-api/models"
)

// ── Saran ────────────────────────────────────────────────────────────────────
//
// Saran is the app's one verdict (handlers call it through decide()). It
// replaced the weighted DecisionEngine on 2026-11-23: that score had ~zero
// rank IC and every factor graded D in the Rapor. The rule is the "tren naik
// belum pucuk" pattern from the 2020–Nov 2026 panel research (docs/DECISIONS.md):
//
//	BUY  ("Tren naik")  short (EMA10/20) and medium (EMA20/50) trend Bullish,
//	                    close 0–1.5 ATR above EMA20, RSI14 50–65
//	SELL ("Tren turun") short and medium trend Bearish — description only, no plan
//	WAIT ("Tunggu")     everything else
//
// Plan = close, stop −1.5 ATR, target +3 ATR (the exit that made the pattern
// pay; the old support-based stop/near TP lost money after costs).
//
// ponytail: the thresholds are the researched values, deliberately not
// re-tuned — changing them needs a new research run, not a guess. The rule is
// under forward test (blindtest freezes Nov 2026 – Jan 2027, pass criteria in
// docs/DECISIONS.md).

const (
	SaranStopATR   = 1.5 // stop distance below close, in ATR14
	SaranTargetATR = 3.0 // target distance above close, in ATR14
	saranMaxExtATR = 1.5 // close may sit at most this many ATR above EMA20
	saranRSILo     = 50.0
	saranRSIHi     = 65.0
)

// Saran returns the verdict for the last bar. Needs ≥ 60 bars. Score and
// Confidence stay zero: the rule is a checklist, not a score.
func Saran(prices []models.StockPrice) Decision {
	n := len(prices)
	if n < 60 {
		return Decision{Signal: "WAIT",
			Trend:      TrendSet{"Sideways", "Sideways", "Sideways", "Sideways"},
			Components: []FactorScore{{Name: "Data", Note: "Data belum cukup (butuh ≥60 hari)"}}}
	}
	close := prices[n-1].Close
	ema20 := lastVal(EMA(prices, 20))
	rsi := lastVal(RSI(prices, 14))
	atr := lastVal(ATR(prices, 14))
	trend, _ := trendSet(close, lastVal(EMA(prices, 10)), ema20, lastVal(EMA(prices, 50)), lastVal(EMA(prices, 200)))

	ext := 0.0
	if atr > 0 {
		ext = (close - ema20) / atr
	}
	check := func(ok bool) int {
		if ok {
			return 100
		}
		return 0
	}
	shortUp, medUp := trend.Short == "Bullish", trend.Medium == "Bullish"
	extOK := atr > 0 && ext >= 0 && ext <= saranMaxExtATR
	rsiOK := rsi >= saranRSILo && rsi <= saranRSIHi
	comps := []FactorScore{
		{Name: "Tren pendek naik", Score: check(shortUp), Note: "EMA10 vs EMA20: " + trend.Short},
		{Name: "Tren menengah naik", Score: check(medUp), Note: "EMA20 vs EMA50: " + trend.Medium},
		{Name: "Belum terlalu jauh", Score: check(extOK), Note: fmt.Sprintf("%.1f ATR di atas EMA20 (syarat 0–%.1f)", ext, saranMaxExtATR)},
		{Name: "RSI wajar", Score: check(rsiOK), Note: fmt.Sprintf("RSI %.0f (syarat %.0f–%.0f)", rsi, saranRSILo, saranRSIHi)},
	}

	d := Decision{Signal: "WAIT", Trend: trend, Components: comps}
	d.Support, d.Resistance = srLevels(prices, fractalSwings(prices, 90), close, atr)
	switch {
	case shortUp && medUp && extOK && rsiOK:
		d.Signal = "BUY"
	case trend.Short == "Bearish" && trend.Medium == "Bearish":
		d.Signal = "SELL"
		return d // description only: no plan
	}
	if stop, tp := SaranPlan(close, atr); stop > 0 {
		d.EntryZone = EntryZone{Buy: [2]float64{roundTick(close), roundTick(close)}, Ideal: roundTick(close)}
		d.StopLoss = stop
		d.TakeProfit = []TPLevel{{tp, "100%"}}
		d.RiskReward = R2((tp - roundTick(close)) / (roundTick(close) - stop))
	}
	return d
}

// SaranPlan is the ATR exit: stop and target, tick-rounded. Zero when ATR is
// unknown. Calibration and the blindtest baseline apply it to every verdict.
func SaranPlan(close, atr float64) (stop, target float64) {
	if atr <= 0 || close-SaranStopATR*atr <= 0 {
		return 0, 0
	}
	return roundTick(close - SaranStopATR*atr), roundTick(close + SaranTargetATR*atr)
}

// RegimeWarnNote is attached to a Tren naik verdict while IHSG is below its
// SMA50. Nothing is hidden; the calibration row attached alongside carries
// the historical result in that regime.
const RegimeWarnNote = "IHSG di bawah MA50 — secara historis saran Tren naik di kondisi ini rata-rata rugi. Lihat rekam jejak di bawah."

// WarnRegime adds RegimeWarnNote to a BUY when regime is "down". It replaced
// GateRegime (which hid the plan) on 2026-11-23 at the user's request.
func WarnRegime(d Decision, regime string) Decision {
	if regime == "down" && d.Signal == "BUY" {
		d.Note = RegimeWarnNote
	}
	return d
}
