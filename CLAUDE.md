# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**IDX Stock Analyzer** — Full-stack technical analysis platform for Indonesian (IDX) stocks. Go backend (Gorilla Mux) fetches Yahoo Finance data and runs 15+ technical indicators, a weighted decision engine (the single source of verdicts), and a local AI write-up; React + Vite frontend renders a decision-board landing page, charts, decision verdicts, market screener, portfolio, and a candle-prediction practice game.

All code lives in `stock-api/`. Run all commands from that directory unless noted.

## Commands

### Backend (Go) — run from `stock-api/`
```bash
go build -o stock-api.exe .   # Build binary
./stock-api.exe               # Run server on :1111 (also serves UI from ./static)
go build ./...                # Compile-check all packages
go vet ./...                  # Vet code
go test ./...                 # All tests (analysis/ + handlers/)
go test ./analysis/ -run TestDecision   # Single test by name (analysis tests read frozen OHLCV from analysis/testdata/, never ./data)
```

### Research — engine report card, run from `stock-api/`
```bash
go run ./research/rapor                                   # indicator report card (120 indicators, A–F) → research/rapor/<date>.json + forward-test log research/forward/<date>.json (~1.5 min)
go run ./research/rapor -universe sehat                   # same on "saham sehat" (top 40 turnover/day with price ≥ Rp500, calmer half by ATR%; ~20 stocks) → research/rapor/sehat/ + research/forward/sehat/; -sehatn 30|50 = size sensitivity (scratch, no log)
go run ./research/l1 BBCA TLKM ADRO > research/out/l1_app.json && python research/l1_check.py research/out/l1_app.json   # L1: app indicator math vs TA-Lib (needs pip ta-lib)
go run ./research/blindtest analyze  -cutoff 2026-11-30   # freeze verdicts from bars <= cutoff → research/frozen/<cutoff>.json (refuses to overwrite)
go run ./research/blindtest validate -cutoff 2025-11-28   # score a frozen file against what happened (K1–K6 criteria inside the file)
go run ./research/blindtest export                        # engine on every bar since 2020 → research/out/export.csv (~1.5 min)
python research/panel.py && python research/research.py all   # pandas pattern research, TRAIN 2020–23 / VALID 2024–Nov25 / TEST Dec25+
python research/ml.py probe|freeze|validate <date>             # numpy ridge walk-forward; freeze = "rawan gerak besar" list → research/frozen/bigmove-<date>.json
```

`main.go` calls `loadEnv(".env")` on startup (best-effort, never overrides real env). Env vars are listed under Deployment below — note `DATA_DIR` must be a real env var (`storage.DataDir` initialises before `.env` loads).

### Frontend (React + Vite) — run from `stock-api/ui/`
```bash
npm install
npm run dev                      # :5173, proxies /api/* to :1111
npm run build                    # outputs to ../static/ (served by Go)
npm test                         # Vitest: money.test.js (RiskCalc/Portfolio math, MoneyInput), practiceScore.test.js
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
| `analysis/analysis.go` | Pure indicator math: SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP (rolling 20), SAR, Ichimoku (spans displaced +26, chikou −26), Fibonacci, Pivots. Verified against a textbook/Pine reference (2026-10-22) — `indicators_test.go` pins ADX (Wilder), VWAP, Ichimoku |
| `analysis/amd.go` | Accumulation–Manipulation–Distribution (Wyckoff-style) phase detector |
| `analysis/adline.go`, `mfi.go`, `cmf.go` | Volume-flow indicators: A/D Line, Money Flow Index, Chaikin Money Flow |
| `analysis/bandar.go` | Bandarmology (broker accumulation/distribution) analysis over broker-summary data |
| `analysis/helpers.go` | Shared price-action helpers incl. `CandlePattern` — the one candle detector (engine, `/ai`, `/session` via `candleInfo`) |
| `analysis/decision.go` | **Decision engine** — weighted multi-factor scoring (market structure, EMA trend, money flow, volume, S/R, FVG, bandarmology…); 5-level signal, confidence, entry zone, tiered TP. Low-confidence results downgrade to WAIT. `GateRegime`: when IHSG < SMA50 a BUY/STRONG_BUY becomes WAIT (note `RegimeGateNote`) and every stock's plan (entry/stop/TP/R:R) is zeroed with `gated: true`; score kept so calibration still matches. **Only source of verdicts** — the old Advisor tree and `calcSignals` were removed (2026-10-20) because they contradicted it. `DecisionEngineWithBroker` folds in broker data |
| `analysis/decision_backtest.go` | Backtests the decision engine per stock; exits via `planOutcome` (shared with calibration — same entry/stop/TP1/20-bar timeout rules). `planOutcome` charges `RoundTripCostPct` (0.4% = 0.15 buy + 0.25 sell), so every P&L/win figure in the app is after costs |
| `analysis/calibration.go` | Replays the decision engine over all stocks (no look-ahead, broker excluded) and records real outcomes per score bucket × IHSG regime (close vs SMA50; `^JKSE` fetched since 2020 so every bar has a regime). The engine replay runs in parallel over all CPUs (~15s for 92 stocks × 6.5y); `handlers/calibration.go` serves the stale table while rebuilding in the background, and boot warms it: plan = entry next open, WIN if TP1 before stop within 20 bars. Also the **projection**: per regime × 5/10/20-bar horizon × score bucket, % of cases ending Bullish/Sideways/Bearish (move beyond 0.5 × ATR% × √h) + p10–p90 range — the only bull/side/bear odds in the app (`Projection.jsx`) |
| `analysis/fvg.go` | Fair Value Gap detection (also feeds decision engine confluence) |
| `analysis/levels.go` | **Key Levels** (chart button "S/R Auto") — auto support/resistance named R1..Rn / S1..Sn: trigger (close ≥2× in 15 bars above price), consolidation (4–8 bars, close range ≤0.8 ATR), unfilled gap (remaining part only), recent low (+double-bottom note), base (longest stay below price, P25–P75 of closes), 52-week low, swing fillers (max 2). Merged when <0.35 ATR apart, dropped when >30% or <0.25 ATR from close, snapped to IDX tick. Pinned against a frozen HRTA fixture in `levels_test.go`. Not used by the decision engine |
| `analysis/valuation.go` | 3-year PBV band (mean ±1/±2 SD of price ÷ book value per share; USD reporters converted via `USDIDR=X`) + quality screen from the Astronacci "5 Undervalued Stock" report: listing >10y, dividend yield ≥5%, avg ROE >12%, net income always positive (Yahoo has ~4 annual reports). `undervalue` = passes all four AND PBV below its mean. Feeds the engine as factor **Valuasi** (10%, technical weights scaled to 90%) only when quality passes; otherwise the factor is absent and the score equals the plain engine — so calibration (replayed without valuation) still measures the same model |
| `handlers/handlers.go` | Stock CRUD, update-all, latest, CSV export; helpers `canonicalSymbol`, `respond`, `loadPrices`, `doUpdate`, `updateAll` (guarded by `updateMu`) |
| `handlers/autoupdate.go` | `StartAutoUpdate` (called from `main`): boot refresh of stale stocks only + 15-min refresh in market hours |
| `handlers/analysis.go` | All `/api/analysis/*` endpoints (calls `analysis.*`) |
| `handlers/advisor.go` | `/decision` and `/decision-backtest` for one symbol (file name is historical) |
| `handlers/advisor_screen.go` | `GET /api/advisor/screen` — runs the **decision engine** (not Advisor) across all stocks concurrently, returns ranked candidates (`?mode=buy&min_turnover=&syariah=true&undervalue=true`); each row carries `valuation` |
| `handlers/calibration.go` | In-memory calibration cache (rebuilt when newest stored bar or stock count changes; `^JKSE` via `jkseBars` for regime). Attached as `calibration` to `/decision` and every screen row; screen also returns `regime` |
| `handlers/syariah.go` | Syariah set = OJK DES Periode I 2026 Lampiran I (622 stocks, `isSyariah`); `syariahValidUntil` drives `syariah_stale` in the screen response + UI warning. Replace from the next DES PDF (±1 Dec / ±1 Jun) |
| `handlers/indices.go` | IDX30/LQ45 sets + `indexValidUntil` (BEI re-evaluates quarterly, announced ~late Jan/Apr/Jul/Oct) |
| `handlers/indices.go` | Hardcoded IDX30/LQ45 constituent sets (`isIDX30`/`isLQ45`) → `idx30`/`lq45` on stock list + screen rows; screen filter `?index=idx30\|lq45`. BEI re-evaluates quarterly (Feb/May/Aug/Nov) — edit manually |
| `handlers/ai.go` | `GET /api/analysis/{symbol}/ai` — **rule-based local** narrative (no external LLM); verdict/stop/targets/R:R from `DecisionEngineWithBroker`, indicators for context, `candleInfo` pattern, uploaded reports text |
| `handlers/ihsg.go` | `GET /api/ihsg` — Jakarta Composite Index; owns `jkseBars()`, the single `^JKSE` fetch (2y, cached 60s) shared with calibration regime + auto-update holiday check |
| `handlers/broker.go` | Broker-summary data CRUD under `./data/broker/{SYMBOL}.json`; includes `/mock` generator for test data. Mock files carry `"source": "mock"` and `LoadBrokerDays` ignores them, so synthetic flows never reach the decision engine |
| `handlers/reports.go` | PDF research reports — list/upload/delete under `./data/reports/{SYMBOL}/`; uses `github.com/ledongthuc/pdf` for text extraction (consumed by AI handler). **Gotcha:** upload also spawns a Claude Code terminal (`openClaudeTerminal`) that analyzes the PDF and writes `./data/fundamentals/{SYMBOL}.json` |
| `handlers/valuation.go` | Valuation cache `data/valuation/{SYMBOL}.json`, refreshed weekly in the auto-update goroutine (`FetchLongHistory` 3y + `FetchFundamentals`). Also owns **`decide(sym, prices)`** — the one call every handler uses for a verdict (broker + valuation folded in, then `analysis.GateRegime` with the `^JKSE` regime on the stock's last bar; `^JKSE` unavailable → no gate): `/decision`, screen, `/ai`, overview, session |
| `research/` | **Engine report card** (not part of the server). `blindtest/` (Go, own `main`): `analyze` freezes the verdicts the engine would have given on a past cutoff (calibration rebuilt from bars ≤ cutoff), `validate` scores them later, `export` replays every bar. `frozen/` is committed evidence (2025-11-28 = first blind test); `out/` is gitignored scratch. `panel.py` + `research.py` (pandas) = pattern research. Findings 2026-11-02: score rank IC ≈ 0 for picking stocks; only the regime gate and the projection bands held out-of-sample. `ml.py` (2026-11-03): direction unpredictable, vol/drawdown = ATR14 alone, only "big move" (|20d ret| > 2σ) beats ATR — under forward test |
| `research/rapor/` | **Rapor Indikator** (`docs/rapor-indikator-plan.md`, own `main`): 48 buy signals + 46 value indicators (rank IC; incl. Yahoo FY2022+ fundamentals, cache `research/out/fund/`) + 24 market/macro/calendar timing conditions, using the app's own `analysis.*` code. Market-neutral excess (vs all liquid stocks same date), total return, T+1 open, 0.4% cost, ARB/ARA locks, 20-bar dedupe, month-block bootstrap + Benjamini-Hochberg q, random entry p95, 10-slot portfolio vs IHSG, ±30% parameter neighbours, sector/liquidity/regime breakdown → grade A–F. Each run also appends the **forward-test log** `research/forward/<date>.json` (hash-chained, final candles only: after 16:15 WIB and data saved after the close) and scores it. 2026-11-20 (after review fixes: 20k bootstrap, direction picked without TEST): all-stocks 1 of 120 significant (VIX > 25, timing), no buy signal beats IHSG as a portfolio |
| `research/forward_daily.cmd` | Windows Task Scheduler job "IDX Rapor uji maju" (Mon–Fri 17:00): starts the backend if down, update-all, both Rapor runs → appends the forward-test logs (from `forwardStart` 2026-11-20). Logs still need a manual commit |
| `research/l1/` + `research/l1_check.py` | Layer 1: dumps app indicators, compares with TA-Lib (60/60 within 2-decimal rounding after the SAR flip-day fix) |
| `handlers/rapor.go` | `GET /api/research/rapor[?universe=sehat]` — serves the newest `research/rapor/*.json` (or `sehat/`); `RAPOR_DIR` overrides; Dockerfile copies the JSON. 2026-11-23 sehat run ("tenang relatif"): EBITDA÷EV grade A, PBV/PER low + VIX > 25 grade B, technical signals still D — candidates until the forward test confirms |
| `handlers/fundamental.go` | Read/write arbitrary JSON to `./data/fundamentals/{SYMBOL}.json` |
| `handlers/dividends.go` | Dividend calendar: Yahoo dividend history for all tracked stocks (`fetcher.FetchDividends`, cached 24h in `data/dividends/yahoo.json`) → `riwayat` rows + `perkiraan` (last 12 months projected +1y, specials >3× median skipped). Manual official announcements in `data/dividends/calendar.json` suppress nearby projections |

**Routes** (registered in `main.go`):

- Stocks: `GET/POST /api/stocks`, `POST /api/stocks/update-all`, `POST /api/stocks/backfill` (extend history back to `historyStart` = 2020-01-01; new stocks start there too), `GET/DELETE /api/stocks/{symbol}`, `GET /api/stocks/{symbol}/latest`, `POST /api/stocks/{symbol}/update`, `GET /api/stocks/{symbol}/export.csv`
- Reports: `GET/POST /api/stocks/{symbol}/reports`, `DELETE /api/stocks/{symbol}/reports/{id}`
- Fundamental: `GET/POST /api/stocks/{symbol}/fundamental`
- Analysis (`/api/analysis/{symbol}/*`): `summary`, `indicators`, `sma`, `ema`, `rsi`, `macd`, `bollinger`, `stochastic`, `atr`, `obv`, `adx`, `vwap`, `sar`, `ichimoku`, `fibonacci`, `fvg`, `levels`, `avwap`, `pivots`, `amd`, `adline`, `cmf`, `mfi`, `decision`, `decision-backtest`, `ai`
- Dividends: `GET /api/dividends` (`?refresh=1` re-fetches Yahoo), `POST /api/dividends` (replaces manual entries)
- Market: `GET /api/overview`, `GET /api/advisor/screen`, `GET /api/calibration`, `GET /api/session`, `GET /api/ihsg`
- Research: `GET /api/research/rapor`
- Broker: `GET/DELETE /api/broker/{symbol}`, `GET /api/broker/{symbol}/summary`, `POST /api/broker/{symbol}/mock`

**Incremental fetching** (`doUpdate`): reads last saved date, re-requests from it (refreshes a partial intraday candle), merges via `mergePrices` (dedupe by date, re-sort). History depth = `historyStart` (2020-01-01). Every ingest path runs `dropHolidayFillers`: Yahoo pads IDX holidays with flat zero-volume bars (e.g. 14–15 & 27–28 May 2026); bars like that on a date `^JKSE` did not trade are dropped (illiquid no-trade days are kept). `POST /api/stocks/backfill` also cleans stored files.

**Symbols** stored without `.JK` (e.g. `BBCA`). `canonicalSymbol()` strips `.JK` from user input; fetcher re-adds it internally. `ValidateSymbol` middleware (on `/api`) and `AddStock` reject anything but `[A-Za-z0-9]{1,12}(.JK)?`, so `{symbol}` can never carry path separators into `filepath.Join`. Persisted JSON goes through `storage.WriteJSON` (temp file + rename).

**Server limits** — `http.Server` timeouts (WriteTimeout 10 min because update-all is sequential) and a 40 MB body cap (`limitBody`).

**API envelope** — every endpoint returns `{ "success": bool, "message": "...", "data": {...} }`. Helper `respond(w, status, ok, msg, data)`.

### Frontend (React)

Views (in `App.jsx`): `today` (DecisionBoard, default) | `stock` (StockPanel) | `overview` | `session` | `advisor` | `portfolio` | `dividends` | `practice` | `kamus` | `rapor` (Rapor.jsx — indicator report card, helpers in `rapor.js`/`rapor.test.js`). All views except StockPanel are code-split via `React.lazy` + `Suspense`; heavy StockPanel tabs (ChartTab, Indicators) are also lazy. View is mirrored into `history.state`; legacy names `watchlist`/`home` are migrated to `today`/`stock`.

```
App.jsx                       ← global state (stocks[], selected, view, toast); mounts useAlertChecker + IHSGBadge
├── Sidebar.jsx               ← slim nav hub: stock list + search + "Update All" + view switcher
├── DecisionBoard.jsx         ← (view=today, DEFAULT) landing board of tracked stocks
├── StockPanel.jsx            ← (view=stock) tab container; lazy per-tab data fetch with TabLoading spinner
│   ├── Overview.jsx          ← change cards, 52-week range, volume, MA, RSI bar
│   ├── ChartTab.jsx          ← lightweight-charts candlestick + SMA + volume; FVG/Fib zones drawn via custom primitives in `components/chart/`
│   ├── Indicators.jsx        ← RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku
│   ├── Advisor.jsx           ← "Saran" tab: decision verdict banner + decision-backtest stats
│   ├── RiskCalc.jsx          ← position sizing / stop-loss helper
│   └── ReportUpload.jsx      ← "Laporan" tab: PDF upload/list/delete; renders FundamentalAnalysis.jsx
├── MarketOverview.jsx        ← (view=overview) market-wide overview; renders IHSGChart.jsx
├── SessionPrep.jsx           ← (view=session) trading-session prep
├── AdvisorScreen.jsx         ← (view=advisor) market-wide advisor screener (ranked BUY candidates)
├── Portfolio.jsx             ← (view=portfolio) holdings tracker; input form matches IDX broker reporting format
├── Dividends.jsx             ← (view=dividends) dividend calendar by month; ⭐ + est. payout for Portfolio holdings (reads its localStorage)
├── Practice.jsx              ← (view=practice) "Latihan" candle-prediction practice game
├── AlertsPanel.jsx           ← modal; exports useAlertChecker (5-min poll, mounted in App)
├── IHSGBadge.jsx             ← header badge; polls /api/ihsg every 60s (backend caches 60s)
└── AddStockModal.jsx         ← POST /api/stocks (symbol + optional from-date)
```

**`api.js`** — fetch wrapper; throws on `success: false`; namespaces: `api.stocks.*`, `api.analysis.*`, `api.dividends.*`, plus top-level `api.overview()`, `api.advisorScreen()`, `api.session()`, `api.ihsg()`, `api.calibration()`. Only endpoints the UI calls have wrappers.

**`money.js`** — pure money math (`positionSize`, `averagePrice`, `positionPnL`, `portfolioTotals`) used by RiskCalc + Portfolio; tested in `money.test.js`.

**`utils.js`** — `fmt.price/pct/vol`, `colorOf`/`signalStyle` Tailwind helpers, `LW_BASE` shared lightweight-charts options (Indicators, Practice). `signalLabel` is the one display mapping for signals — descriptive, not imperative (STRONG_BUY→"Tren naik kuat", BUY→"Tren naik", WAIT→"Tunggu", SELL→"Tren turun", STRONG_SELL→"Tren turun kuat"); API values stay BUY/SELL. `GATED_PLAN` is the text shown where a `gated` plan would be; `calibShort` leads with avg P&L/trade, win rate second.

**Charting libs** — `lightweight-charts` v5 only: ChartTab (series primitives for zone overlays; TradingView-style: OHLC legend top-left, D/W/M timeframe resampled client-side in `chart/bars.js` (+ SMA/RSI/MACD, tested in `bars.test.js`), RSI/MACD as lower panes, log scale; FVG/AVWAP/Projection are daily-only), Indicators (3 charts with synced pan/zoom), Practice (time axis hidden). IHSGChart embeds the TradingView widget.

**Chart alignment (Indicators)** — indicator series have fewer points than raw prices (warm-up). `align()` maps the full price date list through a `date → value` Map and emits whitespace points (`{ time }`) for missing dates, so every chart has the same logical indexes and the pan/zoom sync maps bar-to-bar.

### Data & storage

| Path | Content |
|---|---|
| `./data/{SYMBOL}.json` | OHLCV time series — `StockData` struct, `prices` always sorted by date string (lex-sort is correct for `YYYY-MM-DD`) |
| `./data/valuation/` | Weekly PBV-band cache per stock (gitignored; rebuilt in the background on a fresh volume) |
| `./data/dividends/` | `yahoo.json` (auto cache) + `calendar.json` (manual announcements). Subdir on purpose: `storage.List` treats every `data/*.json` as a stock |
| `./data/fundamentals/{SYMBOL}.json` | Fundamental analysis JSON — written by the Claude Code terminal spawned on PDF upload; Laporan tab only reads it |
| `./data/reports/{SYMBOL}/{timestamp}_{filename}.pdf` | Uploaded PDF research reports; AI handler reads text from these |
| `./data/broker/{SYMBOL}.json` | Broker-summary (bandarmology) data; `/mock` endpoint can generate test data |

No database. Concurrent writes to OHLCV files are protected by `sync.RWMutex` in `storage/storage.go`. Other dirs (`fundamentals/`, `reports/`, `broker/`) are written without an in-process lock — handlers assume single-user usage.

### Tailwind custom colors

Defined in `ui/tailwind.config.js` under the `tv` namespace: `tv-bg` (#131722), `tv-card` (#1e222d), `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`.

## Deployment (Fly.io)

Single container: the Go binary serves both `/api/*` and the built UI from `./static`.

```bash
fly launch --no-deploy   # first time only; fly.toml is already committed
fly volumes create idx_data --region sin --size 1
fly secrets set AUTH_USER=... AUTH_PASS=...
fly deploy
```

| File | Role |
|---|---|
| `stock-api/Dockerfile` | 3 stages: node builds UI → `go build` → alpine runtime |
| `stock-api/fly.toml` | app config; volume `idx_data` mounted at `/data`, port 8080 |
| `stock-api/.dockerignore` | keeps `data/reports/` PDFs and `node_modules` out of the image |

**Env vars** (real env only — `.env` is read in `main()`, after `storage` has already initialised):

| Var | Default | Notes |
|---|---|---|
| `DATA_DIR` | `./data` | root for OHLCV, `broker/`, `fundamentals/`, `reports/` |
| `SEED_DIR` | *(unset)* | when set and `DATA_DIR` is empty, `seedDataDir()` copies the image snapshot in — first boot on a fresh volume |
| `PORT` | `1111` | Fly sets 8080 |
| `AUTH_USER` / `AUTH_PASS` | *(unset)* | both set ⇒ HTTP basic auth on every route; unset ⇒ open locally, but **refuses to start on Fly** (`FLY_APP_NAME` set) |

**Deployment-specific behaviour:**
- `data/` is committed to git (~19 MB OHLCV, daily bars since 2020) so the image ships a snapshot. `data/reports/` stays gitignored.
- `openClaudeTerminal` (PDF upload → Claude CLI) is gated to `runtime.GOOS == "windows"`; on the server it's a no-op, since an upload-triggered `exec` is remote code execution.
- In-process auto-update (`handlers/autoupdate.go`): at boot refreshes only stale stocks (outside market hours a stock is fresh when its newest bar is the latest `^JKSE` session and the file was written after that day's 16:15 close), then every 15 min on IDX trading days 09:00–16:15 WIB (holiday = `^JKSE` has no bar today). Shares `updateMu` with `POST /api/stocks/update-all` (endpoint waits, auto tick skips). On Fly it only runs while the machine is awake, and a cold start outside market hours only pulls stocks missing the latest final candle.
## Key constraints

- **IDX only** — Yahoo Finance `.JK` suffix; prices are integers (Indonesian Rupiah, no decimals). IHSG uses `^JKSE`.
- **No database** — file-based persistence only. OHLCV is `RWMutex`-protected; `fundamentals/`, `reports/`, `broker/` assume single-user.
- **PDF dependency** — `github.com/ledongthuc/pdf` (text extraction for uploaded research reports).
- **AI endpoint is local, upload flow is not** — `/api/analysis/{symbol}/ai` is rule-based (no external LLM call). But PDF upload spawns a Claude Code terminal via `os/exec` (`reports.go`): requires `claude` CLI installed, Windows-only (`wt`/`cmd start`), and assumes localhost single-user — do not expose the server to a network.
- **UI text is Indonesian** — user-facing labels/messages in Bahasa Indonesia (e.g. tabs "Saran", "Laporan"; view "Latihan").
- The `ui/` Vite build outputs to `../static/` (i.e. `stock-api/static/`), which Go's `http.FileServer` serves at the root.
