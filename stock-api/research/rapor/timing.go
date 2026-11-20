package main

import (
	"math"
	"sort"
	"time"

	"stock-api/models"
)

// Timing indicators don't pick stocks — they say whether a DAY is a good or
// bad time to buy anything. Measured on the market itself: the mean 20-day
// forward return of all liquid stocks bought on dates where the condition
// holds, minus that period's (TRAIN/VALID/TEST) average over all dates.
type timingCond struct {
	Name, Cat, Explain, Note string
	on                       func(d string) bool
}

// dateSeries answers "value as of date d" from another market's daily bars.
// prior=true uses only bars strictly before d (US sessions close after IDX).
type dateSeries struct {
	dates []string
	close []float64
}

func newDateSeries(p []models.StockPrice) dateSeries {
	ds := dateSeries{}
	for _, b := range p {
		if b.Close > 0 {
			ds.dates = append(ds.dates, b.Date)
			ds.close = append(ds.close, b.Close)
		}
	}
	return ds
}

func (ds dateSeries) at(d string, prior bool) int {
	k := sort.SearchStrings(ds.dates, d) // first >= d
	if !prior && k < len(ds.dates) && ds.dates[k] == d {
		return k
	}
	return k - 1
}

// ret is the return over `back` bars ending at the bar for date d.
func (ds dateSeries) ret(d string, back int, prior bool) float64 {
	k := ds.at(d, prior)
	if k-back < 0 || k >= len(ds.close) {
		return nan
	}
	return ds.close[k]/ds.close[k-back] - 1
}

func (ds dateSeries) aboveSMA(d string, n int, prior bool) (bool, bool) {
	k := ds.at(d, prior)
	if k+1 < n {
		return false, false
	}
	sum := 0.0
	for j := k + 1 - n; j <= k; j++ {
		sum += ds.close[j]
	}
	return ds.close[k] > sum/float64(n), true
}

// Idul Fitri (1 Syawal) — the IDX holiday week moves every year.
var lebaran = []string{"2020-05-24", "2021-05-13", "2022-05-02", "2023-04-22", "2024-04-10", "2025-03-31", "2026-03-20"}

func timingConds(jk dateSeries, mood map[string]string, breadth map[string]float64, ext map[string]dateSeries, tradeDays []string) []timingCond {
	is := func(m string) func(string) bool { return func(d string) bool { return mood[d] == m } }
	dd := func(lim float64) func(string) bool {
		return func(d string) bool {
			k := jk.at(d, false)
			if k < 0 {
				return false
			}
			hi := 0.0
			for j := max(0, k-249); j <= k; j++ {
				hi = math.Max(hi, jk.close[j])
			}
			return jk.close[k]/hi-1 < lim
		}
	}
	lastOfMonth := map[string]bool{} // last 3 trading days of each month
	for i, d := range tradeDays {
		if i+3 < len(tradeDays) {
			lastOfMonth[d] = tradeDays[i+3][:7] != d[:7]
		} else {
			// newest bars: the next trading days are not known yet — use the
			// calendar (weekdays left in the month; holidays ignored)
			lastOfMonth[d] = weekdaysLeftInMonth(d) < 3
		}
	}
	wd := func(w time.Weekday) func(string) bool {
		return func(d string) bool { t, err := time.Parse("2006-01-02", d); return err == nil && t.Weekday() == w }
	}
	ext20 := func(sym string, back int, cmp func(float64) bool, prior bool) func(string) bool {
		return func(d string) bool { r := ext[sym].ret(d, back, prior); return !math.IsNaN(r) && cmp(r) }
	}
	return []timingCond{
		{"Suasana pasar: panik (RSI IHSG < 40)", "pasar", "RSI 14 IHSG di bawah 40.", "", is("panik")},
		{"Suasana pasar: takut (RSI IHSG 40–50)", "pasar", "RSI 14 IHSG 40–50.", "", is("takut")},
		{"Suasana pasar: tenang (RSI IHSG 50–60)", "pasar", "RSI 14 IHSG 50–60.", "", is("tenang")},
		{"Suasana pasar: optimis (RSI IHSG 60–70)", "pasar", "RSI 14 IHSG 60–70.", "", is("optimis")},
		{"Suasana pasar: euforia (RSI IHSG > 70)", "pasar", "RSI 14 IHSG di atas 70.", "", is("euforia")},
		{"IHSG di atas MA50 (gate lama)", "pasar", "Penutupan IHSG di atas rata-rata 50 hari.", "",
			func(d string) bool { up, ok := jk.aboveSMA(d, 50, false); return ok && up }},
		{"IHSG turun > 10% dari puncak 1 tahun", "pasar", "IHSG lebih dari 10% di bawah puncak 250 hari.", "", dd(-0.10)},
		{"IHSG turun > 20% dari puncak 1 tahun", "pasar", "IHSG lebih dari 20% di bawah puncak 250 hari (bear market).", "", dd(-0.20)},
		{"Breadth sempit (< 30% saham di atas EMA50)", "pasar", "Kurang dari 30% saham likuid di atas EMA50-nya.", "",
			func(d string) bool { b, ok := breadth[d]; return ok && b < 30 }},
		{"Breadth lebar (> 70% saham di atas EMA50)", "pasar", "Lebih dari 70% saham likuid di atas EMA50-nya.", "",
			func(d string) bool { b, ok := breadth[d]; return ok && b > 70 }},
		{"Rupiah melemah > 2% dalam 20 hari", "makro", "USD/IDR naik lebih dari 2% dalam 20 hari bursa.", "",
			ext20("USDIDR=X", 20, func(r float64) bool { return r > 0.02 }, false)},
		{"Rupiah menguat > 2% dalam 20 hari", "makro", "USD/IDR turun lebih dari 2% dalam 20 hari bursa.", "",
			ext20("USDIDR=X", 20, func(r float64) bool { return r < -0.02 }, false)},
		{"S&P 500 turun > 2% semalam", "makro", "Sesi Wall Street sebelumnya turun lebih dari 2%.", "",
			ext20("^GSPC", 1, func(r float64) bool { return r < -0.02 }, true)},
		{"S&P 500 turun > 5% dalam 20 hari", "makro", "Wall Street koreksi lebih dari 5% sebulan.", "",
			ext20("^GSPC", 20, func(r float64) bool { return r < -0.05 }, true)},
		{"S&P 500 di atas MA50", "makro", "Wall Street dalam tren naik.", "",
			func(d string) bool { up, ok := ext["^GSPC"].aboveSMA(d, 50, true); return ok && up }},
		{"VIX > 25 (pasar global takut)", "makro", "Indeks ketakutan Wall Street di atas 25.", "",
			func(d string) bool { k := ext["^VIX"].at(d, true); return k >= 0 && ext["^VIX"].close[k] > 25 }},
		{"Minyak naik > 10% dalam 20 hari", "makro", "Harga minyak WTI naik lebih dari 10% sebulan.", "",
			ext20("CL=F", 20, func(r float64) bool { return r > 0.10 }, true)},
		{"Emas naik > 5% dalam 20 hari", "makro", "Harga emas naik lebih dari 5% sebulan.", "",
			ext20("GC=F", 20, func(r float64) bool { return r > 0.05 }, true)},
		{"Bulan Desember (window dressing)", "kalender", "Beli di bulan Desember.", "",
			func(d string) bool { return d[5:7] == "12" }},
		{"Bulan Januari", "kalender", "Beli di bulan Januari.", "", func(d string) bool { return d[5:7] == "01" }},
		{"3 hari bursa terakhir tiap bulan", "kalender", "Beli menjelang pergantian bulan.", "", func(d string) bool { return lastOfMonth[d] }},
		{"Sinyal Jumat (beli Senin)", "kalender", "Keputusan di hari Jumat, masuk di open Senin.", "", wd(time.Friday)},
		{"Sinyal Kamis (beli Jumat)", "kalender", "Keputusan di hari Kamis, masuk di open Jumat.", "", wd(time.Thursday)},
		{"2 minggu sebelum Lebaran", "kalender", "14 hari kalender sebelum Idul Fitri.", "Hanya 7 Lebaran (2020–2026) — sampel sangat kecil.",
			func(d string) bool {
				for _, l := range lebaran {
					if d < l && d >= shiftDate(l, -14) {
						return true
					}
				}
				return false
			}},
	}
}

// timingResults grades every condition on the market's 20-day forward return.
func timingResults(conds []timingCond, m20 map[string]float64, mood, reg map[string]string) []Result {
	dates := make([]string, 0, len(m20))
	for d := range m20 {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	sum, cnt := map[string]float64{}, map[string]float64{}
	for _, d := range dates {
		sum[splitOf(d)] += m20[d]
		cnt[splitOf(d)]++
	}
	out := make([]Result, 0, len(conds))
	for _, c := range conds {
		var o []obs
		for _, d := range dates {
			if c.on(d) {
				sp := splitOf(d)
				o = append(o, obs{d, m20[d] - sum[sp]/cnt[sp]})
			}
		}
		r := Result{Name: c.Name, Category: c.Cat, Kind: "timing", Explain: c.Explain, Note: c.Note, Horizons: map[string]float64{}}
		summarize(&r, o, mood, 20)
		for _, x := range o { // a timing "trade" earns the market deviation on its side
			r.netObs = append(r.netObs, obs{x.date, x.v * r.dir})
		}
		r.Groups = map[string]map[string]GroupStat{"rezim": regimeGroups(o, reg)}
		out = append(out, r)
	}
	return out
}

// weekdaysLeftInMonth counts Mon–Fri days after d in d's month.
func weekdaysLeftInMonth(d string) int {
	t, err := time.Parse("2006-01-02", d)
	if err != nil {
		return 99
	}
	n := 0
	for x := t.AddDate(0, 0, 1); x.Month() == t.Month(); x = x.AddDate(0, 0, 1) {
		if x.Weekday() != time.Saturday && x.Weekday() != time.Sunday {
			n++
		}
	}
	return n
}
