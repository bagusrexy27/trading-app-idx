package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"stock-api/analysis"
)

// AIHandler handles analysis endpoints.
type AIHandler struct{}

func NewAI() *AIHandler { return &AIHandler{} }

// ── GET /api/analysis/{symbol}/ai ─────────────────────────────────────────────

func (h *AIHandler) Analyze(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	prices, ok := loadPrices(w, symbol)
	if !ok {
		return
	}

	if len(prices) < 30 {
		respond(w, 422, false, "butuh minimal 30 bar data untuk analisa", nil)
		return
	}

	latest := prices[len(prices)-1]

	// ── Kumpulkan semua indikator ─────────────────────────────────────

	rsiPts := analysis.RSI(prices, 14)
	rsiVal := 0.0
	if len(rsiPts) > 0 {
		rsiVal = rsiPts[len(rsiPts)-1].Value
	}

	macdPts := analysis.MACD(prices, 12, 26, 9)
	histVal := 0.0
	if len(macdPts) > 0 {
		histVal = macdPts[len(macdPts)-1].Histogram
	}

	bollPts := analysis.Bollinger(prices, 20, 2.0)
	upper, middle, lower, percentB := 0.0, 0.0, 0.0, 50.0
	if len(bollPts) > 0 {
		b := bollPts[len(bollPts)-1]
		upper, middle, lower, percentB = b.Upper, b.Middle, b.Lower, b.PercentB
	}

	stochPts := analysis.Stochastic(prices, 14, 3)
	stochK, stochD := 0.0, 0.0
	if len(stochPts) > 0 {
		s := stochPts[len(stochPts)-1]
		stochK, stochD = s.K, s.D
	}

	sma20  := lastPoint(analysis.SMA(prices, 20))
	sma50  := lastPoint(analysis.SMA(prices, 50))
	sma200 := lastPoint(analysis.SMA(prices, 200))

	pct1d, pct5d, pct1m := 0.0, 0.0, 0.0
	if len(prices) > 1 {
		ref := prices[len(prices)-2].Close
		if ref > 0 { pct1d = analysis.R2((latest.Close-ref)/ref*100) }
	}
	if len(prices) > 5 {
		ref := prices[len(prices)-6].Close
		if ref > 0 { pct5d = analysis.R2((latest.Close-ref)/ref*100) }
	}
	if len(prices) > 22 {
		ref := prices[len(prices)-23].Close
		if ref > 0 { pct1m = analysis.R2((latest.Close-ref)/ref*100) }
	}

	vol20 := avgVol(prices, 20)
	volRatio := 0.0
	if vol20 > 0 {
		volRatio = analysis.R2(float64(latest.Volume) / float64(vol20))
	}

	sig     := calcSignals(prices)
	pattern := detectPattern(prices)
	reports := GetReportsText(symbol)

	// ── Buat analisa ──────────────────────────────────────────────────

	text := generateLocalAnalysis(
		symbol, latest.Close,
		sma20, sma50, sma200,
		rsiVal, histVal,
		stochK, stochD,
		upper, middle, lower, percentB,
		pct1d, pct5d, pct1m, volRatio,
		sig.Signal, sig.Score, sig.MaxScore,
		pattern.Name, pattern.Description,
		reports,
	)

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":    symbol,
		"date":      latest.Date,
		"close":     latest.Close,
		"signal":    sig.Signal,
		"analysis":  text,
		"generated": time.Now().Format("15:04 WIB"),
	})
}

// ── Rule-based analysis engine ────────────────────────────────────────────────

func generateLocalAnalysis(
	symbol string, close float64,
	sma20, sma50, sma200 float64,
	rsiVal, histVal float64,
	stochK, stochD float64,
	upper, middle, lower, percentB float64,
	pct1d, pct5d, pct1m, volRatio float64,
	signal string, score, maxScore int,
	patternName, patternDesc string,
	reportsText string,
) string {
	var sb strings.Builder
	f := func(v float64) string { return fmt.Sprintf("%.0f", v) }

	above20  := sma20 > 0 && close > sma20
	above50  := sma50 > 0 && close > sma50
	above200 := sma200 > 0 && close > sma200
	golden   := sma20 > 0 && sma50 > 0 && sma20 >= sma50

	// ── 1. Kondisi Tren ───────────────────────────────────────────────

	sb.WriteString("**Kondisi Tren**\n")

	switch {
	case above20 && above50 && above200 && golden:
		sb.WriteString(fmt.Sprintf(
			"%s berada di atas SMA20 (%s), SMA50 (%s), dan SMA200 (%s) dengan golden cross aktif — struktur bullish solid di semua timeframe.",
			symbol, f(sma20), f(sma50), f(sma200)))
	case above20 && above50 && golden && sma200 > 0:
		sb.WriteString(fmt.Sprintf(
			"%s menguat di atas SMA20 (%s) dan SMA50 (%s), namun masih di bawah SMA200 (%s) — tren menengah bullish, belum full recovery jangka panjang.",
			symbol, f(sma20), f(sma50), f(sma200)))
	case above20 && above50 && golden:
		sb.WriteString(fmt.Sprintf(
			"%s di atas SMA20 (%s) dan SMA50 (%s) dengan golden cross aktif — tren bullish jangka menengah terkonfirmasi.",
			symbol, f(sma20), f(sma50)))
	case above20 && !above50:
		sb.WriteString(fmt.Sprintf(
			"%s baru pulih di atas SMA20 (%s) namun masih tertahan di bawah SMA50 (%s) — fase pemulihan awal, konfirmasi lanjutan diperlukan.",
			symbol, f(sma20), f(sma50)))
	case !above20 && above50:
		sb.WriteString(fmt.Sprintf(
			"%s terkoreksi di bawah SMA20 (%s) namun masih di atas SMA50 (%s) — pullback dalam tren menengah yang masih positif.",
			symbol, f(sma20), f(sma50)))
	case !above20 && !above50 && !above200 && sma200 > 0:
		sb.WriteString(fmt.Sprintf(
			"%s di bawah SMA20 (%s), SMA50 (%s), dan SMA200 (%s) — tren bearish di semua timeframe, tekanan jual dominan.",
			symbol, f(sma20), f(sma50), f(sma200)))
	default:
		sb.WriteString(fmt.Sprintf(
			"%s bergerak di bawah SMA20 (%s) dan SMA50 (%s) — tren jangka pendek dan menengah negatif.",
			symbol, f(sma20), f(sma50)))
	}

	// RSI context
	switch {
	case rsiVal >= 70:
		sb.WriteString(fmt.Sprintf(" RSI %.1f di zona overbought — risiko koreksi teknikal meningkat.", rsiVal))
	case rsiVal <= 30:
		sb.WriteString(fmt.Sprintf(" RSI %.1f di zona oversold — potensi technical bounce, tunggu konfirmasi candle.", rsiVal))
	case rsiVal > 55:
		sb.WriteString(fmt.Sprintf(" RSI %.1f mengkonfirmasi momentum positif.", rsiVal))
	case rsiVal < 45:
		sb.WriteString(fmt.Sprintf(" RSI %.1f menandakan momentum negatif masih aktif.", rsiVal))
	}

	// Performance context
	if pct1d >= 3 {
		sb.WriteString(fmt.Sprintf(" Kenaikan tajam hari ini +%.1f%% — waspadai exhaustion jangka pendek.", pct1d))
	} else if pct1d <= -3 {
		sb.WriteString(fmt.Sprintf(" Penurunan tajam %.1f%% hari ini — potensi overselling atau distribusi.", pct1d))
	}
	s5 := ""; if pct5d > 0 { s5 = "+" }
	s1m := ""; if pct1m > 0 { s1m = "+" }
	sb.WriteString(fmt.Sprintf(" (5H: %s%.1f%%, 1B: %s%.1f%%)", s5, pct5d, s1m, pct1m))

	// ── 2. Konfluensi Sinyal ──────────────────────────────────────────

	sb.WriteString("\n\n**Konfluensi Sinyal**\n")

	bullCount, bearCount := 0, 0
	var bullFactors, bearFactors []string

	// RSI
	if rsiVal <= 35 {
		bullCount++; bullFactors = append(bullFactors, fmt.Sprintf("RSI oversold (%.1f)", rsiVal))
	} else if rsiVal >= 65 {
		bearCount++; bearFactors = append(bearFactors, fmt.Sprintf("RSI overbought (%.1f)", rsiVal))
	} else if rsiVal > 50 {
		bullCount++
	} else {
		bearCount++
	}

	// MACD histogram
	if histVal > 0 {
		bullCount++; bullFactors = append(bullFactors, "MACD histogram positif")
	} else {
		bearCount++; bearFactors = append(bearFactors, "MACD histogram negatif")
	}

	// Bollinger %B
	if percentB <= 20 {
		bullCount++; bullFactors = append(bullFactors, fmt.Sprintf("harga di lower Bollinger (%%B %.0f%%)", percentB))
	} else if percentB >= 80 {
		bearCount++; bearFactors = append(bearFactors, fmt.Sprintf("harga di upper Bollinger (%%B %.0f%%)", percentB))
	} else if percentB > 50 {
		bullCount++
	} else {
		bearCount++
	}

	// Stochastic
	if stochK <= 25 {
		bullCount++; bullFactors = append(bullFactors, fmt.Sprintf("Stochastic oversold (%%K %.0f)", stochK))
	} else if stochK >= 75 {
		bearCount++; bearFactors = append(bearFactors, fmt.Sprintf("Stochastic overbought (%%K %.0f)", stochK))
	} else if stochK > stochD {
		bullCount++
	} else {
		bearCount++
	}

	// SMA position
	if above20 && above50 {
		bullCount++; bullFactors = append(bullFactors, "harga di atas SMA20 dan SMA50")
	} else if !above20 && !above50 {
		bearCount++; bearFactors = append(bearFactors, "harga di bawah SMA20 dan SMA50")
	}

	switch {
	case bullCount >= 4:
		sb.WriteString(fmt.Sprintf("Konfluensi bullish kuat: %d/%d indikator sependapat positif.", bullCount, bullCount+bearCount))
		if len(bullFactors) > 0 { sb.WriteString(" Pendukung: " + strings.Join(bullFactors, ", ") + ".") }
		if len(bearFactors) > 0 { sb.WriteString(" Catatan: " + strings.Join(bearFactors, ", ") + ".") }
	case bearCount >= 4:
		sb.WriteString(fmt.Sprintf("Konfluensi bearish: %d/%d indikator menekan.", bearCount, bullCount+bearCount))
		if len(bearFactors) > 0 { sb.WriteString(" Penekan: " + strings.Join(bearFactors, ", ") + ".") }
		if len(bullFactors) > 0 { sb.WriteString(" Satu-satunya positif: " + strings.Join(bullFactors, ", ") + ".") }
	case bullCount > bearCount:
		sb.WriteString(fmt.Sprintf("Sinyal campuran, kecenderungan bullish (%d vs %d).", bullCount, bearCount))
		if len(bullFactors) > 0 { sb.WriteString(" Positif: " + strings.Join(bullFactors, ", ") + ".") }
		if len(bearFactors) > 0 { sb.WriteString(" Negatif: " + strings.Join(bearFactors, ", ") + ".") }
	case bearCount > bullCount:
		sb.WriteString(fmt.Sprintf("Sinyal campuran, kecenderungan bearish (%d vs %d).", bearCount, bullCount))
		if len(bearFactors) > 0 { sb.WriteString(" Negatif: " + strings.Join(bearFactors, ", ") + ".") }
		if len(bullFactors) > 0 { sb.WriteString(" Positif: " + strings.Join(bullFactors, ", ") + ".") }
	default:
		sb.WriteString("Indikator terbagi rata — pasar dalam kondisi tidak pasti, hindari posisi agresif.")
	}

	if patternName != "" && patternName != "None" && patternName != "-" {
		sb.WriteString(fmt.Sprintf(" Pola candle: %s (%s).", patternName, patternDesc))
	}
	if volRatio >= 1.5 {
		sb.WriteString(fmt.Sprintf(" Volume %.1fx rata-rata — tinggi, mengkonfirmasi pergerakan.", volRatio))
	} else if volRatio < 0.6 {
		sb.WriteString(fmt.Sprintf(" Volume %.1fx rata-rata — sepi, kurangi bobot sinyal.", volRatio))
	}

	// ── 3. Level Kunci ────────────────────────────────────────────────

	sb.WriteString("\n\n**Level Kunci**\n")

	type lvl struct{ name string; val float64 }
	allLevels := []lvl{
		{"Bollinger Lower", lower},
		{"SMA200", sma200},
		{"SMA50", sma50},
		{"SMA20", sma20},
		{"Bollinger Mid", middle},
		{"Bollinger Upper", upper},
	}

	var supports, resistances []string
	for _, l := range allLevels {
		if l.val <= 0 { continue }
		gap := (close - l.val) / close * 100
		if gap > 0.5 {
			supports = append(supports, fmt.Sprintf("%s %s (%.1f%%)", l.name, f(l.val), -gap))
		} else if gap < -0.5 {
			resistances = append(resistances, fmt.Sprintf("%s %s (+%.1f%%)", l.name, f(l.val), -gap))
		}
	}
	if len(supports) > 3    { supports = supports[:3] }
	if len(resistances) > 3 { resistances = resistances[:3] }

	supStr := "area bawah (data terbatas)"
	if len(supports) > 0 { supStr = strings.Join(supports, " → ") }
	resStr := "area atas (data terbatas)"
	if len(resistances) > 0 { resStr = strings.Join(resistances, " → ") }

	sb.WriteString(fmt.Sprintf("Support: %s\nResistance: %s", supStr, resStr))

	// ── 4. Outlook & Rekomendasi ──────────────────────────────────────

	sb.WriteString("\n\n**Outlook & Rekomendasi**\n")

	// Stop & target dari Bollinger band
	stopLoss := lower * 0.99
	if stopLoss <= 0 { stopLoss = close * 0.95 }
	t1 := middle
	if t1 <= close { t1 = close * 1.03 }
	t2 := upper
	if t2 <= t1   { t2 = close * 1.06 }

	rr := 0.0
	if close-stopLoss > 0 { rr = (t1 - close) / (close - stopLoss) }

	nearSup := "support terdekat"
	if len(supports) > 0 { nearSup = supports[0] }

	switch signal {
	case "STRONG_BUY", "STRONG BUY":
		sb.WriteString(fmt.Sprintf(
			"ENTRY — Momentum sangat bullish (skor %d/%d). Masuk di area saat ini (%.0f) atau pada pullback ke %s. Stop-loss di %.0f. Target 1: %.0f, Target 2: %.0f. R/R ≈ %.1f:1.",
			score, maxScore, close, nearSup, stopLoss, t1, t2, rr))
	case "BUY":
		sb.WriteString(fmt.Sprintf(
			"AKUMULASI — Sinyal bullish (skor %d/%d). Ideal masuk pada pullback ke %s, bukan di harga saat ini (%.0f). Stop-loss di %.0f. Target: %.0f.",
			score, maxScore, nearSup, close, stopLoss, t1))
	case "NEUTRAL":
		sb.WriteString(fmt.Sprintf(
			"WAIT & SEE — Sinyal netral (skor %d/%d). Pasar konsolidasi di range %.0f–%.0f. Tunggu breakout disertai volume tinggi sebelum masuk posisi baru.",
			score, maxScore, lower, upper))
	case "SELL":
		sb.WriteString(fmt.Sprintf(
			"KURANGI POSISI — Tekanan jual mulai dominan (skor %d/%d). Take profit sebagian jika masih memegang. Hindari membeli baru. Pantau support %s sebagai potensi titik reversal.",
			score, maxScore, nearSup))
	case "STRONG_SELL", "STRONG SELL":
		sb.WriteString(fmt.Sprintf(
			"EXIT — Tekanan bearish kuat (skor %d/%d). Keluar dari posisi atau cut loss jika harga menembus support kritis. Re-entry hanya setelah RSI recovery dari oversold dan MACD bullish crossover terkonfirmasi.",
			score, maxScore))
	default:
		sb.WriteString(fmt.Sprintf("Pantau perkembangan indikator lebih lanjut. Skor sinyal: %d/%d.", score, maxScore))
	}

	// ── 5. Fundamental (jika ada PDF) ────────────────────────────────

	if reportsText != "" {
		sb.WriteString("\n\n**Fundamental**\n")
		sb.WriteString("Laporan keuangan tersedia untuk saham ini. Gunakan analisa teknikal di atas untuk timing entry/exit, dan validasikan dengan kondisi fundamental dari laporan yang diunggah sebelum mengambil posisi signifikan.")
	}

	return sb.String()
}
