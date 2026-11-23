export const fmt = {
  price: (n) => (n == null ? '-' : n.toLocaleString('id-ID')),
  pct:   (n) => (n == null ? '-' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`),
  chg:   (n) => (n == null ? '-' : `${n > 0 ? '+' : ''}${n.toLocaleString('id-ID')}`),
  vol:   (n) => {
    if (n == null) return '-'
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
    return String(n)
  },
  num:   (n, d = 2) => (n == null ? '-' : n.toFixed(d)),
}

export const colorOf = (n) =>
  n > 0 ? 'text-tv-green' : n < 0 ? 'text-tv-red' : 'text-tv-muted'

export const bgOf = (n) =>
  n > 0 ? 'bg-tv-green/10 text-tv-green' : n < 0 ? 'bg-tv-red/10 text-tv-red' : 'bg-tv-muted/10 text-tv-muted'

// Label tampilan saran (analysis.Saran): menggambarkan tren, bukan perintah
// beli/jual. API mengirim BUY | WAIT | SELL; STRONG_* hanya ada di payload lama.
const SIGNAL_LABEL = { STRONG_BUY: 'Tren naik kuat', BUY: 'Tren naik', WAIT: 'Tunggu', SELL: 'Tren turun', STRONG_SELL: 'Tren turun kuat' }
export const signalLabel = (s) => {
  const u = (s || '').toUpperCase().replace(/ /g, '_')
  return SIGNAL_LABEL[u] ?? u.replace(/_/g, ' ')
}

export const signalStyle = (s) => {
  const u = (s || '').toUpperCase().replace(/ /g, '_')
  if (!u) return 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
  if (u === 'STRONG_BUY')  return 'bg-tv-green text-white border-tv-green'
  if (u === 'BUY')         return 'bg-tv-green/15 text-tv-green border-tv-green/30'
  if (u === 'STRONG_SELL') return 'bg-tv-red text-white border-tv-red'
  if (u === 'SELL')        return 'bg-tv-red/15 text-tv-red border-tv-red/30'
  return 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
}

// Shared lightweight-charts base options (dark theme) for the indicator and
// practice charts. ChartTab keeps its own richer config.
export const LW_BASE = {
  autoSize: true,
  layout: {
    background: { color: 'transparent' },
    textColor: '#787b86',
    fontSize: 10,
    fontFamily: 'Inter, sans-serif',
    attributionLogo: false,
  },
  grid: {
    vertLines: { visible: false },
    horzLines: { color: '#2a2e3950', style: 2 }, // LineStyle.Dashed
  },
  crosshair: {
    vertLine: { color: '#787b86', width: 1, style: 2, labelBackgroundColor: '#2a2e39' },
    horzLine: { color: '#787b86', width: 1, style: 2, labelBackgroundColor: '#2a2e39' },
  },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false },
  // charts sit in the page's scroll flow: don't trap the wheel / vertical swipe
  handleScale: { mouseWheel: false },
  handleScroll: { mouseWheel: false, vertTouchDrag: false },
}

// Rekam jejak historis Decision Engine (dari /api/calibration, terlampir di
// decision & screen). Frekuensi nyata dari replay historis, bukan rumus skor.
export const REGIME_LABEL = { up: 'IHSG di atas MA50', down: 'IHSG di bawah MA50', unknown: 'kondisi IHSG tidak diketahui' }

// Rata-rata hasil di depan: win rate tinggi tetap rugi kalau target lebih dekat dari stop.
export const calibShort = (c) =>
  c?.samples ? `Historis rata-rata ${fmt.pct(c.avg_pnl_pct)}/trade · kena TP ${Math.round(c.win_rate)}% (n=${c.samples.toLocaleString('id-ID')})` : null
