# AGENTS.md

Agent guidance for the **IDX Stock Analyzer** (Go backend + React/Vite frontend for
Indonesian stock technical analysis). All application code lives in `stock-api/`.

For architecture, routes, data layout, and conventions, see [`CLAUDE.md`](./CLAUDE.md)
and [`README.md`](./README.md). This file documents how to **set up, run, and test** the
environment (including on Cursor Cloud).

## Prerequisites

- **Go 1.24.1** — pinned in `stock-api/go.mod`. If the system `go` is older (e.g. 1.22),
  the default `GOTOOLCHAIN=auto` transparently downloads and uses `go1.24.1` on the first
  `go build`/`go test` (requires network). No manual Go install is needed.
- **Node.js 18+ / npm** — for the Vite frontend.

## Setup

Run all commands from `stock-api/` unless noted.

```bash
# Backend deps + build (auto-fetches go1.24.1 toolchain if needed)
cd stock-api
go build -o stock-api.exe .        # binary; *.exe is gitignored

# Frontend deps — the --legacy-peer-deps flag is REQUIRED
cd ui
npm install --legacy-peer-deps     # react-apexcharts vs React 18 peer-dep conflict
```

## Run

Dev mode is one script (backend `:1111` + Vite `:5173` with hot reload):

```bash
# Windows
stock-api/start-dev.bat

# Linux / macOS / Cursor Cloud
stock-api/start-dev.sh
```

Then open http://localhost:5173

Production (single server): `cd stock-api/ui && npm run build`, then `stock-api/start.bat` (Windows) or `./stock-api.exe` from `stock-api/` (serves API + built UI on `:1111`).

## Test / Lint

```bash
cd stock-api
go vet ./...          # vet (clean)
go test ./...         # unit tests (analysis/ + handlers/)
go build ./...        # compile-check all packages
```
The frontend defines no lint/test scripts (only `dev`, `build`, `preview`).

## Key facts & gotchas

- **No database.** All persistence is file-based under `stock-api/data/` (gitignored).
  `data/`, `static/`, `reports/`, and `ui/node_modules/` are gitignored — do not commit them.
- **Only external dependency is Yahoo Finance** (`query1.finance.yahoo.com` v8 chart API).
  It is the sole network call and is required to fetch/update price data. Symbols are stored
  without the `.JK` suffix (the fetcher re-adds it); IHSG uses `^JKSE`.
- **`npm install` must use `--legacy-peer-deps`** (react-apexcharts peer conflict).
- **Ports:** backend `:1111` (API + static UI), Vite dev `:5173` (proxies `/api`).
- **API envelope:** every endpoint returns `{ "success": bool, "message": "...", "data": {...} }`.
- **`.env`** is loaded best-effort at startup but no env vars are currently consumed.
- The PDF-upload "Claude terminal" flow (`handlers/reports.go`) is Windows-only and not
  required for the core product; it is a no-op on Linux.

## Cursor Cloud specific instructions

- The environment has network access, so `GOTOOLCHAIN=auto` successfully downloads
  `go1.24.1` on the first build, and Yahoo Finance fetches succeed. Verified end-to-end:
  `POST /api/stocks {"symbol":"BBCA"}` fetched 243 OHLCV points and analysis endpoints
  (`/signals`, `/advisor`, `/ai`) returned valid data.
- Recommended smoke test after setup (backend on :1111):
  ```bash
  curl -s http://localhost:1111/api/stocks
  curl -s -X POST http://localhost:1111/api/stocks -H 'Content-Type: application/json' -d '{"symbol":"BBCA"}'
  curl -s http://localhost:1111/api/analysis/BBCA/advisor
  ```
- For UI verification use the dev server on :5173 (or the built UI on :1111). The Watchlist
  is the default landing view; click a stock card to open the detail panel (Overview /
  📊 Chart / 🧭 Saran tabs), and use "＋ Tambah Saham" to add a symbol.
- Long-running servers: from `stock-api/` run `./start-dev.sh` (Linux/Cloud) or `start-dev.bat` (Windows). The script is idempotent if `:1111` / `:5173` are already up. Do not kill them if the user may want to keep testing.
- User-facing UI text is in Bahasa Indonesia.
