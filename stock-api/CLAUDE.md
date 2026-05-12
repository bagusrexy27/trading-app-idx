# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IDX Stock Analyzer** — Full-stack technical analysis platform for Indonesian (IDX) stocks. Go backend (Gorilla Mux) fetches Yahoo Finance data and runs 15 technical indicators plus a rule-based local AI write-up; React + Vite frontend renders charts, signals, screener, portfolio, comparison, alerts, fundamentals, and uploaded PDF research reports.

All code lives in `stock-api/`. Run all commands from this directory unless noted.

## Commands

### Backend (Go) — run from `stock-api/`
```bash
go build -o stock-api.exe .   # Build binary
./stock-api.exe               # Run server on :8080 (also serves UI from ./static)
go build ./...                # Compile-check all packages
go vet ./...                  # Vet code
```

`main.go` calls `loadEnv(".env")` on startup (best-effort, no error if missing). No env vars are currently consumed by the code — `.env` exists for future hooks.

### Frontend (React + Vite) — run from `stock-api/ui/`
```bash
npm install --legacy-peer-deps   # required: react-apexcharts vs React 18 peer dep
npm run dev                      # :5173, proxies /api/* to :8080
npm run build                    # outputs to ../static/ (served by Go)
```

### Development workflow
- Terminal 1: `./stock-api.exe` (API + static files on :8080)
- Terminal 2: `cd ui && npm run dev` (hot-reload UI on :5173)
- Production: build UI first, then run the binary (single server)

## Architecture

### Backend (Go)

Request flow: `main.go` (Gorilla Mux) → `handlers/` → `analysis/` + `storage/` + `fetcher/`.

| Package / file | Responsibility |
|---|---|
| `models/` | `StockPrice` (OHLCV + date) and `StockData` (symbol + prices) |
| `fetcher/` | Yahoo Finance v8 chart API; appends `.JK` automatically |
| `storage/` | `./data/{SYMBOL}.json`; thread-safe via `sync.RWMutex` |
| `analysis/analysis.go` | Pure indicator math: SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku, Fibonacci, Pivots |
| `analysis/amd.go` | Accumulation–Manipulation–Distribution (Wyckoff-style) phase detector |
| `handlers/handlers.go` | Stock CRUD, update-all, latest, CSV export; helpers `canonicalSymbol`, `respond`, `loadPrices`, `doUpdate` |
| `handlers/analysis.go` | All `/api/analysis/*` endpoints (calls `analysis.*`) |
| `handlers/ai.go` | `GET /api/analysis/{symbol}/ai` — **rule-based local** narrative analysis (no external LLM); uses signals, indicators, pattern detection, and uploaded reports text |
| `handlers/backtest.go` | `GET /api/analysis/{symbol}/backtest` — simulates BUY/SELL on composite-signal change at next open; returns trades + summary (win rate, drawdown, etc.) |
| `handlers/reports.go` | PDF research reports — list/upload/delete under `./data/reports/{SYMBOL}/`; uses `github.com/ledongthuc/pdf` for text extraction (consumed by AI handler) |
| `handlers/fundamental.go` | Read/write arbitrary JSON to `./data/fundamentals/{SYMBOL}.json` |

**Routes** (registered in `main.go`):

- Stocks: `GET/POST /api/stocks`, `POST /api/stocks/update-all`, `GET/DELETE /api/stocks/{symbol}`, `GET /api/stocks/{symbol}/latest`, `POST /api/stocks/{symbol}/update`, `GET /api/stocks/{symbol}/export.csv`
- Reports: `GET/POST /api/stocks/{symbol}/reports`, `DELETE /api/stocks/{symbol}/reports/{id}`
- Fundamental: `GET/POST /api/stocks/{symbol}/fundamental`
- Analysis: `summary`, `indicators`, `signals`, `sma`, `ema`, `rsi`, `macd`, `bollinger`, `stochastic`, `atr`, `obv`, `adx`, `vwap`, `sar`, `ichimoku`, `fibonacci`, `pivots`, `amd`, `ai`, `backtest` under `/api/analysis/{symbol}/*`
- Market: `GET /api/overview`, `GET /api/session`

**Incremental fetching** (`doUpdate`): reads last saved date, requests from `lastDate+1`, dedupes by date string, appends and re-sorts.

**Symbols** stored without `.JK` (e.g. `BBCA`). `canonicalSymbol()` strips `.JK` from user input; fetcher re-adds it internally.

**API envelope** — every endpoint returns `{ "success": bool, "message": "...", "data": {...} }`. Helper `respond(w, status, ok, msg, data)`.

### Frontend (React)

```
App.jsx                       ← global state (stocks[], selected, view, toast)
                                view ∈ home | overview | session | screener | portfolio | comparison
├── Sidebar.jsx                ← stock list + search + "Update All" + view switcher
├── StockPanel.jsx             ← (view=home) loads tabs in parallel (Promise.all), tab container
│   ├── Overview.jsx           ← change cards, 52-week range, volume, MA, RSI bar
│   ├── ChartTab.jsx           ← ApexCharts candlestick + SMA overlays + volume; range filter
│   ├── Indicators.jsx         ← RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku
│   ├── Signals.jsx            ← composite BUY/SELL/NEUTRAL badge + breakdown
│   ├── AMD.jsx                ← Accumulation/Manipulation/Distribution phase view
│   ├── RiskCalc.jsx           ← position sizing / stop-loss helper
│   ├── FundamentalAnalysis.jsx← reads/edits ./data/fundamentals/{SYMBOL}.json
│   └── ReportUpload.jsx       ← upload/list/delete PDF reports
├── MarketOverview.jsx         ← (view=overview) market-wide overview
├── SessionPrep.jsx            ← (view=session) trading-session prep
├── Screener.jsx               ← (view=screener) filter stocks by indicator criteria
├── Portfolio.jsx              ← (view=portfolio) holdings tracker
├── Comparison.jsx             ← (view=comparison) multi-stock side-by-side
├── AlertsPanel.jsx            ← modal; exports useAlertChecker (5-min poll, mounted in App)
└── AddStockModal.jsx          ← POST /api/stocks (symbol + optional from-date)
```

**`api.js`** — fetch wrapper; throws on `success: false`; namespaces: `api.stocks.*`, `api.analysis.*` (and helpers for reports/fundamental).

**`utils.js`** — `fmt.price/pct/vol`, `colorOf`/`signalStyle` Tailwind helpers, `APEX_DARK` shared ApexCharts theme.

**Chart alignment** — indicator series (SMA, Bollinger, etc.) have fewer points than raw prices. Components build a `date → value` Map from indicator data, then map over the full price array using `map[p.date] ?? null` so all ApexCharts series share equal-length arrays.

### Data & storage

| Path | Content |
|---|---|
| `./data/{SYMBOL}.json` | OHLCV time series — `StockData` struct, `prices` always sorted by date string (lex-sort is correct for `YYYY-MM-DD`) |
| `./data/fundamentals/{SYMBOL}.json` | Free-form JSON saved by user via the Fundamental tab |
| `./data/reports/{SYMBOL}/{timestamp}_{filename}.pdf` | Uploaded PDF research reports; AI handler reads text from these |

No database. Concurrent writes to OHLCV files are protected by `sync.RWMutex` in `storage/storage.go`. Other dirs (`fundamentals/`, `reports/`) are written without an in-process lock — the handlers assume single-user usage.

### Tailwind custom colors

Defined in `ui/tailwind.config.js` under the `tv` namespace: `tv-bg` (#131722), `tv-card` (#1e222d), `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`.

## Key constraints

- **IDX only** — Yahoo Finance `.JK` suffix; prices are integers (Indonesian Rupiah, no decimals).
- **No database** — file-based persistence only. OHLCV is `RWMutex`-protected; `fundamentals/` and `reports/` assume single-user.
- **`npm install` requires `--legacy-peer-deps`** — `react-apexcharts` peer-dep conflict with React 18.
- **PDF dependency** — `github.com/ledongthuc/pdf` (text extraction for uploaded research reports).
- **AI is local** — `/api/analysis/{symbol}/ai` is rule-based (no external LLM call); safe to ship without secrets.
- The `ui/` Vite build outputs to `../static/` (i.e. `stock-api/static/`), which Go's `http.FileServer` serves at the root.
