package analysis

import (
	"math"

	"stock-api/models"
)

// ── Types ────────────────────────────────────────────────────────────────────

type Point struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type MACDPoint struct {
	Date      string  `json:"date"`
	MACD      float64 `json:"macd"`
	Signal    float64 `json:"signal"`
	Histogram float64 `json:"histogram"`
}

type BollingerPoint struct {
	Date      string  `json:"date"`
	Upper     float64 `json:"upper"`
	Middle    float64 `json:"middle"`
	Lower     float64 `json:"lower"`
	Bandwidth float64 `json:"bandwidth"` // (upper-lower)/middle * 100
	PercentB  float64 `json:"percent_b"` // (close-lower)/(upper-lower) * 100
}

// ── SMA ──────────────────────────────────────────────────────────────────────

// SMA computes a Simple Moving Average over `period` days.
func SMA(prices []models.StockPrice, period int) []Point {
	if len(prices) < period || period < 1 {
		return nil
	}
	out := make([]Point, 0, len(prices)-period+1)
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += prices[i].Close
	}
	out = append(out, Point{Date: prices[period-1].Date, Value: R2(sum / float64(period))})
	for i := period; i < len(prices); i++ {
		sum += prices[i].Close - prices[i-period].Close
		out = append(out, Point{Date: prices[i].Date, Value: R2(sum / float64(period))})
	}
	return out
}

// ── EMA ──────────────────────────────────────────────────────────────────────

// EMA computes an Exponential Moving Average seeded with SMA(period).
func EMA(prices []models.StockPrice, period int) []Point {
	if len(prices) < period || period < 1 {
		return nil
	}
	mul := 2.0 / float64(period+1)

	// seed: SMA of first `period` candles
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += prices[i].Close
	}
	ema := sum / float64(period)
	out := make([]Point, 0, len(prices)-period+1)
	out = append(out, Point{Date: prices[period-1].Date, Value: R2(ema)})

	for i := period; i < len(prices); i++ {
		ema = prices[i].Close*mul + ema*(1-mul)
		out = append(out, Point{Date: prices[i].Date, Value: R2(ema)})
	}
	return out
}

// ema returns raw float64 slice (internal, used by MACD).
func emaRaw(prices []models.StockPrice, period int) []float64 {
	if len(prices) < period {
		return nil
	}
	mul := 2.0 / float64(period+1)
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += prices[i].Close
	}
	v := sum / float64(period)
	out := make([]float64, len(prices)-period+1)
	out[0] = v
	for i := period; i < len(prices); i++ {
		v = prices[i].Close*mul + v*(1-mul)
		out[i-period+1] = v
	}
	return out
}

// ── RSI ──────────────────────────────────────────────────────────────────────

// RSI computes Wilder's RSI over `period` days (typically 14).
func RSI(prices []models.StockPrice, period int) []Point {
	if len(prices) < period+1 || period < 1 {
		return nil
	}

	var avgGain, avgLoss float64
	for i := 1; i <= period; i++ {
		d := prices[i].Close - prices[i-1].Close
		if d > 0 {
			avgGain += d
		} else {
			avgLoss -= d
		}
	}
	avgGain /= float64(period)
	avgLoss /= float64(period)

	rsiVal := func(g, l float64) float64 {
		if l == 0 {
			return 100
		}
		return 100 - 100/(1+g/l)
	}

	out := make([]Point, 0, len(prices)-period)
	out = append(out, Point{Date: prices[period].Date, Value: R2(rsiVal(avgGain, avgLoss))})

	for i := period + 1; i < len(prices); i++ {
		d := prices[i].Close - prices[i-1].Close
		gain, loss := 0.0, 0.0
		if d > 0 {
			gain = d
		} else {
			loss = -d
		}
		avgGain = (avgGain*float64(period-1) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)
		out = append(out, Point{Date: prices[i].Date, Value: R2(rsiVal(avgGain, avgLoss))})
	}
	return out
}

// ── MACD ─────────────────────────────────────────────────────────────────────

// MACD computes MACD(fast, slow, signal). Typical: fast=12, slow=26, signal=9.
func MACD(prices []models.StockPrice, fast, slow, sigPeriod int) []MACDPoint {
	ef := emaRaw(prices, fast)
	es := emaRaw(prices, slow)
	if ef == nil || es == nil {
		return nil
	}

	// ef starts at index (fast-1) of prices, es at (slow-1).
	// Align them so both cover the same price indices.
	offset := slow - fast // ef is longer; skip offset elements
	n := len(es)
	macdLine := make([]float64, n)
	macdDates := make([]string, n)
	for i := 0; i < n; i++ {
		macdLine[i] = ef[i+offset] - es[i]
		macdDates[i] = prices[slow-1+i].Date
	}

	if n < sigPeriod {
		return nil
	}

	// Signal line: EMA(sigPeriod) of macdLine
	mul := 2.0 / float64(sigPeriod+1)
	sum := 0.0
	for i := 0; i < sigPeriod; i++ {
		sum += macdLine[i]
	}
	sig := sum / float64(sigPeriod)

	out := make([]MACDPoint, 0, n-sigPeriod+1)
	m := macdLine[sigPeriod-1]
	out = append(out, MACDPoint{
		Date:      macdDates[sigPeriod-1],
		MACD:      R2(m),
		Signal:    R2(sig),
		Histogram: R2(m - sig),
	})

	for i := sigPeriod; i < n; i++ {
		sig = macdLine[i]*mul + sig*(1-mul)
		out = append(out, MACDPoint{
			Date:      macdDates[i],
			MACD:      R2(macdLine[i]),
			Signal:    R2(sig),
			Histogram: R2(macdLine[i] - sig),
		})
	}
	return out
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────

// Bollinger computes Bollinger Bands with `period` days and `mult` std-dev multiplier (typically 2.0).
func Bollinger(prices []models.StockPrice, period int, mult float64) []BollingerPoint {
	if len(prices) < period || period < 1 {
		return nil
	}
	out := make([]BollingerPoint, 0, len(prices)-period+1)

	for i := period - 1; i < len(prices); i++ {
		sum := 0.0
		for j := i - period + 1; j <= i; j++ {
			sum += prices[j].Close
		}
		mean := sum / float64(period)

		variance := 0.0
		for j := i - period + 1; j <= i; j++ {
			d := prices[j].Close - mean
			variance += d * d
		}
		sd := math.Sqrt(variance / float64(period))

		upper := mean + mult*sd
		lower := mean - mult*sd
		bw := 0.0
		pb := 0.0
		if mean != 0 {
			bw = (upper - lower) / mean * 100
		}
		if upper != lower {
			pb = (prices[i].Close - lower) / (upper - lower) * 100
		}

		out = append(out, BollingerPoint{
			Date:      prices[i].Date,
			Upper:     R2(upper),
			Middle:    R2(mean),
			Lower:     R2(lower),
			Bandwidth: R2(bw),
			PercentB:  R2(pb),
		})
	}
	return out
}

// ── Stochastic Oscillator ─────────────────────────────────────────────────────

type StochPoint struct {
	Date string  `json:"date"`
	K    float64 `json:"k"` // %K
	D    float64 `json:"d"` // %D = SMA(3) of K
}

// Stochastic computes the Stochastic Oscillator (%K, %D). Typical: k=14, d=3.
func Stochastic(prices []models.StockPrice, kPeriod, dPeriod int) []StochPoint {
	if len(prices) < kPeriod {
		return nil
	}
	kLine := make([]float64, 0, len(prices)-kPeriod+1)
	kDates := make([]string, 0, len(prices)-kPeriod+1)

	for i := kPeriod - 1; i < len(prices); i++ {
		lo, hi := prices[i-kPeriod+1].Low, prices[i-kPeriod+1].High
		for j := i - kPeriod + 1; j <= i; j++ {
			if prices[j].Low < lo {
				lo = prices[j].Low
			}
			if prices[j].High > hi {
				hi = prices[j].High
			}
		}
		k := 0.0
		if hi != lo {
			k = (prices[i].Close - lo) / (hi - lo) * 100
		}
		kLine = append(kLine, k)
		kDates = append(kDates, prices[i].Date)
	}

	if len(kLine) < dPeriod {
		return nil
	}

	out := make([]StochPoint, 0, len(kLine)-dPeriod+1)
	for i := dPeriod - 1; i < len(kLine); i++ {
		sum := 0.0
		for j := i - dPeriod + 1; j <= i; j++ {
			sum += kLine[j]
		}
		out = append(out, StochPoint{
			Date: kDates[i],
			K:    R2(kLine[i]),
			D:    R2(sum / float64(dPeriod)),
		})
	}
	return out
}

// ── ATR (Average True Range) ─────────────────────────────────────────────────

// ATR computes Wilder's Average True Range over `period` days (typically 14).
func ATR(prices []models.StockPrice, period int) []Point {
	if len(prices) < period+1 || period < 1 {
		return nil
	}

	// Compute True Range for each bar starting at index 1
	tr := make([]float64, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		hi := prices[i].High
		lo := prices[i].Low
		pc := prices[i-1].Close
		trVal := math.Max(hi-lo, math.Max(math.Abs(hi-pc), math.Abs(lo-pc)))
		tr[i-1] = trVal
	}

	if len(tr) < period {
		return nil
	}

	// Seed: simple average of first `period` true ranges
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += tr[i]
	}
	atr := sum / float64(period)

	out := make([]Point, 0, len(tr)-period+1)
	// The first ATR point corresponds to prices[period] (index period in prices)
	out = append(out, Point{Date: prices[period].Date, Value: R2(atr)})

	for i := period; i < len(tr); i++ {
		atr = (atr*float64(period-1) + tr[i]) / float64(period)
		out = append(out, Point{Date: prices[i+1].Date, Value: R2(atr)})
	}
	return out
}

// ── OBV (On-Balance Volume) ───────────────────────────────────────────────────

// OBV computes On-Balance Volume. Positive volume added on up-days, subtracted on down-days.
func OBV(prices []models.StockPrice) []Point {
	if len(prices) < 2 {
		return nil
	}
	out := make([]Point, 0, len(prices))
	var obv float64
	out = append(out, Point{Date: prices[0].Date, Value: 0})
	for i := 1; i < len(prices); i++ {
		switch {
		case prices[i].Close > prices[i-1].Close:
			obv += float64(prices[i].Volume)
		case prices[i].Close < prices[i-1].Close:
			obv -= float64(prices[i].Volume)
		}
		out = append(out, Point{Date: prices[i].Date, Value: R2(obv)})
	}
	return out
}

// ── ADX (Average Directional Index) ──────────────────────────────────────────

type ADXPoint struct {
	Date    string  `json:"date"`
	ADX     float64 `json:"adx"`
	PlusDI  float64 `json:"plus_di"`
	MinusDI float64 `json:"minus_di"`
}

// ADX computes Wilder's ADX(period) along with +DI and -DI.
func ADX(prices []models.StockPrice, period int) []ADXPoint {
	if len(prices) < period*2+1 || period < 1 {
		return nil
	}

	n := len(prices)
	plusDM  := make([]float64, n-1)
	minusDM := make([]float64, n-1)
	tr      := make([]float64, n-1)

	for i := 1; i < n; i++ {
		upMove   := prices[i].High - prices[i-1].High
		downMove := prices[i-1].Low - prices[i].Low
		if upMove > downMove && upMove > 0 {
			plusDM[i-1] = upMove
		}
		if downMove > upMove && downMove > 0 {
			minusDM[i-1] = downMove
		}
		tr[i-1] = math.Max(prices[i].High-prices[i].Low,
			math.Max(math.Abs(prices[i].High-prices[i-1].Close),
				math.Abs(prices[i].Low-prices[i-1].Close)))
	}

	// Wilder's smoothing seed (sum of first `period` values)
	atr14, pDM14, mDM14 := 0.0, 0.0, 0.0
	for i := 0; i < period; i++ {
		atr14 += tr[i]
		pDM14 += plusDM[i]
		mDM14 += minusDM[i]
	}

	pf := float64(period)
	out := make([]ADXPoint, 0, n-2*period)

	// first DI values
	pDI := 100 * pDM14 / atr14
	mDI := 100 * mDM14 / atr14
	dx  := 0.0
	if pDI+mDI > 0 {
		dx = 100 * math.Abs(pDI-mDI) / (pDI + mDI)
	}
	adxSum := dx // seed for ADX smoothing

	// We need `period` DX values to seed the ADX; track them
	dxBuf := make([]float64, 0, period)
	dxBuf = append(dxBuf, dx)

	for i := period; i < n-1; i++ {
		atr14 = atr14 - atr14/pf + tr[i]
		pDM14 = pDM14 - pDM14/pf + plusDM[i]
		mDM14 = mDM14 - mDM14/pf + minusDM[i]

		if atr14 == 0 {
			dxBuf = append(dxBuf, 0)
			continue
		}
		pDI = R2(100 * pDM14 / atr14)
		mDI = R2(100 * mDM14 / atr14)
		dx = 0
		if pDI+mDI > 0 {
			dx = 100 * math.Abs(pDI-mDI) / (pDI + mDI)
		}
		dxBuf = append(dxBuf, dx)

		if len(dxBuf) < period {
			continue
		}
		// seed ADX on first `period` dx values
		var adx float64
		if len(dxBuf) == period {
			for _, v := range dxBuf {
				adxSum += v
			}
			adx = R2(adxSum / pf)
		} else {
			adx = R2((adxSum*(pf-1) + dx) / pf)
			adxSum = adx
		}

		out = append(out, ADXPoint{
			Date:    prices[i+1].Date,
			ADX:     adx,
			PlusDI:  pDI,
			MinusDI: mDI,
		})
	}
	return out
}

// ── VWAP (Cumulative for daily data) ─────────────────────────────────────────

// VWAP computes cumulative Volume-Weighted Average Price using daily bars.
// TP = (High + Low + Close) / 3
func VWAP(prices []models.StockPrice) []Point {
	if len(prices) == 0 {
		return nil
	}
	out := make([]Point, 0, len(prices))
	var cumTPV, cumVol float64
	for _, p := range prices {
		tp := (p.High + p.Low + p.Close) / 3
		cumTPV += tp * float64(p.Volume)
		cumVol += float64(p.Volume)
		vwap := 0.0
		if cumVol > 0 {
			vwap = R2(cumTPV / cumVol)
		}
		out = append(out, Point{Date: p.Date, Value: vwap})
	}
	return out
}

// ── Parabolic SAR ─────────────────────────────────────────────────────────────

// SAR computes Wilder's Parabolic SAR. AF starts at 0.02, steps 0.02, max 0.2.
func SAR(prices []models.StockPrice) []Point {
	if len(prices) < 2 {
		return nil
	}
	const afInit, afStep, afMax = 0.02, 0.02, 0.2

	// Determine initial trend from first 2 bars
	bull  := prices[1].Close >= prices[0].Close
	sar   := prices[0].Low
	if !bull {
		sar = prices[0].High
	}
	ep  := prices[0].High
	if !bull {
		ep = prices[0].Low
	}
	af  := afInit

	out := make([]Point, 0, len(prices))
	out = append(out, Point{Date: prices[0].Date, Value: R2(sar)})

	for i := 1; i < len(prices); i++ {
		p := prices[i]
		// Project SAR
		newSAR := sar + af*(ep-sar)

		if bull {
			// Ensure SAR is below prior two lows
			if i >= 2 && newSAR > prices[i-1].Low {
				newSAR = prices[i-1].Low
			}
			if i >= 3 && newSAR > prices[i-2].Low {
				newSAR = prices[i-2].Low
			}
			if p.Low <= newSAR {
				// Reversal to bearish
				bull = false
				newSAR = ep
				ep = p.Low
				af = afInit
			} else {
				if p.High > ep {
					ep = p.High
					af = math.Min(af+afStep, afMax)
				}
			}
		} else {
			if i >= 2 && newSAR < prices[i-1].High {
				newSAR = prices[i-1].High
			}
			if i >= 3 && newSAR < prices[i-2].High {
				newSAR = prices[i-2].High
			}
			if p.High >= newSAR {
				// Reversal to bullish
				bull = true
				newSAR = ep
				ep = p.High
				af = afInit
			} else {
				if p.Low < ep {
					ep = p.Low
					af = math.Min(af+afStep, afMax)
				}
			}
		}
		sar = newSAR
		out = append(out, Point{Date: p.Date, Value: R2(sar)})
	}
	return out
}

// ── Ichimoku Cloud ────────────────────────────────────────────────────────────

type IchimokuPoint struct {
	Date   string  `json:"date"`
	Tenkan float64 `json:"tenkan"`
	Kijun  float64 `json:"kijun"`
	SpanA  float64 `json:"span_a"`
	SpanB  float64 `json:"span_b"`
	Chikou float64 `json:"chikou"`
}

func ichimokuMid(prices []models.StockPrice, start, end int) float64 {
	hi, lo := prices[start].High, prices[start].Low
	for i := start + 1; i <= end; i++ {
		if prices[i].High > hi { hi = prices[i].High }
		if prices[i].Low  < lo { lo = prices[i].Low  }
	}
	return R2((hi + lo) / 2)
}

// Ichimoku computes the 5 Ichimoku components using standard (9,26,52) periods.
func Ichimoku(prices []models.StockPrice) []IchimokuPoint {
	if len(prices) < 52 {
		return nil
	}
	out := make([]IchimokuPoint, 0, len(prices)-51)
	for i := 51; i < len(prices); i++ {
		tenkan := ichimokuMid(prices, i-8, i)
		kijun  := ichimokuMid(prices, i-25, i)
		spanA  := R2((tenkan + kijun) / 2)
		spanB  := ichimokuMid(prices, i-51, i)
		chikou := prices[i].Close
		// Chikou is plotted 26 bars back; we return current close for alignment
		_ = chikou
		chikouDate := prices[i].Date
		if i >= 26 {
			chikouDate = prices[i-26].Date
		}
		_ = chikouDate
		out = append(out, IchimokuPoint{
			Date:   prices[i].Date,
			Tenkan: tenkan,
			Kijun:  kijun,
			SpanA:  spanA,
			SpanB:  spanB,
			Chikou: prices[i].Close,
		})
	}
	return out
}

// ── Fibonacci Retracement ─────────────────────────────────────────────────────

type FibLevels struct {
	High float64 `json:"high"`
	Low  float64 `json:"low"`
	L0   float64 `json:"l0"`
	L236 float64 `json:"l236"`
	L382 float64 `json:"l382"`
	L500 float64 `json:"l500"`
	L618 float64 `json:"l618"`
	L786 float64 `json:"l786"`
	L100 float64 `json:"l100"`
}

// Fibonacci computes retracement levels from the highest high and lowest low
// in the last `lookback` bars (default 100 if lookback <= 0).
func Fibonacci(prices []models.StockPrice, lookback int) FibLevels {
	if lookback <= 0 || lookback > len(prices) {
		lookback = len(prices)
	}
	slice := prices[len(prices)-lookback:]
	hi, lo := slice[0].High, slice[0].Low
	for _, p := range slice {
		if p.High > hi { hi = p.High }
		if p.Low  < lo { lo = p.Low  }
	}
	rng := hi - lo
	return FibLevels{
		High: R2(hi),
		Low:  R2(lo),
		L0:   R2(lo),
		L236: R2(lo + 0.236*rng),
		L382: R2(lo + 0.382*rng),
		L500: R2(lo + 0.500*rng),
		L618: R2(lo + 0.618*rng),
		L786: R2(lo + 0.786*rng),
		L100: R2(hi),
	}
}

// ── Pivot Points (Standard) ───────────────────────────────────────────────────

type PivotLevels struct {
	Date   string  `json:"date"`
	Pivot  float64 `json:"pivot"`
	R1     float64 `json:"r1"`
	R2     float64 `json:"r2"`
	R3     float64 `json:"r3"`
	S1     float64 `json:"s1"`
	S2     float64 `json:"s2"`
	S3     float64 `json:"s3"`
}

// Pivots computes standard pivot points from the most recent complete bar.
func Pivots(prices []models.StockPrice) PivotLevels {
	if len(prices) < 2 {
		return PivotLevels{}
	}
	prev := prices[len(prices)-2]
	cur  := prices[len(prices)-1]
	h, l, c := prev.High, prev.Low, prev.Close
	p := R2((h + l + c) / 3)
	rng := h - l
	return PivotLevels{
		Date:  cur.Date,
		Pivot: p,
		R1:    R2(2*p - l),
		R2:    R2(p + rng),
		R3:    R2(h + 2*(p-l)),
		S1:    R2(2*p - h),
		S2:    R2(p - rng),
		S3:    R2(l - 2*(h-p)),
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

// R2 rounds to 2 decimal places.
func R2(v float64) float64 {
	return math.Round(v*100) / 100
}
