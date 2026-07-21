# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IDX Stock Analyzer** — Full-stack technical analysis platform for Indonesian (IDX) stocks. Go backend (Gorilla Mux) fetches Yahoo Finance data and runs 15+ technical indicators, a rule-based advisor/decision engine, and a local AI write-up; React + Vite frontend renders a watchlist landing page, charts, advisor verdicts, market screener, portfolio, and a candle-prediction practice game.

All code lives in `stock-api/`. Run all commands from that directory unless noted.

## Commands

### Backend (Go) — run from `stock-api/`
```bash
go build -o stock-api.exe .   # Build binary
./stock-api.exe               # Run server on :1111 (also serves UI from ./static)
go build ./...                # Compile-check all packages
go vet ./...                  # Vet code
go test ./analysis/           # Advisor unit tests
```

`main.go` calls `loadEnv(".env")` on startup (best-effort, no error if missing). No env vars are currently consumed — `.env` exists for future hooks.

### Frontend (React + Vite) — run from `stock-api/ui/`
```bash
npm install --legacy-peer-deps   # required: react-apexcharts vs React 18 peer dep
npm run dev                      # :5173, proxies /api/* to :1111
npm run build                    # outputs to ../static/ (served by Go)
```

### Development workflow
- Terminal 1: `./stock-api.exe` (API + static files on :1111)
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
| `analysis/adline.go`, `mfi.go`, `cmf.go` | Volume-flow indicators: A/D Line, Money Flow Index, Chaikin Money Flow |
| `analysis/bandar.go` | Bandarmology (broker accumulation/distribution) analysis over broker-summary data |
| `analysis/advisor.go` | Rule-based price-action decision engine — verdict `STRONG_BUY \| BUY \| WAIT \| AVOID \| REDUCE` with confidence, stop/target, Indonesian action text; tests in `advisor_test.go` |
| `analysis/advisor_backtest.go` | Backtests the advisor's signals over history |
| `handlers/handlers.go` | Stock CRUD, update-all, latest, CSV export; helpers `canonicalSymbol`, `respond`, `loadPrices`, `doUpdate` |
| `handlers/analysis.go` | All `/api/analysis/*` endpoints (calls `analysis.*`) |
| `handlers/advisor.go` | Advisor + advisor-backtest endpoints for one symbol |
| `handlers/advisor_screen.go` | `GET /api/advisor/screen` — runs advisor across all stocks, returns ranked candidates (`?mode=buy&min_turnover=`) |
| `handlers/ai.go` | `GET /api/analysis/{symbol}/ai` — **rule-based local** narrative analysis (no external LLM); uses signals, indicators, pattern detection, and uploaded reports text |
| `handlers/backtest.go` | `GET /api/analysis/{symbol}/backtest` — simulates BUY/SELL on composite-signal change at next open; returns trades + summary |
| `handlers/ihsg.go` | `GET /api/ihsg` — fetches `^JKSE` (Jakarta Composite Index) via the same fetcher |
| `handlers/broker.go` | Broker-summary data CRUD under `./data/broker/{SYMBOL}.json`; includes `/mock` generator for test data |
| `handlers/reports.go` | PDF research reports — list/upload/delete under `./data/reports/{SYMBOL}/`; uses `github.com/ledongthuc/pdf` for text extraction (consumed by AI handler). **Gotcha:** upload also spawns a Claude Code terminal (`openClaudeTerminal`) that analyzes the PDF and writes `./data/fundamentals/{SYMBOL}.json` |
| `handlers/fundamental.go` | Read/write arbitrary JSON to `./data/fundamentals/{SYMBOL}.json` |

**Routes** (registered in `main.go`):

- Stocks: `GET/POST /api/stocks`, `POST /api/stocks/update-all`, `GET/DELETE /api/stocks/{symbol}`, `GET /api/stocks/{symbol}/latest`, `POST /api/stocks/{symbol}/update`, `GET /api/stocks/{symbol}/export.csv`
- Reports: `GET/POST /api/stocks/{symbol}/reports`, `DELETE /api/stocks/{symbol}/reports/{id}`
- Fundamental: `GET/POST /api/stocks/{symbol}/fundamental`
- Analysis (`/api/analysis/{symbol}/*`): `summary`, `indicators`, `signals`, `sma`, `ema`, `rsi`, `macd`, `bollinger`, `stochastic`, `atr`, `obv`, `adx`, `vwap`, `sar`, `ichimoku`, `fibonacci`, `pivots`, `amd`, `adline`, `cmf`, `mfi`, `advisor`, `advisor-backtest`, `ai`, `backtest`
- Market: `GET /api/overview`, `GET /api/advisor/screen`, `GET /api/session`, `GET /api/ihsg`
- Broker: `GET/DELETE /api/broker/{symbol}`, `GET /api/broker/{symbol}/summary`, `POST /api/broker/{symbol}/mock`

**Incremental fetching** (`doUpdate`): reads last saved date, requests from `lastDate+1`, dedupes by date string, appends and re-sorts.

**Symbols** stored without `.JK` (e.g. `BBCA`). `canonicalSymbol()` strips `.JK` from user input; fetcher re-adds it internally.

**API envelope** — every endpoint returns `{ "success": bool, "message": "...", "data": {...} }`. Helper `respond(w, status, ok, msg, data)`.

### Frontend (React)

Views (in `App.jsx`): `watchlist` (default) | `home` (StockPanel) | `overview` | `session` | `advisor` | `portfolio` | `practice`. All views except StockPanel are code-split via `React.lazy` + `Suspense`; heavy StockPanel tabs (ChartTab, Indicators) are also lazy.

```
App.jsx                       ← global state (stocks[], selected, view, toast); mounts useAlertChecker + IHSGBadge
├── Sidebar.jsx               ← slim nav hub: stock list + search + "Update All" + view switcher
├── Watchlist.jsx             ← (view=watchlist, DEFAULT) centered landing view, JII syariah quick-add picks
├── StockPanel.jsx            ← (view=home) tab container; lazy per-tab data fetch with TabLoading spinner
│   ├── Overview.jsx          ← change cards, 52-week range, volume, MA, RSI bar
│   ├── ChartTab.jsx          ← ApexCharts candlestick + SMA20/50 + volume; toggleable indicators, Fibonacci overlay, TradingView-style wheel zoom/pan (rAF-throttled, animations off)
│   ├── Indicators.jsx        ← RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku
│   ├── Advisor.jsx           ← "Saran" tab: advisor verdict banner + backtest stats
│   ├── RiskCalc.jsx          ← position sizing / stop-loss helper
│   └── ReportUpload.jsx      ← "Laporan" tab: PDF upload/list/delete; renders FundamentalAnalysis.jsx
├── MarketOverview.jsx        ← (view=overview) market-wide overview; renders IHSGChart.jsx
├── SessionPrep.jsx           ← (view=session) trading-session prep
├── AdvisorScreen.jsx         ← (view=advisor) market-wide advisor screener (ranked BUY candidates)
├── Portfolio.jsx             ← (view=portfolio) holdings tracker; input form matches IDX broker reporting format
├── Practice.jsx              ← (view=practice) "Latihan" candle-prediction practice game
├── AlertsPanel.jsx           ← modal; exports useAlertChecker (5-min poll, mounted in App)
├── IHSGBadge.jsx             ← header badge; polls /api/ihsg every 60s (backend caches 60s)
└── AddStockModal.jsx         ← POST /api/stocks (symbol + optional from-date)
```

**`api.js`** — fetch wrapper; throws on `success: false`; namespaces: `api.stocks.*`, `api.analysis.*`, `api.broker.*`, plus top-level `api.overview()`, `api.advisorScreen()`, `api.session()`, `api.ihsg()`.

**`utils.js`** — `fmt.price/pct/vol`, `colorOf`/`signalStyle` Tailwind helpers, `APEX_DARK` shared ApexCharts theme.

**Chart alignment** — indicator series (SMA, Bollinger, etc.) have fewer points than raw prices. Components build a `date → value` Map from indicator data, then map over the full price array using `map[p.date] ?? null` so all ApexCharts series share equal-length arrays.

**Chart performance** — ApexCharts animations are disabled and wheel-zoom events are rAF-throttled in ChartTab; re-enabling animations brings back severe zoom/pan lag. A migration of ChartTab to `lightweight-charts` has been scoped (native 60fps zoom/pan) but not implemented.

### Data & storage

| Path | Content |
|---|---|
| `./data/{SYMBOL}.json` | OHLCV time series — `StockData` struct, `prices` always sorted by date string (lex-sort is correct for `YYYY-MM-DD`) |
| `./data/fundamentals/{SYMBOL}.json` | Fundamental analysis JSON — written by the Claude Code terminal spawned on PDF upload; Laporan tab only reads it |
| `./data/reports/{SYMBOL}/{timestamp}_{filename}.pdf` | Uploaded PDF research reports; AI handler reads text from these |
| `./data/broker/{SYMBOL}.json` | Broker-summary (bandarmology) data; `/mock` endpoint can generate test data |

No database. Concurrent writes to OHLCV files are protected by `sync.RWMutex` in `storage/storage.go`. Other dirs (`fundamentals/`, `reports/`, `broker/`) are written without an in-process lock — handlers assume single-user usage.

### Tailwind custom colors

Defined in `ui/tailwind.config.js` under the `tv` namespace: `tv-bg` (#131722), `tv-card` (#1e222d), `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`.

## Key constraints

- **IDX only** — Yahoo Finance `.JK` suffix; prices are integers (Indonesian Rupiah, no decimals). IHSG uses `^JKSE`.
- **No database** — file-based persistence only. OHLCV is `RWMutex`-protected; `fundamentals/`, `reports/`, `broker/` assume single-user.
- **`npm install` requires `--legacy-peer-deps`** — `react-apexcharts` peer-dep conflict with React 18.
- **PDF dependency** — `github.com/ledongthuc/pdf` (text extraction for uploaded research reports).
- **AI endpoint is local, upload flow is not** — `/api/analysis/{symbol}/ai` is rule-based (no external LLM call). But PDF upload spawns a Claude Code terminal via `os/exec` (`reports.go`): requires `claude` CLI installed, Windows-only (`wt`/`cmd start`), and assumes localhost single-user — do not expose the server to a network.
- **UI text is Indonesian** — user-facing labels/messages in Bahasa Indonesia (e.g. tabs "Saran", "Laporan"; view "Latihan").
- The `ui/` Vite build outputs to `../static/` (i.e. `stock-api/static/`), which Go's `http.FileServer` serves at the root.
