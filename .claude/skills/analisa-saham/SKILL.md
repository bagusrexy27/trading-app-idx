---
name: analisa-saham
description: Analisa teknikal bertingkat ala quant trader untuk saham IDX dari data OHLCV lokal — market structure, support/resistance, volume, candlestick, momentum, probabilitas, entry/SL/TP, dan skor akhir. Trigger — /analisa-saham SYMBOL.
---

# Analisa Saham (metode bertingkat)

Analisa saham IDX dari `stock-api/data/{SYMBOL}.json` dengan metodologi quant: struktur dulu, candle terakhir belakangan. Output dalam Bahasa Indonesia.

## Langkah 0 — Data

1. Kalau server jalan (cek cepat `GET http://localhost:1111/api/ihsg` atau skip kalau sudah tahu), refresh dulu: `POST http://localhost:1111/api/stocks/{SYMBOL}/update`. Server mati → pakai data yang ada, sebutkan tanggal data terakhir di output.
2. Hitung fitur (JANGAN hitung manual dari candle satu per satu — rawan salah):
   ```bash
   node .claude/skills/analisa-saham/analyze.mjs SYMBOL [n=60]
   ```
   Output: last candle + changePct, sma20/50, atr14, volAvg20, lastVolVsAvg, structure (HH/LH + HL/LL), swingsRecent, srLevels (cluster + jumlah sentuhan), recent10 candle, pctFromLow/High.

Interpretasi dan penilaian di langkah berikut adalah tugasmu — script hanya menyediakan angka.

## Langkah 1 — Trend besar (market structure)

Dari `swingsRecent` + `structure`, bagi riwayat jadi fase: uptrend (HH+HL), downtrend (LH+LL), atau transisi/reversal (baru mulai HH/HL setelah LL). Ceritakan fase-fasenya singkat. Ini faktor paling penting.

## Langkah 2 — Support & Resistance

Dari `srLevels`: level dengan sentuhan terbanyak = paling kuat. Petakan relatif ke harga sekarang: resistance besar, resistance minor, support kuat, swing low. Tampilkan sebagai daftar level.

## Langkah 3 — Volume

Bandingkan volume saat naik vs saat turun (lihat `recent10`), dan `lastVolVsAvg`:
- Naik + volume naik = sehat.
- Naik + volume kecil (< 0.8× avg) = hati-hati, belum didukung.
- Turun + volume besar = seller kuat.

## Langkah 4 — Candlestick (konfirmasi saja, bukan sinyal utama)

Baca 2–3 candle terakhir dari `recent10`: body besar/kecil, arah, pola (engulfing, hammer, pin bar, inside bar, doji). Simpulkan siapa menang dan seberapa dominan.

## Langkah 5 — Momentum & volatilitas

- % kenaikan/penurunan dari swing terakhir (`pctFromLow`/`pctFromHigh`). Naik cepat >15% dalam waktu singkat = rawan istirahat/pullback.
- ATR14 vs harga: apakah saham "bernapas" normal atau terlalu panas.
- Posisi vs SMA20/50.

## Langkah 6 — Skor & probabilitas

Scoring berbobot (jangan pakai feeling):

| Faktor | Bobot |
|---|---|
| Market structure (HH/HL, BOS, CHoCH) | 35% |
| Volume (konfirmasi breakout/reversal) | 25% |
| Jarak ke support/resistance | 20% |
| Candlestick | 10% |
| Volatilitas/momentum (ATR, panas/tidak) | 10% |

Tampilkan tabel skor per faktor (misal −10..+10 per faktor, dikali bobot) → skor total 0–100.
- ≥ 65 → **BUY**
- 40–64 → **WAIT**
- < 40 → **AVOID/SELL**

Lalu probabilitas skenario besok: Naik X% / Sideways Y% / Turun Z% (jumlah 100%), masing-masing dengan alasan satu baris.

## Langkah 7 — Trade plan (hanya kalau BUY/lean bullish)

- **Entry**: jangan kejar setelah hijau panjang — tunggu pullback ke area support/breakout retest. Sebutkan harga.
- **Stop Loss**: sedikit di bawah support terdekat (bukan pas di support). Tembus = keluar, tidak berharap.
- **Take Profit**: TP1/TP2/TP3 = resistance bertingkat dari srLevels.
- **Risk/Reward**: hitung eksplisit. RR < 1:2 → bilang setup kurang menarik.
- Harga IDX = integer rupiah; patuhi tick size IDX (mis. <200: 1, 200–500: 2, 500–2000: 5, 2000–5000: 10, ≥5000: 25).

## Format output

Ringkas tapi lengkap: fase trend → level S/R → volume → candle → tabel skor → verdict + probabilitas → trade plan. Tutup dengan disclaimer satu baris bahwa ini analisa probabilistik, bukan kepastian.

Pembanding opsional: `GET http://localhost:1111/api/analysis/{SYMBOL}/advisor` (rule engine internal app). Kalau verdict beda jauh dengan analisamu, sebutkan bedanya.
