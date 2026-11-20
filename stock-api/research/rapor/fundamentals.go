package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"stock-api/fetcher"
)

// Point-in-time fundamentals from Yahoo's annual reports (FY2022 onward —
// Yahoo keeps only 4). A report is treated as public 90 days after its period
// end (IDX deadline for audited annual reports is end of March), so nothing is
// used before investors could have read it.
const (
	fundDir     = "research/out/fund"
	fundTTL     = 7 * 24 * time.Hour
	publishLag  = 90 * 24 * time.Hour
	fundSinceNB = "Laporan tahunan Yahoo FY2022+ (dianggap terbit 90 hari setelah tutup buku) → sampel ±Apr 2023–sekarang."
)

var fundTypes = []string{"NetIncome", "TotalRevenue", "StockholdersEquity", "OrdinarySharesNumber", "TotalDebt",
	"TotalAssets", "CurrentAssets", "CurrentLiabilities", "OperatingCashFlow", "GrossProfit", "EBITDA", "EBIT",
	"RetainedEarnings", "TotalLiabilitiesNetMinorityInterest", "CashAndCashEquivalents",
	"CashFlowsfromusedinOperatingActivitiesDirect"} // IDX filers use the direct method; see fetchFund

type fpt struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type fundData struct {
	Fetched  string           `json:"fetched"`
	Currency string           `json:"currency"`
	Annual   map[string][]fpt `json:"annual"`
	Divs     []fpt            `json:"divs"` // cash dividends by ex date, Rp per share
}

// loadFund returns the cached fundamentals for sym, refreshing a stale cache.
// fetched reports whether a network request was made (caller paces requests).
func loadFund(sym string) (f *fundData, fetched bool) {
	path := filepath.Join(fundDir, sym+".json")
	if b, err := os.ReadFile(path); err == nil {
		var c fundData
		if json.Unmarshal(b, &c) == nil {
			if t, err := time.Parse(time.RFC3339, c.Fetched); err == nil && time.Since(t) < fundTTL {
				return &c, false
			}
			f = &c // stale but usable if the refresh fails
		}
	}
	nf, err := fetchFund(sym)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nfund %s: %v", sym, err)
		return f, true
	}
	os.MkdirAll(fundDir, 0o755)
	b, _ := json.Marshal(nf)
	os.WriteFile(path, b, 0o644)
	return nf, true
}

func fetchFund(sym string) (*fundData, error) {
	types := make([]string, len(fundTypes))
	for i, t := range fundTypes {
		types[i] = "annual" + t
	}
	url := fmt.Sprintf("https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/%s.JK?type=%s&period1=%d&period2=%d",
		sym, strings.Join(types, ","), time.Date(2015, 1, 1, 0, 0, 0, 0, time.UTC).Unix(), time.Now().Unix())
	var raw struct {
		Timeseries struct {
			Result []map[string]json.RawMessage `json:"result"`
		} `json:"timeseries"`
	}
	if err := getJSON(url, &raw); err != nil {
		return nil, err
	}
	f := &fundData{Fetched: time.Now().Format(time.RFC3339), Annual: map[string][]fpt{}}
	for _, res := range raw.Timeseries.Result {
		for _, t := range fundTypes {
			body, ok := res["annual"+t]
			if !ok {
				continue
			}
			var rows []*struct {
				AsOfDate      string `json:"asOfDate"`
				CurrencyCode  string `json:"currencyCode"`
				ReportedValue struct {
					Raw float64 `json:"raw"`
				} `json:"reportedValue"`
			}
			if json.Unmarshal(body, &rows) != nil {
				continue
			}
			for _, r := range rows {
				if r == nil {
					continue
				}
				f.Annual[t] = append(f.Annual[t], fpt{r.AsOfDate, r.ReportedValue.Raw})
				if f.Currency == "" {
					f.Currency = r.CurrencyCode
				}
			}
			sort.Slice(f.Annual[t], func(i, j int) bool { return f.Annual[t][i].Date < f.Annual[t][j].Date })
		}
	}
	if len(f.Annual["OperatingCashFlow"]) == 0 { // most IDX filers report operating cash flow by the direct method
		f.Annual["OperatingCashFlow"] = f.Annual["CashFlowsfromusedinOperatingActivitiesDirect"]
	}
	_, divs, _, err := fetcher.FetchLongHistory(sym, 8)
	if err != nil {
		return nil, err
	}
	for _, d := range divs {
		f.Divs = append(f.Divs, fpt{d.Date, d.Value})
	}
	return f, nil
}

func getJSON(url string, v any) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; idx-stock-api/1.0)")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// annual returns report value `typ` that was public on bar i: back=0 is the
// latest public report, back=1 the one before. NaN when none.
func (s *series) annual(i int, typ string, back int) float64 {
	if s.fund == nil {
		return nan
	}
	rows := s.fund.Annual[typ]
	k := -1
	for j, r := range rows {
		t, err := time.Parse("2006-01-02", r.Date)
		if err == nil && t.Add(publishLag).Format("2006-01-02") <= s.date[i] {
			k = j
		}
	}
	k -= back
	if k < 0 {
		return nan
	}
	return rows[k].Value
}

// px is the close in the reporting currency (USD reporters: close ÷ USD/IDR).
func (s *series) px(i int) float64 {
	if s.fund != nil && s.fund.Currency == "USD" {
		return s.c[i] / s.fx[i]
	}
	return s.c[i]
}

func ratio(a, b float64) float64 {
	if b == 0 || math.IsNaN(a) || math.IsNaN(b) {
		return nan
	}
	return a / b
}

func fundVal(name, explain string, f func(s *series, i int) float64) indicator {
	return indicator{Name: name, Cat: "fundamental", Explain: explain, Note: fundSinceNB,
		val: func(s *series) []float64 { return values(s.n, func(i int) float64 { return f(s, i) }) }}
}

func perShare(s *series, i int, typ string) float64 {
	return ratio(s.annual(i, typ, 0), s.annual(i, "OrdinarySharesNumber", 0))
}

func mcap(s *series, i int) float64 { return s.px(i) * s.annual(i, "OrdinarySharesNumber", 0) }

func fundamentals() []indicator {
	return []indicator{
		fundVal("PBV (harga ÷ nilai buku)", "Harga dibagi nilai buku per saham. Kecil = murah.",
			func(s *series, i int) float64 {
				b := perShare(s, i, "StockholdersEquity")
				if !(b > 0) {
					return nan
				}
				return s.px(i) / b
			}),
		fundVal("Earnings yield (kebalikan PER)", "Laba per saham ÷ harga. Besar = murah (PER kecil); laba negatif ikut dihitung.",
			func(s *series, i int) float64 { return ratio(perShare(s, i, "NetIncome"), s.px(i)) }),
		fundVal("Sales yield (kebalikan PSR)", "Pendapatan per saham ÷ harga.",
			func(s *series, i int) float64 { return ratio(perShare(s, i, "TotalRevenue"), s.px(i)) }),
		fundVal("EBITDA ÷ EV (kebalikan EV/EBITDA)", "EBITDA dibagi nilai perusahaan (kapitalisasi + utang − kas). Besar = murah.",
			func(s *series, i int) float64 {
				ev := mcap(s, i) + s.annual(i, "TotalDebt", 0) - s.annual(i, "CashAndCashEquivalents", 0)
				if !(ev > 0) {
					return nan
				}
				return ratio(s.annual(i, "EBITDA", 0), ev)
			}),
		fundVal("ROE", "Laba bersih ÷ ekuitas.", func(s *series, i int) float64 {
			return ratio(s.annual(i, "NetIncome", 0), s.annual(i, "StockholdersEquity", 0))
		}),
		fundVal("ROA", "Laba bersih ÷ total aset.", func(s *series, i int) float64 {
			return ratio(s.annual(i, "NetIncome", 0), s.annual(i, "TotalAssets", 0))
		}),
		fundVal("Net margin", "Laba bersih ÷ pendapatan.", func(s *series, i int) float64 {
			return ratio(s.annual(i, "NetIncome", 0), s.annual(i, "TotalRevenue", 0))
		}),
		fundVal("DER (utang ÷ ekuitas)", "Total utang berbunga ÷ ekuitas.", func(s *series, i int) float64 {
			return ratio(s.annual(i, "TotalDebt", 0), s.annual(i, "StockholdersEquity", 0))
		}),
		fundVal("Current ratio", "Aset lancar ÷ liabilitas lancar (bank tidak punya).", func(s *series, i int) float64 {
			return ratio(s.annual(i, "CurrentAssets", 0), s.annual(i, "CurrentLiabilities", 0))
		}),
		fundVal("Pertumbuhan laba (YoY)", "Laba tahun terakhir ÷ tahun sebelumnya − 1 (hanya jika laba sebelumnya positif).",
			func(s *series, i int) float64 {
				a, b := s.annual(i, "NetIncome", 0), s.annual(i, "NetIncome", 1)
				if !(b > 0) {
					return nan
				}
				return a/b - 1
			}),
		fundVal("Pertumbuhan pendapatan (YoY)", "Pendapatan tahun terakhir ÷ tahun sebelumnya − 1.",
			func(s *series, i int) float64 {
				a, b := s.annual(i, "TotalRevenue", 0), s.annual(i, "TotalRevenue", 1)
				if !(b > 0) {
					return nan
				}
				return a/b - 1
			}),
		fundVal("Akrual", "(Laba − arus kas operasi) ÷ aset. Besar = laba banyak di atas kertas.",
			func(s *series, i int) float64 {
				return ratio(s.annual(i, "NetIncome", 0)-s.annual(i, "OperatingCashFlow", 0), s.annual(i, "TotalAssets", 0))
			}),
		fundVal("Piotroski F-score", "Skor kesehatan 0–9 (laba, arus kas, utang, likuiditas, dilusi, margin, perputaran aset).", fscore),
		fundVal("Altman Z-score", "Skor risiko bangkrut (makin tinggi makin aman).", altmanZ),
		fundVal("Kapitalisasi pasar (ukuran)", "Harga × jumlah saham (log).", func(s *series, i int) float64 {
			m := mcap(s, i)
			if !(m > 0) {
				return nan
			}
			return math.Log(m)
		}),
		{Name: "Dividend yield 12 bulan", Cat: "fundamental", Explain: "Total dividen tunai 12 bulan terakhir ÷ harga.",
			Note: "Riwayat dividen Yahoo sejak 2018 → sampel penuh 2020–sekarang.",
			val: func(s *series) []float64 {
				return values(s.n, func(i int) float64 {
					if s.fund == nil {
						return nan
					}
					from := shiftDate(s.date[i], -365)
					sum := 0.0
					for _, d := range s.fund.Divs {
						if d.Date > from && d.Date <= s.date[i] {
							sum += d.Value
						}
					}
					return sum / s.c[i]
				})
			}},
	}
}

func fscore(s *series, i int) float64 {
	g := func(t string, b int) float64 { return s.annual(i, t, b) }
	roa := func(b int) float64 { return ratio(g("NetIncome", b), g("TotalAssets", b)) }
	cr := func(b int) float64 { return ratio(g("CurrentAssets", b), g("CurrentLiabilities", b)) }
	lev := func(b int) float64 { return ratio(g("TotalDebt", b), g("TotalAssets", b)) }
	gm := func(b int) float64 { return ratio(g("GrossProfit", b), g("TotalRevenue", b)) }
	at := func(b int) float64 { return ratio(g("TotalRevenue", b), g("TotalAssets", b)) }
	tests := []struct{ a, b float64 }{ // each: a > b scores a point
		{roa(0), 0}, {g("OperatingCashFlow", 0), 0}, {roa(0), roa(1)}, {g("OperatingCashFlow", 0), g("NetIncome", 0)},
		{lev(1), lev(0)}, {cr(0), cr(1)}, {g("OrdinarySharesNumber", 1) + 1, g("OrdinarySharesNumber", 0)},
		{gm(0), gm(1)}, {at(0), at(1)},
	}
	score := 0.0
	for _, t := range tests {
		if math.IsNaN(t.a) || math.IsNaN(t.b) {
			return nan // incomplete data (e.g. banks): no score rather than a partial one
		}
		if t.a > t.b {
			score++
		}
	}
	return score
}

func altmanZ(s *series, i int) float64 {
	g := func(t string) float64 { return s.annual(i, t, 0) }
	ta, tl := g("TotalAssets"), g("TotalLiabilitiesNetMinorityInterest")
	if !(ta > 0) || !(tl > 0) {
		return nan
	}
	z := 1.2*(g("CurrentAssets")-g("CurrentLiabilities"))/ta + 1.4*g("RetainedEarnings")/ta +
		3.3*g("EBIT")/ta + 0.6*mcap(s, i)/tl + 1.0*g("TotalRevenue")/ta
	return z
}

func shiftDate(d string, days int) string {
	t, err := time.Parse("2006-01-02", d)
	if err != nil {
		return d
	}
	return t.AddDate(0, 0, days).Format("2006-01-02")
}
