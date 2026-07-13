package analysis

import "stock-api/models"

// ── FVG (Fair Value Gap) + iFVG (Inversion) ──────────────────────────────────
//
// A Fair Value Gap is a 3-candle imbalance where the wicks of candle 1 and
// candle 3 do not overlap, leaving an unfilled price void around the middle
// candle:
//
//   Bullish FVG – low of candle 3 > high of candle 1 (gap acts as support).
//   Bearish FVG – high of candle 3 < low of candle 1 (gap acts as resistance).
//
// Lifecycle (tracked forward from the bar after creation):
//
//   active   – price has not rebalanced the gap.
//   filled   – price wicked through the zone in the retrace direction but did
//              NOT close beyond it (gap rebalanced, zone consumed).
//   inverted – price CLOSED beyond the zone (bull: close < Bottom, bear:
//              close > Top). The zone flips role (iFVG): a broken bullish gap
//              becomes resistance, a broken bearish gap becomes support.
//              A previously-touched (filled) zone can still invert. Once
//              inverted it stays inverted, unless price later closes back
//              through it in the opposite direction — then it is spent and
//              marked "filled".
//
// Gaps smaller than minGapPct % of the middle candle's close are ignored.

// FVGZone is one detected Fair Value Gap with its final lifecycle status.
type FVGZone struct {
	ID           int     `json:"id"`
	Type         string  `json:"type"`   // "bull" | "bear" (direction of the original gap)
	Status       string  `json:"status"` // "active" | "inverted" | "filled"
	Top          float64 `json:"top"`
	Bottom       float64 `json:"bottom"`
	Date         string  `json:"date"`                    // date of the middle candle that created the gap
	InvertedDate string  `json:"inverted_date,omitempty"` // when status became inverted
}

// FVG scans `prices` for Fair Value Gaps and tracks each zone's lifecycle.
//
//	lookback  – how many recent bars to analyse (0 = all)
//	minGapPct – minimum gap size as % of the middle candle close (noise filter)
func FVG(prices []models.StockPrice, lookback int, minGapPct float64) []FVGZone {
	if lookback <= 0 || lookback > len(prices) {
		lookback = len(prices)
	}
	subset := prices[len(prices)-lookback:]

	var zones []FVGZone
	id := 0

	for i := 2; i < len(subset); i++ {
		var typ string
		var top, bottom float64
		switch {
		case subset[i].Low > subset[i-2].High: // bullish gap
			typ, bottom, top = "bull", subset[i-2].High, subset[i].Low
		case subset[i].High < subset[i-2].Low: // bearish gap
			typ, bottom, top = "bear", subset[i].High, subset[i-2].Low
		default:
			continue
		}

		midClose := subset[i-1].Close
		if midClose <= 0 || (top-bottom)/midClose*100 < minGapPct {
			continue
		}

		z := FVGZone{
			ID:     id,
			Type:   typ,
			Status: "active",
			Top:    R2(top),
			Bottom: R2(bottom),
			Date:   subset[i-1].Date,
		}
		id++

		// Track lifecycle forward from the bar after creation.
		for j := i + 1; j < len(subset); j++ {
			b := subset[j]
			if z.Status != "inverted" {
				// active or filled — a close beyond the zone still inverts it
				if typ == "bull" {
					if b.Close < bottom {
						z.Status = "inverted"
						z.InvertedDate = b.Date
					} else if b.Low <= bottom {
						z.Status = "filled"
					}
				} else {
					if b.Close > top {
						z.Status = "inverted"
						z.InvertedDate = b.Date
					} else if b.High >= top {
						z.Status = "filled"
					}
				}
			} else {
				// inverted — spent if price closes back through in the opposite direction
				if (typ == "bull" && b.Close > top) || (typ == "bear" && b.Close < bottom) {
					z.Status = "filled"
					break
				}
			}
		}

		zones = append(zones, z)
	}
	return zones
}
