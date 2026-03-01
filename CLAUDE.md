# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IDX Stock Analyzer** — Full-stack technical analysis platform for Indonesian (IDX) stocks. Go backend fetches data from Yahoo Finance and runs indicator calculations; React frontend renders charts, signals, and market overview.

All code lives in `stock-api/`. Run all commands from that directory unless noted.

## Commands

### Backend (Go) — run from `stock-api/`
```bash
go build -o stock-api.exe .   # Build binary
./stock-api.exe               # Run server on :8080
go build ./...                # Compile-check all packages
go vet ./...                  # Vet code
```

### Frontend (React + Vite) — run from `stock-api/ui/`
```bash
npm install --legacy-peer-deps   # Install (--legacy-peer-deps required for react-apexcharts + React 18)
npm run dev                      # Dev server on :5173, proxies /api/* to :8080
npm run build                    # Production build → outputs to stock-api/static/
```

### Development workflow
- Terminal 1: `./stock-api.exe` (API + static files on :8080)
- Terminal 2: `cd ui && npm run dev` (hot-reload UI on :5173)
- Production: build UI first, then run the binary (single server)

## Architecture

### Backend (Go)

Request flow: `main.go` → `handlers/` → `analysis/` + `storage/` + `fetcher/`

| Package | Responsibility |
|---------|---------------|
| `models/` | `StockPrice` (OHLCV + date) and `StockData` (symbol + prices slice) |
| `fetcher/` | Calls Yahoo Finance v8 chart API; appends `.JK` suffix automatically |
| `storage/` | Reads/writes `./data/{SYMBOL}.json`; thread-safe via `sync.RWMutex` |
| `analysis/` | Pure calculation functions: SMA, EMA, RSI, MACD, Bollinger, Stochastic |
| `handlers/handlers.go` | CRUD — list, add, get (`?limit=`, `?from=`, `?to=`), update, delete |
| `handlers/analysis.go` | Analysis endpoints — calls `analysis.*` functions via `loadPrices()` |

**Incremental fetching** (`doUpdate`): reads last saved date, requests from `lastDate+1`, deduplicates by date string, appends and re-sorts.

**Symbols** are stored without `.JK` (e.g. `BBCA`). The `canonicalSymbol()` helper strips `.JK` from user input; the fetcher re-adds it internally.

**API envelope** — all endpoints return `{ "success": bool, "message": "...", "data": {...} }`.

### Frontend (React)

```
App.jsx                  ← global state (stocks[], selected, toast)
├── Sidebar.jsx          ← stock list + search + "Update All"
├── StockPanel.jsx       ← loads all tabs in parallel (Promise.all), tab container
│   ├── Overview.jsx     ← change cards, 52-week range, volume, moving averages, RSI bar
│   ├── ChartTab.jsx     ← ApexCharts candlestick + SMA overlays + volume; range filter
│   ├── Indicators.jsx   ← RSI, MACD, Bollinger, Stochastic charts
│   └── Signals.jsx      ← composite BUY/SELL/NEUTRAL badge + breakdown table
├── AddStockModal.jsx    ← POST /api/stocks (symbol + optional from-date)
├── MarketOverview.jsx   ← market-wide overview panel
└── SessionPrep.jsx      ← trading session preparation
```

**`api.js`** — fetch wrapper; throws on `success: false`; two namespaces: `api.stocks.*`, `api.analysis.*`.

**`utils.js`** — `fmt.price/pct/vol` formatters, `colorOf`/`signalStyle` Tailwind helpers, `APEX_DARK` shared ApexCharts theme base.

**Chart alignment**: indicator series (SMA, Bollinger, etc.) have fewer points than raw prices. Components build a `date → value` Map from indicator data, then map over the full price array using `map[p.date] ?? null` so all ApexCharts series share equal-length arrays.

### Data & storage

Each stock is `./data/{SYMBOL}.json` — a serialized `StockData` struct. Prices are always sorted by date string (lexicographic sort is valid for `YYYY-MM-DD`). No database — concurrency is handled by `sync.RWMutex` in `storage/storage.go`.

### Tailwind custom colors

Defined in `ui/tailwind.config.js` under the `tv` namespace: `tv-bg` (#131722), `tv-card` (#1e222d), `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`.

## Key constraints

- **IDX only** — Yahoo Finance `.JK` suffix required; prices are integers (Indonesian Rupiah, no decimals).
- **No database** — file-based persistence only.
- **`npm install` requires `--legacy-peer-deps`** — `react-apexcharts` has an unresolved peer dep conflict with React 18.
- The `ui/` Vite build outputs to `../static/` (i.e. `stock-api/static/`), which Go's `http.FileServer` serves at the root.
