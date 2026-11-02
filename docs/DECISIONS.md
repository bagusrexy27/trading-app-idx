# Decisions

## Decision log
- 2026-11-02: Gate regime keras — saat IHSG < MA50 (pada bar terakhir saham), BUY/STRONG_BUY diturunkan ke WAIT dan rencana entry/stop/target/R:R dikosongkan untuk SEMUA saham (`analysis.GateRegime`, dipanggil di `decide()` `handlers/valuation.go`, field `gated`); skor tidak diubah. Why: riset 2020–2026 — BUY saat IHSG < MA50 hanya menang 43% (2024–Nov 2025) dan 25% (Des 2025+) dengan median negatif; rencana saham Tren turun sama menggodanya, dan skor tetap supaya tabel kalibrasi tetap cocok.
- 2026-11-02: Gate fail-open — kalau `^JKSE` gagal diambil, tidak ada gate. Why: sama dengan tabel kalibrasi yang dibangun tanpa regime; gangguan Yahoo tidak boleh menyembunyikan semua rencana.
- 2026-11-02: Label sinyal di UI deskriptif lewat satu `signalLabel()` di `ui/src/utils.js` (Tren naik kuat / Tren naik / Tunggu / Tren turun / Tren turun kuat), termasuk judul kolom Hari Ini, header saham, alert, dan glosarium; nilai API tetap STRONG_BUY…STRONG_SELL. Why: uji buta + riset menunjukkan skor hampir tidak bisa memilih saham (rank IC ≈ 0), jadi label perintah menyesatkan; API dipertahankan supaya alert dan skill cek-ombak tetap jalan.
- 2026-11-02: Rekam jejak historis menampilkan rata-rata hasil per trade lebih dulu, win rate di belakang (`calibShort`, CalibCard, OmbakMeter, panel backtest). Why: rencana engine menang 52–56% tapi rata-rata −0,3…−1,1% net per trade; win rate sendirian menyesatkan.
- 2026-11-02: Uji buta & riset disimpan di `stock-api/research/` (satu modul Go dengan app); `frozen/` di-commit sebagai bukti, `out/` di-gitignore dan dockerignore; `analyze` menolak menimpa file beku. Why: uji harus bisa diulang, dan prediksi yang sudah dibekukan tidak boleh diedit setelah hasil terlihat.
- 2026-11-02: Bobot faktor decision engine tidak diatur ulang. Why: semua faktor punya IC ≈ 0 dengan tanda yang berubah antar periode; mengatur ulang bobot = menghafal masa lalu (overfitting).
- 2026-11-02: Tidak menjanjikan analisa yang "kemungkinan salahnya tipis"; ekspektasi realistis ±55–60% benar, keuntungan dari manajemen risiko. Why: aturan yang menang 84–88% di TRAIN (2020–2023) turun ke 54–64% di data yang tidak dipakai untuk mencarinya.

## Progress log
- 2026-11-02: Uji buta per 28 Nov 2025 dibekukan (`stock-api/research/frozen/2025-11-28.json`, sha256 `b8b18a44…5311c3`) dan divalidasi — 3½/6 kriteria lolos (K1 ✅, K2 ½, K3 ❌ korelasi −0,03, K4 ❌ −0,03%/trade, K5 ✅ 80% di band proyeksi, K6 ✅ tapi kebetulan); setelah 2 bulan ranking terbalik (10 skor tertinggi −3,6%, 10 skor terendah +12,4%, IHSG −2,1%).
- 2026-11-02: Riset 129 ribu keputusan engine 2020–Nov 2026 (TRAIN 2020–2023 / VALID 2024–Nov 2025 / TEST Des 2025+): rank IC skor 0,00–0,02 (negatif saat IHSG < MA50); yang konsisten out-of-sample hanya gate regime, band proyeksi, dan pola pantulan oversold.
- 2026-11-02: Dibangun & diverifikasi — `GateRegime` + `TestGateRegime`, guard `TakeProfit[0]` + field `gated` di screener, label UI di ±11 file, perbaikan bug MarketOverview (menghitung WAIT, bukan NEUTRAL), folder `research/`, ignore files, code map CLAUDE.md. Verifikasi: `go test ./...`, `npm test` 12/12, build, API live (87/87 saham ter-gate, mode beli 0), Chrome headless 19/19 cek (satu `SecurityError` di halaman Market berasal dari widget TradingView, sudah ada sebelumnya). Belum di-commit.

## Open
- 2026-11-02: Commit perubahan sesi ini (belum di-commit; working tree juga berisi perubahan `stock-api/data/*.json` dari sebelumnya).
- 2026-11-02: AI write-up (`handlers/ai.go`) masih memakai kata perintah (ENTRY / EXIT / KURANGI POSISI).
- 2026-11-02: Backtest per saham di tab Decision (`BacktestDecision`) belum menyimulasikan gate regime.
- 2026-11-02: Tinjau rasio TP vs stop — rencana engine menang 52–56% tapi rata-rata −0,3…−1,1% net per trade.
- 2026-11-02: Forward test bulanan — tiap akhir bulan jalankan `go run ./research/blindtest analyze -cutoff <tanggal>` (mis. 2026-11-30) dari `stock-api/`, lalu `validate` dengan cutoff yang sama sebulan kemudian.

## Parked
- 2026-11-02: Mode "Pantulan" di screener (RSI < 35, IHSG ≥10% di bawah puncak 52 minggu, turnover ≥ Rp20 M/hari, tahan 40–60 hari). Why parked: user tidak memilihnya; menang 54–64% di data baru tapi gagal serentak per episode (2024: 0% menang, median −18%) dan terkena bias survivorship.
- 2026-11-02: Aturan momentum (BUY & IHSG di atas MA50 & RSI > 70). Why parked: hanya 3 dari 7 tahun positif — tidak konsisten per tahun.
- 2026-11-02: Filter "rekam jejak saham" (rata-rata historis saham > 0). Why parked: lolos di uji Des 2025, tapi di 2020–2023 justru lebih jelek — tidak konsisten antar periode.
