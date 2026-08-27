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

Field per row: `symbol, close, signal, score, confidence, trend, structure,
volume_state, entry_low, entry_high, entry_ideal, stop, target, risk_reward,
probability{up,side,down}, turnover_bn, syariah`.

Dari hasil `mode=all`, ambil yang `signal` = `SELL` atau `STRONG_SELL` untuk bagian
warning (engine pakai skala STRONG_BUY/BUY/WAIT/SELL/STRONG_SELL).

## Langkah 4 — Sentimen berita ekonomi

Pakai tool **WebSearch** (atau `web_search_exa` kalau ada) untuk ambil berita terbaru.
Jalankan 3 query, satu per kategori. Selalu sisipkan bulan+tahun berjalan biar hasil fresh:

1. **Domestik IDX** — `"sentimen IHSG pasar saham Indonesia hari ini asing net sell rupiah BI rate <bulan tahun>"`
2. **Global makro** — `"global market sentiment Fed FOMC rate decision MSCI rebalancing emerging markets <bulan tahun>"`
3. **Regional Asia** — `"Asia stock market today Hang Seng Nikkei KOSPI China sentiment <bulan tahun>"`

Dari tiap hasil, tarik 3–5 headline paling relevan. Untuk tiap kategori tentukan
label sentimen: **Bullish** / **Netral** / **Bearish** (dari sudut pandang dampak ke
saham Indonesia). Catat faktor konkret (mis. net sell asing Rp X T, keputusan Fed,
harga komoditas, MSCI rebalancing) — nanti dipakai di kesimpulan.

Kalau semua query gagal (offline / tool tidak tersedia), skip bagian ini dan tulis di
report: "Sentimen berita: tidak tersedia (search gagal)". Jangan mengarang berita.
<!-- ponytail: search live tiap run, no cache/DB. Berita selalu terbaru; kalau nanti butuh dipakai di UI, baru bikin endpoint backend. -->

## Langkah 5 — Report

Format:

1. **Konteks pasar** — 1 baris: IHSG hari ini (nilai + arah) dari langkah 1.
2. **Sentimen berita (dari langkah 4)** — 3 baris, satu per kategori:
   - `🇮🇩 Domestik: [Bullish/Netral/Bearish]` — 1 kalimat faktor utama (mis. "asing net sell Rp3,4 T 5 hari, transisi Gubernur BI").
   - `🌏 Global: [label]` — 1 kalimat (mis. "pasar wait-and-see jelang FOMC Fed").
   - `🀄 Regional: [label]` — 1 kalimat.
3. **Kandidat BUY hari ini** — TAMPILKAN SEMUA yang lolos (jangan dipotong), sudah
   urut dari terbaik. Per saham satu blok ringkas:
   - `SYMBOL` — signal (STRONG_BUY/BUY) · skor X/100 · confidence Y% · 🕌 kalau syariah
   - Entry: `entry_low`–`entry_high` (ideal `entry_ideal`) · Stop: `stop` · Target: `target` · RR 1:`risk_reward`
   - Probabilitas besok: Naik `up`% / Sideways `side`% / Turun `down`%
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
6. Tutup: 1 baris disclaimer — ini analisa probabilistik dari data Yahoo (delay) +
   rangkuman berita publik, bukan kepastian; selalu pakai stop-loss.

Harga IDX = integer rupiah, tanpa desimal. Ranking sudah dari backend — jangan
diurut ulang. Kalau `matched` = 0, bilang tidak ada setup BUY layak hari ini
(pasar lagi lesu) dan tetap tampilkan bagian warning.
