package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"stock-api/handlers"
)

// ── Request logging middleware (Gin / Fiber style with ANSI colors) ──────────

const (
	cReset    = "\033[0m"
	cBold     = "\033[1m"
	cDim      = "\033[2m"
	cFgBlack  = "\033[30m"
	cFgWhite  = "\033[97m"
	cBgGreen  = "\033[42m"
	cBgYellow = "\033[43m"
	cBgRed    = "\033[41m"
	cBgCyan   = "\033[46m"
	cBgBlue   = "\033[44m"
	cBgMag    = "\033[45m"
	cFgGreen  = "\033[32m"
	cFgYellow = "\033[33m"
	cFgRed    = "\033[31m"
	cFgCyan   = "\033[36m"
	cFgBlue   = "\033[34m"
	cFgMag    = "\033[35m"
	cFgGray   = "\033[90m"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// statusColor — Gin-style background color per status range
func statusColor(s int) string {
	switch {
	case s >= 200 && s < 300:
		return cBgGreen + cFgBlack
	case s >= 300 && s < 400:
		return cBgCyan + cFgBlack
	case s >= 400 && s < 500:
		return cBgYellow + cFgBlack
	default:
		return cBgRed + cFgWhite
	}
}

// methodColor — color per HTTP verb
func methodColor(m string) string {
	switch m {
	case "GET":
		return cBgBlue + cFgWhite
	case "POST":
		return cBgCyan + cFgBlack
	case "PUT":
		return cBgYellow + cFgBlack
	case "DELETE":
		return cBgRed + cFgWhite
	case "PATCH":
		return cBgGreen + cFgBlack
	default:
		return cBgMag + cFgWhite
	}
}

// formatLatency — human-readable µs / ms / s
func formatLatency(d time.Duration) string {
	switch {
	case d < time.Microsecond:
		return fmt.Sprintf("%dns", d.Nanoseconds())
	case d < time.Millisecond:
		return fmt.Sprintf("%.1fµs", float64(d.Nanoseconds())/1000)
	case d < time.Second:
		return fmt.Sprintf("%.2fms", float64(d.Nanoseconds())/1e6)
	default:
		return fmt.Sprintf("%.2fs", d.Seconds())
	}
}

// clientIP — extract caller IP, prefer X-Forwarded-For / X-Real-IP
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.Index(xff, ","); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return xr
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// logger logs every /api/* request in Gin/Fiber-style colored format.
// Static asset requests are skipped to keep terminal readable.
func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)

		if !strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}

		dur := time.Since(start)
		ts := start.Format("15:04:05")
		ip := clientIP(r)
		path := r.URL.Path
		if r.URL.RawQuery != "" {
			path += "?" + r.URL.RawQuery
		}

		fmt.Fprintf(os.Stdout,
			"%s[API]%s %s%s%s %s %s %3d %s %s%9s%s %s│%s %s%-15s%s %s%-7s%s %s\n",
			cFgMag, cReset,
			cFgGray, ts, cReset,
			cFgGray+"│"+cReset,
			statusColor(rec.status), rec.status, cReset,
			cBold, formatLatency(dur), cReset,
			cFgGray, cReset,
			cFgCyan, ip, cReset,
			methodColor(r.Method), " "+r.Method+" ", cReset,
			path,
		)
	})
}

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
	log.SetFlags(0) // ditch default 'YYYY/MM/DD HH:MM:SS' prefix — our middleware prints its own timestamp
	loadEnv(".env")
	h := handlers.New()
	a := handlers.NewAnalysis()
	ai := handlers.NewAI()
	bt := handlers.NewBacktest()
	br := handlers.NewBroker()

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
	api.HandleFunc("/analysis/{symbol}/fvg", a.FVG).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/pivots", a.Pivots).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/amd", a.AMD).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/adline", a.ADLine).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/cmf", a.CMF).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/mfi", a.MFI).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/advisor", a.Advisor).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/advisor-backtest", a.AdvisorBacktest).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/decision", a.Decision).Methods("GET")
	api.HandleFunc("/analysis/{symbol}/backtest", bt.Backtest).Methods("GET")
	api.HandleFunc("/overview", a.Overview).Methods("GET")
	api.HandleFunc("/advisor/screen", a.AdvisorScreen).Methods("GET")
	api.HandleFunc("/session", a.Session).Methods("GET")
	api.HandleFunc("/ihsg", h.IHSG).Methods("GET")

	// ── Broker / Bandar endpoints ─────────────────────────────────────────────
	api.HandleFunc("/broker/{symbol}", br.Get).Methods("GET")
	api.HandleFunc("/broker/{symbol}", br.Delete).Methods("DELETE")
	api.HandleFunc("/broker/{symbol}/summary", br.Summary).Methods("GET")
	api.HandleFunc("/broker/{symbol}/mock", br.Mock).Methods("POST")

	// ── Serve React UI from ./static (production build) ───────────────────────
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))

	fmt.Println()
	fmt.Println(cBold + cFgCyan + "  ╭──────────────────────────────────────────────────╮" + cReset)
	fmt.Println(cBold + cFgCyan + "  │ " + cFgMag + "IDX Stock Analyzer" + cReset + cBold + cFgCyan + " · API + UI server          │" + cReset)
	fmt.Println(cBold + cFgCyan + "  ╰──────────────────────────────────────────────────╯" + cReset)
	fmt.Println(cFgGray + "    server   " + cReset + "→ " + cFgGreen + "http://localhost:8080" + cReset)
	fmt.Println(cFgGray + "    data     " + cReset + "→ ./data/")
	fmt.Println(cFgGray + "    ui (dev) " + cReset + "→ " + cFgGreen + "http://localhost:5173" + cReset + cFgGray + "  (npm run dev inside ui/)" + cReset)
	fmt.Println(cFgGray + "    logging  " + cReset + "→ enabled for /api/* (Gin-style)")
	fmt.Println()
	log.Fatal(http.ListenAndServe(":8080", logger(r)))
}
