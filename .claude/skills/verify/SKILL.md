---
name: verify
description: Build, run, and drive the IDX Stock Analyzer app to verify UI/backend changes end-to-end.
---

# Verify IDX Stock Analyzer

## Build + serve
```bash
cd stock-api/ui && npm run build        # outputs to ../static/
cd stock-api && ./stock-api.exe         # serves API + static on :1111
```
Port 1111 often already has a running instance (bind error = fine): `http.FileServer` serves `./static` from disk, so a fresh `npm run build` is live immediately — no server restart needed for UI-only changes. Backend changes DO need rebuild (`go build -o stock-api.exe .`) + restart.

## Drive the UI (headless browser)
Playwright MCP is extension-bridge mode and usually unavailable. Working recipe: `npm i playwright-core` in scratchpad, launch with `channel: 'chrome'` (Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`), headless, viewport 1440×900.

Navigation flow:
1. `goto http://localhost:1111` → lands on Watchlist view.
2. Click a stock symbol card, e.g. `getByText('BBCA', { exact: true })`. **Gotcha:** `/^[A-Z]{4}$/` matches the IHSG header badge first — use explicit symbols. Known-present: BBCA, AALI, ANTM, ACES, ADRO.
3. Tabs: `getByText('📊 Chart')`, `'📋 Overview'`, `'🧭 Saran'`, `'📄 Laporan'`, etc.
4. Back to stock list: sidebar `getByText('Watchlist', { exact: true })`.

## Gotchas
- Chart (lightweight-charts) = `<canvas>` elements; assert `.apexcharts-canvas` count is 0 on Chart tab (ApexCharts remains only in Indicators tab).
- Chart pane is 500px; with YesterdayCard visible (1W range) the volume area falls below a 900px viewport fold — scroll or use full-page screenshot before concluding volume is missing.
- `favicon.ico` 404s on every load — pre-existing console noise, ignore.
- Yahoo data contains zero-volume flat bars (O=H=L=C, V=0) on some dates — data quirk, not a render bug.
- Wheel zoom: `page.mouse.wheel(0, -240)` over the canvas; pan: mouse down + move + up.
