package analysis

import (
	"math"

	"stock-api/models"
)

// ── CMF (Chaikin Money Flow) ─────────────────────────────────────────────────
//
// CMF = Σ MFV(period) / Σ Volume(period)
//   - Range  : −1.0 .. +1.0
//   - > 0.05 : accumulation (buyers in control)
//   - < −0.05: distribution (sellers in control)
//   - period : typically 20
//
// MFV computed as in A/D Line (see adline.go).

// CMF computes Chaikin Money Flow with rolling window `period`.
func CMF(prices []models.StockPrice, period int) []Point {
	if len(prices) < period || period < 1 {
		return nil
	}

	mfv := make([]float64, len(prices))
	vol := make([]float64, len(prices))
	for i, p := range prices {
		var mfm float64
		if p.High != p.Low {
			mfm = ((p.Close - p.Low) - (p.High - p.Close)) / (p.High - p.Low)
		}
		mfv[i] = mfm * float64(p.Volume)
		vol[i] = float64(p.Volume)
	}

	round4 := func(v float64) float64 { return math.Round(v*10000) / 10000 }

	out := make([]Point, 0, len(prices)-period+1)
	var sumMFV, sumVol float64
	for i := range period {
		sumMFV += mfv[i]
		sumVol += vol[i]
	}
	cmf := 0.0
	if sumVol > 0 {
		cmf = sumMFV / sumVol
	}
	out = append(out, Point{Date: prices[period-1].Date, Value: round4(cmf)})

	for i := period; i < len(prices); i++ {
		sumMFV += mfv[i] - mfv[i-period]
		sumVol += vol[i] - vol[i-period]
		cmf = 0.0
		if sumVol > 0 {
			cmf = sumMFV / sumVol
		}
		out = append(out, Point{Date: prices[i].Date, Value: round4(cmf)})
	}
	return out
}
