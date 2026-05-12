package main

import (
	"bufio"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/mux"
	"stock-api/handlers"
)

// loadEnv reads key=value pairs from a .env file into the process environment.
func loadEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // no .env file is fine
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			if os.Getenv(key) == "" { // don't override real env vars
				os.Setenv(key, val)
			}
		}
	}
}

func main() {
	loadEnv(".env")
	h := handlers.New()
	a := handlers.NewAnalysis()
	ai := handlers.NewAI()
	bt := handlers.NewBacktest()

	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()

	// ── Stock data endpoints ──────────────────────────────────────────────────
	api.HandleFunc("/stocks", h.ListStocks).Methods("GET")
	api.HandleFunc("/stocks", h.AddStock).Methods("POST")
	api.HandleFunc("/stocks/update-all", h.UpdateAllStocks).Methods("POST")
	api.HandleFunc("/stocks/{symbol}", h.GetStock).Methods("GET")
	api.HandleFunc("/stocks/{symbol}", h.DeleteStock).Methods("DELETE")
	api.HandleFunc("/stocks/{symbol}/latest", h.GetLatest).Methods("GET")
	api.HandleFunc("/stocks/{symbol}/update", h.UpdateStock).Methods("POST")
	api.HandleFunc("/stocks/{symbol}/export.csv", h.ExportCSV).Methods("GET")
	api.HandleFunc("/stocks/{symbol}/reports", handlers.ListReports).Methods("GET")
	api.HandleFunc("/stocks/{symbol}/reports", handlers.UploadReport).Methods("POST")
	api.HandleFunc("/stocks/{symbol}/reports/{id}", handlers.DeleteReport).Methods("DELETE")
	api.HandleFunc("/stocks/{symbol}/fundamental", handlers.GetFundamental).Methods("GET")
	api.HandleFunc("/stocks/{symbol}/fundamental", handlers.SaveFundamental).Methods("POST")

	// ── Analysis endpoints ────────────────────────────────────────────────────
	api.HandleFunc("/analysis/{symbol}/summary", a.Summary).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/indicators", a.Indicators).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/signals", a.Signals).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/sma", a.SMA).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/ema", a.EMA).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/rsi", a.RSI).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/macd", a.MACD).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/bollinger", a.Bollinger).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/stochastic", a.Stochastic).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/atr", a.ATR).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/obv", a.OBV).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/ai", ai.Analyze).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/adx", a.ADX).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/vwap", a.VWAP).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/sar", a.SAR).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/ichimoku", a.Ichimoku).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/fibonacci", a.Fibonacci).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/pivots", a.Pivots).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/amd", a.AMD).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/backtest", bt.Backtest).Methods("GET")
	api.HandleFunc("/overview", a.Overview).Methods("GET")
	api.HandleFunc("/session", a.Session).Methods("GET")

	// ── Serve React UI from ./static (production build) ───────────────────────
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))

	log.Println("IDX Stock API + UI  →  http://localhost:8080")
	log.Println("Data directory       →  ./data/")
	log.Println("UI dev server        →  http://localhost:5173  (npm run dev inside ui/)")
	log.Fatal(http.ListenAndServe(":8080", r))
}
