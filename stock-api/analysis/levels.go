package analysis

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"stock-api/models"
)

// ── Key Levels (support / resistance otomatis) ───────────────────────────────
//
// Menandai level yang biasa digambar manual oleh trader IDX di chart harian,
// masing-masing dengan alasan yang bisa dibaca:
//
//   trigger        – close terbaru yang berulang di atas harga (≥2 kali dalam
//                    15 bar). Close kembali di atasnya = tanda pertama
//                    penurunan berhenti.
//   consolidation  – 4–8 bar terakhir yang close-nya mengumpul rapat
//                    (rentang ≤ 0.8 × ATR). Di atas harga = resistance.
//   gap            – gap harian yang belum tertutup (sisa yang belum
//                    tersentuh). Gap turun di atas harga = resistance.
//   recent_low     – low terendah 10 bar terakhir; ditandai "double bottom"
//                    kalau ada swing low lain ±0.25 × ATR dalam 15 bar.
//   base           – harga paling lama bertahan (histogram close 1 tahun) di
//                    bawah harga sekarang: "basis" sebelum harga naik.
//   swing          – swing low/high fractal (2 kiri, 2 kanan) yang belum
//                    tercakup level lain.
//   low52          – low 52 minggu (batas stop terakhir).
//
// Level yang saling berdekatan (< 0.35 × ATR) digabung; yang prioritasnya lebih
// tinggi menang (urutan di atas). Hasil diberi nama R1..Rn (naik dari harga)
// dan S1..Sn (turun dari harga). Semua harga dibulatkan ke fraksi BEI.
//
// Tidak ada look-ahead terhadap bar terakhir — fungsi ini hanya memakai data
// sampai bar terakhir yang diberikan, jadi bisa dipakai di backtest dengan
// memotong `prices`.

const (
	klLookback      = 250  // ±1 tahun bursa
	klMergeATR      = 0.35 // dua level lebih dekat dari ini = satu level
	klMaxDistPct    = 30.0 // level lebih jauh dari ini dari close diabaikan
	klConsolMaxATR  = 0.8  // rentang close maksimum sebuah konsolidasi
	klMinGapATR     = 0.5  // gap lebih kecil dari ini dianggap noise
	klTriggerWindow = 15
)

// KeyLevel adalah satu garis / zona support-resistance.
type KeyLevel struct {
	Name    string  `json:"name"`  // R1, R2, … / S1, S2, …
	Side    string  `json:"side"`  // "resistance" | "support"
	Kind    string  `json:"kind"`  // trigger | consolidation | gap | recent_low | base | swing | low52
	Price   float64 `json:"price"` // garis utama: sisi zona yang paling dekat ke harga
	Top     float64 `json:"top"`
	Bottom  float64 `json:"bottom"`
	Label   string  `json:"label"` // keterangan singkat (Bahasa Indonesia)
	Date    string  `json:"date,omitempty"`
	Touches int     `json:"touches,omitempty"`
}

// KeyLevelsResult membungkus level beserta konteks harga saat dihitung.
type KeyLevelsResult struct {
	Date   string     `json:"date"`
	Close  float64    `json:"close"`
	ATR    float64    `json:"atr"`
	Levels []KeyLevel `json:"levels"`
}

type klCand struct {
	KeyLevel
	prio int
}

var klPrio = map[string]int{
	"recent_low": 0, "trigger": 1, "consolidation": 2, "gap": 3,
	"base": 4, "low52": 5, "swing": 6,
}

// KeyLevels menghitung level support/resistance dari data harian.
func KeyLevels(prices []models.StockPrice) KeyLevelsResult {
	n := len(prices)
	if n < 30 {
		return KeyLevelsResult{}
	}
	last := prices[n-1]
	c := last.Close
	atr := lastVal(ATR(prices, 14))
	if atr <= 0 || c <= 0 {
		return KeyLevelsResult{Date: last.Date, Close: c}
	}
	start := n - klLookback
	if start < 0 {
		start = 0
	}

	var cands []klCand
	add := func(kind string, top, bottom float64, label, date string, touches int) {
		top, bottom = roundTick(top), roundTick(bottom)
		if top < bottom {
			top, bottom = bottom, top
		}
		cands = append(cands, klCand{KeyLevel{
			Kind: kind, Top: top, Bottom: bottom, Label: label, Date: date, Touches: touches,
		}, klPrio[kind]})
	}

	// 1. Low terbaru (+ double bottom).
	recentLow, rlIdx := math.MaxFloat64, n-1
	for i := n - 10; i < n; i++ {
		if i >= 0 && prices[i].Low < recentLow {
			recentLow, rlIdx = prices[i].Low, i
		}
	}
	if recentLow < c {
		label := "low terbaru " + idDate(prices[rlIdx].Date)
		touches := 1
		for i := n - klTriggerWindow; i < n-2; i++ {
			if i < 2 || i == rlIdx || !isSwingLow(prices, i) {
				continue
			}
			if math.Abs(prices[i].Low-recentLow) <= 0.25*atr {
				label += ", sama dengan low " + idDate(prices[i].Date)
				touches++
				break
			}
		}
		add("recent_low", recentLow, recentLow, label, prices[rlIdx].Date, touches)
	}

	// 2. Trigger: close berulang di atas harga dalam 15 bar terakhir.
	if lvl, cnt, ok := triggerLevel(prices, c, atr); ok {
		add("trigger", lvl, lvl, fmt.Sprintf("trigger konfirmasi (close %d× di sini)", cnt), "", cnt)
	}

	// 3. Konsolidasi terbaru.
	if lo, hi, d1, d2, ok := recentConsolidation(prices, atr); ok && (lo > c || hi < c) {
		add("consolidation", hi, lo, "area konsolidasi "+idDateRange(d1, d2), d1, 0)
	}

	// 4. Gap terdekat yang belum tertutup (atas = gap turun, bawah = gap naik).
	for _, g := range openGaps(prices, start, atr) {
		add("gap", g.top, g.bottom, g.label, g.date, 0)
	}

	// 5. Basis harga (time-at-price) di bawah low terbaru.
	ceiling := math.Min(c, recentLow) - 0.25*atr
	if lo, hi, d, ok := baseZone(prices[start:], ceiling, atr); ok {
		add("base", hi, lo, "basis harga "+idMonth(d)+" (area lama sebelum naik)", d, 0)
	}

	// 6. Low 52 minggu.
	lowIdx := start
	for i := start; i < n; i++ {
		if prices[i].Low < prices[lowIdx].Low {
			lowIdx = i
		}
	}
	if prices[lowIdx].Low < c-0.25*atr {
		add("low52", prices[lowIdx].Low, prices[lowIdx].Low,
			"low 52 minggu "+idDate(prices[lowIdx].Date)+" — batas stop terakhir", prices[lowIdx].Date, 0)
	}

	// 7. Swing fractal (prioritas terendah, pengisi celah).
	for i := start + 2; i < n-2; i++ {
		if isSwingLow(prices, i) && prices[i].Low < c {
			add("swing", prices[i].Low, prices[i].Low, "swing low "+idDate(prices[i].Date), prices[i].Date, 1)
		}
		if isSwingHigh(prices, i) && prices[i].High > c {
			add("swing", prices[i].High, prices[i].High, "swing high "+idDate(prices[i].Date), prices[i].Date, 1)
		}
	}

	levels := mergeLevels(cands, c, atr)
	return KeyLevelsResult{Date: last.Date, Close: c, ATR: R2(atr), Levels: levels}
}

// mergeLevels membuang level yang terlalu jauh / bertumpuk, lalu memberi nama.
func mergeLevels(cands []klCand, c, atr float64) []KeyLevel {
	// Prioritas dulu; sesama prioritas, yang lebih dekat ke harga dulu
	// (swing yang dekat lebih berguna dari swing yang jauh).
	sort.SliceStable(cands, func(i, j int) bool {
		if cands[i].prio != cands[j].prio {
			return cands[i].prio < cands[j].prio
		}
		return distTo(cands[i].KeyLevel, c) < distTo(cands[j].KeyLevel, c)
	})
	var kept []KeyLevel
	swings := 0
	for _, cd := range cands {
		l := cd.KeyLevel
		d := distTo(l, c)
		if l.Top <= 0 || d/c*100 > klMaxDistPct || d < 0.25*atr {
			// terlalu jauh, atau terlalu dekat ke harga untuk berguna
			continue
		}
		switch {
		case l.Bottom > c:
			l.Side, l.Price = "resistance", l.Bottom
		case l.Top < c:
			l.Side, l.Price = "support", l.Top
		default:
			continue // zona yang memuat harga sekarang bukan S/R
		}
		clash := false
		for _, k := range kept {
			if gapBetween(l, k) < klMergeATR*atr {
				clash = true
				break
			}
		}
		if clash {
			continue
		}
		if l.Kind == "swing" {
			if swings >= 2 { // cukup dua pengisi
				continue
			}
			swings++
		}
		kept = append(kept, l)
	}

	var res, sup []KeyLevel
	for _, k := range kept {
		if k.Side == "resistance" {
			res = append(res, k)
		} else {
			sup = append(sup, k)
		}
	}
	sort.Slice(res, func(i, j int) bool { return res[i].Price < res[j].Price })
	sort.Slice(sup, func(i, j int) bool { return sup[i].Price > sup[j].Price })
	out := make([]KeyLevel, 0, len(kept))
	for i := range res {
		res[i].Name = "R" + strconv.Itoa(i+1)
		out = append(out, res[i])
	}
	for i := range sup {
		sup[i].Name = "S" + strconv.Itoa(i+1)
		out = append(out, sup[i])
	}
	return out
}

func distTo(l KeyLevel, c float64) float64 {
	switch {
	case l.Bottom > c:
		return l.Bottom - c
	case l.Top < c:
		return c - l.Top
	}
	return 0
}

// gapBetween = jarak antar dua rentang harga (0 kalau bertumpuk).
func gapBetween(a, b KeyLevel) float64 {
	if a.Bottom > b.Top {
		return a.Bottom - b.Top
	}
	if b.Bottom > a.Top {
		return b.Bottom - a.Top
	}
	return 0
}

func isSwingLow(p []models.StockPrice, i int) bool {
	if i < 2 || i > len(p)-3 {
		return false
	}
	for j := i - 2; j <= i+2; j++ {
		if j != i && p[j].Low < p[i].Low {
			return false
		}
	}
	return true
}

func isSwingHigh(p []models.StockPrice, i int) bool {
	if i < 2 || i > len(p)-3 {
		return false
	}
	for j := i - 2; j <= i+2; j++ {
		if j != i && p[j].High > p[i].High {
			return false
		}
	}
	return true
}

// triggerLevel: cluster close (selain bar terakhir) di atas harga dalam 15 bar,
// yang terdekat ke harga dengan ≥2 close.
func triggerLevel(p []models.StockPrice, c, atr float64) (float64, int, bool) {
	n := len(p)
	tol := 0.15 * atr
	var closes []float64
	for i := n - 1 - klTriggerWindow; i < n-1; i++ {
		if i >= 0 && p[i].Close > c+tickSize(c) {
			closes = append(closes, p[i].Close)
		}
	}
	sort.Float64s(closes)
	for i := 0; i < len(closes); {
		j, sum := i, 0.0
		for j < len(closes) && closes[j]-closes[i] <= tol {
			sum += closes[j]
			j++
		}
		if j-i >= 2 {
			return sum / float64(j-i), j - i, true
		}
		i = j
	}
	return 0, 0, false
}

// recentConsolidation: jendela 4–8 bar paling baru (dalam 20 bar, tidak termasuk
// bar terakhir) yang rentang close-nya ≤ 0.8 × ATR. Jendela terpanjang menang.
func recentConsolidation(p []models.StockPrice, atr float64) (lo, hi float64, d1, d2 string, ok bool) {
	n := len(p)
	for end := n - 2; end >= n-20 && end >= 8; end-- {
		for L := 8; L >= 4; L-- {
			s := end - L + 1
			mn, mx := math.MaxFloat64, 0.0
			for i := s; i <= end; i++ {
				mn = math.Min(mn, p[i].Close)
				mx = math.Max(mx, p[i].Close)
			}
			if mx-mn <= klConsolMaxATR*atr {
				return mn, mx, p[s].Date, p[end].Date, true
			}
		}
	}
	return 0, 0, "", "", false
}

type gapZone struct {
	top, bottom float64
	label, date string
}

// openGaps: gap turun terdekat di atas harga & gap naik terdekat di bawah harga
// yang belum tertutup penuh. Yang dikembalikan hanya sisa yang belum disentuh.
func openGaps(p []models.StockPrice, start int, atr float64) []gapZone {
	n := len(p)
	c := p[n-1].Close
	var down, up *gapZone
	// Jalan mundur supaya maxHigh/minLow sesudah bar i bisa dihitung sekali jalan.
	maxHigh, minLow := 0.0, math.MaxFloat64
	for i := n - 1; i > start && i > 0; i-- {
		prev, cur := p[i-1], p[i]
		if cur.High < prev.Low { // gap turun
			top, bottom := prev.Low, math.Max(cur.High, maxHigh)
			if maxHigh < top && top-bottom >= klMinGapATR*atr && bottom > c && down == nil {
				lbl := "gap turun " + idDate(cur.Date) + " (belum tertutup)"
				if maxHigh > cur.High {
					lbl = "gap turun " + idDate(cur.Date) + " (sisa belum tertutup)"
				}
				down = &gapZone{top, bottom, lbl, cur.Date}
			}
		}
		if cur.Low > prev.High { // gap naik
			top, bottom := math.Min(cur.Low, minLow), prev.High
			if minLow > bottom && top-bottom >= klMinGapATR*atr && top < c && up == nil {
				up = &gapZone{top, bottom, "gap naik " + idDate(cur.Date) + " (belum tertutup)", cur.Date}
			}
		}
		maxHigh = math.Max(maxHigh, cur.High)
		minLow = math.Min(minLow, cur.Low)
	}
	var out []gapZone
	if down != nil {
		out = append(out, *down)
	}
	if up != nil {
		out = append(out, *up)
	}
	return out
}

// baseZone: periode terpanjang (≥ 8 bar, boleh diselingi ≤ 2 bar di atas)
// ketika close bertahan di bawah `ceiling`. Zona = persentil 25–75 close pada
// periode itu — tempat harga "betah" sebelum bergerak jauh.
func baseZone(p []models.StockPrice, ceiling, atr float64) (lo, hi float64, date string, ok bool) {
	if ceiling <= 0 {
		return
	}
	bestS, bestE, bestN := -1, -1, 0
	for s := 0; s < len(p); s++ {
		if p[s].Close >= ceiling {
			continue
		}
		e, out, cnt := s, 0, 0
		for i := s; i < len(p); i++ {
			if p[i].Close < ceiling {
				e, out = i, 0
				cnt++
			} else if out++; out > 2 {
				break
			}
		}
		if cnt > bestN {
			bestS, bestE, bestN = s, e, cnt
		}
		s = e // segmen berikutnya mulai setelah segmen ini
	}
	if bestN < 8 {
		return
	}
	var cl []float64
	for i := bestS; i <= bestE; i++ {
		if p[i].Close < ceiling {
			cl = append(cl, p[i].Close)
		}
	}
	sort.Float64s(cl)
	lo, hi = cl[len(cl)/4], cl[len(cl)*3/4]
	if hi-lo < 0.2*atr { // zona terlalu tipis → beri lebar minimal
		mid := (hi + lo) / 2
		lo, hi = mid-0.1*atr, mid+0.1*atr
	}
	return lo, hi, p[(bestS+bestE)/2].Date, true
}

var idMonths = [...]string{"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}

// idDate: "2026-10-16" → "16 Okt".
func idDate(d string) string {
	if len(d) < 10 {
		return d
	}
	m, _ := strconv.Atoi(d[5:7])
	day := strings.TrimLeft(d[8:10], "0")
	if m < 1 || m > 12 {
		return d
	}
	return day + " " + idMonths[m-1]
}

// idMonth: "2025-11-12" → "Nov 2025".
func idMonth(d string) string {
	if len(d) < 7 {
		return d
	}
	m, _ := strconv.Atoi(d[5:7])
	if m < 1 || m > 12 {
		return d
	}
	return idMonths[m-1] + " " + d[:4]
}

// idDateRange: "22–28 Okt" bila bulan sama, selain itu "30 Sep–6 Okt".
func idDateRange(a, b string) string {
	if len(a) >= 10 && len(b) >= 10 && a[:7] == b[:7] {
		return strings.TrimLeft(a[8:10], "0") + "–" + idDate(b)
	}
	return idDate(a) + "–" + idDate(b)
}
