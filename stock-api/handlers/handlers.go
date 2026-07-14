package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"stock-api/fetcher"
	"stock-api/models"
	"stock-api/storage"
)

// Handler groups all HTTP handler methods.
type Handler struct{}

func New() *Handler { return &Handler{} }

// APIResponse is the standard JSON envelope returned by every endpoint.
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// ─── helpers ────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON error: %v", err)
	}
}

func respond(w http.ResponseWriter, status int, success bool, msg string, data interface{}) {
	writeJSON(w, status, APIResponse{Success: success, Message: msg, Data: data})
}

// canonicalSymbol uppercases the symbol and strips any .JK suffix so that
// storage always uses the bare ticker (e.g. "BBCA", not "BBCA.JK").
func canonicalSymbol(s string) string {
	return strings.ToUpper(strings.TrimSuffix(strings.TrimSuffix(s, ".jk"), ".JK"))
}

// ─── GET /api/stocks ─────────────────────────────────────────────────────────

func (h *Handler) ListStocks(w http.ResponseWriter, r *http.Request) {
	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	sort.Strings(symbols)

	type Summary struct {
		Symbol      string    `json:"symbol"`
		Exchange    string    `json:"exchange"`
		LastUpdated string    `json:"last_updated"`
		DataPoints  int       `json:"data_points"`
		OldestDate  string    `json:"oldest_date,omitempty"`
		NewestDate  string    `json:"newest_date,omitempty"`
		LastClose   float64   `json:"last_close,omitempty"`
		ChangePct   float64   `json:"change_pct,omitempty"`
		Sparkline   []float64 `json:"sparkline,omitempty"`
	}

	list := make([]Summary, 0, len(symbols))
	for _, sym := range symbols {
		d, err := storage.Load(sym)
		if err != nil || d == nil {
			continue
		}
		s := Summary{
			Symbol:      d.Symbol,
			Exchange:    d.Exchange,
			LastUpdated: d.LastUpdated,
			DataPoints:  len(d.Prices),
		}
		if len(d.Prices) > 0 {
			s.OldestDate = d.Prices[0].Date
			s.NewestDate = d.Prices[len(d.Prices)-1].Date
			s.LastClose = d.Prices[len(d.Prices)-1].Close
		}
		if len(d.Prices) >= 2 {
			prev := d.Prices[len(d.Prices)-2].Close
			if prev > 0 {
				s.ChangePct = (s.LastClose - prev) / prev * 100
			}
			n := 20
			if len(d.Prices) < n {
				n = len(d.Prices)
			}
			spark := make([]float64, n)
			for i, p := range d.Prices[len(d.Prices)-n:] {
				spark[i] = p.Close
			}
			s.Sparkline = spark
		}
		list = append(list, s)
	}

	respond(w, 200, true, "", list)
}

// ─── POST /api/stocks ────────────────────────────────────────────────────────

type addRequest struct {
	Symbol string `json:"symbol"`
	From   string `json:"from"` // optional YYYY-MM-DD; default = 1 year ago
}

func (h *Handler) AddStock(w http.ResponseWriter, r *http.Request) {
	var req addRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond(w, 400, false, "invalid JSON body", nil)
		return
	}

	symbol := canonicalSymbol(req.Symbol)
	if symbol == "" {
		respond(w, 400, false, "symbol is required", nil)
		return
	}

	existing, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if existing != nil {
		respond(w, 409, false,
			fmt.Sprintf("%s is already tracked — use POST /api/stocks/%s/update to fetch new data", symbol, symbol),
			nil)
		return
	}

	from := time.Now().AddDate(-1, 0, 0) // default: past year
	if req.From != "" {
		from, err = time.Parse("2006-01-02", req.From)
		if err != nil {
			respond(w, 400, false, "invalid from date — use YYYY-MM-DD", nil)
			return
		}
	}

	prices, exchange, err := fetcher.Fetch(symbol, from)
	if err != nil {
		respond(w, 500, false, "fetch error: "+err.Error(), nil)
		return
	}

	data := &models.StockData{
		Symbol:      symbol,
		Exchange:    exchange,
		LastUpdated: time.Now().Format("2006-01-02"),
		Prices:      prices,
	}

	if err := storage.Save(data); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	respond(w, 201, true,
		fmt.Sprintf("now tracking %s: saved %d data points", symbol, len(prices)),
		data)
}

// ─── GET /api/stocks/{symbol} ────────────────────────────────────────────────

func (h *Handler) GetStock(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	data, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if data == nil {
		respond(w, 404, false,
			fmt.Sprintf("stock %s not found — add it first with POST /api/stocks", symbol), nil)
		return
	}

	prices := data.Prices
	q := r.URL.Query()

	if from := q.Get("from"); from != "" {
		filtered := prices[:0]
		for _, p := range prices {
			if p.Date >= from {
				filtered = append(filtered, p)
			}
		}
		prices = filtered
	}
	if to := q.Get("to"); to != "" {
		filtered := prices[:0]
		for _, p := range prices {
			if p.Date <= to {
				filtered = append(filtered, p)
			}
		}
		prices = filtered
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n < len(prices) {
			prices = prices[len(prices)-n:] // last N trading days
		}
	}

	respond(w, 200, true, "", map[string]interface{}{
		"symbol":       data.Symbol,
		"exchange":     data.Exchange,
		"last_updated": data.LastUpdated,
		"count":        len(prices),
		"prices":       prices,
	})
}

// ─── GET /api/stocks/{symbol}/latest ─────────────────────────────────────────

func (h *Handler) GetLatest(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	data, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if data == nil {
		respond(w, 404, false, fmt.Sprintf("stock %s not found", symbol), nil)
		return
	}
	if len(data.Prices) == 0 {
		respond(w, 404, false, "no price data available yet", nil)
		return
	}

	respond(w, 200, true, "", map[string]interface{}{
		"symbol": data.Symbol,
		"price":  data.Prices[len(data.Prices)-1],
	})
}

// ─── POST /api/stocks/{symbol}/update ────────────────────────────────────────

func (h *Handler) UpdateStock(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	added, data, msg, err := doUpdate(symbol)
	if err != nil {
		status := 500
		if data == nil {
			status = 404
		}
		respond(w, status, false, err.Error(), nil)
		return
	}

	newestDate := ""
	if len(data.Prices) > 0 {
		newestDate = data.Prices[len(data.Prices)-1].Date
	}

	respond(w, 200, true, msg, map[string]interface{}{
		"symbol":      data.Symbol,
		"added":       added,
		"total":       len(data.Prices),
		"newest_date": newestDate,
	})
}

// ─── POST /api/stocks/update-all ─────────────────────────────────────────────

func (h *Handler) UpdateAllStocks(w http.ResponseWriter, r *http.Request) {
	symbols, err := storage.List()
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	sort.Strings(symbols)

	type Result struct {
		Symbol string `json:"symbol"`
		Added  int    `json:"added"`
		Total  int    `json:"total"`
		Status string `json:"status"`
	}

	results := make([]Result, 0, len(symbols))
	for _, sym := range symbols {
		added, data, msg, err := doUpdate(sym)
		res := Result{Symbol: sym}
		if err != nil {
			res.Status = "error: " + err.Error()
		} else {
			res.Added = added
			res.Total = len(data.Prices)
			res.Status = msg
		}
		results = append(results, res)
	}

	respond(w, 200, true, fmt.Sprintf("updated %d stocks", len(results)), results)
}

// ─── DELETE /api/stocks/{symbol} ─────────────────────────────────────────────

func (h *Handler) DeleteStock(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])

	existing, err := storage.Load(symbol)
	if err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}
	if existing == nil {
		respond(w, 404, false, fmt.Sprintf("stock %s not found", symbol), nil)
		return
	}

	if err := storage.Delete(symbol); err != nil {
		respond(w, 500, false, err.Error(), nil)
		return
	}

	respond(w, 200, true, fmt.Sprintf("stopped tracking %s", symbol), nil)
}

// ─── shared update logic ─────────────────────────────────────────────────────

// doUpdate fetches new prices for a symbol and appends them to the saved file.
// Returns the number of rows added, the updated StockData, a status message, and any error.
func doUpdate(symbol string) (added int, data *models.StockData, msg string, err error) {
	existing, err := storage.Load(symbol)
	if err != nil {
		return
	}
	if existing == nil {
		err = fmt.Errorf("stock %s not found — add it first with POST /api/stocks", symbol)
		return
	}

	// Determine the start date for the incremental fetch.
	// Re-fetch from the last stored date (not +1) so a partial intraday candle
	// saved earlier gets refreshed with final values.
	var from time.Time
	if len(existing.Prices) > 0 {
		lastDate, _ := time.Parse("2006-01-02", existing.Prices[len(existing.Prices)-1].Date)
		from = lastDate
	} else {
		from = time.Now().AddDate(-1, 0, 0)
	}

	today := time.Now().Truncate(24 * time.Hour)
	if from.After(today) {
		msg = "already up to date"
		data = existing
		return
	}

	newPrices, _, fetchErr := fetcher.Fetch(symbol, from)
	if fetchErr != nil {
		err = fmt.Errorf("fetch error: %w", fetchErr)
		data = existing
		return
	}

	// Index stored dates so re-fetched dates overwrite (refresh) instead of duplicate.
	known := make(map[string]int, len(existing.Prices))
	for i, p := range existing.Prices {
		known[p.Date] = i
	}

	for _, p := range newPrices {
		if i, ok := known[p.Date]; ok {
			existing.Prices[i] = p
		} else {
			existing.Prices = append(existing.Prices, p)
			added++
		}
	}

	// Keep prices sorted chronologically.
	sort.Slice(existing.Prices, func(i, j int) bool {
		return existing.Prices[i].Date < existing.Prices[j].Date
	})

	existing.LastUpdated = time.Now().Format("2006-01-02")

	if err = storage.Save(existing); err != nil {
		data = existing
		return
	}

	data = existing
	msg = fmt.Sprintf("added %d new data points", added)
	return
}

// ─── GET /api/stocks/{symbol}/export.csv ─────────────────────────────────────

func (h *Handler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	symbol := canonicalSymbol(mux.Vars(r)["symbol"])
	data, err := storage.Load(symbol)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if data == nil {
		http.Error(w, "stock not found", 404)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, symbol))

	fmt.Fprintf(w, "Date,Open,High,Low,Close,Volume\n")
	for _, p := range data.Prices {
		fmt.Fprintf(w, "%s,%.0f,%.0f,%.0f,%.0f,%d\n",
			p.Date, p.Open, p.High, p.Low, p.Close, p.Volume)
	}
}
