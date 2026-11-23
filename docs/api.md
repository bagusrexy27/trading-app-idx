# Referensi API

Base URL lokal: `http://localhost:1111/api` (port dari env `PORT`, default `1111`).

Semua contoh di dokumen ini adalah response nyata dari binary, diambil untuk simbol `BBCA` per 2026-09-18, dengan array panjang dipotong (`…`).

---

## Envelope

Setiap endpoint JSON mengembalikan bentuk yang sama:

```json
{ "success": true, "message": "", "data": { } }
```

`message` dan `data` di-`omitempty`, jadi response sukses biasanya hanya `success` + `data`, dan response error hanya `success` + `message`.

Frontend (`ui/src/api.js`) melempar `Error(message)` untuk setiap `success: false`, jadi handler error di UI tidak perlu memeriksa status HTTP.

### Error code

| Status | Kapan | Contoh `message` |
|---|---|---|
| `400` | Body atau parameter tidak valid | `symbol is required`, `invalid JSON body` |
| `404` | Simbol belum dilacak, atau tanggal anchor tak ada | `stock ZZZZ not found — add it first with POST /api/stocks` |
| `409` | Simbol sudah dilacak (khusus `POST /stocks`) | `BBCA is already tracked — use POST /api/stocks/BBCA/update to fetch new data` |
| `422` | Simbol ada tapi belum punya bar harga, atau parameter wajib kosong | `no price data available yet` |
| `500` | Kegagalan I/O, unmarshal, atau upstream Yahoo | pesan error asli |

```bash
$ curl -s localhost:1111/api/analysis/ZZZZ/decision
{"success":false,"message":"stock ZZZZ not found — add it first with POST /api/stocks"}
```

### Auth

Kalau `AUTH_USER` **dan** `AUTH_PASS` di-set, setiap route (termasuk UI statis) dilindungi HTTP basic auth:

```bash
curl -u user:pass localhost:1111/api/stocks
```

Kalau salah satu kosong, server jalan tanpa auth dan mencetak peringatan saat startup. Lihat [deploy.md](deploy.md).

### Konvensi

- **Simbol tanpa `.JK`** — `BBCA`, bukan `BBCA.JK`. Input di-uppercase dan sufiks `.JK` dilepas (`canonicalSymbol`); fetcher menambahkannya kembali ke Yahoo. IHSG memakai `^JKSE`.
- **Harga bilangan bulat Rupiah** — tanpa desimal. Nilai indikator tetap float.
- **Tanggal `YYYY-MM-DD`**, dan diurutkan sebagai string (benar untuk format ini).
- **`limit`** pada endpoint series memotong dari **ujung terbaru** — `limit=3` berarti 3 bar terakhir.
- Parameter integer yang tidak valid atau ≤ 0 diabaikan dan kembali ke nilai default.

---

## Saham

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/stocks` | Daftar semua saham yang dilacak + ringkasan |
| `POST` | `/stocks` | Tambah saham dan tarik histori awal |
| `GET` | `/stocks/{symbol}` | Time series OHLCV |
| `DELETE` | `/stocks/{symbol}` | Hapus file saham |
| `GET` | `/stocks/{symbol}/latest` | Hanya bar terakhir |
| `POST` | `/stocks/{symbol}/update` | Update inkremental dari Yahoo |
| `POST` | `/stocks/update-all` | Update inkremental seluruh watchlist |
| `GET` | `/stocks/{symbol}/export.csv` | Unduh OHLCV sebagai CSV (bukan JSON) |

### `GET /stocks`

```json
{"success":true,"data":[
  {"symbol":"AADI","exchange":"JKT","last_updated":"2026-09-18","data_points":328,
   "oldest_date":"2025-05-14","newest_date":"2026-09-18","last_close":12225,
   "change_pct":-1.2121212121212122,
   "sparkline":[9800,10250,10000,"…",12375,12225],
   "syariah":true},
  "…"
]}
```

`sparkline` berisi maksimal 20 close terakhir, untuk chart mini di sidebar. `syariah` dicek terhadap map ISSI hardcoded di `handlers/syariah.go`.

### `POST /stocks`

```bash
curl -X POST localhost:1111/api/stocks \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BBCA","from":"2025-01-01"}'
```

| Field | Wajib | Default |
|---|---|---|
| `symbol` | ya | — |
| `from` | tidak | 1 tahun lalu (`YYYY-MM-DD`) |

### `GET /stocks/{symbol}`

| Param | Default | Keterangan |
|---|---|---|
| `from` | — | Ambil hanya bar dengan `date >= from` |
| `to` | — | Ambil hanya bar dengan `date <= to` |
| `limit` | semua | N bar **terakhir** setelah filter tanggal |

```json
{"success":true,"data":{
  "symbol":"BBCA","exchange":"JKT","last_updated":"2026-09-18","count":300,
  "prices":[{"date":"2026-09-18","open":6325,"high":6350,"low":6225,"close":6225,"volume":62228800}]
}}
```

### `POST /stocks/update-all`

Menjalankan update inkremental untuk setiap simbol dan mengembalikan satu baris hasil per saham (jumlah bar baru atau pesan error per simbol). Server juga menjalankan refresh yang sama secara otomatis (saat start, lalu tiap 15 menit di jam bursa — lihat `handlers/autoupdate.go`). Kalau refresh otomatis sedang berjalan, request ini menunggu sampai selesai.

```bash
curl -X POST localhost:1111/api/stocks/update-all
```

---

## Series indikator

Semua endpoint di bawah punya bentuk sama: array titik `{date, value}` plus metadata parameter yang dipakai.

```bash
$ curl -s 'localhost:1111/api/analysis/BBCA/rsi?limit=3'
```
```json
{"success":true,"data":{
  "symbol":"BBCA","period":14,"count":3,
  "overbought":70,"oversold":30,
  "data":[{"date":"2026-09-16","value":44.53},
          {"date":"2026-09-17","value":45.75},
          {"date":"2026-09-18","value":40.89}]
}}
```

| Endpoint | Parameter (default) |
|---|---|
| `/analysis/{symbol}/sma` | `period=20`, `limit` |
| `/analysis/{symbol}/ema` | `period=20`, `limit` |
| `/analysis/{symbol}/rsi` | `period=14`, `limit` |
| `/analysis/{symbol}/macd` | `fast=12`, `slow=26`, `signal=9`, `limit` |
| `/analysis/{symbol}/bollinger` | `period=20`, `mult=2` (float), `limit` |
| `/analysis/{symbol}/stochastic` | `k=14`, `d=3`, `limit` |
| `/analysis/{symbol}/atr` | `period=14`, `limit` |
| `/analysis/{symbol}/obv` | `limit` |
| `/analysis/{symbol}/adx` | `period=14`, `limit` |
| `/analysis/{symbol}/vwap` | `period` (default 20) · `limit` — VWAP **rolling** N hari (bukan kumulatif); untuk VWAP sejak tanggal tertentu pakai `avwap` |
| `/analysis/{symbol}/avwap` | `anchor` (tanggal `YYYY-MM-DD`, **wajib**) |
| `/analysis/{symbol}/sar` | `limit` |
| `/analysis/{symbol}/ichimoku` | `limit` — 5 komponen |
| `/analysis/{symbol}/adline` | `limit` |
| `/analysis/{symbol}/cmf` | `period=20`, `limit` |
| `/analysis/{symbol}/mfi` | `period=14`, `limit` |

Endpoint multi-nilai tetap mengembalikan satu array `data`, tapi tiap titiknya membawa field tambahan alih-alih `value`:

| Endpoint | Field per titik |
|---|---|
| `macd` | `macd`, `signal`, `histogram` |
| `bollinger` | `upper`, `middle`, `lower`, `bandwidth`, `percent_b` |
| `stochastic` | `k`, `d` |
| `adx` | `adx`, `plus_di`, `minus_di` |
| `ichimoku` | Tenkan, Kijun, Span A/B, Chikou — **sudah digeser seperti di chart**: Span A/B di tanggal X dihitung 26 bar sebelumnya (awan yang terlihat di X); Chikou di X = close 26 bar sesudahnya (kosong untuk 26 bar terakhir) |

`avwap` mengembalikan `422` kalau `anchor` kosong (`parameter anchor (YYYY-MM-DD) wajib diisi`) dan `404` kalau tanggal anchor tidak ada di data tersimpan.

---

## Level & zona

| Endpoint | Parameter | Isi |
|---|---|---|
| `/analysis/{symbol}/fibonacci` | `lookback=100` | Level retracement 0–100% dari high/low periode |
| `/analysis/{symbol}/pivots` | — | Pivot standard R1–R3, S1–S3 |
| `/analysis/{symbol}/fvg` | `lookback=200`, `min_gap` (float, persen) | Fair Value Gap |
| `/analysis/{symbol}/amd` | `accum=10`, `lookback=200` | Siklus Accumulation–Manipulation–Distribution |

### `GET /analysis/{symbol}/fvg`

```json
{"success":true,"data":{"active":[
  {"id":22,"type":"bear","status":"inverted","top":6425,"bottom":6050,
   "date":"2026-04-24","inverted_date":"2026-07-17"},
  {"id":39,"type":"bull","status":"active","top":5975,"bottom":5875,"date":"2026-07-03"},
  "…"
]}}
```

`status`: `active` (gap belum disentuh) · `filled` (harga menutupnya) · `inverted` (ditembus lalu berbalik peran). `type` `bull`/`bear` menunjukkan arah gap terbentuk.

---

## Snapshot & sinyal

### `GET /analysis/{symbol}/summary`

Satu panggilan untuk seluruh kartu Overview.

```json
{"success":true,"data":{
  "symbol":"BBCA","exchange":"JKT","last_updated":"2026-09-18","total_bars":369,
  "price":{"date":"2026-09-18","open":6325,"high":6350,"low":6225,"close":6225,"volume":62228800},
  "changes":{"1d":{"change":-125,"pct":-1.97},"5d":{"change":-100,"pct":-1.58},
             "1m":{"change":-75,"pct":-1.19},"3m":{"change":-50,"pct":-0.8}},
  "52_week":{"high":8750,"low":4820,"pct_from_high":-28.86,"pct_from_low":29.15},
  "moving_averages":{"sma_20":6483.75,"sma_50":6388.5,"sma_200":6817.13,"trend":"neutral"},
  "indicators":{"rsi_14":40.89,
    "macd":{"macd":-11.45,"signal":32.93,"histogram":-44.38},
    "bollinger":{"date":"2026-09-18","upper":6773.26,"middle":6483.75,"lower":6194.24,
                 "bandwidth":8.93,"percent_b":5.31}},
  "volume":{"current":62228800,"avg_20d":120117030,"ratio_vs_avg":0.52}
}}
```

### `GET /analysis/{symbol}/indicators`

Snapshot nilai **terkini** semua indikator dalam satu objek — tanpa series historis.

### `GET /analysis/{symbol}/ai`

Narasi rule-based lokal. Vonis, stop, target, dan R/R diambil dari decision engine (sama dengan `/decision`); pola candle dari `analysis.CandlePattern`, detektor yang sama dengan engine dan `/session`.

Narasi teknikal **berbasis aturan, lokal** — tidak memanggil LLM eksternal. Dibentuk dari sinyal, indikator, deteksi pola candle, dan teks laporan PDF yang sudah diupload untuk simbol tersebut.

---

## Saran

### `GET /analysis/{symbol}/decision`

Verdict dari `analysis.Saran` (sejak 2026-11-23). Contoh ASII, 23 Nov 2026:

```json
{"success":true,"data":{"symbol":"ASII","syariah":false,"close":5400,"decision":{
  "signal":"BUY","confidence":0,"score":0,
  "trend":{"long":"Weak Bearish","medium":"Bullish","short":"Bullish","overall":"Weak Bullish"},
  "support":[5300,5175,5025],
  "resistance":[5800],
  "entry_zone":{"buy":[5400,5400],"ideal":5400},
  "stop_loss":5075,
  "take_profit":[{"price":6050,"portion":"100%"}],
  "risk_reward":2,
  "components":[
    {"name":"Tren pendek naik","score":100,"weight":0,"note":"EMA10 vs EMA20: Bullish"},
    {"name":"Tren menengah naik","score":100,"weight":0,"note":"EMA20 vs EMA50: Bullish"},
    {"name":"Belum terlalu jauh","score":100,"weight":0,"note":"0.9 ATR di atas EMA20 (syarat 0–1.5)"},
    {"name":"RSI wajar","score":100,"weight":0,"note":"RSI 59 (syarat 50–65)"}
  ],
  "note":"IHSG di bawah MA50 — secara historis saran Tren naik di kondisi ini rata-rata rugi. Lihat rekam jejak di bawah."
},
"calibration":{"regime":"down","signal":"BUY","horizon":20,"samples":4942,"win_rate":25.84,"avg_pnl_pct":-0.97,"reliable":true,"stock":{"…":"…"},"projection":["…"]}}}
```

`signal`: `BUY` (Tren naik: keempat `components` bernilai 100) · `WAIT` (Tunggu) · `SELL` (Tren turun: tren pendek & menengah Bearish; tanpa rencana, `stop_loss` 0). `score`/`confidence` selalu 0 (aturan checklist, bukan skor). Rencana = close, stop −1,5 ATR, target +3 ATR. `note` muncul pada `BUY` saat IHSG < MA50. `valuation` (PBV band) ikut sebagai info bila ada.

### `GET /analysis/{symbol}/decision-backtest`

Memutar ulang saran Tren naik atas seluruh histori tersimpan. Aturan exit = kalibrasi (`planOutcome`): masuk open hari berikutnya, keluar di stop (gap tembus = harga open) atau target, atau close setelah 20 bar (timeout), setelah biaya 0,4%. Trade tidak tumpang tindih.

```json
{"success":true,"data":{"symbol":"BBCA","backtest":{
  "trades":[
    {"entry_date":"2025-10-28","entry_price":8350,"exit_date":"2025-10-29","exit_price":8425,
     "signal":"BUY","result":"WIN","pnl_pct":0.9,"risk_reward":1.5},
    {"entry_date":"2026-09-02","entry_price":6650,"exit_date":"2026-09-10","exit_price":6475,
     "signal":"BUY","result":"LOSS","pnl_pct":-2.63,"risk_reward":4.33},
    "…"
  ],
  "total":13,"wins":8,"losses":4,"timeouts":1,"open_trades":0,
  "win_rate":69.23,"avg_win_pct":1.58,"avg_loss_pct":-1.62,
  "expectancy_pct":0.6,"avg_rr":1.85
}}}
```

`result`: `WIN` · `LOSS` · `TIMEOUT` · `OPEN` (data habis sebelum selesai). `win_rate` = wins / total (timeout dihitung bukan menang), `expectancy_pct` = rata-rata P&L termasuk timeout — definisi sama dengan `calibration`. Ini backtest sederhana atas data harian tersimpan — tanpa slippage, tanpa pengecekan likuiditas. Pakai sebagai pembanding relatif antar simbol, bukan sebagai ekspektasi keuntungan.

---

## Screener

### `GET /advisor/screen`

Menjalankan Saran ke seluruh simbol tersimpan. Filter fakta, diurutkan menurut `turnover_bn` (bukan peringkat "terbaik").

| Param | Default | Keterangan |
|---|---|---|
| `mode` | `buy` | `buy` = hanya Tren naik, `all` = semua |
| `min_turnover` | `2` | Turnover minimum dalam miliar rupiah |
| `syariah` | `false` | `true` = hanya daftar syariah (DES OJK) |
| `index` | — | `idx30` / `lq45` |
| `undervalue` | `false` | `true` = hanya saham `valuation.undervalue` (PBV di bawah rata-rata 3 tahun + lolos 4 saringan kualitas) |

```json
{"success":true,"data":{
  "mode":"buy","matched":7,"scanned":127,"regime":"down",
  "min_turnover":2,"syariah":false,"index":"","undervalue":false,
  "results":[
    {"symbol":"ASII","close":5400,"signal":"BUY",
     "trend":{"long":"Weak Bearish","medium":"Bullish","short":"Bullish","overall":"Weak Bullish"},
     "entry_ideal":5400,"stop":5075,"target":6050,"risk_reward":2,
     "turnover_bn":276.2,"syariah":false,"idx30":true,"lq45":true,
     "note":"IHSG di bawah MA50 — …","calibration":{"…":"…"}},
    "…"
  ]
}}
```

Endpoint ini menghitung Saran untuk setiap saham dalam satu request, jadi ini yang paling berat di seluruh API. Naikkan `min_turnover` untuk mempersempit hasil.

---

## Pasar

| Endpoint | Keterangan |
|---|---|
| `GET /overview` | Ringkasan seluruh watchlist (harga, sinyal, tren) — dihitung paralel per simbol |
| `GET /session` | Persiapan sesi: anatomi candle terakhir per simbol (persen body, wick atas/bawah), perubahan harga, volume vs rata-rata 20 hari, plus pola candle hasil `detectPattern` |
| `GET /ihsg` | Jakarta Composite Index (`^JKSE`) |

### `GET /ihsg`

```json
{"success":true,"message":"ok","data":{
  "symbol":"^JKSE","exchange":"JKT",
  "last":6430.80810546875,"prev_close":6462.43115234375,
  "change":-31.623046875,"change_pct":-0.48933669279449377,
  "open":6512.56884765625,"high":6521.02099609375,"low":6422.81298828125,
  "volume":0,"date":"2026-09-18",
  "history":[{"date":"2026-08-06","open":6379.91796875,"…":0}]
}}
```

Di-cache 60 detik di sisi server (`ihsgCacheTTL`); response dari cache ditandai `"message":"ok (cached)"`. `IHSGBadge.jsx` melakukan poll di interval yang sama. Berbeda dari saham, nilai indeks bukan bilangan bulat dan `volume` bisa 0.

---

## Broker / Bandarmology

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/broker/{symbol}` | Data broker summary mentah |
| `GET` | `/broker/{symbol}/summary` | Analisis bandarmology (`lookback=20`, `top=5`) |
| `POST` | `/broker/{symbol}/mock` | **Generator data uji** (`days=30`) |
| `DELETE` | `/broker/{symbol}` | Hapus data broker simbol ini |

Tidak ada jalur ingest broker summary yang sesungguhnya di codebase ini — `POST /mock` adalah satu-satunya penulis, dan datanya sintetis. File hasilnya tidak membawa penanda mock, jadi jangan sampai masuk ke server yang dianggap menyajikan data pasar nyata. `data/broker/` karena itu di-ignore git dan Docker.

Kalau data broker ada, faktor Bandarmology (bobot 8%) pada decision engine ikut aktif.

---

## Laporan & fundamental

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/stocks/{symbol}/reports` | Daftar PDF yang sudah diupload |
| `POST` | `/stocks/{symbol}/reports` | Upload PDF (`multipart/form-data`, field `file`, maks 32 MB) |
| `DELETE` | `/stocks/{symbol}/reports/{id}` | Hapus satu PDF |
| `GET` | `/stocks/{symbol}/fundamental` | Baca `data/fundamentals/{SYMBOL}.json` |
| `POST` | `/stocks/{symbol}/fundamental` | Tulis JSON fundamental (bentuk bebas) |

```bash
curl -X POST localhost:1111/api/stocks/BBCA/reports -F 'file=@laporan-q2.pdf'
```

Teks PDF diekstrak dengan `github.com/ledongthuc/pdf` dan dikonsumsi endpoint `/ai`.

> **Efek samping upload.** Di **Windows**, upload yang berhasil memicu `openClaudeTerminal()` — sebuah goroutine yang membuka jendela terminal Claude Code untuk membaca PDF dan menulis `data/fundamentals/{SYMBOL}.json`. Butuh CLI `claude` terpasang. Di OS lain fungsi ini no-op, karena `os/exec` yang dipicu upload adalah jalur eksekusi kode remote kalau server terekspos.
