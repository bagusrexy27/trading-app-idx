package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"stock-api/fetcher"
	"stock-api/storage"
)

// Dividend is one dividend event. Status "resmi" = announced with a cum date;
// "perkiraan" = guessed from last year's pattern, so only EstMonth is known.
type Dividend struct {
	ID         string  `json:"id"`
	Symbol     string  `json:"symbol"`
	Type       string  `json:"type"`        // interim | final | spesial
	FiscalYear int     `json:"fiscal_year"` // tahun buku
	Amount     float64 `json:"amount"`      // Rp per saham (0 = belum diketahui)
	Status     string  `json:"status"`      // resmi | perkiraan
	CumDate    string  `json:"cum_date,omitempty"`
	PayDate    string  `json:"pay_date,omitempty"`
	EstMonth   string  `json:"est_month,omitempty"` // YYYY-MM, untuk perkiraan
	ExDate     string  `json:"ex_date,omitempty"`   // dari Yahoo (riwayat) / tebakan (perkiraan otomatis)
	Note       string  `json:"note,omitempty"`
	Source     string  `json:"source,omitempty"`
	Auto       bool    `json:"auto,omitempty"` // dibuat otomatis dari Yahoo, tidak disimpan
}

// ponytail: lives in a subdir, not DataDir root — storage.List globs DataDir/*.json as stocks.
var dividendsPath = filepath.Join(storage.DataDir, "dividends", "calendar.json")

var (
	reDate  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	reMonth = regexp.MustCompile(`^\d{4}-\d{2}$`)
)

func loadDividends() ([]Dividend, error) {
	raw, err := os.ReadFile(dividendsPath)
	if os.IsNotExist(err) {
		return []Dividend{}, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Dividend
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ─── Auto calendar from Yahoo ────────────────────────────────────────────────

type yahooDivCache struct {
	UpdatedAt string                             `json:"updated_at"`
	Items     map[string][]fetcher.DividendEvent `json:"items"`
}

var (
	yahooDivPath = filepath.Join(storage.DataDir, "dividends", "yahoo.json")
	yahooDivMu   sync.Mutex
)

// yahooDividends returns the cached Yahoo dividend history for every tracked
// stock, re-fetching when forced or when the cache is older than a day.
func yahooDividends(force bool) (yahooDivCache, error) {
	yahooDivMu.Lock()
	defer yahooDivMu.Unlock()

	var c yahooDivCache
	if raw, err := os.ReadFile(yahooDivPath); err == nil {
		_ = json.Unmarshal(raw, &c)
	}
	if t, err := time.Parse(time.RFC3339, c.UpdatedAt); !force && err == nil && time.Since(t) < 24*time.Hour {
		return c, nil
	}

	symbols, err := storage.List()
	if err != nil {
		return c, err
	}
	fresh := map[string][]fetcher.DividendEvent{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for _, s := range symbols {
		wg.Add(1)
		go func(s string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			ev, err := fetcher.FetchDividends(s)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				fresh[s] = c.Items[s] // keep last good data on a failed fetch
				return
			}
			fresh[s] = ev
		}(s)
	}
	wg.Wait()

	c = yahooDivCache{UpdatedAt: time.Now().Format(time.RFC3339), Items: fresh}
	if err := os.MkdirAll(filepath.Dir(yahooDivPath), 0755); err == nil {
		if out, err := json.MarshalIndent(c, "", "  "); err == nil {
			_ = os.WriteFile(yahooDivPath, out, 0644)
		}
	}
	return c, nil
}

// buildAutoDividends turns Yahoo history into "riwayat" rows, and projects
// every dividend of the past 12 months one year forward as "perkiraan".
func buildAutoDividends(items map[string][]fetcher.DividendEvent, today time.Time) []Dividend {
	var out []Dividend
	yearAgo := today.AddDate(-1, 0, 0).Format("2006-01-02")
	todayS := today.Format("2006-01-02")
	for sym, evs := range items {
		amounts := make([]float64, len(evs))
		for i, e := range evs {
			amounts[i] = e.Amount
		}
		med := median(amounts)
		for _, e := range evs {
			out = append(out, Dividend{
				ID: "y-" + sym + "-" + e.Date, Symbol: sym, Status: "riwayat",
				ExDate: e.Date, Amount: e.Amount, Auto: true, Source: "Yahoo Finance",
			})
			if e.Date <= yearAgo || e.Date > todayS {
				continue
			}
			// ponytail: crude special-dividend filter (>3× median), skip projecting one-offs.
			if len(evs) >= 3 && e.Amount > 3*med {
				continue
			}
			t, _ := time.Parse("2006-01-02", e.Date)
			est := t.AddDate(1, 0, 0).Format("2006-01-02")
			if paidNear(evs, est) { // this year's round already happened (earlier than last year)
				continue
			}
			out = append(out, Dividend{
				ID: "p-" + sym + "-" + est, Symbol: sym, Status: "perkiraan",
				ExDate: est, EstMonth: est[:7], Amount: e.Amount, Auto: true,
				Note: "pola tahun lalu: ex " + e.Date, Source: "Yahoo Finance",
			})
		}
	}
	return out
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	return s[len(s)/2]
}

func paidNear(evs []fetcher.DividendEvent, date string) bool {
	for _, e := range evs {
		if nearDate(e.Date, date) {
			return true
		}
	}
	return false
}

// nearDate reports whether two YYYY-MM-DD dates are within 45 days.
func nearDate(a, b string) bool {
	ta, e1 := time.Parse("2006-01-02", a)
	tb, e2 := time.Parse("2006-01-02", b)
	if e1 != nil || e2 != nil {
		return false
	}
	d := ta.Sub(tb)
	return d < 45*24*time.Hour && d > -45*24*time.Hour
}

// GetDividends returns manual entries + Yahoo history + auto projections.
// A projection is dropped once a manual entry or a real dividend lands near it.
// ?refresh=1 forces a Yahoo re-fetch.
func GetDividends(w http.ResponseWriter, r *http.Request) {
	manual, err := loadDividends()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	cache, err := yahooDividends(r.URL.Query().Get("refresh") == "1")
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	auto := buildAutoDividends(cache.Items, time.Now())

	list := append([]Dividend{}, manual...)
	for _, a := range auto {
		if a.Status == "perkiraan" && overlaps(a, manual) {
			continue
		}
		list = append(list, a)
	}
	sort.SliceStable(list, func(i, j int) bool { return dividendKey(list[i]) < dividendKey(list[j]) })
	respond(w, 200, true, cache.UpdatedAt, list)
}

func overlaps(p Dividend, manual []Dividend) bool {
	for _, m := range manual {
		if m.Symbol != p.Symbol {
			continue
		}
		date := m.CumDate
		if date == "" {
			date = m.EstMonth + "-15"
		}
		if nearDate(date, p.ExDate) {
			return true
		}
	}
	return false
}

// SaveDividends replaces the whole calendar (single-user app, like fundamentals/).
func SaveDividends(w http.ResponseWriter, r *http.Request) {
	var in []Dividend
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respond(w, 400, false, "invalid json: "+err.Error(), nil)
		return
	}
	list := []Dividend{}
	for _, d := range in {
		if !d.Auto { // auto rows are rebuilt from Yahoo, never stored
			list = append(list, d)
		}
	}
	for i := range list {
		d := &list[i]
		d.Symbol = canonicalSymbol(d.Symbol)
		if d.Symbol == "" || d.ID == "" {
			respond(w, 400, false, "symbol dan id wajib diisi", nil)
			return
		}
		if d.Status != "resmi" && d.Status != "perkiraan" {
			respond(w, 400, false, d.Symbol+": status harus resmi atau perkiraan", nil)
			return
		}
		if d.Amount < 0 {
			respond(w, 400, false, d.Symbol+": nominal tidak boleh negatif", nil)
			return
		}
		for _, s := range []string{d.CumDate, d.PayDate} {
			if s != "" && !reDate.MatchString(s) {
				respond(w, 400, false, d.Symbol+": format tanggal harus YYYY-MM-DD", nil)
				return
			}
		}
		if d.EstMonth != "" && !reMonth.MatchString(d.EstMonth) {
			respond(w, 400, false, d.Symbol+": format bulan perkiraan harus YYYY-MM", nil)
			return
		}
		if d.CumDate == "" && d.EstMonth == "" {
			respond(w, 400, false, d.Symbol+": isi cum date atau bulan perkiraan", nil)
			return
		}
		d.Type = strings.ToLower(d.Type)
	}
	sort.SliceStable(list, func(i, j int) bool { return dividendKey(list[i]) < dividendKey(list[j]) })

	if err := os.MkdirAll(filepath.Dir(dividendsPath), 0755); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	out, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if err := os.WriteFile(dividendsPath, out, 0644); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	respond(w, 200, true, "saved", list)
}

// dividendKey sorts by cum date, then ex date, falling back to the estimated month.
func dividendKey(d Dividend) string {
	switch {
	case d.CumDate != "":
		return d.CumDate
	case d.ExDate != "":
		return d.ExDate
	}
	return d.EstMonth + "-99"
}
