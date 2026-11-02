package analysis

import (
	"fmt"
	"math"
	"testing"

	"stock-api/models"
)

// HRTA 30 Okt 2026 — level yang sebelumnya digambar manual di Chartbit.
// Fixture dibekukan supaya test tidak ikut berubah saat data di-update.
func TestKeyLevelsHRTA(t *testing.T) {
	r := KeyLevels(loadFixture(t, "HRTA"))
	if r.Date != "2026-10-30" || r.Close != 1445 {
		t.Fatalf("fixture berubah: date=%s close=%v", r.Date, r.Close)
	}
	want := []struct {
		name, kind  string
		bottom, top float64
	}{
		{"R1", "trigger", 1510, 1510},
		{"R2", "consolidation", 1595, 1660},
		{"R3", "gap", 1715, 1865},
		{"S1", "recent_low", 1405, 1405},
		{"S2", "base", 1240, 1355},
		{"S3", "low52", 1140, 1140},
	}
	if len(r.Levels) != len(want) {
		for _, l := range r.Levels {
			t.Logf("%s %s %v-%v %s", l.Name, l.Kind, l.Bottom, l.Top, l.Label)
		}
		t.Fatalf("got %d levels, want %d", len(r.Levels), len(want))
	}
	for i, w := range want {
		l := r.Levels[i]
		if l.Name != w.name || l.Kind != w.kind || l.Bottom != w.bottom || l.Top != w.top {
			t.Errorf("level %d = %s %s %v-%v (%s), want %s %s %v-%v",
				i, l.Name, l.Kind, l.Bottom, l.Top, l.Label, w.name, w.kind, w.bottom, w.top)
		}
	}
	if got := r.Levels[3].Label; got != "low terbaru 30 Okt, sama dengan low 20 Okt" {
		t.Errorf("S1 label = %q", got)
	}
}

// Invarian yang harus berlaku untuk saham apa pun.
func TestKeyLevelsInvariants(t *testing.T) {
	for _, sym := range []string{"BBCA", "DEWA", "TINS", "TPIA", "UNVR", "VKTR", "HRTA"} {
		t.Run(sym, func(t *testing.T) {
			prices := loadFixture(t, sym)
			r := KeyLevels(prices)
			if r.ATR <= 0 {
				t.Fatal("ATR nol")
			}
			prevR, prevS := 0.0, math.MaxFloat64
			nr, ns := 0, 0
			for _, l := range r.Levels {
				if l.Bottom > l.Top {
					t.Errorf("%s: bottom %v > top %v", l.Name, l.Bottom, l.Top)
				}
				for _, p := range []float64{l.Top, l.Bottom} {
					if p != roundTick(p) {
						t.Errorf("%s: %v bukan kelipatan fraksi", l.Name, p)
					}
				}
				switch l.Side {
				case "resistance":
					nr++
					if l.Name != fmt.Sprintf("R%d", nr) || l.Price != l.Bottom || l.Bottom <= r.Close || l.Price < prevR {
						t.Errorf("resistance salah urut/posisi: %+v", l)
					}
					prevR = l.Price
				case "support":
					ns++
					if l.Name != fmt.Sprintf("S%d", ns) || l.Price != l.Top || l.Top >= r.Close || l.Price > prevS {
						t.Errorf("support salah urut/posisi: %+v", l)
					}
					prevS = l.Price
				default:
					t.Errorf("side tak dikenal: %+v", l)
				}
				if d := distTo(l, r.Close); d/r.Close*100 > klMaxDistPct {
					t.Errorf("%s terlalu jauh dari harga: %v", l.Name, l.Price)
				}
				if l.Label == "" {
					t.Errorf("%s tanpa label", l.Name)
				}
			}
			for i := range r.Levels {
				for j := i + 1; j < len(r.Levels); j++ {
					if gapBetween(r.Levels[i], r.Levels[j]) < klMergeATR*r.ATR-1e-9 {
						t.Errorf("%s dan %s bertumpuk", r.Levels[i].Name, r.Levels[j].Name)
					}
				}
			}
		})
	}
}

// Tanpa look-ahead: level pada hari X hanya bergantung pada data sampai X.
func TestKeyLevelsNoLookahead(t *testing.T) {
	prices := loadFixture(t, "HRTA")
	cut := len(prices) - 20
	a := KeyLevels(prices[:cut])
	b := KeyLevels(append([]models.StockPrice(nil), prices[:cut]...))
	if fmt.Sprint(a) != fmt.Sprint(b) {
		t.Fatal("hasil tidak deterministik")
	}
	if a.Date != prices[cut-1].Date {
		t.Fatalf("date = %s, want %s", a.Date, prices[cut-1].Date)
	}
}

func TestKeyLevelsGapSynthetic(t *testing.T) {
	var p []models.StockPrice
	day := func(i int) string { return fmt.Sprintf("2026-%02d-%02d", i/28+1, i%28+1) }
	// 25 bar datar di sekitar 1000, lalu gap turun ke 800 dan bertahan 20 bar
	// (lebih lama dari jendela trigger, supaya close 1000 tidak jadi trigger).
	for i := 0; i < 25; i++ {
		p = append(p, fvgBar(day(i), 1000, 1010, 990, 1000))
	}
	for i := 25; i < 45; i++ {
		p = append(p, fvgBar(day(i), 800, 810, 790, 800))
	}
	r := KeyLevels(p)
	var gap *KeyLevel
	for i := range r.Levels {
		if r.Levels[i].Kind == "gap" {
			gap = &r.Levels[i]
		}
	}
	if gap == nil {
		t.Fatalf("gap turun tidak terdeteksi: %+v", r.Levels)
	}
	if gap.Side != "resistance" || gap.Bottom != 810 || gap.Top != 990 {
		t.Errorf("gap = %+v, want resistance 810–990", *gap)
	}

	// Setelah harga menutup gap (high ≥ 990), gap tidak boleh muncul lagi.
	p = append(p, fvgBar("2026-03-01", 800, 995, 800, 900))
	for _, l := range KeyLevels(p).Levels {
		if l.Kind == "gap" && l.Side == "resistance" {
			t.Errorf("gap yang sudah tertutup masih muncul: %+v", l)
		}
	}
}

func TestKeyLevelsShortHistory(t *testing.T) {
	if r := KeyLevels(loadFixture(t, "BBCA")[:10]); len(r.Levels) != 0 {
		t.Fatalf("data < 30 bar harus kosong, got %+v", r.Levels)
	}
}

func TestIDDate(t *testing.T) {
	cases := map[string]string{
		idDate("2026-10-16"):                    "16 Okt",
		idDate("2026-05-01"):                    "1 Mei",
		idMonth("2025-11-12"):                   "Nov 2025",
		idDateRange("2026-10-22", "2026-10-28"): "22–28 Okt",
		idDateRange("2026-09-30", "2026-10-06"): "30 Sep–6 Okt",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("got %q want %q", got, want)
		}
	}
}
