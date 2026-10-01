# Arsitektur

Monolit satu proses: Go menyajikan `/api/*` dan file statis hasil build React dari `./static`. Tidak ada database, tidak ada scheduler, tidak ada layanan eksternal selain Yahoo Finance.

Semua kode di `stock-api/`.

---

## Alur request

```
                      ┌────────────────────── stock-api.exe (:1111) ─────────────────────────┐
                      │                                                                      │
 Browser ── /api/* ───┼─▶ logger ─▶ basicAuth ─▶ mux ─▶ handlers/ ─┬─▶ analysis/  (murni)    │
                      │                                            ├─▶ storage/   (RWMutex)  │
 Browser ── /     ────┼─▶ http.FileServer("./static")               └─▶ fetcher/   (Yahoo)    │
                      │                                                                      │
                      └──────────────────────────────────────────────────────────────────────┘
                                                                          │
                                              ./data/{SYMBOL}.json  ◀─────┘
```

`main.go` merangkai middleware (`logger(basicAuth(r))`), menjalankan `seedDataDir()`, lalu mendaftarkan seluruh route di satu subrouter `/api`.

### Paket

| Paket | Tanggung jawab |
|---|---|
| `models/` | `StockPrice` (OHLCV + `date`) dan `StockData` (symbol, exchange, last_updated, prices) |
| `fetcher/` | Klien Yahoo Finance v8 chart. `toYahooSymbol()` menambah `.JK`, kecuali simbol berawalan `^` (indeks) atau sudah mengandung titik. Wajib kirim `User-Agent` — Yahoo memblokir request tanpa itu. Bar dengan OHLC `nil` dilewati |
| `storage/` | Baca/tulis `{DataDir}/{SYMBOL}.json`, dilindungi satu `sync.RWMutex` proses. `DataDir` dari env `DATA_DIR` (default `./data`) |
| `analysis/` | Matematika indikator murni — tanpa I/O, tanpa HTTP. Input `[]models.StockPrice`, output slice `Point{date,value}` atau struct verdict |
| `handlers/` | Parsing HTTP, validasi, envelope JSON. Semua state file diakses lewat `storage.DataDir` |

### Isi `analysis/`

| File | Isi |
|---|---|
| `analysis.go` | SMA, EMA, RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku, Fibonacci, Pivots |
| `decision.go` | **Decision engine** — skoring multi-faktor berbobot (lihat di bawah) |
| `advisor.go` | Pohon keputusan price-action, verdict + checklist Bahasa Indonesia |
| `decision_backtest.go`, `advisor_backtest.go` | Replay sinyal masing-masing engine atas histori tersimpan |
| `fvg.go` | Fair Value Gap — deteksi gap 3-bar, lacak status `active` / `filled` / `inverted` |
| `amd.go` | Siklus Accumulation–Manipulation–Distribution (Wyckoff / ICT) |
| `bandar.go` | Bandarmology atas data broker summary (`BrokerDay`) |
| `adline.go`, `mfi.go`, `cmf.go` | Indikator aliran volume |

Test ada di `analysis/*_test.go` (advisor, decision, decision backtest, FVG) dan `handlers/advisor_screen_test.go`.

---

## Dua mesin keputusan

Repo ini punya **dua** generator verdict yang jalan berdampingan. Keduanya dipakai UI, keduanya punya endpoint dan backtest sendiri.

### 1. Decision engine (`analysis/decision.go`)

Skoring berbobot. Setiap faktor dinilai 0–100 (50 = netral), dikalikan bobot tetap, dijumlahkan jadi satu skor:

| Faktor | Bobot |
|---|---|
| Market Structure (HH/HL vs LH/LL) | 23% |
| Trend EMA (multi-timeframe) | 16% |
| Money Flow (CMF + MFI) | 10% |
| Volume | 10% |
| Support / Resistance | 10% |
| Bandarmology | 8% |
| Momentum (RSI + MACD) | 7% |
| FVG Confluence | 7% |
| Trend Strength (ADX) | 4% |
| Candlestick | 3% |
| Risk / Reward | 2% |

Output: `signal` (`STRONG_BUY` · `BUY` · `WAIT` · `SELL` · `STRONG_SELL`), `confidence` numerik, tren long/medium/short, zona support & resistance, zona entry, stop, take profit bertingkat, `probability` bullish/sideways/bearish, dan `components[]` — breakdown per faktor beserta catatannya.

Tiga sifat yang penting dipahami:

- **Gating.** Kalau faktor-faktor saling bertentangan tajam sehingga confidence rendah, signal diturunkan ke `WAIT` alih-alih mengeluarkan BUY/SELL yang tidak benar-benar didukung komponennya. Alasan penurunan diisi ke field `note`.
- **Konstanta terkalibrasi, bukan universal.** Knob seperti `srNearMaxPct` disetel terhadap perilaku IDX (gap crash meninggalkan swing level jauh di atas harga). Kalau engine mulai salah menilai setup yang kelewat stretched, knob inilah yang diputar — bukan bobotnya.
- **Level dibulatkan ke tick IDX.** `tickSize()` / `roundTick()` memastikan entry, stop, dan target berupa harga yang benar-benar bisa diorder.

Varian `DecisionEngineWithBroker()` menambahkan skor bandarmology kalau `data/broker/{SYMBOL}.json` ada; tanpa itu faktor tersebut netral (50) dan catatannya berbunyi "data broker tidak tersedia".

### 2. Advisor (`analysis/advisor.go`)

Pohon if/else price-action, bukan skoring. Output `verdict` (`STRONG_BUY` · `BUY` · `WAIT` · `AVOID` · `REDUCE`), satu baris `action` Bahasa Indonesia, `reasons[]`, `scenarios[]` ("kalau harga tembus X maka …"), dan `checklist[]` 7 poin yang tiap itemnya pass/fail dengan catatan.

Advisor sengaja dipertahankan karena keluarannya bisa dibaca sebagai penalaran, bukan angka: berguna untuk memahami kenapa sebuah setup ditolak. Decision engine yang dipakai screener pasar.

### Screener (`handlers/advisor_screen.go`)

`GET /api/advisor/screen` menjalankan decision engine ke **seluruh** simbol tersimpan, lalu merangking hasilnya. Gate default: turnover ≥ 2 miliar rupiah, ditambah filter opsional `min_rr`, `min_confidence`, `syariah`, `include_low_rr`. Tiap baris hasil membawa entry/stop/target siap pakai.

---

## Data & penyimpanan

| Path | Isi | Penulis |
|---|---|---|
| `{DATA_DIR}/{SYMBOL}.json` | Time series OHLCV; `prices` selalu urut tanggal (lex-sort benar untuk `YYYY-MM-DD`) | `storage` (RWMutex) |
| `{DATA_DIR}/broker/{SYMBOL}.json` | Broker summary untuk bandarmology | `handlers/broker.go` (RWMutex sendiri) |
| `{DATA_DIR}/fundamentals/{SYMBOL}.json` | Analisa fundamental JSON | Terminal Claude Code yang dipicu upload PDF; tab Laporan hanya membaca |
| `{DATA_DIR}/reports/{SYMBOL}/{timestamp}_{file}.pdf` | Laporan riset yang diupload | `handlers/reports.go` |

**`storage.List()` men-glob `{DataDir}/*.json` dan menganggap setiap hasilnya ticker.** File JSON asing di direktori itu akan muncul sebagai saham palsu dan gagal di-unmarshal pada setiap `GET /api/stocks`. Karena itu `data/portfolio.json` masuk `.gitignore` dan `.dockerignore`.

### Update inkremental

`doUpdate()` (`handlers/handlers.go`) membaca tanggal tersimpan terakhir, meminta Yahoo mulai `lastDate+1`, mendedup berdasarkan string tanggal, menambahkan, lalu mengurutkan ulang. `POST /api/stocks/update-all` melakukannya untuk seluruh watchlist.

Tidak ada scheduler. Update dipicu manual dari tombol **Update All** di UI, atau lewat curl.

### Daftar syariah

`handlers/syariah.go` memuat konstituen ISSI sebagai map hardcoded — snapshot Daftar Efek Syariah OJK. DES di-review ±2× setahun (Mei & November), jadi **daftar ini harus diedit manual lalu binary di-rebuild.** Simbol yang tidak ada di map dianggap non-syariah.

---

## Frontend

React 18 + Vite. `ui/` build ke `../static/`, yang disajikan `http.FileServer` di root.

```
App.jsx                  ← state global (stocks[], selected, view, toast), navigasi history
│                          view: today | stock | overview | session | advisor | portfolio | practice
├── Sidebar.jsx           ← rail nav (Today/Market/Session/Screen/Port/Drill) + daftar saham + search
├── DecisionBoard.jsx     ← (today) landing: ringkasan keputusan hari ini
├── StockPanel.jsx        ← (stock) container tab; chart compact selalu mounted di atas tab
│   ├── Overview.jsx      ← kartu perubahan, range 52 minggu, volume, MA, bar RSI
│   ├── ChartTab.jsx      ← candlestick lightweight-charts + overlay FVG & Fibonacci (primitive custom)
│   ├── Indicators.jsx    ← RSI, MACD, Bollinger, Stochastic, ATR, OBV, ADX, VWAP, SAR, Ichimoku (ApexCharts)
│   ├── Advisor.jsx       ← tab "Saran": verdict + statistik backtest
│   ├── RiskCalc.jsx      ← position sizing / stop loss
│   └── ReportUpload.jsx  ← tab "Laporan": upload PDF + FundamentalAnalysis.jsx
├── MarketOverview.jsx    ← (overview) + IHSGChart.jsx
├── SessionPrep.jsx       ← (session) persiapan sesi
├── AdvisorScreen.jsx     ← (advisor) screener pasar
├── Portfolio.jsx         ← (portfolio) holdings, format laporan broker IDX
├── Practice.jsx          ← (practice) game prediksi candle
├── AlertsPanel.jsx       ← modal; export useAlertChecker (poll 5 menit)
├── IHSGBadge.jsx         ← badge header, poll /api/ihsg tiap 60s
└── AddStockModal.jsx
```

Semua view kecuali `StockPanel` di-code-split lewat `React.lazy` + `Suspense`; tab berat (ChartTab, Indicators) juga lazy. Navigasi terdaftar ke history browser lewat `pushState`/`popstate`, jadi tombol back, Alt+←/→, dan Backspace bekerja.

**`api.js`** — wrapper fetch tipis. Melempar `Error` kalau `success: false`, dan memberi pesan khusus saat response bukan JSON (biasanya berarti backend lama belum punya route baru → rebuild binary). Namespace: `api.stocks.*`, `api.analysis.*`, `api.broker.*`, plus `api.overview()`, `api.advisorScreen()`, `api.session()`, `api.ihsg()`.

**`utils.js`** — `fmt.price/pct/vol`, helper kelas Tailwind `colorOf`/`signalStyle`, tema `APEX_DARK`.

### Dua library chart

Bukan kecelakaan:

- **`lightweight-charts`** dipakai `ChartTab.jsx` — zoom/pan candlestick 60fps, plus dua primitive custom (`chart/FVGZonesPrimitive.js`, `chart/FibZonesPrimitive.js`) untuk menggambar zona langsung di canvas chart.
- **ApexCharts** dipakai panel `Indicators.jsx` — chart garis kecil di mana performa interaksi tidak penting.

Untuk ApexCharts, animasi **dimatikan** dan event wheel-zoom di-throttle rAF. Menyalakan ulang animasi membawa kembali lag berat saat zoom/pan.

### Penyelarasan series chart

Series indikator (SMA, Bollinger, dll) punya titik lebih sedikit daripada harga mentah. Komponen membangun `Map` `date → value` dari data indikator, lalu memetakan seluruh array harga dengan `map[p.date] ?? null`, sehingga semua series ApexCharts punya panjang sama.

### Warna Tailwind

Namespace `tv` di `ui/tailwind.config.js`: `tv-bg` (#131722), `tv-card` (#1e222d), `tv-hover`, `tv-border`, `tv-text`, `tv-muted`, `tv-green`, `tv-red`, `tv-blue`, `tv-yellow`, `tv-purple`, `tv-input`.

---

## Trade-off & batasan yang diketahui

| Keputusan | Konsekuensi |
|---|---|
| **File JSON, bukan database** | Nol dependensi operasional dan mudah di-inspect/di-commit, tapi tidak ada query, tidak ada transaksi, dan hanya OHLCV yang punya lock. `broker/`, `fundamentals/`, `reports/` mengasumsikan pemakai tunggal |
| **`data/` ikut di-commit** | Image membawa snapshot ~4 MB sehingga deploy pertama langsung berisi — tapi setiap "Update All" menulis ulang ~75 file terlacak, jadi working tree praktis selalu kotor dan `git diff` perlu difilter path |
| **Auth gagal-terbuka** | `basicAuth` hanya aktif kalau `AUTH_USER` **dan** `AUTH_PASS` terisi. Kalau salah satu kosong, server jalan terbuka dan hanya mencetak peringatan kuning saat startup — bukan `log.Fatal`. Lupa `fly secrets set` berarti seluruh route, termasuk DELETE dan upload, terbuka |
| **Upload PDF memicu `os/exec`** | `openClaudeTerminal()` membuka terminal Claude Code untuk menganalisa PDF dan menulis `data/fundamentals/{SYMBOL}.json`. Digerbangi `runtime.GOOS == "windows"` sehingga no-op di server — karena upload yang memicu exec adalah jalur eksekusi kode remote. Jangan pernah jalankan versi Windows-nya dengan port terbuka |
| **Endpoint AI lokal** | `/api/analysis/{symbol}/ai` berbasis aturan, tanpa panggilan LLM eksternal. Narasi dibentuk dari sinyal, indikator, deteksi pola, dan teks laporan PDF yang diekstrak |
| **Tanpa scheduler** | Data hanya sesegar "Update All" terakhir. Di Fly dengan `auto_stop_machines`, tidak ada proses latar yang menyegarkan apa pun |
| **Yahoo Finance tak resmi** | Tanpa kontrak, tanpa SLA, rate limit tak terdokumentasi. `User-Agent` wajib. Perubahan bentuk response akan merusak `fetcher` tanpa peringatan |
| **Daftar syariah manual** | Snapshot hardcoded, butuh edit + rebuild setiap review DES |
| **Dua mesin keputusan** | Decision engine dan Advisor bisa tidak sepakat untuk simbol yang sama. Itu disengaja (beda metode), tapi berarti ada dua jalur yang harus dipelihara dan dua backtest yang harus dibaca |
