# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IDX Stock Analyzer** — A full-stack app for technical analysis of Indonesian (IDX) stocks. Go backend fetches data from Yahoo Finance and runs technical indicators; React frontend renders charts and signals.

## Commands

### Backend (Go)
```bash
# Build binary
go build -o stock-api.exe .

# Run server (port 8080)
./stock-api.exe

# Compile-check all packages without producing a binary
go build ./...

# Vet code
go vet ./...
```

### Frontend (React + Vite)
```bash
cd ui

# Install dependencies (requires --legacy-peer-deps due to react-apexcharts)
npm install --legacy-peer-deps

# Dev server with API proxy to :8080 (http://localhost:5173)
npm run dev

# Production build → outputs to ../static/ (served by Go)
npm run build
```

### Full development workflow
- Terminal 1: `./stock-api.exe` (API on :8080)
- Terminal 2: `cd ui && npm run dev` (UI on :5173, proxied to API)
- Production: `cd ui && npm run build` then `./stock-api.exe` (single server on :8080)

## Architecture

### Backend (Go)

Request flow: `main.go` (Gorilla Mux) → `handlers/` → `analysis/` + `storage/` + `fetcher/`

| Package | Responsibility |
|---------|---------------|
| `models/` | Shared types: `StockPrice` (OHLCV + date) and `StockData` (symbol + prices slice) |
| `fetcher/` | Calls Yahoo Finance v8 chart API; appends `.JK` suffix for IDX tickers automatically |
| `storage/` | Reads/writes `./data/{SYMBOL}.json`; thread-safe via `sync.RWMutex` |
| `analysis/` | Pure calculation functions (no I/O): SMA, EMA, RSI, MACD, Bollinger, Stochastic |
| `handlers/handlers.go` | CRUD for stocks — list, add, get (with `?limit=`, `?from=`, `?to=`), update, delete |
| `handlers/analysis.go` | Analysis endpoints — uses `loadPrices()` helper, calls `analysis.*` functions |

**Incremental data fetching** (`doUpdate` in `handlers/handlers.go`): reads the last saved date, starts the next Yahoo Finance request from `lastDate + 1 day`, deduplicates by date string, then appends and sorts.

**API response envelope** — every endpoint returns:
```json
{ "success": true, "message": "...", "data": { ... } }
```

**Stock symbols** are stored without the `.JK` suffix (e.g. `BBCA`, not `BBCA.JK`). The fetcher adds `.JK` internally. The `canonicalSymbol()` helper in handlers strips `.JK` from user input.

### Frontend (React)

Component tree:
```
App.jsx              ← global state (stocks[], selected, toast)
├── Sidebar.jsx      ← stock list + search + "Update All"
├── StockPanel.jsx   ← loads all data in parallel (Promise.all), tab container
│   ├── Overview.jsx     ← change cards, 52-week range, volume, MA, RSI bar
│   ├── ChartTab.jsx     ← ApexCharts candlestick + SMA overlays + volume; range filter (1M/3M/6M/1Y/All)
│   ├── Indicators.jsx   ← RSI area, MACD mixed, Bollinger line, Stochastic line
│   └── Signals.jsx      ← composite BUY/SELL/NEUTRAL badge + breakdown table
└── AddStockModal.jsx ← POST /api/stocks with symbol + optional from date
```

**`api.js`** — thin fetch wrapper; throws on `success: false`; two namespaces: `api.stocks.*` and `api.analysis.*`.

**`utils.js`** — formatting (`fmt.price`, `fmt.pct`, `fmt.vol`) + Tailwind class helpers (`colorOf`, `signalStyle`) + `APEX_DARK` (shared ApexCharts dark theme base options).

**Chart alignment**: SMA/Bollinger data has fewer points than raw prices. In `ChartTab.jsx` and `Indicators.jsx`, a date→value Map is built from indicator data, then `prices.map(p => ({ x: p.date, y: map[p.date] ?? null }))` aligns series so ApexCharts receives arrays of equal length with `null` for missing values.

### Tailwind custom colors

Defined in `ui/tailwind.config.js` under the `tv` key:
`tv-bg`, `tv-card`, `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`

### Data storage

Each stock is a single JSON file at `./data/{SYMBOL}.json` — `StockData` struct serialized with `json.MarshalIndent`. The `prices` array is always kept sorted by date string (lexicographic sort is correct for `YYYY-MM-DD`).

## Key constraints

- **IDX only** — Yahoo Finance `.JK` suffix; prices are in Indonesian Rupiah (integers, no decimals needed).
- **No database** — file-based persistence; concurrent writes are protected by `sync.RWMutex` in `storage/storage.go`.
- **`npm install` requires `--legacy-peer-deps`** due to `react-apexcharts` peer dependency conflict with React 18.
- The `ui/` build output directory is `../static/` (relative to `ui/`), which is the same directory that Go's `http.FileServer` serves from.
