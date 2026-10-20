package analysis

import (
	"math"

	"stock-api/models"
)

// Shared price-action helpers used by the decision engine (and, for
// CandlePattern, by the /ai and /session handlers — the one candle detector).

// CandlePattern inspects bar i (needs i>=1) and returns an Indonesian label
// and a direction ("bull" | "bear" | "neutral").
func CandlePattern(prices []models.StockPrice, i int) (label, dir string) {
	if i < 1 {
		return "-", "neutral"
	}
	o, h, l, c := prices[i].Open, prices[i].High, prices[i].Low, prices[i].Close
	po, pc := prices[i-1].Open, prices[i-1].Close
	body := math.Abs(c - o)
	rng := h - l
	if rng == 0 {
		return "-", "neutral"
	}
	upper := h - math.Max(c, o)
	lower := math.Min(c, o) - l

	// Bullish engulfing: prev red, current green body engulfs prev body.
	if pc < po && c > o && c >= po && o <= pc {
		return "Bullish Engulfing", "bull"
	}
	// Bearish engulfing: prev green, current red body engulfs prev body.
	if pc > po && c < o && o >= pc && c <= po {
		return "Bearish Engulfing", "bear"
	}
	// Hammer: long lower wick, small body up top, tiny upper wick.
	if lower > 2*body && upper < body && body/rng < 0.4 {
		return "Hammer (tolak bawah)", "bull"
	}
	// Shooting star: long upper wick, small body down low, tiny lower wick.
	if upper > 2*body && lower < body && body/rng < 0.4 {
		return "Shooting Star (tolak atas)", "bear"
	}
	// Doji: very small body.
	if body/rng < 0.1 {
		return "Doji (ragu-ragu)", "neutral"
	}
	if c > o {
		return "Bar hijau", "bull"
	}
	return "Bar merah", "bear"
}

func lastVal(pts []Point) float64 {
	if len(pts) == 0 {
		return 0
	}
	return pts[len(pts)-1].Value
}

func minLow(prices []models.StockPrice, window int) float64 {
	return minLowRange(prices, window, 0)
}

// minLowRange = lowest Low over the window ending `offset` bars from the end.
func minLowRange(prices []models.StockPrice, window, offset int) float64 {
	n := len(prices)
	end := n - offset
	start := end - window
	if start < 0 {
		start = 0
	}
	if end > n {
		end = n
	}
	m := math.MaxFloat64
	for i := start; i < end; i++ {
		if prices[i].Low < m {
			m = prices[i].Low
		}
	}
	if m == math.MaxFloat64 {
		return 0
	}
	return m
}

// avgVol = average Volume over `window` bars ending `offset` bars from the end.
func avgVol(prices []models.StockPrice, window, offset int) float64 {
	n := len(prices)
	end := n - offset
	start := end - window
	if start < 0 {
		start = 0
	}
	if end > n {
		end = n
	}
	var sum float64
	cnt := 0
	for i := start; i < end; i++ {
		sum += float64(prices[i].Volume)
		cnt++
	}
	if cnt == 0 {
		return 0
	}
	return sum / float64(cnt)
}

// pctDiff = (a-b)/b * 100.
func pctDiff(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return (a - b) / b * 100
}

func cond(b bool, yes, no string) string {
	if b {
		return yes
	}
	return no
}
