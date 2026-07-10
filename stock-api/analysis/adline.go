package analysis

import "stock-api/models"

// ── A/D Line (Accumulation / Distribution Line) ──────────────────────────────
//
// Money Flow Multiplier (MFM) = ((Close - Low) - (High - Close)) / (High - Low)
//   - MFM > 0  → close near High → buying pressure
//   - MFM < 0  → close near Low  → selling pressure
//   - MFM = 0  → High == Low (no range, no signal)
//
// Money Flow Volume (MFV) = MFM × Volume
// AD Line = cumulative Σ MFV
//
// Compared to OBV (which only looks at close-to-close direction), AD also
// considers WHERE in the bar the close happened — sensitive to wick shape.

// ADLine returns the cumulative Accumulation/Distribution Line.
func ADLine(prices []models.StockPrice) []Point {
	if len(prices) == 0 {
		return nil
	}
	out := make([]Point, 0, len(prices))
	var ad float64
	for _, p := range prices {
		var mfm float64
		if p.High != p.Low {
			mfm = ((p.Close - p.Low) - (p.High - p.Close)) / (p.High - p.Low)
		}
		ad += mfm * float64(p.Volume)
		out = append(out, Point{Date: p.Date, Value: R2(ad)})
	}
	return out
}
