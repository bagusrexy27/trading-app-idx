package analysis

import "stock-api/models"

// ── AMD (Accumulation · Manipulation · Distribution) ─────────────────────────
//
// AMD is a Smart Money Concepts (SMC) / ICT-based market structure model:
//
//   Accumulation  – Smart money quietly builds positions in a tight sideways range.
//   Manipulation  – A false breakout (stop hunt / liquidity grab) traps retail traders.
//   Distribution  – Price moves strongly in the opposite direction of the manipulation.
//
// Detection algorithm (daily OHLCV bars):
//  1. Slide a fixed window of `accumPeriod` bars; if (maxHigh−minLow)/midClose < 5%
//     → accumulation zone found.
//  2. In the next `manipWindow` bars look for a "stop hunt":
//       bull_manip – bar.Low dips ≥ 0.3% below rangeLow AND closes back above it.
//       bear_manip – bar.High spikes ≥ 0.3% above rangeHigh AND closes back below it.
//  3. The `distribBars` bars after the manipulation are labelled distribution.
//  4. A confidence score (0–100) is computed from range tightness, accum length,
//     manipulation depth, and size of the subsequent move.

// ── Types ─────────────────────────────────────────────────────────────────────

// AMDZone represents one complete (or in-progress) AMD cycle.
type AMDZone struct {
	ID int `json:"id"`

	// Accumulation
	AccumStart string  `json:"accum_start"`
	AccumEnd   string  `json:"accum_end"`
	AccumBars  int     `json:"accum_bars"`
	RangeHigh  float64 `json:"range_high"`
	RangeLow   float64 `json:"range_low"`
	RangePct   float64 `json:"range_pct"` // (high−low)/mid × 100

	// Manipulation (liquidity grab / stop hunt)
	ManipDate  string  `json:"manip_date"`
	ManipType  string  `json:"manip_type"`  // "bull_manip" | "bear_manip"
	ManipLevel float64 `json:"manip_level"` // extreme wick price of the fakeout
	ManipPct   float64 `json:"manip_pct"`   // % beyond the accumulation range

	// Distribution (the real directional move)
	DistribStart string  `json:"distrib_start"`
	DistribDir   string  `json:"distrib_dir"` // "bullish" | "bearish"
	DistribPct   float64 `json:"distrib_pct"` // max % move from manipulation close

	// Meta
	Phase      string  `json:"phase"`      // "accumulation"|"manipulation"|"distribution"|"completed"
	Confidence float64 `json:"confidence"` // 0–100
}

// AMDBarPhase labels a single bar within the AMD cycle.
type AMDBarPhase struct {
	Date   string `json:"date"`
	Phase  string `json:"phase"`   // "accum"|"manip"|"distrib"|"none"
	ZoneID int    `json:"zone_id"` // -1 if not part of any zone
}

// AMDResult is the full AMD analysis response for a symbol.
type AMDResult struct {
	Zones        []AMDZone    `json:"zones"`
	BarPhases    []AMDBarPhase `json:"bar_phases"`
	CurrentZone  *AMDZone     `json:"current_zone"`  // most recent/active zone, nil if none
	CurrentPhase string       `json:"current_phase"` // phase of the last labelled bar
}

// ── AMD ───────────────────────────────────────────────────────────────────────

// AMD scans `prices` for Accumulation–Manipulation–Distribution patterns.
//
//	accumPeriod – minimum bars required for an accumulation window (default 10)
//	lookback    – how many recent bars to analyse (0 = all)
func AMD(prices []models.StockPrice, accumPeriod, lookback int) AMDResult {
	if accumPeriod < 3 {
		accumPeriod = 3
	}
	if lookback <= 0 || lookback > len(prices) {
		lookback = len(prices)
	}
	subset := prices[len(prices)-lookback:]
	n := len(subset)
	if n < accumPeriod+3 {
		return AMDResult{CurrentPhase: "none"}
	}

	const (
		accumThreshold = 5.0  // max H−L range % for accumulation
		minManipBreak  = 0.3  // min % spike beyond range to count as manipulation
		manipWindow    = 5    // bars after accumulation to look for stop hunt
		distribBars    = 25   // bars after manipulation to track distribution
	)

	barPhases := make([]AMDBarPhase, n)
	for i, p := range subset {
		barPhases[i] = AMDBarPhase{Date: p.Date, Phase: "none", ZoneID: -1}
	}

	var zones []AMDZone
	zoneID := 0
	i := 0

	for i <= n-accumPeriod-2 {
		window := subset[i : i+accumPeriod]

		// ── 1. Check if window forms a tight accumulation range ──────────────
		hi, lo, closeSum := window[0].High, window[0].Low, 0.0
		for _, p := range window {
			if p.High > hi {
				hi = p.High
			}
			if p.Low < lo {
				lo = p.Low
			}
			closeSum += p.Close
		}
		mid := closeSum / float64(accumPeriod)
		if mid == 0 {
			i++
			continue
		}
		rangePct := (hi - lo) / mid * 100
		if rangePct > accumThreshold {
			i++
			continue
		}

		// ── Accumulation found – extend window while range stays tight ───────
		accumEnd := i + accumPeriod - 1
		maxAccumLen := accumPeriod * 3
		for accumEnd+1 < n-2 && (accumEnd-i+1) < maxAccumLen {
			next := subset[accumEnd+1]
			newHi := hi
			newLo := lo
			if next.High > newHi {
				newHi = next.High
			}
			if next.Low < newLo {
				newLo = next.Low
			}
			newMid := (closeSum + next.Close) / float64(accumEnd-i+2)
			if newMid == 0 {
				break
			}
			if (newHi-newLo)/newMid*100 > accumThreshold {
				break
			}
			hi = newHi
			lo = newLo
			closeSum += next.Close
			accumEnd++
		}

		// Mark accumulation bars
		for j := i; j <= accumEnd; j++ {
			barPhases[j] = AMDBarPhase{Date: subset[j].Date, Phase: "accum", ZoneID: -1}
		}

		// ── 2. Look for manipulation (stop hunt) ─────────────────────────────
		manipSearch := accumEnd + 1
		manipLimit := manipSearch + manipWindow
		if manipLimit > n {
			manipLimit = n
		}

		type manipCandidate struct {
			idx      int
			mtype    string
			level    float64
			manipPct float64
		}
		var manip *manipCandidate

		for j := manipSearch; j < manipLimit; j++ {
			p := subset[j]
			// Bullish manipulation: wick dips below rangeLow, body closes back above
			if p.Low < lo && p.Close > lo {
				spikePct := (lo - p.Low) / lo * 100
				if spikePct >= minManipBreak {
					manip = &manipCandidate{
						idx:      j,
						mtype:    "bull_manip",
						level:    R2(p.Low),
						manipPct: R2(spikePct),
					}
					break
				}
			}
			// Bearish manipulation: wick spikes above rangeHigh, body closes back below
			if p.High > hi && p.Close < hi {
				spikePct := (p.High - hi) / hi * 100
				if spikePct >= minManipBreak {
					manip = &manipCandidate{
						idx:      j,
						mtype:    "bear_manip",
						level:    R2(p.High),
						manipPct: R2(spikePct),
					}
					break
				}
			}
		}

		if manip == nil {
			// No stop hunt found after this accumulation window – skip
			i = accumEnd + 1
			continue
		}

		// Mark manipulation bar
		barPhases[manip.idx] = AMDBarPhase{Date: subset[manip.idx].Date, Phase: "manip", ZoneID: zoneID}
		// Also correct accumulation bar zone IDs
		for j := i; j <= accumEnd; j++ {
			barPhases[j].ZoneID = zoneID
		}

		// ── 3. Distribution ──────────────────────────────────────────────────
		distribStart := manip.idx + 1
		distribEnd := distribStart + distribBars
		if distribEnd > n {
			distribEnd = n
		}

		for j := distribStart; j < distribEnd; j++ {
			barPhases[j] = AMDBarPhase{Date: subset[j].Date, Phase: "distrib", ZoneID: zoneID}
		}

		// Measure the max move during distribution window
		distribDir := "bullish"
		if manip.mtype == "bear_manip" {
			distribDir = "bearish"
		}
		distribPct := 0.0
		distribStartDate := ""
		if distribStart < n {
			distribStartDate = subset[distribStart].Date
			refClose := subset[manip.idx].Close
			for j := distribStart; j < distribEnd; j++ {
				p := subset[j]
				var pct float64
				if distribDir == "bullish" {
					pct = (p.High - refClose) / refClose * 100
				} else {
					pct = (refClose - p.Low) / refClose * 100
				}
				if pct > distribPct {
					distribPct = pct
				}
			}
			distribPct = R2(distribPct)
		}

		// ── Confidence score (0–100) ─────────────────────────────────────────
		confidence := 40.0
		accumLen := accumEnd - i + 1
		// Tighter range → higher confidence
		if rangePct < 2.5 {
			confidence += 15
		} else if rangePct < 3.5 {
			confidence += 8
		}
		// Longer accumulation → higher confidence
		if accumLen >= 15 {
			confidence += 15
		} else if accumLen >= 10 {
			confidence += 8
		}
		// Deeper manipulation spike → higher confidence
		if manip.manipPct >= 1.5 {
			confidence += 15
		} else if manip.manipPct >= 0.5 {
			confidence += 8
		}
		// Larger distribution move → higher confidence
		if distribPct >= 5.0 {
			confidence += 15
		} else if distribPct >= 2.5 {
			confidence += 8
		}
		if confidence > 100 {
			confidence = 100
		}

		// ── Determine phase status ────────────────────────────────────────────
		lastIdx := n - 1
		zonePhase := "completed"
		if lastIdx <= manip.idx {
			zonePhase = "manipulation"
		} else if lastIdx < distribEnd {
			zonePhase = "distribution"
		}

		zones = append(zones, AMDZone{
			ID:           zoneID,
			AccumStart:   subset[i].Date,
			AccumEnd:     subset[accumEnd].Date,
			AccumBars:    accumLen,
			RangeHigh:    R2(hi),
			RangeLow:     R2(lo),
			RangePct:     R2(rangePct),
			ManipDate:    subset[manip.idx].Date,
			ManipType:    manip.mtype,
			ManipLevel:   manip.level,
			ManipPct:     manip.manipPct,
			DistribStart: distribStartDate,
			DistribDir:   distribDir,
			DistribPct:   distribPct,
			Phase:        zonePhase,
			Confidence:   R2(confidence),
		})
		zoneID++

		// Resume scan after the distribution window
		i = distribEnd
	}

	// ── Determine current phase & zone ────────────────────────────────────────
	currentPhase := "none"
	for j := n - 1; j >= 0; j-- {
		if barPhases[j].Phase != "none" {
			currentPhase = barPhases[j].Phase
			break
		}
	}

	// If tail bars look like accumulation but no pattern formed yet → flag it
	if currentPhase == "none" && n >= 10 {
		tail := subset[n-10:]
		tHi, tLo, tSum := tail[0].High, tail[0].Low, 0.0
		for _, p := range tail {
			if p.High > tHi {
				tHi = p.High
			}
			if p.Low < tLo {
				tLo = p.Low
			}
			tSum += p.Close
		}
		tMid := tSum / 10
		if tMid > 0 && (tHi-tLo)/tMid*100 < accumThreshold {
			currentPhase = "potential_accum"
		}
	}

	// Current zone: the most recently active zone (last bar inside any zone)
	var currentZone *AMDZone
	for j := n - 1; j >= 0; j-- {
		if barPhases[j].ZoneID >= 0 {
			zid := barPhases[j].ZoneID
			for k := range zones {
				if zones[k].ID == zid {
					cp := zones[k]
					currentZone = &cp
					break
				}
			}
			break
		}
	}

	return AMDResult{
		Zones:        zones,
		BarPhases:    barPhases,
		CurrentZone:  currentZone,
		CurrentPhase: currentPhase,
	}
}
