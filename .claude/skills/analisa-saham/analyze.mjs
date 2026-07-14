// Hitung fitur teknikal dari stock-api/data/{SYMBOL}.json — output JSON ke stdout.
// Pakai: node analyze.mjs SYMBOL [jumlahCandle=60]
import { readFileSync } from 'node:fs';

const sym = (process.argv[2] || '').toUpperCase().replace(/\.JK$/, '');
if (!sym) { console.error('usage: node analyze.mjs SYMBOL [n]'); process.exit(1); }
const n = parseInt(process.argv[3] || '60', 10);

const all = JSON.parse(readFileSync(new URL(`../../../stock-api/data/${sym}.json`, import.meta.url), 'utf8')).prices;
const p = all.slice(-n);
const closes = p.map(c => c.close), vols = p.map(c => c.volume);
const last = p[p.length - 1];

const sma = (arr, len) => arr.length < len ? null : +(arr.slice(-len).reduce((a, b) => a + b, 0) / len).toFixed(2);

// ATR14 (rata-rata true range sederhana)
const tr = p.map((c, i) => i === 0 ? c.high - c.low
  : Math.max(c.high - c.low, Math.abs(c.high - p[i - 1].close), Math.abs(c.low - p[i - 1].close)));
const atr14 = sma(tr, 14);

// Swing high/low (fractal 2 kiri 2 kanan)
const swings = [];
for (let i = 2; i < p.length - 2; i++) {
  const w = p.slice(i - 2, i + 3);
  if (p[i].high === Math.max(...w.map(c => c.high))) swings.push({ type: 'H', date: p[i].date, price: p[i].high });
  if (p[i].low === Math.min(...w.map(c => c.low))) swings.push({ type: 'L', date: p[i].date, price: p[i].low });
}
const highs = swings.filter(s => s.type === 'H'), lows = swings.filter(s => s.type === 'L');

// Market structure: bandingkan 2 swing terakhir tiap sisi
const struct = {};
if (highs.length >= 2) struct.high = highs.at(-1).price > highs.at(-2).price ? 'HH' : 'LH';
if (lows.length >= 2) struct.low = lows.at(-1).price > lows.at(-2).price ? 'HL' : 'LL';

// S/R: cluster harga swing dalam toleransi 1.5%, urut jumlah sentuhan
const levels = [];
for (const s of swings) {
  const hit = levels.find(l => Math.abs(l.price - s.price) / l.price < 0.015);
  if (hit) { hit.touches++; hit.price = (hit.price * (hit.touches - 1) + s.price) / hit.touches; }
  else levels.push({ price: s.price, touches: 1 });
}
levels.sort((a, b) => b.touches - a.touches);
const sr = levels.slice(0, 6).map(l => ({ price: Math.round(l.price), touches: l.touches }))
  .sort((a, b) => a.price - b.price);

const volAvg20 = sma(vols, 20);
const out = {
  symbol: sym, candles: p.length, from: p[0].date, to: last.date,
  last: { ...last, changePct: +((last.close - p.at(-2).close) / p.at(-2).close * 100).toFixed(2) },
  sma20: sma(closes, 20), sma50: sma(closes, 50), atr14,
  volAvg20, lastVolVsAvg: volAvg20 ? +(last.volume / volAvg20).toFixed(2) : null,
  structure: struct,
  swingsRecent: swings.slice(-8),
  srLevels: sr,
  recent10: p.slice(-10).map(c => ({ date: c.date, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume })),
  pctFromLow: +((last.close - Math.min(...closes)) / Math.min(...closes) * 100).toFixed(1),
  pctFromHigh: +((last.close - Math.max(...closes)) / Math.max(...closes) * 100).toFixed(1),
};
console.log(JSON.stringify(out, null, 2));
