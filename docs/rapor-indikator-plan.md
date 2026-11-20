# Plan — Rapor Indikator (uji komprehensif semua indikator)

Dibuat 2026-11-20. Status: **draft, belum dikerjakan**.

## Tujuan

Menguji **sebanyak mungkin indikator** — teknikal, aliran volume, struktur harga, kondisi
pasar, kalender, dan **fundamental** — dengan aturan yang sama, lalu memberi **nilai A–E**
pada tiap indikator. Hasilnya tampil di app sebagai view baru **"Rapor"**. Dari rapor itu
user memutuskan indikator mana yang dihapus total (engine + grafik + tab Indikator + API).

Latar: uji 2026-11-20 atas 28 sinyal standar (versi Python sederhana) → **0 lolos**
setelah efek pasar dinetralkan; untung pola "Lanjut tren" ternyata dari *timing* IHSG +
aturan keluar ATR, bukan dari memilih saham. Uji itu kasar (versi sederhana, 92 saham,
tanpa fundamental). Plan ini membuatnya tuntas dan bisa diulang.

## Keputusan desain

| Topik | Pilihan | Alasan |
|---|---|---|
| Bahasa | **Go**, satu command baru `research/rapor` | Indikator app sudah di Go (`analysis/`). Menguji **kode yang sama persis** dengan yang tampil di app — uji Python kemarin pakai salinan sederhana (FVG, Key Levels, struktur) sehingga hasilnya cuma indikatif. Go paralel di semua CPU (kalibrasi 92 saham × 6,5 th ≈ 15 dtk). Rust tidak perlu: bottleneck-nya bukan CPU |
| Python | Tetap untuk eksplorasi (`research/*.py`) | Boleh dipakai cek silang, bukan sumber nilai rapor |
| Tampilan | **Di app** (view "Rapor"), bukan artifact | Data bisa di-run ulang tiap bulan, nyambung ke engine, dan user memutuskan hapus/pertahankan dari situ. Artifact = snapshot statis; opsional untuk dibagikan |
| Penyimpanan hasil | `research/rapor/<tanggal>.json` (di-commit, seperti `research/frozen/`) | Bukti historis; app membaca file terbaru |
| API | `GET /api/research/rapor` — baca JSON terbaru | Tanpa komputasi di request |

## Aturan uji (ditetapkan SEBELUM melihat hasil)

1. **Universe**: semua saham IDX dengan turnover rata-rata 20 hari ≥ Rp20 M di hari itu
   (bukan cuma 92 yang dilacak). Target ±250–400 saham likuid, data harian sejak 2020.
2. **Entry** = open hari berikutnya. Biaya beli 0,15% + jual 0,25%. Satu saham tidak
   dihitung ulang dalam 10 hari bursa setelah sinyal (anti-dobel).
3. **Dua jenis uji**:
   - *Sinyal* (ya/tidak, mis. MACD cross): event study — hasil 5/10/20/60 hari.
   - *Nilai kontinu* (mis. PBV, RSI): rank IC per tanggal (Spearman lintas saham).
4. **Market-neutral**: hasil dikurangi rata-rata semua saham likuid di tanggal yang sama.
5. **Periode**: TRAIN 2020–2023 · VALID 2024–Nov 2025 · TEST Des 2025+ · plus per tahun.
6. **Uji kebetulan**: t-stat dikelompokkan per bulan. Karena ±150+ indikator diuji
   sekaligus, ±8 akan "lolos" t≥2 murni kebetulan → nilai A butuh **t ≥ 3**
   (standar Harvey–Liu–Zhu untuk banyak uji).
7. **Per kondisi pasar**: dipecah per suasana pasar (RSI IHSG: panik <40, takut 40–50,
   tenang 50–60, optimis 60–70, euforia >70).
8. **Simulasi trade**: stop −1,5 ATR, target +3 ATR, maks 20 hari — untuk melihat apakah
   indikator berguna dengan aturan keluar yang sudah terbukti.

### Nilai

| Nilai | Syarat | Artinya |
|---|---|---|
| **A** | excess > 0 di 3/3 periode, t ≥ 3, menang ≥ 5/7 tahun | Terbukti — pertahankan, layak jadi penentu BUY |
| **B** | excess > 0 di 3/3 periode, t ≥ 2 | Kemungkinan berguna — pertahankan, uji maju |
| **C** | 2/3 periode positif atau 1 ≤ t < 2 | Ragu — boleh tampil sebagai alat lihat, bukan penentu |
| **D** | tidak beda dari pasar | Tidak berguna — kandidat hapus |
| **E** | excess < 0 di 3/3 periode, t ≤ −2 | Konsisten salah — hapus (atau dipakai terbalik, diuji terpisah) |

Kombinasi indikator hanya dari yang bernilai A/B, diuji walk-forward (latih di masa lalu,
uji di masa sesudahnya) supaya tidak cocok-cocokan.

## Katalog indikator yang diuji

**Sudah ada di app (pakai kode asli `analysis/`)**: SMA, EMA, RSI, MACD, Bollinger,
Stochastic, ATR, OBV, ADX, VWAP, Parabolic SAR, Ichimoku, Fibonacci, Pivot, A/D line,
MFI, CMF, FVG, Key Levels, Market Structure, AMD (Wyckoff), CandlePattern (16 pola),
Valuasi PBV, skor DecisionEngine, tiap komponen skor engine.

**Teknikal baru**
- Tren: Supertrend, Donchian breakout, Keltner, Aroon, Hull MA, KAMA, TRIX, slope regresi linier, Vortex, MA200 filter.
- Momentum: StochRSI, Williams %R, CCI, ROC, TSI, Awesome Oscillator, Ultimate Oscillator, PPO, momentum 1/3/6/12 bulan.
- Volatilitas: lebar Bollinger / *squeeze* (TTM), ATR%, volatilitas historis, NR7, inside bar.
- Volume: Force Index, Ease of Movement, Klinger, volume relatif, perubahan turnover, iliquiditas Amihud.
- Harga: jarak ke high 52 minggu, pembalikan 1 minggu / 1 bulan, efek "lotre" (MAX), gap naik/turun.
- Kekuatan relatif: saham vs IHSG (RS line), beta, saham vs sektornya.

**Kondisi pasar / timing** (diuji sebagai filter, bukan pemilih saham): RSI IHSG, IHSG vs
MA20/50/200, drawdown IHSG, breadth (% saham di atas MA50, naik-turun, high-low baru),
USD/IDR, return S&P 500 semalam, harga komoditas untuk sektornya (batu bara, nikel, CPO).

**Kalender**: hari dalam minggu, bulan (window dressing Des, efek Januari, Lebaran),
sebelum/sesudah ex-dividen, musim laporan keuangan.

**Fundamental**: PBV, PER, PSR, EV/EBITDA, dividend yield, ROE, ROA, net margin, DER,
current ratio, pertumbuhan laba & pendapatan, Piotroski F-score, Altman Z, akrual,
kejutan laba (*post-earnings drift*), kapitalisasi pasar (efek ukuran), free float.

## Data — kendala terbesar

| Data | Sumber | Status |
|---|---|---|
| OHLCV harian ±900 saham sejak 2020 | Yahoo (fetcher yang ada) | Bisa. Perlu daftar ticker IDX lengkap. **Bias survivorship**: saham delisting tidak ada di Yahoo — dicatat di rapor |
| IHSG, USD/IDR, S&P 500, komoditas | Yahoo (`^JKSE`, `USDIDR=X`, `^GSPC`, futures) | Bisa |
| **Fundamental historis point-in-time** | Yahoo cuma ±4 laporan tahunan + 5 kuartalan → **tidak cukup untuk 2020–2026** | **Perlu spike Fase 0**: laporan keuangan XBRL dari idx.co.id (publik), termasuk **tanggal terbit** supaya tidak ada *look-ahead* (memakai laporan sebelum terbit). Kalau tidak bisa diambil, uji fundamental hanya 2024+ dan nilainya ditandai "sampel pendek" |
| Broker / asing | — | Di-skip (keputusan 2026-11-20) |

## Fase

| # | Isi | Hasil | Perkiraan |
|---|---|---|---|
| 0 | **Spike data**: daftar ticker IDX lengkap; cek akses XBRL IDX + tanggal terbit; ukur waktu fetch | Keputusan universe & sumber fundamental | 0,5–1 hari |
| 1 | Unduh data: OHLCV semua saham likuid → `research/data/` (gitignored, terpisah dari `data/` app); makro; fundamental | Dataset beku untuk riset | 1–2 hari (fetch pelan) |
| 2 | Engine `research/rapor` (Go): daftar indikator = slice `{nama, kategori, jenis, fungsi}`; replay paralel; statistik (excess, IC, t per bulan, per tahun, per suasana, trade ATR) | `research/rapor/<tanggal>.json` | 2–3 hari |
| 3 | Validasi engine: hasil 28 sinyal lama harus mendekati uji Python 2026-11-20; test pin di `research/rapor/*_test.go` dengan data beku | Kepercayaan pada angka | 0,5 hari |
| 4 | Fundamental + kalender + makro dimasukkan | Rapor lengkap | 1–2 hari |
| 5 | UI view **Rapor**: tabel per indikator (nilai A–E, kategori, penjelasan awam, excess per periode, tahun menang, heatmap per suasana pasar); filter per kategori & nilai; tautan ke Kamus | Tampil di app | 1–2 hari |
| 6 | **Keputusan user** dari rapor: daftar hapus/pertahankan; baru kemudian hapus kode (engine, grafik, tab, API) per batch | Commit penghapusan | terpisah |
| 7 | Uji maju: rapor di-run ulang tiap bulan; nilai yang berubah ditandai | Rapor hidup | rutin |

## Bentuk output (JSON per indikator)

```json
{
  "name": "MACD cross naik", "category": "momentum", "kind": "signal",
  "grade": "E", "n": 2525,
  "excess": {"TRAIN": 0.12, "VALID": -0.59, "TEST": -0.46},
  "horizons": {"5": 0.15, "10": 0.12, "20": -0.21, "60": null},
  "t": -0.64, "years_won": "3/7",
  "by_mood": {"panik": -0.2, "takut": -0.65, "tenang": -0.41, "optimis": 0.28, "euforia": 0.67},
  "trade_atr": {"TRAIN": -0.3, "VALID": -0.1, "TEST": -1.5},
  "in_app": true, "explain": "Garis MACD memotong ke atas garis sinyal."
}
```

## Risiko

- **Overfitting / data mining**: ratusan uji → pasti ada yang kebetulan bagus. Ditangani
  aturan t ≥ 3, wajib 3/3 periode, dan uji maju bulanan.
- **Bias survivorship**: saham delisting hilang → indikator "beli yang jatuh" terlihat
  lebih bagus dari aslinya. Dicatat di halaman Rapor.
- **Fundamental point-in-time** mungkin tidak tersedia gratis — lihat Fase 0.
- **Yahoo rate limit** saat unduh ±900 saham — fetch pelan, bisa dilanjut (checkpoint).
- **Hasil bisa sama dengan kemarin: hampir semua D/E.** Itu tetap hasil yang berguna —
  app jadi lebih sederhana dan jujur; fokus pindah ke timing + aturan keluar + ukuran posisi.

## Hasil Fase 0 (2026-11-20)

| Cek | Hasil |
|---|---|
| Daftar ticker | **Yahoo screener** (`POST /v1/finance/screener`, `exchange = JKT`, butuh cookie + crumb) → **838 saham**, 4 halaman × 250. idx.co.id diblokir Cloudflare untuk akses otomatis (403 "Just a moment…") |
| Likuiditas sekarang (rata-rata 3 bulan) | ≥ Rp20 M/hari: **83 saham** · ≥ Rp5 M: 194 · ≥ Rp1 M: 398. Pasar sedang turun, jadi angka historis (per hari, 2020–2025) akan lebih besar. Rapor utama pakai Rp20 M; Rp5 M dijalankan sebagai uji sensitivitas (tidak mengubah nilai) |
| Waktu unduh | 1 saham 2020–sekarang = 0,25 dtk, ±110 KB, 1.660 bar. 838 saham ≈ 4 menit; dengan jeda sopan 1 dtk ≈ 15 menit, ±90 MB |
| Fundamental Yahoo | Tahunan: **4 laporan (FY2022–FY2025)** untuk laba, pendapatan, ekuitas. Kuartalan: 5 (Sep 2025–Sep 2026). `trailingPeRatio`: 10 titik sejak 2022. → Rasio dari laporan tahunan bisa diuji **±Apr 2023 – sekarang** (laporan dianggap terbit 3 bulan setelah tutup buku, supaya tidak ada look-ahead). Lebih panjang dari perkiraan "2024+", tetap ditandai "sampel pendek" |
| XBRL IDX | Tidak bisa via curl (Cloudflare). Lewat browser mungkin bisa tapi rapuh — **tidak dipakai** sesuai keputusan #2 |
| Survivorship | Yahoo screener hanya saham yang masih tercatat; delisting tidak ada. Dicatat di Rapor |

## Hasil Fase 2–3 (2026-11-20)

- Engine: `stock-api/research/rapor/` (Go, package main) — `series.go` (data per saham, return maju, trade ATR), `indicators.go` (katalog: 48 sinyal + 30 nilai; indikator app memanggil `analysis.*` langsung), `stats.go` (excess, IC, t per bulan, nilai A–E), `stats_test.go`. Run: `go run ./research/rapor` dari `stock-api/` → `research/rapor/<tanggal>.json`, ±40 dtk untuk 126 saham (BACH dilewati: 96 bar).
- **Validasi**: 23 sinyal dengan definisi sama → angka Go ≈ Python hampir identik (arah sama 75/84 periode; selisih hanya pada indikator yang algoritma app-nya beda dari versi Python sederhana: Hammer, Fibonacci, Key Levels, FVG, struktur). Artinya uji Python sebelumnya salah untuk versi app: Fibonacci app = D (bukan E), Hammer app = E.
- **Koreksi aturan setelah run pertama** (lebih ketat, tidak pernah lebih longgar): untuk indikator *nilai*, arah dipilih dari data, jadi "2 dari 3 periode searah" hampir otomatis → C untuk nilai hanya lewat 1 ≤ |t| < 2.
- **Hasil run 2026-11-20** (78 indikator): A 0 · **B 1** (ADX 14 sebagai nilai — saham dengan tren lebih kuat, arah apa pun, sedikit unggul; t 2,83, 5/7 tahun) · C 18 · D 54 · **E 5** (Force Index, Key Levels mantul S1, NR7, Candle Hammer, RSI keluar oversold). Hampir lolos: "Engine: STRONG_BUY baru" (−0,6 / +4,1 / +2,9, t 2,0, 6/7 tahun — gagal B karena TRAIN negatif).

## Hasil Fase 4 (2026-11-20)

- `fundamentals.go`: 15 jenis laporan tahunan Yahoo (cache `research/out/fund/`, TTL 7 hari, unduh berurutan + jeda 300 ms). Arus kas operasi IDX ada di `CashFlowsfromusedinOperatingActivitiesDirect` (metode langsung) — `OperatingCashFlow` hampir selalu kosong. 38 dari 121 emiten melapor dalam USD → harga dikonversi pakai `USDIDR=X`. Return maju sekarang **total return** (harga + dividen yang ex setelah entry).
- `timing.go`: 24 kondisi pasar/makro/kalender, dinilai dari rata-rata return 20 hari semua saham likuid pada tanggal itu dibanding rata-rata periodenya. Makro dari Yahoo: `USDIDR=X`, `^GSPC`, `^VIX`, `CL=F`, `GC=F` (sesi AS memakai bar sebelum tanggal IDX).
- **Koreksi aturan kedua**: periode yang sampelnya tipis tidak lagi menjatuhkan nilai ke D — periode itu diabaikan, dan nilai maksimalnya C (E → D). Sesuai maksud plan ("tipis = belum cukup bukti").
- **Hasil 120 indikator**: A 1 · B 2 · C 36 · D 75 · E 6.
  - A: **Altman Z-score** arah *rendah* (perusahaan yang neracanya lebih berisiko justru unggul) — sampel ±Apr 2023–sekarang saja. B: ADX (nilai), **Current ratio** arah *rendah* (pola sama dengan Altman Z).
  - E baru: **10 hari bursa sebelum ex-dividen** (−1,5 / −2,5 / −1,2 %, sudah termasuk dividennya).
  - Timing terkuat: **VIX > 25** (+2,4 / +9,1 / +11,9 %, t 3,6) tapi sampel episodik (C*). **Suasana pasar RSI IHSG: semua zona C/D**, **IHSG di atas MA50: D** — tidak ada yang konsisten memprediksi return pasar 20 hari.

## Fase 6 — validasi 4 lapis (disetujui 2026-11-20, sebelum dikerjakan)

Dari audit terhadap kerangka "valid 4 lapis" (hitungan benar → daya prediksi → untung setelah biaya → robust) + protokol point-in-time. Urutan kerja:

1. **Log forward test** (paling mendesak — tidak bisa dipercepat). Mulai 2026-11-20, tanpa backfill ke tanggal yang sudah terlihat. Tiap tanggal: semua sinyal beli, kuintil atas/bawah indikator nilai, status kondisi timing → `research/forward/<tanggal>.json`, berisi sidik jari kode (sha256 sumber `research/rapor`) + hash file sebelumnya (rantai, ketahuan kalau diedit). Run yang terlewat boleh mengejar tanggal yang belum tercatat karena perhitungannya hanya memakai bar ≤ tanggal itu dan kode tercatat. Penilaian: 20 hari bursa kemudian, dengan cara yang sama seperti rapor (excess vs rata-rata hari yang sama). **Kriteria konsisten**: arah sama dengan backtest dan |selisih| < 1 simpangan baku bootstrap setelah ≥ 3 bulan / ≥ 30 sinyal. Bertentangan → percaya forward test.
2. **Biaya di engine app**: kalibrasi + backtest "Saran" memotong 0,4% per trade.
3. **Statistik + ARB/ARA di Rapor**: jeda sinyal = horizon (20); p-value block bootstrap (blok = bulan); Monte Carlo random entry 1.000× (persentil 95); koreksi Benjamini-Hochberg (q); jumlah sampel efektif (bulan berbeda). ARB/ARA: hari terkunci (high = low, atau tutup di low/high dengan gerak ≥ 6,9% — batas terkecil yang pernah berlaku, jadi konservatif) → order tidak tereksekusi, dicoba hari berikutnya. Edge setelah biaya = excess − 0,4 (strategi bayar biaya tiap sinyal, pasar tidak).
4. **L1 + L3/L4**: RSI/MACD/Bollinger/Stochastic/ATR/OBV/MFI/CMF/SAR/SMA/EMA vs TA-Lib di 3 saham (toleransi < 0,01% setelah warm-up); metrik portofolio (CAGR, Sharpe, max drawdown, profit factor, avg win/loss, % waktu pegang posisi) vs IHSG; heatmap parameter ±30%; per sektor; per kuartil likuiditas; rezim (IHSG vs MA200 × volatilitas).

**Skala nilai baru** (menggantikan A–E di atas setelah langkah 3–4 selesai):
- **A**: q < 0,05, mengalahkan p95 random entry, edge setelah biaya > 0 di ketiga periode termasuk TEST, ≥ 5/7 tahun, stabil di parameter tetangga.
- **B**: signifikan + edge setelah biaya > 0, tapi hanya di rezim/sektor/suasana tertentu atau tidak stabil parameternya.
- **C**: daya prediksi signifikan, tapi edge habis dimakan biaya.
- **D**: tidak beda dari acak.
- **E**: sinyal beli yang signifikan **lebih jelek** dari acak (konsisten salah) — tambahan dari kami, kandidat hapus pertama.
- **F**: gagal L1 (hitungan salah) atau TEST < 50% hasil in-sample padahal in-sample signifikan (overfit).

**Progres Fase 6 (2026-11-20)**
- #1 ✅ `research/rapor/forward.go`: tiap run Rapor menulis `research/forward/<tanggal>.json` (rantai hash + sidik jari kode) dan menilai log lama. Pengaman: tanggal hanya dicatat kalau candle-nya final (setelah 16:15 WIB **dan** file data saham ditulis setelah 16:15 hari itu). Log pertama yang sempat ditulis jam 11:19 WIB (candle belum final) dihapus. Log pertama yang sah = run pertama setelah penutupan bursa.
- #2 ✅ `analysis.RoundTripCostPct = 0.4` dipotong di `planOutcome` → kalibrasi, proyeksi rekam jejak, dan backtest "Saran" di app sekarang setelah biaya.
- #3 ✅ `research/rapor/validate.go`: jeda sinyal 20, ARB/ARA (entry gagal → coba lagi ≤ 5 hari; stop/time-exit di hari terkunci → jual di open hari tak terkunci berikutnya), block bootstrap (blok bulan, 2.000×, seed 42), random entry 1.000×, BH, n_eff, cek overfit, skala A–F. **Hasil: q terkecil 0,30 — 0 indikator signifikan; 116 D, 4 F** (Volume spike 2×, Current ratio, Suasana panik, IHSG turun > 10%: kuat in-sample, ambruk di TEST).
- #4 ✅ **L1** `research/l1/` (Go, dump indikator app) + `research/l1_check.py` (TA-Lib 0.8.3): 20 seri × BBCA/TLKM/ADRO = **60/60 PASS** (selisih ≤ pembulatan 2 desimal). Satu bug nyata ketemu & diperbaiki: **Parabolic SAR** di hari balik arah tidak dijepit ke rentang hari ini/kemarin (beda 1 tick di 1–2 dari 1.510 bar) → `analysis.SAR` + `TestSARReversalClamp`. VWAP & Ichimoku sudah dipatok test sebelumnya; Fibonacci/Pivot/FVG/Key Levels/AMD bukan indikator TA-Lib (algoritma app, dipatok test sendiri).
- #4 ✅ **L3** `research/rapor/l3l4.go`: portofolio 10 slot (bobot sama, compounding, trade ATR + biaya + ARB/ARA, drawdown dari ekuitas terealisasi). **Semua 50 sinyal beli rugi sebagai portofolio**: terbaik CAGR −1,4%/th (Gap naik > 2%), terburuk ±−29%/th (Pivot, Williams %R, RSI tembus 50; drawdown ±88%). IHSG beli-dan-tahan Jun 2020–Nov 2026: CAGR +0,8%/th, drawdown 46%.
- #4 ✅ **L4**: parameter tetangga ±30% untuk 10 indikator (RSI ×2, MACD, SMA cross, Bollinger ×2, Stochastic, Donchian, volume spike, MFI) → 4 stabil arah (termasuk yang stabil *jelek*), 6 tidak stabil; per sektor (Yahoo assetProfile, cache `research/out/sector.json`, 11 sektor), per kuartil likuiditas, per rezim (IHSG vs MA200 × volatilitas 20 hari vs median berjalan). Pecahan hanya deskriptif, tidak menaikkan nilai.
- **Cara menjalankan uji maju** (keputusan 2026-11-20): **manual** — jalankan `go run ./research/rapor` dari `stock-api/` kapan saja setelah 16:15 WIB dengan data yang sudah di-update setelah tutup; hari bursa yang terlewat dikejar otomatis di run berikutnya.
- **Kesimpulan Fase 6**: 120 indikator → 0 signifikan setelah koreksi uji berganda (terdekat: VIX > 25, q 0,06); 116 D, 4 F; tidak ada strategi sinyal yang mengalahkan IHSG sebagai portofolio. Rapor menyarankan app berhenti memakai indikator sebagai *penentu beli*; yang tersisa sebagai alat bantu: aturan keluar (stop/target ATR), ukuran posisi, dan log uji maju.
- **Koreksi**: catatan Fase 4 "return maju = total return" ternyata keliru — edit-nya gagal diam-diam (skrip tidak cocok indentasi). Baru benar-benar terpasang di #3; semua angka Fase 4 sebelum ini berbasis harga saja.

**Catatan kejujuran**: periode TEST (Des 2025+) sudah dilihat berkali-kali di sesi 2026-11-20 dan aturan nilai sudah 2× diubah setelah melihat hasil → TEST bukan holdout bersih lagi. Universe juga bocor sedikit (35 saham tambahan dipilih pakai likuiditas & kapitalisasi hari ini; tanpa saham delisting). Bukti bersih satu-satunya = forward test mulai 2026-11-20.

## Keputusan (2026-11-20)

1. Universe: ~~semua saham IDX likuid~~ → diubah user: **hanya saham yang mungkin dibeli**. 92 saham lama tetap, ditambah **35 saham** yang belum dilacak dengan kriteria objektif (bukan "yang sudah naik", supaya tidak bias hindsight): turnover rata-rata 3 bulan ≥ Rp10 M **dan** kapitalisasi ≥ Rp5 T (screener Yahoo 2026-11-20). Ke-35 saham juga **dilacak di app** (`data/`, ikut screener & auto-update): SINI PTRO EMAS PACK ERAA DMAS BREN BIPI JARR ULTJ SGER PSAB ARCI TAPG TOWR COIN FORU PANI PKPK LSIP GGRM CDIA IMPC BUKA RMKE BDMN CARE BFIN PWON JSMR MAPA CMNT CMRY TKIM HMSP. Total **127 saham**; riset membaca `data/` langsung (tidak perlu `research/data/`). Filter likuid Rp20 M per hari tetap berlaku di dalam uji.
2. Fundamental: kalau XBRL IDX tidak bisa diambil → **pakai Yahoo 2024+ saja**, ditandai "sampel pendek".
3. Kerjakan **Fase 0 dulu, lalu lapor** sebelum lanjut.
4. Hapus indikator dilakukan setelah Fase 5 per batch, dengan konfirmasi daftar dulu.
