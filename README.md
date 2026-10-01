# IDX Stock Analyzer

Platform analisis teknikal saham Bursa Efek Indonesia (IDX). Backend **Go** menarik OHLCV dari Yahoo Finance dan menghitung 20+ indikator, sebuah *decision engine* berbobot mengubahnya jadi verdict yang bisa ditindak (entry, stop, target, probabilitas), frontend **React** menampilkannya sebagai chart, screener pasar, portfolio, dan latihan baca candle.

Satu binary menyajikan API **dan** UI. Tanpa database — semua state di file JSON.

```
Yahoo Finance ──▶ fetcher ──▶ ./data/{SYMBOL}.json ──▶ analysis ──▶ handlers ──▶ React UI
```

---

## Quick start

**Prasyarat:** [Go 1.24+](https://go.dev/dl/), [Node 18+](https://nodejs.org/)

```bash
cd stock-api

# 1. Build UI (output ke ../static/, disajikan Go di root)
cd ui && npm install --legacy-peer-deps && npm run build && cd ..

# 2. Build & jalankan backend
go build -o stock-api.exe .
./stock-api.exe
```

Buka **http://localhost:1111**. Repo sudah membawa snapshot OHLCV di `stock-api/data/`, jadi watchlist langsung terisi — klik **Update All** di sidebar untuk menarik bar terbaru.

### Mode development (hot-reload)

```bash
# Terminal 1 — API di :1111
cd stock-api && ./stock-api.exe

# Terminal 2 — UI di :5173, proxy /api/* ke :1111
cd stock-api/ui && npm run dev
```

Buka **http://localhost:5173**.

### Tambah saham

Sidebar → **Add** → kode IDX tanpa `.JK` (`BBCA`, `TLKM`, `ANTM`), opsional tanggal mulai `YYYY-MM-DD`. Default histori 1 tahun. Sufiks `.JK` ditambahkan fetcher, simbol disimpan tanpa sufiks.

Atau via API:

```bash
curl -X POST localhost:1111/api/stocks -d '{"symbol":"BBCA","from":"2024-01-01"}'
```

---

## Fitur

| Area | Isi |
|---|---|
| **Indikator** | SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, Anchored VWAP, Parabolic SAR, Ichimoku, Fibonacci, Pivot Points |
| **Volume flow** | A/D Line, Money Flow Index, Chaikin Money Flow |
| **Smart money** | AMD (Accumulation–Manipulation–Distribution), Fair Value Gap (FVG) dengan status active/filled/inverted, Bandarmology dari broker summary |
| **Decision engine** | 11 faktor berbobot → signal 5 level + confidence + zona entry + stop + take profit bertingkat + distribusi probabilitas. Breakdown per faktor ikut dikirim |
| **Advisor** | Pohon keputusan price-action dengan checklist 7 poin dan narasi Bahasa Indonesia |
| **Backtest** | Backtest decision engine, advisor, dan composite signal atas histori tersimpan |
| **Screener** | `/api/advisor/screen` — jalankan engine ke seluruh watchlist, ranking kandidat, filter turnover / R:R / confidence / syariah |
| **Pasar** | Market overview, session prep, badge IHSG (`^JKSE`, cache 60s) |
| **Lainnya** | Portfolio tracker, risk calculator, price alert, upload laporan PDF + analisa fundamental, export CSV, game latihan prediksi candle |

**View UI:** Today · Market · Session · Screen · Port · Drill, plus panel per-saham (Overview, Chart, Indikator, Saran, Risk, Laporan).

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Alur request, decision engine vs advisor, model storage, trade-off dan batasan yang diketahui |
| [docs/api.md](docs/api.md) | Referensi 50+ endpoint: parameter, contoh response nyata, error code |
| [docs/deploy.md](docs/deploy.md) | Runbook deploy Fly.io, seeding volume, auth, rollback |
| [CLAUDE.md](CLAUDE.md) | Peta repo untuk Claude Code |

---

## Perintah

```bash
cd stock-api

go build -o stock-api.exe .   # build binary
go build ./...                # compile-check semua paket
go vet ./...                  # vet
go test ./...                 # unit test (analysis + handlers)

cd ui
npm run dev                   # dev server :5173
npm run build                 # produksi → ../static/
```

---

## Batasan penting

- **IDX saja** — Yahoo Finance butuh sufiks `.JK`; harga Rupiah bilangan bulat tanpa desimal. IHSG pakai `^JKSE`.
- **Tanpa database** — `./data/{SYMBOL}.json`. OHLCV dilindungi `sync.RWMutex`; `broker/`, `fundamentals/`, `reports/` mengasumsikan pemakai tunggal.
- **`--legacy-peer-deps` wajib** saat `npm install` — konflik peer dep `react-apexcharts` dengan React 18.
- **Jangan ekspos ke jaringan tanpa auth.** Upload PDF memicu `os/exec` yang membuka terminal Claude Code (Windows saja) — itu jalur eksekusi kode remote kalau server terbuka. Set `AUTH_USER` **dan** `AUTH_PASS` sebelum deploy; lihat [docs/deploy.md](docs/deploy.md).
- **`DATA_DIR` hanya boleh berisi file saham.** `storage.List()` menganggap setiap `*.json` di situ sebagai ticker.
- **Teks UI Bahasa Indonesia** — label dan pesan untuk pengguna pakai bahasa Indonesia.

## Lisensi

Untuk keperluan pribadi / edukasi. Data harga dari Yahoo Finance tunduk pada syarat layanan Yahoo Finance. Output aplikasi ini bukan rekomendasi investasi.
