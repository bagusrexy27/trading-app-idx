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

export const signalStyle = (s) => {
  if (!s) return 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
  const u = s.toUpperCase()
  if (u.includes('STRONG BUY'))  return 'bg-tv-green text-white border-tv-green'
  if (u.includes('BUY'))         return 'bg-tv-green/15 text-tv-green border-tv-green/30'
  if (u.includes('STRONG SELL')) return 'bg-tv-red text-white border-tv-red'
  if (u.includes('SELL'))        return 'bg-tv-red/15 text-tv-red border-tv-red/30'
  return 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
}

export const APEX_DARK = {
  chart: {
    background: 'transparent',
    animations: {
      enabled: true,
      easing: 'easeinout',
      speed: 550,
      animateGradually: { enabled: false },
      dynamicAnimation: { enabled: true, speed: 300 },
    },
  },
  theme:  { mode: 'dark' },
  grid:   { borderColor: '#2a2e39', strokeDashArray: 4, xaxis: { lines: { show: false } } },
  xaxis:  {
    type: 'category',
    tickAmount: 8,
    axisBorder: { show: false },
    axisTicks:  { show: false },
    labels: { style: { colors: '#787b86', fontSize: '10px' }, rotate: 0, formatter: v => v ? v.slice(5) : '' },
  },
  yaxis: { labels: { style: { colors: '#787b86', fontSize: '10px' } } },
  tooltip: { theme: 'dark' },
  legend:  { show: false },
  dataLabels: { enabled: false },
}
