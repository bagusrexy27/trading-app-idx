---
name: cek-ombak
description: Scan seluruh saham IDX yang dilacak, update data terbaru, rangkum sentimen berita ekonomi (domestik/global/regional), lalu report kandidat BUY + peringatan SELL + kesimpulan arah pasar. Trigger — user ketik "cek ombak" (plain) atau /cek-ombak.
---

# Cek Ombak

Trigger: user mengetik **"cek ombak"** (dengan atau tanpa slash). Jalankan workflow ini
tanpa nanya lagi. Output Bahasa Indonesia, ringkas, untuk trader IDX yang awam
jargon (jelaskan istilah teknikal sekali dalam kurung).

Base URL: `http://localhost:1111`

## Langkah 1 — Cek server

```bash
curl -s http://localhost:1111/api/ihsg
```

- Sukses → lanjut (pakai juga angka IHSG ini sebagai konteks pasar di report).
- Gagal/refused → server mati. Bilang ke user: jalankan `./stock-api.exe` dari
  `stock-api/` dulu, lalu stop. Jangan lanjut.

## Langkah 1b — Luncurkan 3 subagent riset makro (paralel, background)

Langsung setelah server OK, dalam **satu pesan** panggil Agent tool 3× (biar paralel),
`subagent_type: general-purpose`, `model: sonnet`. Jangan tunggu — lanjut langkah 2–3
sambil mereka jalan. Riset berita TIDAK dikerjakan agent utama (hasil WebSearch mentah
jangan masuk konteks utama).

Satu agent per kategori, query (sisipkan tanggal + bulan + tahun berjalan):

1. **Domestik IDX** — `"sentimen IHSG pasar saham Indonesia hari ini asing net sell rupiah BI rate <tanggal bulan tahun>"`
2. **Global makro** — `"global market sentiment Fed FOMC rate decision MSCI rebalancing emerging markets <month year>"`
3. **Regional Asia** — `"Asia stock market today Hang Seng Nikkei KOSPI China sentiment <month year>"`

Prompt tiap agent harus memuat: tanggal hari ini, kategori + query di atas (boleh 1–2
query tambahan), dan aturan ini:
- Hanya berita ≤3 hari dari hari ini; tiap headline wajib bertanggal. Buang hasil yang
  tanggalnya tidak jelas atau tercampur hari lain.
- Label dari sudut pandang dampak ke saham Indonesia.
- Jangan mengarang. Kalau search gagal / tidak ada berita segar → `LABEL: N/A`.
- Balas HANYA dengan format ini:
  ```
  LABEL: Bullish|Netral|Bearish|N/A
  FAKTOR: 1 kalimat, sebut angka konkret (net sell Rp X T, suku bunga, dll)
  HEADLINE:
  - judul — tanggal
  (3–5 baris)
  SUMBER:
  - url
  ```

## Langkah 2 — Update data terbaru

```bash
curl -s -X POST http://localhost:1111/api/stocks/update-all
```

`update-all` sudah incremental: symbol yang datanya sudah tanggal hari ini otomatis
tidak menarik apa-apa. Jadi cukup panggil ini sekali — yang fresh ke-skip sendiri.
<!-- ponytail: no per-symbol date check; incremental fetch already no-ops fresh symbols. Add explicit skip only if update-all latency becomes a problem. -->

## Langkah 3 — Ambil kandidat & warning

Dua panggilan:

```bash
# Semua kandidat BUY / STRONG_BUY, ranked (score → confidence → RR)
curl -s "http://localhost:1111/api/advisor/screen?mode=buy&min_turnover=2"

# Semua saham (buat cari yang AVOID/REDUCE)
curl -s "http://localhost:1111/api/advisor/screen?mode=all&min_turnover=2"
```

Field per row: `symbol, close, signal, score, confidence, trend{long,medium,short,overall},
structure, volume_state, entry_low, entry_high, entry_ideal, stop, target, risk_reward,
probability{bullish,sideways,bearish}, turnover_bn, syariah, note, calibration`.
Top-level: `regime` (`up` = IHSG di atas MA50, `down` = di bawah, `unknown`).

**`probability` JANGAN ditampilkan sebagai peluang** — itu cuma rumus dari skor,
bukan frekuensi terukur. Yang terukur ada di `calibration`:
- `win_rate`, `samples`, `avg_pnl_pct` — dari semua kasus historis dengan skor
  `score_lo`–`score_hi` di regime yang sama: % rencana yang kena TP1 sebelum stop
  dalam `horizon` (20) hari bursa, dan rata-rata hasil per trade.
- `reliable` = false → sampel < 30, sebut "belum bisa dipercaya".
- `stock{samples,win_rate,avg_pnl_pct}` — rekam jejak saham itu sendiri (hari sinyal beli).

Win rate tinggi belum tentu untung (TP bisa lebih dekat dari stop) — yang menentukan
`avg_pnl_pct`. Negatif = setup ini secara historis rugi.

Dari hasil `mode=all`, ambil yang `signal` = `SELL` atau `STRONG_SELL` untuk bagian
warning (engine pakai skala STRONG_BUY/BUY/WAIT/SELL/STRONG_SELL).

## Langkah 3b — 1 subagent riset berita kandidat BUY

Kalau `matched` > 0: luncurkan **satu** Agent (`general-purpose`, `model: sonnet`,
background) berisi SEMUA symbol kandidat sekaligus (+ nama emiten kalau tahu). Tugas:
berita emiten 7 hari terakhir — aksi korporasi, laporan keuangan, suspensi/UMA
(Unusual Market Activity), net sell asing besar, kasus hukum. Aturan sama: bertanggal,
jangan mengarang. Balas HANYA 1 baris per symbol:
```
SYMBOL — Positif|Negatif|Netral|Tidak ada berita — 1 kalimat (tanggal) — url
```
Kandidat 0 → skip langkah ini.
<!-- ponytail: maks 4 subagent per run (3 makro + 1 kandidat). Jangan satu agent per saham — biaya token. -->

## Langkah 4 — Kumpulkan hasil subagent

Tunggu notifikasi 4 agent (3 makro + 1 kandidat). Jangan polling, jangan search sendiri
sebagai pengganti. Pakai ringkasan mereka apa adanya:
- Label + faktor tiap kategori → bagian sentimen & kesimpulan.
- Baris per symbol → baris `📰` di kandidat.
- Agent gagal / `N/A` → tulis "tidak tersedia" untuk bagian itu. Semua gagal → tulis
  "Sentimen berita: tidak tersedia (search gagal)". Jangan mengarang berita.

## Langkah 5 — Report

Format:

1. **Konteks pasar** — 1 baris: IHSG hari ini (nilai + arah) dari langkah 1, plus
   `regime` dari screener. Kalau `regime` = `down`: tulis tegas di awal report —
   "IHSG di bawah MA50; secara historis sinyal BUY di kondisi ini rata-rata rugi
   (cek `GET /api/calibration` → `buy_calls.down.avg_pnl_pct`). Sikap default: tahan / posisi kecil." 
2. **Sentimen berita (dari langkah 4)** — 3 baris, satu per kategori:
   - `🇮🇩 Domestik: [Bullish/Netral/Bearish]` — 1 kalimat faktor utama (mis. "asing net sell Rp3,4 T 5 hari, transisi Gubernur BI").
   - `🌏 Global: [label]` — 1 kalimat (mis. "pasar wait-and-see jelang FOMC Fed").
   - `🀄 Regional: [label]` — 1 kalimat.
3. **Kandidat BUY hari ini** — TAMPILKAN SEMUA yang lolos (jangan dipotong), sudah
   urut dari terbaik. Per saham satu blok ringkas:
   - `SYMBOL` — signal (STRONG_BUY/BUY) · skor X/100 · confidence Y% · 🕌 kalau syariah
   - Entry: `entry_low`–`entry_high` (ideal `entry_ideal`) · Stop: `stop` · Target: `target` · RR 1:`risk_reward`
   - Rekam jejak: kena TP `calibration.win_rate`% dari `calibration.samples` kasus serupa,
     rata-rata `calibration.avg_pnl_pct`%/trade · saham ini sendiri: `calibration.stock.win_rate`%
     (n=`calibration.stock.samples`). Tandai ⚠️ kalau `avg_pnl_pct` < 0 atau `reliable` false.
   - `📰 Berita:` dari langkah 3b (label + 1 kalimat). Negatif → ⚠️.
   - 1 baris alasan: dari trend + structure + volume_state (terjemahkan ke bahasa awam,
     mis. "struktur naik (higher-high), volume konfirmasi").
4. **⚠️ Perhatian (SELL/STRONG_SELL)** — daftar symbol yang sinyalnya jelek, 1 baris each
   (symbol · signal · alasan singkat). Berguna kalau user pegang barangnya. Kalau
   kosong, tulis "tidak ada".
5. **🧭 Kesimpulan** — 1 paragraf pendek: gabungkan sentimen berita (langkah 4) +
   kondisi teknikal (jumlah BUY vs SELL, arah IHSG). Kasih arah jelas: pasar lagi
   condong risk-on/risk-off/hati-hati, dan saran sikap (mis. "selektif, utamakan RR
   tinggi + confidence tinggi; kurangi posisi kalau IHSG tembus support X"). Jangan
   generik — sebut angka/faktor konkret dari data hari ini.
6. Tutup: 1 baris disclaimer — rekam jejak dari ±1,5 tahun data Yahoo (delay) +
   rangkuman berita publik, bukan kepastian; selalu pakai stop-loss.
7. **Sources** — gabungan semua url dari SUMBER/baris agent, sebagai markdown link.

Harga IDX = integer rupiah, tanpa desimal. Ranking sudah dari backend (skor) — jangan
diurut ulang, tapi kandidat dengan `calibration.avg_pnl_pct` negatif wajib diberi ⚠️. Kalau `matched` = 0, bilang tidak ada setup BUY layak hari ini
(pasar lagi lesu) dan tetap tampilkan bagian warning.
