package main

import (
	"math"

	"stock-api/analysis"
)

// indicator is one entry in the report card. A "signal" indicator says BUY on
// some bars (event study); a "value" indicator is a number per bar whose rank
// across stocks is tested against later returns (rank IC).
type indicator struct {
	Name    string
	Cat     string // tren | momentum | volatilitas | volume | level | struktur | candle | engine | harga | relatif
	InApp   bool   // exists in the app today (chart, Indicators tab, engine)
	Explain string
	Note    string // caveat shown with the grade (short sample, data source)
	sig     func(s *series) []bool
	val     func(s *series) []float64
}

func (ind indicator) kind() string {
	if ind.sig != nil {
		return "signal"
	}
	return "value"
}

// ── app indicator series (aligned to bar index) ─────────────────────────────

func appPts[T any](s *series, pts []T, date func(T) string, v func(T) float64) []float64 {
	m := make(map[string]float64, len(pts))
	for _, p := range pts {
		m[date(p)] = v(p)
	}
	out := make([]float64, s.n)
	for i, d := range s.date {
		if x, ok := m[d]; ok {
			out[i] = x
		} else {
			out[i] = nan
		}
	}
	return out
}

func macd(s *series) (line, sig []float64) {
	pts := analysis.MACD(s.p, 12, 26, 9)
	d := func(p analysis.MACDPoint) string { return p.Date }
	return appPts(s, pts, d, func(p analysis.MACDPoint) float64 { return p.MACD }),
		appPts(s, pts, d, func(p analysis.MACDPoint) float64 { return p.Signal })
}

func boll(s *series) (lo, up, bw, pb []float64) {
	pts := analysis.Bollinger(s.p, 20, 2)
	d := func(p analysis.BollingerPoint) string { return p.Date }
	return appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.Lower }),
		appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.Upper }),
		appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.Bandwidth }),
		appPts(s, pts, d, func(p analysis.BollingerPoint) float64 { return p.PercentB })
}

func adx(s *series) (a, pdi, mdi []float64) {
	pts := analysis.ADX(s.p, 14)
	d := func(p analysis.ADXPoint) string { return p.Date }
	return appPts(s, pts, d, func(p analysis.ADXPoint) float64 { return p.ADX }),
		appPts(s, pts, d, func(p analysis.ADXPoint) float64 { return p.PlusDI }),
		appPts(s, pts, d, func(p analysis.ADXPoint) float64 { return p.MinusDI })
}

// perBar runs fn on every bar from `from` with a bounded history window — for
// app functions that only report "as of the last bar" (Fibonacci, FVG, Key
// Levels, AMD, pivots).
func perBar(s *series, from int, fn func(i int) bool) []bool {
	out := make([]bool, s.n)
	for i := from; i < s.n; i++ {
		out[i] = fn(i)
	}
	return out
}

func green(s *series, i int) bool { return s.c[i] > s.o[i] }

// ── the catalogue ───────────────────────────────────────────────────────────

var catalogue = []indicator{
	// ---- in the app today: signals ----
	{Name: "SMA golden cross 20/50", Cat: "tren", InApp: true, Explain: "Rata-rata 20 hari memotong ke atas rata-rata 50 hari.",
		sig: func(s *series) []bool {
			return crossUp(s.align(analysis.SMA(s.p, 20)), s.align(analysis.SMA(s.p, 50)))
		}},
	{Name: "EMA tren naik (harga > EMA20 > EMA50)", Cat: "tren", InApp: true, Explain: "Hari pertama harga di atas EMA20 dan EMA20 di atas EMA50.",
		sig: func(s *series) []bool {
			e20, e50 := s.align(analysis.EMA(s.p, 20)), s.align(analysis.EMA(s.p, 50))
			up := where(s.n, func(i int) bool { return s.c[i] > e20[i] && e20[i] > e50[i] })
			return where(s.n, func(i int) bool { return i > 0 && up[i] && !up[i-1] })
		}},
	{Name: "RSI naik lewat 30 (keluar oversold)", Cat: "momentum", InApp: true, Explain: "RSI 14 naik dari bawah 30 — 'sudah terlalu murah, mulai mantul'.",
		sig: func(s *series) []bool { return crossUpK(s.align(analysis.RSI(s.p, 14)), 30) }},
	{Name: "RSI tembus 50", Cat: "momentum", InApp: true, Explain: "RSI 14 naik melewati 50 — momentum berubah naik.",
		sig: func(s *series) []bool { return crossUpK(s.align(analysis.RSI(s.p, 14)), 50) }},
	{Name: "MACD cross naik", Cat: "momentum", InApp: true, Explain: "Garis MACD memotong ke atas garis sinyal.",
		sig: func(s *series) []bool { m, g := macd(s); return crossUp(m, g) }},
	{Name: "MACD cross naik di bawah 0", Cat: "momentum", InApp: true, Explain: "MACD memotong ke atas sinyal saat masih di bawah nol (pembalikan awal).",
		sig: func(s *series) []bool {
			m, g := macd(s)
			x := crossUp(m, g)
			return where(s.n, func(i int) bool { return x[i] && m[i] < 0 })
		}},
	{Name: "Bollinger mantul band bawah", Cat: "volatilitas", InApp: true, Explain: "Harga kembali naik melewati band bawah Bollinger.",
		sig: func(s *series) []bool { lo, _, _, _ := boll(s); return crossUp(s.c, lo) }},
	{Name: "Bollinger tembus band atas", Cat: "volatilitas", InApp: true, Explain: "Harga menutup di atas band atas Bollinger (breakout).",
		sig: func(s *series) []bool { _, up, _, _ := boll(s); return crossUp(s.c, up) }},
	{Name: "Stochastic cross naik di bawah 20", Cat: "momentum", InApp: true, Explain: "%K memotong ke atas %D saat di zona jenuh jual (<20).",
		sig: func(s *series) []bool {
			pts := analysis.Stochastic(s.p, 14, 3)
			d := func(p analysis.StochPoint) string { return p.Date }
			k := appPts(s, pts, d, func(p analysis.StochPoint) float64 { return p.K })
			dd := appPts(s, pts, d, func(p analysis.StochPoint) float64 { return p.D })
			x := crossUp(k, dd)
			return where(s.n, func(i int) bool { return x[i] && k[i] < 20 })
		}},
	{Name: "ADX > 20 & +DI memotong −DI", Cat: "tren", InApp: true, Explain: "Arah naik mengambil alih (+DI > −DI) saat tren cukup kuat.",
		sig: func(s *series) []bool {
			a, p, m := adx(s)
			x := crossUp(p, m)
			return where(s.n, func(i int) bool { return x[i] && a[i] > 20 })
		}},
	{Name: "OBV tembus rata-rata 20", Cat: "volume", InApp: true, Explain: "On-Balance Volume naik melewati rata-rata 20 harinya.",
		sig: func(s *series) []bool { o := s.align(analysis.OBV(s.p)); return crossUp(o, rollMean(o, 20)) }},
	{Name: "VWAP 20 hari tembus naik", Cat: "volume", InApp: true, Explain: "Harga menutup di atas VWAP 20 hari (harga rata-rata tertimbang volume).",
		sig: func(s *series) []bool { return crossUp(s.c, s.align(analysis.VWAP(s.p, 20))) }},
	{Name: "Parabolic SAR berbalik naik", Cat: "tren", InApp: true, Explain: "Titik SAR pindah ke bawah harga.",
		sig: func(s *series) []bool {
			sar := s.align(analysis.SAR(s.p))
			bull := where(s.n, func(i int) bool { return sar[i] < s.c[i] })
			return where(s.n, func(i int) bool { return i > 0 && bull[i] && !bull[i-1] && !math.IsNaN(sar[i-1]) })
		}},
	{Name: "Ichimoku tembus awan", Cat: "tren", InApp: true, Explain: "Harga menutup di atas awan Ichimoku (Senkou Span A/B).",
		sig: func(s *series) []bool {
			pts := analysis.Ichimoku(s.p)
			d := func(p analysis.IchimokuPoint) string { return p.Date }
			top := appPts(s, pts, d, func(p analysis.IchimokuPoint) float64 {
				if p.SpanA == 0 || p.SpanB == 0 {
					return nan
				}
				return math.Max(p.SpanA, p.SpanB)
			})
			return crossUp(s.c, top)
		}},
	{Name: "MFI naik lewat 20", Cat: "volume", InApp: true, Explain: "Money Flow Index keluar dari zona jenuh jual (<20).",
		sig: func(s *series) []bool { return crossUpK(s.align(analysis.MFI(s.p, 14)), 20) }},
	{Name: "CMF tembus 0", Cat: "volume", InApp: true, Explain: "Chaikin Money Flow berubah positif (uang masuk).",
		sig: func(s *series) []bool { return crossUpK(s.align(analysis.CMF(s.p, 20)), 0) }},
	{Name: "A/D line tembus rata-rata 20", Cat: "volume", InApp: true, Explain: "Accumulation/Distribution line naik melewati rata-rata 20 harinya.",
		sig: func(s *series) []bool { a := s.align(analysis.ADLine(s.p)); return crossUp(a, rollMean(a, 20)) }},
	{Name: "Fibonacci mantul di 61,8%", Cat: "level", InApp: true, Explain: "Harga menyentuh level Fibonacci 61,8% (lookback 100) lalu tutup di atasnya dengan candle hijau.",
		sig: func(s *series) []bool {
			return perBar(s, 100, func(i int) bool {
				f := analysis.Fibonacci(s.window(i-1, 150), 100) // levels known before bar i
				return f.L618 > 0 && s.l[i] <= f.L618 && s.c[i] > f.L618 && green(s, i)
			})
		}},
	{Name: "Pivot harian tembus naik", Cat: "level", InApp: true, Explain: "Harga menutup di atas pivot klasik (dari H/L/C kemarin).",
		sig: func(s *series) []bool {
			pv := values(s.n, func(i int) float64 {
				if i < 1 {
					return nan
				}
				return analysis.Pivots(s.p[i-1 : i+1]).Pivot
			})
			return crossUp(s.c, pv)
		}},
	{Name: "FVG: harga masuk gap bullish", Cat: "level", InApp: true, Explain: "Harga turun masuk ke Fair Value Gap bullish yang masih aktif lalu tutup di atas dasarnya.",
		sig: func(s *series) []bool {
			return perBar(s, 60, func(i int) bool {
				for _, z := range analysis.FVG(s.window(i-1, 200), 200, 0.3) {
					if z.Type == "bull" && z.Status == "active" && s.l[i] <= z.Top && s.l[i-1] > z.Top && s.c[i] >= z.Bottom {
						return true
					}
				}
				return false
			})
		}},
	{Name: "Key Levels: mantul di support S1", Cat: "level", InApp: true, Explain: "Harga menyentuh support terdekat (S/R Auto) lalu tutup hijau di atasnya.",
		sig: func(s *series) []bool {
			return perBar(s, warmup, func(i int) bool {
				kl := analysis.KeyLevels(s.window(i-1, 300))
				best := -1.0
				var top float64
				for _, lv := range kl.Levels {
					if lv.Side == "support" && lv.Price > best {
						best, top = lv.Price, lv.Top
					}
				}
				return best > 0 && s.l[i] <= top && s.c[i] > best && green(s, i)
			})
		}},
	{Name: "Key Levels: tembus resistance R1", Cat: "level", InApp: true, Explain: "Harga menutup di atas resistance terdekat (S/R Auto).",
		sig: func(s *series) []bool {
			return perBar(s, warmup, func(i int) bool {
				kl := analysis.KeyLevels(s.window(i-1, 300))
				best := math.Inf(1)
				for _, lv := range kl.Levels {
					if lv.Side == "resistance" && lv.Price < best {
						best = lv.Price
					}
				}
				return !math.IsInf(best, 1) && s.c[i] > best
			})
		}},
	{Name: "AMD: mulai fase distribusi naik", Cat: "struktur", InApp: true, Explain: "Detektor Wyckoff (AMD) baru menandai fase distribusi arah naik setelah akumulasi + manipulasi.",
		sig: func(s *series) []bool {
			prev := ""
			return perBar(s, 60, func(i int) bool {
				r := analysis.AMD(s.window(i, 200), 10, 200)
				cur := ""
				if r.CurrentZone != nil && r.CurrentZone.Phase == "distribution" && r.CurrentZone.DistribDir == "bullish" {
					cur = r.CurrentZone.AccumStart
				}
				fire := cur != "" && cur != prev
				prev = cur
				return fire
			})
		}},
	{Name: "Candle Bullish Engulfing", Cat: "candle", InApp: true, Explain: "Candle hijau menelan candle merah kemarin (detektor candle app).",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool { l, _ := analysis.CandlePattern(s.p, i); return l == "Bullish Engulfing" })
		}},
	{Name: "Candle Hammer", Cat: "candle", InApp: true, Explain: "Ekor bawah panjang — penolakan harga bawah (detektor candle app).",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool { l, _ := analysis.CandlePattern(s.p, i); return l == "Hammer (tolak bawah)" })
		}},
	{Name: "Struktur HH + HL baru", Cat: "struktur", InApp: true, Explain: "Engine baru melihat puncak & lembah makin tinggi (higher high + higher low).",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool {
				return i > decStart && s.dec[i].MarketStructure.State == "HH + HL" && s.dec[i-1].MarketStructure.State != "HH + HL"
			})
		}},
	{Name: "Engine: sinyal BUY baru", Cat: "engine", InApp: true, Explain: "Decision engine berubah ke BUY/STRONG_BUY (tanpa gate IHSG).",
		sig: func(s *series) []bool {
			buy := func(x string) bool { return x == "BUY" || x == "STRONG_BUY" }
			return where(s.n, func(i int) bool { return i > decStart && buy(s.dec[i].Signal) && !buy(s.dec[i-1].Signal) })
		}},
	{Name: "Engine: STRONG_BUY baru", Cat: "engine", InApp: true, Explain: "Decision engine berubah ke STRONG_BUY.",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool {
				return i > decStart && s.dec[i].Signal == "STRONG_BUY" && s.dec[i-1].Signal != "STRONG_BUY"
			})
		}},
	{Name: "Volume spike 2× + candle hijau", Cat: "volume", InApp: true, Explain: "Volume lebih dari 2× rata-rata 20 hari dan candle hijau.",
		sig: func(s *series) []bool {
			avg := shift(rollMean(s.v, 20), 1)
			return where(s.n, func(i int) bool { return s.v[i] > 2*avg[i] && green(s, i) })
		}},

	// ---- calendar (stock-specific) ----
	{Name: "10 hari bursa sebelum ex-dividen", Cat: "kalender", Explain: "Beli 10 hari bursa sebelum tanggal ex-dividen (dividen ikut dihitung di hasil).",
		Note: "Tanggal ex dianggap sudah diumumkan ≥ 10 hari bursa sebelumnya (umumnya ±3–4 minggu).",
		sig:  func(s *series) []bool { return where(s.n, func(i int) bool { return i+10 < s.n && s.div[i+10] > 0 }) }},
	{Name: "Hari ex-dividen", Cat: "kalender", Explain: "Beli di hari ex-dividen (harga sudah turun sebesar dividen).",
		sig: func(s *series) []bool { return where(s.n, func(i int) bool { return s.div[i] > 0 }) }},

	// ---- not in the app: signals ----
	{Name: "Supertrend (10, 3) berbalik naik", Cat: "tren", Explain: "Garis Supertrend pindah ke bawah harga.", sig: supertrendFlip},
	{Name: "Breakout high 20 hari (Donchian)", Cat: "tren", Explain: "Harga menutup di atas harga tertinggi 20 hari sebelumnya.",
		sig: func(s *series) []bool { return crossUp(s.c, shift(rollMax(s.h, 20), 1)) }},
	{Name: "Tembus high 52 minggu", Cat: "tren", Explain: "Harga menutup di atas harga tertinggi 250 hari sebelumnya.",
		sig: func(s *series) []bool { return crossUp(s.c, shift(rollMax(s.h, 250), 1)) }},
	{Name: "Golden cross 50/200", Cat: "tren", Explain: "Rata-rata 50 hari memotong ke atas rata-rata 200 hari.",
		sig: func(s *series) []bool { return crossUp(rollMean(s.c, 50), rollMean(s.c, 200)) }},
	{Name: "Aroon (25) naik memotong turun", Cat: "tren", Explain: "Aroon Up memotong ke atas Aroon Down — puncak baru lebih baru dari lembah baru.",
		sig: func(s *series) []bool { up, dn := aroon(s, 25); return crossUp(up, dn) }},
	{Name: "Williams %R naik lewat −80", Cat: "momentum", Explain: "Williams %R (14) keluar dari jenuh jual.",
		sig: func(s *series) []bool {
			hh, ll := rollMax(s.h, 14), rollMin(s.l, 14)
			wr := values(s.n, func(i int) float64 { return (hh[i] - s.c[i]) / (hh[i] - ll[i]) * -100 })
			return crossUpK(wr, -80)
		}},
	{Name: "CCI (20) naik lewat −100", Cat: "momentum", Explain: "Commodity Channel Index keluar dari zona jenuh jual.",
		sig: func(s *series) []bool { return crossUpK(cci(s, 20), -100) }},
	{Name: "ROC (10) tembus 0", Cat: "momentum", Explain: "Kenaikan 10 hari berubah positif.",
		sig: func(s *series) []bool { return crossUpK(ret(s.c, 10), 0) }},
	{Name: "Keltner tembus atas", Cat: "volatilitas", Explain: "Harga menutup di atas EMA20 + 2 ATR.",
		sig: func(s *series) []bool {
			e := ema(s.c, 20)
			return crossUp(s.c, values(s.n, func(i int) float64 { return e[i] + 2*s.atr[i] }))
		}},
	{Name: "TTM squeeze lepas ke atas", Cat: "volatilitas", Explain: "Bollinger keluar dari dalam Keltner (volatilitas meledak) dengan harga di atas EMA20.",
		sig: func(s *series) []bool {
			lo, up, _, _ := boll(s)
			e := ema(s.c, 20)
			on := where(s.n, func(i int) bool { return lo[i] > e[i]-1.5*s.atr[i] && up[i] < e[i]+1.5*s.atr[i] })
			return where(s.n, func(i int) bool { return i > 0 && on[i-1] && !on[i] && s.c[i] > e[i] })
		}},
	{Name: "NR7 lalu tembus high", Cat: "volatilitas", Explain: "Kemarin rentang harga tersempit 7 hari, hari ini menutup di atas high kemarin.",
		sig: func(s *series) []bool {
			rng := values(s.n, func(i int) float64 { return s.h[i] - s.l[i] })
			mn := rollMin(rng, 7)
			return where(s.n, func(i int) bool { return i > 7 && rng[i-1] <= mn[i-1] && s.c[i] > s.h[i-1] })
		}},
	{Name: "Inside bar lalu tembus high", Cat: "candle", Explain: "Kemarin candle di dalam rentang candle sebelumnya, hari ini menutup di atas high kemarin.",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool { return i > 2 && s.h[i-1] < s.h[i-2] && s.l[i-1] > s.l[i-2] && s.c[i] > s.h[i-1] })
		}},
	{Name: "Force Index (13) tembus 0", Cat: "volume", Explain: "EMA 13 dari (perubahan harga × volume) berubah positif.",
		sig: func(s *series) []bool {
			f := values(s.n, func(i int) float64 {
				if i == 0 {
					return nan
				}
				return (s.c[i] - s.c[i-1]) * s.v[i]
			})
			return crossUpK(ema(f, 13), 0)
		}},
	{Name: "Hull MA (20) berbalik naik", Cat: "tren", Explain: "Hull Moving Average berubah arah dari turun ke naik.",
		sig: func(s *series) []bool {
			h := hma(s.c, 20)
			return where(s.n, func(i int) bool { return i > 1 && h[i] > h[i-1] && h[i-1] <= h[i-2] })
		}},
	{Name: "Slope regresi 20 hari jadi positif", Cat: "tren", Explain: "Garis regresi linier 20 hari berubah miring ke atas.",
		sig: func(s *series) []bool { return crossUpK(slope(s.c, 20), 0) }},
	{Name: "Kekuatan relatif vs IHSG high 60 hari", Cat: "relatif", Explain: "Rasio harga saham ÷ IHSG mencapai tertinggi 60 hari (saham lebih kuat dari pasar).",
		sig: func(s *series) []bool {
			rs := values(s.n, func(i int) float64 { return s.c[i] / s.idx[i] })
			return crossUp(rs, shift(rollMax(rs, 60), 1))
		}},
	{Name: "Gap naik > 2% bertahan", Cat: "harga", Explain: "Buka di atas high kemarin + 2% dan tutup lebih tinggi dari open.",
		sig: func(s *series) []bool {
			return where(s.n, func(i int) bool { return i > 0 && s.o[i] > s.h[i-1]*1.02 && s.c[i] > s.o[i] })
		}},
	{Name: "Pembalikan 5 hari (turun > 5% sepekan)", Cat: "harga", Explain: "Hari pertama saham turun lebih dari 5% dalam 5 hari.",
		sig: func(s *series) []bool {
			r := ret(s.c, 5)
			return where(s.n, func(i int) bool { return i > 0 && r[i] < -0.05 && !(r[i-1] < -0.05) })
		}},
	{Name: "Bollinger squeeze lalu tembus atas", Cat: "volatilitas", Explain: "Lebar Bollinger kemarin dekat terendah 120 hari, hari ini harga tembus band atas.",
		sig: func(s *series) []bool {
			_, up, bw, _ := boll(s)
			mn := rollMin(bw, 120)
			return where(s.n, func(i int) bool { return i > 0 && bw[i-1] <= mn[i-1]*1.05 && s.c[i] > up[i] })
		}},

	// ---- values (rank IC) ----
	{Name: "RSI (14)", Cat: "momentum", InApp: true, Explain: "Nilai RSI hari ini.", val: func(s *series) []float64 { return s.align(analysis.RSI(s.p, 14)) }},
	{Name: "ADX (14)", Cat: "tren", InApp: true, Explain: "Kekuatan tren hari ini.", val: func(s *series) []float64 { a, _, _ := adx(s); return a }},
	{Name: "Bollinger %B", Cat: "volatilitas", InApp: true, Explain: "Posisi harga di dalam pita Bollinger (0 = band bawah, 100 = band atas).",
		val: func(s *series) []float64 { _, _, _, pb := boll(s); return pb }},
	{Name: "MFI (14)", Cat: "volume", InApp: true, Explain: "Nilai Money Flow Index.", val: func(s *series) []float64 { return s.align(analysis.MFI(s.p, 14)) }},
	{Name: "CMF (20)", Cat: "volume", InApp: true, Explain: "Nilai Chaikin Money Flow.", val: func(s *series) []float64 { return s.align(analysis.CMF(s.p, 20)) }},
	{Name: "Skor decision engine", Cat: "engine", InApp: true, Explain: "Skor 0–100 dari engine (sebelum gate IHSG).",
		val: func(s *series) []float64 {
			return decVal(s, func(d analysis.Decision) float64 { return float64(d.Score) })
		}},
	{Name: "Jarak ke high 52 minggu", Cat: "harga", Explain: "Harga ÷ harga tertinggi 250 hari.",
		val: func(s *series) []float64 {
			hi := rollMax(s.h, 250)
			return values(s.n, func(i int) float64 { return s.c[i] / hi[i] })
		}},
	{Name: "Momentum 12−1 bulan", Cat: "harga", Explain: "Kenaikan 12 bulan, tidak termasuk bulan terakhir.",
		val: func(s *series) []float64 { return values(s.n, func(i int) float64 { return lagRet(s.c, i, 20, 250) }) }},
	{Name: "Momentum 6−1 bulan", Cat: "harga", Explain: "Kenaikan 6 bulan, tidak termasuk bulan terakhir.",
		val: func(s *series) []float64 { return values(s.n, func(i int) float64 { return lagRet(s.c, i, 20, 125) }) }},
	{Name: "Return 1 bulan", Cat: "harga", Explain: "Kenaikan 20 hari terakhir (uji pembalikan jangka pendek).", val: func(s *series) []float64 { return ret(s.c, 20) }},
	{Name: "Return 1 minggu", Cat: "harga", Explain: "Kenaikan 5 hari terakhir.", val: func(s *series) []float64 { return ret(s.c, 5) }},
	{Name: "ATR % (volatilitas harian)", Cat: "volatilitas", Explain: "Rata-rata gerak harian ÷ harga.",
		val: func(s *series) []float64 { return values(s.n, func(i int) float64 { return s.atr[i] / s.c[i] }) }},
	{Name: "Volatilitas 60 hari", Cat: "volatilitas", Explain: "Simpangan baku return harian 60 hari.", val: func(s *series) []float64 { return rollStd(ret(s.c, 1), 60) }},
	{Name: "MAX 20 hari (efek lotre)", Cat: "harga", Explain: "Kenaikan harian terbesar dalam 20 hari.", val: func(s *series) []float64 { return rollMax(ret(s.c, 1), 20) }},
	{Name: "Iliquiditas Amihud", Cat: "volume", Explain: "Rata-rata |return harian| ÷ nilai transaksi (makin besar makin tidak likuid).",
		val: func(s *series) []float64 {
			r := ret(s.c, 1)
			x := values(s.n, func(i int) float64 {
				to := s.c[i] * s.v[i] / 1e9
				if to <= 0 {
					return nan
				}
				return math.Abs(r[i]) / to
			})
			return rollMean(x, 20)
		}},
	{Name: "Turnover 20 hari (ukuran)", Cat: "volume", Explain: "Nilai transaksi rata-rata 20 hari (proksi ukuran saham).",
		val: func(s *series) []float64 {
			return values(s.n, func(i int) float64 { return math.Log(s.to20[i] + 1e-9) })
		}},
	{Name: "Rasio volume", Cat: "volume", Explain: "Volume hari ini ÷ rata-rata 20 hari sebelumnya.",
		val: func(s *series) []float64 {
			a := shift(rollMean(s.v, 20), 1)
			return values(s.n, func(i int) float64 { return s.v[i] / a[i] })
		}},
	{Name: "Beta 60 hari vs IHSG", Cat: "relatif", Explain: "Seberapa kuat saham ikut gerak IHSG.", val: beta60},
	{Name: "Kekuatan relatif 60 hari vs IHSG", Cat: "relatif", Explain: "Kenaikan saham 60 hari dikurangi kenaikan IHSG 60 hari.",
		val: func(s *series) []float64 {
			a, b := ret(s.c, 60), ret(s.idx, 60)
			return values(s.n, func(i int) float64 { return a[i] - b[i] })
		}},
	{Name: "Jarak ke EMA200", Cat: "tren", Explain: "Harga ÷ EMA200 − 1.",
		val: func(s *series) []float64 {
			e := ema(s.c, 200)
			return values(s.n, func(i int) float64 { return s.c[i]/e[i] - 1 })
		}},
}

// components adds one value indicator per decision-engine factor.
func components() []indicator {
	names := []string{"Market Structure", "Trend EMA", "Money Flow", "Volume", "Support/Resistance", "Momentum",
		"Trend Strength", "Candlestick", "Risk/Reward", "FVG Confluence"}
	out := make([]indicator, 0, len(names))
	for _, nm := range names {
		nm := nm
		out = append(out, indicator{Name: "Komponen engine: " + nm, Cat: "engine", InApp: true,
			Explain: "Skor faktor '" + nm + "' di decision engine.",
			val: func(s *series) []float64 {
				return decVal(s, func(d analysis.Decision) float64 {
					for _, c := range d.Components {
						if c.Name == nm {
							return float64(c.Score)
						}
					}
					return nan
				})
			}})
	}
	return out
}

func decVal(s *series, f func(analysis.Decision) float64) []float64 {
	return values(s.n, func(i int) float64 {
		if i < decStart {
			return nan
		}
		return f(s.dec[i])
	})
}

func lagRet(c []float64, i, skip, look int) float64 {
	if i < look || c[i-look] <= 0 {
		return nan
	}
	return c[i-skip]/c[i-look] - 1
}

// ── research-only indicator math ────────────────────────────────────────────

func supertrendFlip(s *series) []bool {
	atr := s.align(analysis.ATR(s.p, 10))
	out := make([]bool, s.n)
	var fu, fl float64
	bull := true
	for i := 0; i < s.n; i++ {
		if math.IsNaN(atr[i]) {
			continue
		}
		mid := (s.h[i] + s.l[i]) / 2
		bu, bl := mid+3*atr[i], mid-3*atr[i]
		if fu == 0 {
			fu, fl = bu, bl
			continue
		}
		if bu < fu || s.c[i-1] > fu {
			fu = bu
		}
		if bl > fl || s.c[i-1] < fl {
			fl = bl
		}
		was := bull
		if bull && s.c[i] < fl {
			bull = false
		} else if !bull && s.c[i] > fu {
			bull = true
		}
		out[i] = bull && !was
	}
	return out
}

func aroon(s *series, n int) (up, dn []float64) {
	up, dn = make([]float64, s.n), make([]float64, s.n)
	for i := range up {
		up[i], dn[i] = nan, nan
		if i < n {
			continue
		}
		hi, lo := i-n, i-n
		for j := i - n; j <= i; j++ {
			if s.h[j] >= s.h[hi] {
				hi = j
			}
			if s.l[j] <= s.l[lo] {
				lo = j
			}
		}
		up[i] = 100 * float64(n-(i-hi)) / float64(n)
		dn[i] = 100 * float64(n-(i-lo)) / float64(n)
	}
	return
}

func cci(s *series, n int) []float64 {
	tp := values(s.n, func(i int) float64 { return (s.h[i] + s.l[i] + s.c[i]) / 3 })
	m := rollMean(tp, n)
	return values(s.n, func(i int) float64 {
		if math.IsNaN(m[i]) {
			return nan
		}
		md := 0.0
		for j := i + 1 - n; j <= i; j++ {
			md += math.Abs(tp[j] - m[i])
		}
		md /= float64(n)
		if md == 0 {
			return nan
		}
		return (tp[i] - m[i]) / (0.015 * md)
	})
}

func wma(x []float64, n int) []float64 {
	return values(len(x), func(i int) float64 {
		if i+1 < n {
			return nan
		}
		num, den := 0.0, 0.0
		for k := 0; k < n; k++ {
			w := float64(n - k)
			num += w * x[i-k]
			den += w
		}
		return num / den
	})
}

func hma(x []float64, n int) []float64 {
	a, b := wma(x, n/2), wma(x, n)
	d := values(len(x), func(i int) float64 { return 2*a[i] - b[i] })
	sq := int(math.Sqrt(float64(n)))
	return values(len(x), func(i int) float64 {
		if i+1 < n+sq {
			return nan
		}
		num, den := 0.0, 0.0
		for k := 0; k < sq; k++ {
			w := float64(sq - k)
			num += w * d[i-k]
			den += w
		}
		return num / den
	})
}

func slope(x []float64, n int) []float64 {
	return values(len(x), func(i int) float64 {
		if i+1 < n {
			return nan
		}
		var sx, sy, sxy, sxx float64
		for k := 0; k < n; k++ {
			xv, yv := float64(k), x[i+1-n+k]
			sx, sy, sxy, sxx = sx+xv, sy+yv, sxy+xv*yv, sxx+xv*xv
		}
		fn := float64(n)
		return (fn*sxy - sx*sy) / (fn*sxx - sx*sx)
	})
}

func beta60(s *series) []float64 {
	r, ri := ret(s.c, 1), ret(s.idx, 1)
	return values(s.n, func(i int) float64 {
		if i < 60 {
			return nan
		}
		var sa, sb, sab, sbb float64
		k := 0
		for j := i - 59; j <= i; j++ {
			if math.IsNaN(r[j]) || math.IsNaN(ri[j]) {
				continue
			}
			sa, sb, sab, sbb = sa+r[j], sb+ri[j], sab+r[j]*ri[j], sbb+ri[j]*ri[j]
			k++
		}
		if k < 40 {
			return nan
		}
		fk := float64(k)
		v := sbb/fk - (sb/fk)*(sb/fk)
		if v == 0 {
			return nan
		}
		return (sab/fk - (sa/fk)*(sb/fk)) / v
	})
}
