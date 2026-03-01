# IDX Stock Analyzer

Platform analisis teknikal saham Bursa Efek Indonesia (IDX) — full stack dengan backend **Go** dan frontend **React**. Data diambil langsung dari Yahoo Finance, diproses dengan berbagai indikator teknikal, dan ditampilkan dalam dashboard interaktif berbasis chart.

---

## Fitur Utama

### Analisis Teknikal
| Indikator | Keterangan |
|-----------|------------|
| SMA / EMA | Simple & Exponential Moving Average (periode bebas) |
| RSI (14) | Relative Strength Index — overbought/oversold |
| MACD (12,26,9) | Moving Average Convergence Divergence |
| Bollinger Bands | %B, Bandwidth, Upper/Middle/Lower |
| Stochastic (14,3) | %K dan %D |
| ATR (14) | Average True Range |
| OBV | On-Balance Volume |
| ADX (14) | Average Directional Index + ±DI |
| VWAP | Volume-Weighted Average Price (kumulatif harian) |
| Parabolic SAR | Stop and Reverse |
| Ichimoku Cloud | Tenkan, Kijun, Span A/B, Chikou |
| Fibonacci | Retracement 0%–100% dari high/low periode |
| Pivot Points | R1/R2/R3, S1/S2/S3 (standard) |
| **AMD** | **Accumulation · Manipulation · Distribution** (Smart Money) |

### Smart Money — Model AMD
Deteksi otomatis siklus AMD berdasarkan konsep ICT/Smart Money Concepts:
- **Accumulation** — range harga sempit < 5%, smart money diam-diam membangun posisi
- **Manipulation** — stop hunt / liquidity grab menembus batas range lalu berbalik
- **Distribution** — pergerakan nyata berlawanan arah manipulasi

Setiap pola dilengkapi skor **Confidence (0–100)**, level range, level manipulasi, dan besar move distribusi.

### Fitur Lainnya
- **Sinyal Komposit** — BUY / SELL / NEUTRAL dari gabungan 5 indikator dengan breakdown per indikator
- **AI Analisa** — narasi teknikal rule-based otomatis
- **Backtest** — simulasi strategi MA crossover pada data historis
- **Risk Calculator** — kalkulasi lot, stop-loss (1×ATR / 2×ATR), target R:R
- **Screener** — filter saham berdasarkan sinyal, tren, RSI, volume ratio, dan %change
- **Portfolio** — tracking posisi dengan P&L real-time (disimpan di localStorage)
- **Price Alerts** — notifikasi in-app untuk kondisi harga, RSI, dan sinyal
- **Comparison** — overlay chart normalized multi-saham (maks 5)
- **Market Overview** — ringkasan semua saham dengan ranking sinyal
- **Session Prep** — persiapan sesi trading dengan deteksi pola candlestick
- **Export CSV** — download data historis OHLCV
- **Upload Laporan** — simpan laporan analisis PDF per saham
- **Update Incremental** — fetch hanya data baru dari tanggal terakhir
- **Auto-refresh** — refresh data setiap 15 menit (opsional)

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Go 1.21+, Gorilla Mux |
| Data source | Yahoo Finance v8 chart API |
| Storage | File JSON (`./data/`) — tanpa database |
| Frontend | React 18, Vite |
| Charts | ApexCharts (react-apexcharts) |
| Styling | Tailwind CSS v3 |

---

## Struktur Direktori

```
stock-api/
├── main.go                  # Entry point, routing (Gorilla Mux)
├── models/                  # StockPrice, StockData
├── fetcher/                 # Yahoo Finance API client
├── storage/                 # Baca/tulis ./data/*.json (RWMutex)
├── analysis/
│   ├── analysis.go          # SMA, EMA, RSI, MACD, Bollinger, Stoch,
│   │                        # ATR, OBV, ADX, VWAP, SAR, Ichimoku, Fib, Pivot
│   └── amd.go               # AMD (Accumulation·Manipulation·Distribution)
├── handlers/
│   ├── handlers.go          # CRUD saham + incremental update
│   ├── analysis.go          # Semua endpoint analisis teknikal
│   ├── backtest.go          # Backtest MA crossover
│   ├── ai.go                # AI analisa rule-based
│   └── reports.go           # Upload/list/delete laporan PDF
├── data/                    # *.json per saham (di-gitignore)
├── static/                  # Output build React (di-gitignore)
└── ui/
    ├── src/
    │   ├── App.jsx           # Global state, routing panel
    │   ├── api.js            # Fetch wrapper semua endpoint
    │   ├── utils.js          # Formatter, Tailwind helpers, APEX_DARK
    │   └── components/
    │       ├── Sidebar.jsx        # Daftar saham + search + Update All
    │       ├── StockPanel.jsx     # Container tab per saham
    │       ├── Overview.jsx       # Kartu harga, 52-week, MA, RSI bar
    │       ├── ChartTab.jsx       # Candlestick + SMA overlay + volume
    │       ├── Indicators.jsx     # RSI, MACD, Bollinger, Stoch, OBV
    │       ├── AMD.jsx            # AMD Smart Money indicator
    │       ├── Signals.jsx        # Badge sinyal + breakdown tabel
    │       ├── RiskCalc.jsx       # Kalkulator risiko & lot
    │       ├── Screener.jsx       # Filter & ranking semua saham
    │       ├── Portfolio.jsx      # Tracker posisi & P&L
    │       ├── AlertsPanel.jsx    # Price & signal alerts
    │       ├── Comparison.jsx     # Overlay chart multi-saham
    │       ├── MarketOverview.jsx # Ringkasan pasar
    │       ├── SessionPrep.jsx    # Persiapan sesi trading
    │       ├── AddStockModal.jsx  # Form tambah saham baru
    │       └── ReportUpload.jsx   # Upload laporan PDF
    ├── tailwind.config.js    # Custom tv-* color palette
    └── vite.config.js        # Proxy /api/* → :8080
```

---

## Instalasi & Menjalankan

### Prasyarat
- [Go 1.21+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/) + npm

### Clone & Setup

```bash
git clone <repo-url>
cd stock-api
```

### Backend

```bash
# Install dependencies
go mod download

# Build
go build -o stock-api.exe .

# Jalankan (port 8080)
./stock-api.exe
```

### Frontend

```bash
cd ui

# Install — wajib --legacy-peer-deps (react-apexcharts vs React 18)
npm install --legacy-peer-deps

# Dev server (port 5173, proxy /api/* ke :8080)
npm run dev

# Build produksi → output ke ../static/
npm run build
```

### Mode Development (dua terminal)

```bash
# Terminal 1
./stock-api.exe

# Terminal 2
cd ui && npm run dev
```

Buka `http://localhost:5173`

### Mode Produksi (satu server)

```bash
cd ui && npm run build
cd ..
./stock-api.exe        # Serve UI + API di :8080
```

Buka `http://localhost:8080`

---

## API Reference

Semua endpoint mengembalikan envelope:
```json
{ "success": true, "message": "", "data": { ... } }
```

### Saham

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/stocks` | Daftar semua saham |
| POST | `/api/stocks` | Tambah saham baru `{ symbol, from }` |
| GET | `/api/stocks/{symbol}` | Data OHLCV historis (`?limit=`, `?from=`, `?to=`) |
| POST | `/api/stocks/{symbol}/update` | Update incremental ke Yahoo Finance |
| POST | `/api/stocks/update-all` | Update semua saham sekaligus |
| DELETE | `/api/stocks/{symbol}` | Hapus saham |
| GET | `/api/stocks/{symbol}/latest` | Bar terakhir saja |
| GET | `/api/stocks/{symbol}/export.csv` | Export OHLCV sebagai CSV |

### Analisis

| Endpoint | Keterangan |
|----------|------------|
| `/api/analysis/{symbol}/summary` | Ringkasan lengkap (harga, changes, MA, RSI, MACD, Bollinger) |
| `/api/analysis/{symbol}/indicators` | Snapshot semua indikator terkini |
| `/api/analysis/{symbol}/signals` | Sinyal komposit + breakdown per indikator |
| `/api/analysis/{symbol}/sma?period=20` | SMA series |
| `/api/analysis/{symbol}/ema?period=20` | EMA series |
| `/api/analysis/{symbol}/rsi?period=14` | RSI series |
| `/api/analysis/{symbol}/macd` | MACD + Signal + Histogram series |
| `/api/analysis/{symbol}/bollinger` | Upper/Middle/Lower + %B + Bandwidth |
| `/api/analysis/{symbol}/stochastic` | %K dan %D series |
| `/api/analysis/{symbol}/atr?period=14` | ATR series |
| `/api/analysis/{symbol}/obv` | OBV series |
| `/api/analysis/{symbol}/adx?period=14` | ADX + ±DI series |
| `/api/analysis/{symbol}/vwap` | VWAP kumulatif |
| `/api/analysis/{symbol}/sar` | Parabolic SAR series |
| `/api/analysis/{symbol}/ichimoku` | 5 komponen Ichimoku |
| `/api/analysis/{symbol}/fibonacci?lookback=100` | Level Fibonacci retracement |
| `/api/analysis/{symbol}/pivots` | Pivot points standard |
| `/api/analysis/{symbol}/amd?accum=10&lookback=200` | **AMD Smart Money** |
| `/api/analysis/{symbol}/ai` | Narasi analisis teknikal otomatis |
| `/api/analysis/{symbol}/backtest` | Backtest MA crossover |
| `/api/overview` | Overview semua saham (parallel) |
| `/api/session` | Data persiapan sesi trading |

---

## Konfigurasi

### Environment Variables (`.env`)

```env
# Opsional — tidak diperlukan untuk fitur dasar
ANTHROPIC_API_KEY=sk-ant-...   # Jika AI analisa menggunakan Claude API
```

### Tailwind Custom Colors (`ui/tailwind.config.js`)

| Token | Hex | Penggunaan |
|-------|-----|------------|
| `tv-bg` | `#131722` | Background utama |
| `tv-card` | `#1e222d` | Card / panel |
| `tv-hover` | `#2a2e39` | Hover state |
| `tv-border` | `#2a2e39` | Border |
| `tv-text` | `#d1d4dc` | Teks utama |
| `tv-muted` | `#787b86` | Teks sekunder |
| `tv-green` | `#26a69a` | Positif / bullish |
| `tv-red` | `#ef5350` | Negatif / bearish |
| `tv-blue` | `#2196f3` | Aksen / aktif |
| `tv-yellow` | `#f59e0b` | Warning / netral |
| `tv-purple` | `#9c6bff` | AI / highlight |
| `tv-input` | `#2a2e39` | Input background |

---

## Cara Menambah Saham

1. Klik **＋ Tambah Saham** di sidebar
2. Masukkan kode saham IDX (tanpa `.JK`) — contoh: `BBCA`, `TLKM`, `GOTO`
3. Opsional: tentukan tanggal mulai historis (format `YYYY-MM-DD`)
4. Klik **Tambah** — data langsung diunduh dari Yahoo Finance

> Sufiks `.JK` ditambahkan otomatis oleh fetcher. Saham disimpan tanpa sufiks.

---

## Catatan Penting

- **IDX only** — Yahoo Finance memerlukan sufiks `.JK` untuk saham Indonesia
- **Harga dalam Rupiah** — bilangan bulat, tanpa desimal
- **Tanpa database** — data tersimpan di `./data/{SYMBOL}.json` per saham
- **Concurrency** — write lock menggunakan `sync.RWMutex` di `storage/storage.go`
- **`--legacy-peer-deps`** wajib saat `npm install` karena konflik peer dependency `react-apexcharts` dengan React 18
- **Chart alignment** — series indikator (SMA, Bollinger, dll) punya lebih sedikit titik dari harga raw; alignment dilakukan via `date → value Map` dengan `null` untuk tanggal yang tidak ada datanya

---

## Development Notes

```bash
# Compile check tanpa menghasilkan binary
go build ./...

# Vet code
go vet ./...

# Cek semua route yang terdaftar
grep "HandleFunc" main.go
```

---

## Lisensi

Proyek ini untuk keperluan pribadi / edukasi. Data harga dari Yahoo Finance tunduk pada syarat layanan Yahoo Finance.
