package analysis

import (
	"fmt"
	"math"

	"stock-api/models"
)

// ── Advisor ──────────────────────────────────────────────────────────────────
//
// Rule-based price-action advisor. Encodes the classic Price Action decision
// order used by discretionary traders (Al Brooks / Nial Fuller style), as a
// hard-coded if/else decision tree — no external LLM:
//
//   1. TREND      — only look for longs in an uptrend (close > SMA50, SMA20 > SMA50)
//   2. LOCATION   — is price at support (pullback), resistance, or mid-range?
//   3. CANDLE     — rejection/confirmation candle (hammer, engulfing, star…)
//   4. VOLUME     — confirmation vs the 20-day average
//   5. RISK/REWARD— entry→stop (support) vs entry→target (resistance), need ≥ 1:2
//
// The verdict is a plain-Indonesian recommendation plus the reasons, an
// entry/stop/target plan, a rule checklist, and "what-if" scenarios so a
// non-trader can learn the logic.

// Check is one line of the rule checklist.
type Check struct {
	Label string `json:"label"`
	Pass  bool   `json:"pass"`
	Note  string `json:"note"`
}

// Advice is the full advisor output for one symbol.
type Advice struct {
	Verdict     string   `json:"verdict"`      // STRONG_BUY | BUY | WAIT | AVOID | REDUCE
	Action      string   `json:"action"`       // one-line recommendation (Indonesian)
	Confidence  string   `json:"confidence"`   // Tinggi | Sedang | Rendah
	Trend       string   `json:"trend"`        // Naik | Turun | Sideways
	Location    string   `json:"location"`     // Dekat support | Dekat resistance | Tengah range
	Candle      string   `json:"candle"`       // detected pattern (Indonesian) or "-"
	VolumeState string   `json:"volume_state"` // Tinggi | Normal | Tipis
	RSI         float64  `json:"rsi"`
	Close       float64  `json:"close"`
	Support     float64  `json:"support"`
	Resistance  float64  `json:"resistance"`
	Entry       float64  `json:"entry"`
	Stop        float64  `json:"stop"`
	Target      float64  `json:"target"`
	StopPct     float64  `json:"stop_pct"`
	TargetPct   float64  `json:"target_pct"`
	RiskReward  float64  `json:"risk_reward"`
	Reasons     []string `json:"reasons"`
	Scenarios   []string `json:"scenarios"`
	Checklist   []Check  `json:"checklist"`
}

// candlePattern inspects bar i (needs i>=1) and returns an Indonesian label
// and a direction ("bull" | "bear" | "neutral").
func candlePattern(prices []models.StockPrice, i int) (label, dir string) {
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

// Advisor runs the full price-action decision tree. Needs ≥ 60 bars.
func Advisor(prices []models.StockPrice) Advice {
	n := len(prices)
	if n < 60 {
		return Advice{Verdict: "WAIT", Action: "Data belum cukup (butuh ≥60 hari) untuk analisa price action.", Confidence: "Rendah", Trend: "-", Location: "-", Candle: "-", VolumeState: "-"}
	}

	last := prices[n-1]
	close := last.Close

	sma20 := lastVal(SMA(prices, 20))
	sma50 := lastVal(SMA(prices, 50))
	rsi := lastVal(RSI(prices, 14))

	// Structural levels.
	support := minLow(prices, 10)  // nearest support = 10-day low
	resist := maxHigh(prices, 20)  // nearest resistance = 20-day high
	loRecent := minLow(prices, 10) // market structure: higher-low check
	loPrior := minLowRange(prices, 20, 10)
	higherLow := loRecent >= loPrior*0.99

	// Volume confirmation (last 5 vs prior 20).
	v5 := avgVol(prices, 5, 0)
	v20 := avgVol(prices, 20, 5)
	vr := 0.0
	if v20 > 0 {
		vr = v5 / v20
	}
	volState := "Normal"
	switch {
	case vr >= 1.2:
		volState = "Tinggi"
	case vr < 0.8:
		volState = "Tipis"
	}

	// Candle on the latest bar.
	candleLabel, candleDir := candlePattern(prices, n-1)

	// ── RULE 1: TREND ────────────────────────────────────────────────────────
	trend := "Sideways"
	switch {
	case close > sma50 && sma20 > sma50:
		trend = "Naik"
	case close < sma50 && sma20 < sma50:
		trend = "Turun"
	}

	// ── RULE 2: LOCATION ─────────────────────────────────────────────────────
	distSupport := pctDiff(close, support) // how far above support (%)
	distResist := pctDiff(resist, close)   // how far below resistance (%)
	location := "Tengah range"
	switch {
	case distSupport <= 4:
		location = "Dekat support"
	case distResist <= 4:
		location = "Dekat resistance"
	}

	// ── RULE 5: RISK / REWARD ────────────────────────────────────────────────
	entry := close
	stop := support * 0.99 // just below support
	target := resist
	stopPct := pctDiff(entry, stop)
	targetPct := pctDiff(target, entry)
	rr := 0.0
	if entry-stop > 0 {
		rr = (target - entry) / (entry - stop)
	}

	adv := Advice{
		Trend: trend, Location: location, Candle: candleLabel, VolumeState: volState,
		RSI: R2(rsi), Close: close, Support: support, Resistance: resist,
		Entry: R2(entry), Stop: R2(stop), Target: R2(target),
		StopPct: R2(stopPct), TargetPct: R2(targetPct), RiskReward: R2(rr),
	}

	bullCandle := candleDir == "bull"
	bearCandle := candleDir == "bear"
	volOK := vr >= 1.05
	rrOK := rr >= 2
	notOverbought := rsi < 70

	// ── Checklist (GPT's 5 rules) ────────────────────────────────────────────
	adv.Checklist = []Check{
		{Label: "1. Tren naik (harga > SMA50, SMA20 > SMA50)", Pass: trend == "Naik", Note: fmt.Sprintf("tren %s", trend)},
		{Label: "2. Struktur higher-low", Pass: higherLow, Note: cond(higherLow, "low naik (sehat)", "low turun (lemah)")},
		{Label: "3. Di lokasi bagus (dekat support)", Pass: location == "Dekat support", Note: location},
		{Label: "4. Candle konfirmasi bullish", Pass: bullCandle, Note: candleLabel},
		{Label: "5. Volume mendukung (>1.05×)", Pass: volOK, Note: fmt.Sprintf("%.2f× rata-rata", vr)},
		{Label: "6. Risk/Reward ≥ 1:2", Pass: rrOK, Note: fmt.Sprintf("R/R %.1f", rr)},
		{Label: "7. RSI belum overbought (<70)", Pass: notOverbought, Note: fmt.Sprintf("RSI %.0f", rsi)},
	}

	// ── DECISION TREE (if / else if / else) ──────────────────────────────────
	switch trend {

	case "Turun":
		// Lawan tren = pisau jatuh. Butuh bukti kuat sebelum berani.
		if bullCandle && location == "Dekat support" && volOK {
			adv.Verdict = "WAIT"
			adv.Confidence = "Rendah"
			adv.Action = "Ada tanda pantulan di support, TAPI tren masih turun. Jangan buru-buru — tunggu harga tembus & tahan di atas SMA50 dulu (konfirmasi reversal). Baru pertimbangkan entry."
			adv.Reasons = []string{
				fmt.Sprintf("Tren TURUN (harga %.0f < SMA50 %.0f)", close, sma50),
				fmt.Sprintf("Tapi ada %s di dekat support %.0f dengan volume %s — sinyal pantulan awal", candleLabel, support, volState),
				"Aturan #1: jangan lawan tren. Reversal harus dikonfirmasi break SMA50, bukan ditebak.",
			}
		} else {
			adv.Verdict = "AVOID"
			adv.Confidence = "Tinggi"
			adv.Action = "HINDARI entry. Tren turun tanpa tanda pembalikan — ini 'pisau jatuh'. Beli di sini = lawan tren, kesalahan paling mahal."
			adv.Reasons = []string{
				fmt.Sprintf("Tren TURUN (harga %.0f < SMA50 %.0f, SMA20 < SMA50)", close, sma50),
				cond(bearCandle, fmt.Sprintf("Candle terakhir %s — tekanan jual masih ada", candleLabel), "Belum ada candle pembalikan (hammer/engulfing) di support"),
				"Aturan #1 price action: HANYA beli saat tren naik. Turun = tunggu di pinggir.",
			}
		}

	case "Sideways":
		if bullCandle && location == "Dekat support" && volOK && rrOK {
			adv.Verdict = "BUY"
			adv.Confidence = "Sedang"
			adv.Action = fmt.Sprintf("Boleh entry SPEKULATIF. Harga sideways tapi mantul dari support %.0f dengan %s + volume %s. Pasang stop di %.0f (-%.1f%%), target %.0f (+%.1f%%).", support, candleLabel, volState, adv.Stop, stopPct, target, targetPct)
			adv.Reasons = []string{
				"Tren SIDEWAYS (belum jelas arah) — risiko lebih tinggi dari tren naik",
				fmt.Sprintf("%s di support %.0f + volume %s = sinyal pantulan", candleLabel, support, volState),
				fmt.Sprintf("Risk/Reward %.1f memenuhi syarat 1:2", rr),
			}
		} else {
			adv.Verdict = "WAIT"
			adv.Confidence = "Rendah"
			adv.Action = "TUNGGU. Harga sideways, belum ada setup lengkap. Sabar sampai breakout dari range dengan volume, atau pantulan jelas dari support."
			adv.Reasons = sidewaysReasons(location, bullCandle, volOK, rrOK, candleLabel)
		}

	default: // "Naik"
		switch location {

		case "Dekat resistance":
			if bearCandle {
				adv.Verdict = "REDUCE"
				adv.Confidence = "Sedang"
				adv.Action = fmt.Sprintf("JANGAN entry baru. Harga di resistance %.0f + %s = kemungkinan tolak turun. Kalau sudah punya & profit, ini area ambil sebagian untung.", resist, candleLabel)
				adv.Reasons = []string{
					fmt.Sprintf("Tren naik, TAPI harga %.0f mepet resistance %.0f (cuma %.1f%% lagi)", close, resist, distResist),
					fmt.Sprintf("%s di resistance = sinyal penolakan penjual", candleLabel),
					"Beli di resistance = beli di pucuk. R/R jelek karena target dekat.",
				}
			} else {
				adv.Verdict = "WAIT"
				adv.Confidence = "Sedang"
				adv.Action = fmt.Sprintf("TUNGGU. Tren naik & harga mepet resistance %.0f. Dua pilihan bagus: (a) tunggu BREAKOUT + RETEST di atas %.0f, atau (b) tunggu PULLBACK ke support %.0f. Jangan kejar di sini.", resist, resist, support)
				adv.Reasons = []string{
					fmt.Sprintf("Tren NAIK (sehat), tapi harga di resistance %.0f", resist),
					"Entry di resistance = R/R jelek (target dekat, risiko jauh)",
					"Setup terbaik: breakout+retest, atau beli pullback — bukan di sini.",
				}
			}

		case "Dekat support":
			// SETUP UTAMA: pullback dalam tren naik.
			if bullCandle && volOK && rrOK && notOverbought {
				adv.Verdict = "STRONG_BUY"
				adv.Confidence = "Tinggi"
				adv.Action = fmt.Sprintf("SETUP TERBAIK. Tren naik + pullback ke support %.0f + %s + volume %s + R/R %.1f. Entry area %.0f, stop %.0f (-%.1f%%), target %.0f (+%.1f%%).", support, candleLabel, volState, rr, entry, adv.Stop, stopPct, target, targetPct)
				adv.Reasons = []string{
					fmt.Sprintf("Tren NAIK (harga %.0f > SMA50 %.0f) — searah tren, aturan #1 ✓", close, sma50),
					fmt.Sprintf("Pullback ke support %.0f = beli murah, bukan kejar pucuk", support),
					fmt.Sprintf("%s = konfirmasi pembeli masuk", candleLabel),
					fmt.Sprintf("Volume %s (%.2f×) + R/R %.1f (≥1:2) — semua syarat kumpul", volState, vr, rr),
				}
			} else if bullCandle && rrOK && notOverbought {
				// Candle & R/R oke tapi volume tipis.
				adv.Verdict = "BUY"
				adv.Confidence = "Sedang"
				adv.Action = fmt.Sprintf("Boleh entry tapi KECILKAN ukuran. Setup bagus (tren naik + %s di support %.0f + R/R %.1f) tapi volume masih tipis (%.2f×) — belum penuh keyakinan. Stop %.0f (-%.1f%%).", candleLabel, support, rr, vr, adv.Stop, stopPct)
				adv.Reasons = []string{
					fmt.Sprintf("Tren naik + pullback ke support %.0f + %s ✓", support, candleLabel),
					fmt.Sprintf("R/R %.1f memenuhi 1:2 ✓", rr),
					fmt.Sprintf("TAPI volume %s (%.2f×) — konfirmasi lemah, kurangi lot", volState, vr),
				}
			} else if bullCandle && !rrOK {
				// INI kasus "candle bagus tapi support rendah / target dekat" → R/R jelek.
				adv.Verdict = "WAIT"
				adv.Confidence = "Rendah"
				adv.Action = fmt.Sprintf("TAHAN dulu walau ada %s. Masalahnya R/R cuma %.1f (di bawah 1:2): stop ke support %.1f%% jauh, target ke resistance cuma %.1f%%. Risiko kegedean vs untungnya. Tunggu harga lebih dekat support, atau skip.", candleLabel, rr, stopPct, targetPct)
				adv.Reasons = []string{
					fmt.Sprintf("Ada %s di support — sinyal candle bagus", candleLabel),
					fmt.Sprintf("TAPI support %.0f terlalu jauh (stop -%.1f%%) atau resistance %.0f terlalu dekat (+%.1f%%)", support, stopPct, resist, targetPct),
					fmt.Sprintf("R/R %.1f < 1:2 → aturan #5 gagal. Untung kecil, risiko besar = skip.", rr),
				}
			} else if !bullCandle {
				adv.Verdict = "WAIT"
				adv.Confidence = "Sedang"
				adv.Action = fmt.Sprintf("HAMPIR. Tren naik & harga di support %.0f (lokasi bagus), tapi BELUM ada candle konfirmasi (hammer/bullish engulfing). Tunggu 1 candle penolakan + volume, baru entry.", support)
				adv.Reasons = []string{
					fmt.Sprintf("Tren naik + pullback ke support %.0f = lokasi entry ideal ✓", support),
					fmt.Sprintf("TAPI candle terakhir '%s' bukan sinyal beli", candleLabel),
					"Aturan #3: candle di lokasi bagus = baru berarti. Tunggu konfirmasi.",
				}
			} else {
				adv.Verdict = "WAIT"
				adv.Confidence = "Rendah"
				adv.Action = "TUNGGU. Setup belum lengkap. Cek checklist di bawah — poin yang belum ✓ harus dipenuhi dulu."
				adv.Reasons = []string{"Sebagian syarat sudah, sebagian belum — lihat checklist."}
			}

		default: // Tengah range
			adv.Verdict = "WAIT"
			adv.Confidence = "Rendah"
			adv.Action = fmt.Sprintf("TUNGGU. Tren naik (bagus) tapi harga ada di TENGAH range — bukan lokasi entry. Beli di tengah = R/R jelek. Sabar sampai PULLBACK ke support %.0f, baru cari candle konfirmasi.", support)
			adv.Reasons = []string{
				"Tren NAIK ✓ tapi harga di tengah, bukan dekat support/resistance",
				fmt.Sprintf("Entry ideal: tunggu pullback ke support %.0f", support),
				"Aturan #2: lokasi menentukan. Tengah range = sabar.",
			}
		}
	}

	adv.Scenarios = buildScenarios(adv, sma50, higherLow)
	return adv
}

// sidewaysReasons enumerates which pieces are missing in a sideways market.
func sidewaysReasons(location string, bull, volOK, rrOK bool, candle string) []string {
	r := []string{"Tren SIDEWAYS — arah belum jelas, tunggu breakout"}
	if location != "Dekat support" {
		r = append(r, "Harga belum di support — bukan lokasi entry")
	}
	if !bull {
		r = append(r, fmt.Sprintf("Candle '%s' belum konfirmasi beli", candle))
	}
	if !volOK {
		r = append(r, "Volume belum mendukung")
	}
	if !rrOK {
		r = append(r, "Risk/Reward belum 1:2")
	}
	return r
}

// buildScenarios produces educational "what-if" lines tuned to the current state.
func buildScenarios(a Advice, sma50 float64, higherLow bool) []string {
	s := []string{}
	// Support jauh (aturan risiko 7%).
	if a.StopPct > 8 {
		s = append(s, fmt.Sprintf("⚠️ Support %.0f terlalu jauh (stop -%.1f%%, lebih dari batas 7%%). Kalau tetap entry, KECILKAN lot supaya rugi rupiah tetap kecil — atau tunggu harga lebih dekat support.", a.Support, a.StopPct))
	} else {
		s = append(s, fmt.Sprintf("✓ Stop di support %.0f = -%.1f%% (masih di bawah batas 7%%). Ukuran lot normal boleh.", a.Stop, a.StopPct))
	}
	// Candle bagus tapi volume tipis.
	if a.VolumeState == "Tipis" {
		s = append(s, "Kalau candle-nya bagus TAPI volume tipis kayak sekarang → biasanya breakout/pantulan palsu. Tunggu volume naik dulu, atau masuk setengah lot.")
	} else {
		s = append(s, "Kalau nanti muncul candle bullish + volume ikut membesar → itu konfirmasi kuat, boleh naikkan keyakinan.")
	}
	// Break support skenario.
	s = append(s, fmt.Sprintf("Kalau harga TEMBUS & tutup di bawah support %.0f → setup batal, JANGAN average down. Itu tanda struktur rusak, keluar/hindari.", a.Support))
	// Break resistance skenario.
	s = append(s, fmt.Sprintf("Kalau harga BREAKOUT di atas resistance %.0f dengan volume besar → tunggu RETEST (harga balik nyentuh %.0f lalu naik lagi). Retest yang berhasil = entry paling aman.", a.Resistance, a.Resistance))
	// Trend flip.
	if a.Trend != "Naik" {
		s = append(s, fmt.Sprintf("Kalau harga naik & tutup di atas SMA50 (%.0f) beberapa hari → tren berubah jadi naik, setup long baru valid.", sma50))
	}
	if !higherLow {
		s = append(s, "Struktur low-nya sedang turun (lower-low) = tren melemah. Hati-hati, ini bukan tempat beli agresif.")
	}
	return s
}

// ── small helpers (self-contained; don't collide with other files) ───────────

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

func maxHigh(prices []models.StockPrice, window int) float64 {
	n := len(prices)
	start := n - window
	if start < 0 {
		start = 0
	}
	m := 0.0
	for i := start; i < n; i++ {
		if prices[i].High > m {
			m = prices[i].High
		}
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
