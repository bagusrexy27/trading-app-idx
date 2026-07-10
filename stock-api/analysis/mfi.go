package analysis

import "stock-api/models"

// ── MFI (Money Flow Index) ───────────────────────────────────────────────────
//
// Volume-weighted version of RSI.
//   TP        = (High + Low + Close) / 3
//   Raw MF    = TP × Volume
//   +MF       = Σ Raw MF on bars where TP > TP[prev], over `period`
//   −MF       = Σ Raw MF on bars where TP < TP[prev], over `period`
//   MF Ratio  = +MF / −MF
//   MFI       = 100 − 100 / (1 + MF Ratio)
//
// Period typically 14. >80 = overbought / distribution risk.
// <20 = oversold / accumulation opportunity.

// MFI computes the Money Flow Index over `period` days.
func MFI(prices []models.StockPrice, period int) []Point {
	if len(prices) < period+1 || period < 1 {
		return nil
	}

	n := len(prices)
	tp := make([]float64, n)
	rmf := make([]float64, n)
	for i, p := range prices {
		tp[i] = (p.High + p.Low + p.Close) / 3
		rmf[i] = tp[i] * float64(p.Volume)
	}

	out := make([]Point, 0, n-period)
	for i := period; i < n; i++ {
		var pos, neg float64
		for j := i - period + 1; j <= i; j++ {
			if tp[j] > tp[j-1] {
				pos += rmf[j]
			} else if tp[j] < tp[j-1] {
				neg += rmf[j]
			}
		}
		mfi := 100.0
		if neg > 0 {
			mfi = 100 - 100/(1+pos/neg)
		}
		out = append(out, Point{Date: prices[i].Date, Value: R2(mfi)})
	}
	return out
}
