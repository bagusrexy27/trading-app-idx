// Client-side bar math for ChartTab: resampling daily bars to weekly/monthly
// and the indicators drawn on the chart, so they work on any timeframe.
// Checked by bars.test.js.

// Bucket key per timeframe — the bar is stamped with its first trading day.
const weekKey = (date) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // back to Monday
  return d.toISOString().slice(0, 10)
}

export function resample(prices, tf) {
  if (tf === 'D') return prices
  const key = tf === 'W' ? weekKey : (d) => d.slice(0, 7)
  const out = []
  let cur = null, curKey = null
  for (const p of prices) {
    const k = key(p.date)
    if (k !== curKey) {
      cur = { date: p.date, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume }
      curKey = k
      out.push(cur)
    } else {
      cur.high = Math.max(cur.high, p.high)
      cur.low = Math.min(cur.low, p.low)
      cur.close = p.close
      cur.volume += p.volume
    }
  }
  return out
}

// → [{ time, value }] starting once n bars exist
export function sma(bars, n) {
  const out = []
  let sum = 0
  bars.forEach((b, i) => {
    sum += b.close
    if (i >= n) sum -= bars[i - n].close
    if (i >= n - 1) out.push({ time: b.date, value: sum / n })
  })
  return out
}

const emaOf = (vals, n) => {
  const k = 2 / (n + 1)
  const out = new Array(vals.length).fill(null)
  if (vals.length < n) return out
  let e = vals.slice(0, n).reduce((a, v) => a + v, 0) / n
  out[n - 1] = e
  for (let i = n; i < vals.length; i++) out[i] = e = vals[i] * k + e * (1 - k)
  return out
}

// Wilder RSI, same definition as the backend (analysis.RSI).
export function rsi(bars, n = 14) {
  const out = []
  if (bars.length <= n) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const ch = bars[i].close - bars[i - 1].close
    if (ch > 0) gain += ch; else loss -= ch
  }
  gain /= n; loss /= n
  const val = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  out.push({ time: bars[n].date, value: val() })
  for (let i = n + 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close
    gain = (gain * (n - 1) + Math.max(ch, 0)) / n
    loss = (loss * (n - 1) + Math.max(-ch, 0)) / n
    out.push({ time: bars[i].date, value: val() })
  }
  return out
}

// MACD(12,26,9) → { macd, signal, hist } as [{ time, value }]
export function macd(bars, fast = 12, slow = 26, sig = 9) {
  const closes = bars.map(b => b.close)
  const f = emaOf(closes, fast), s = emaOf(closes, slow)
  const line = []
  bars.forEach((b, i) => { if (f[i] != null && s[i] != null) line.push({ time: b.date, value: f[i] - s[i] }) })
  const sg = emaOf(line.map(p => p.value), sig)
  const signal = [], hist = []
  line.forEach((p, i) => {
    if (sg[i] == null) return
    signal.push({ time: p.time, value: sg[i] })
    hist.push({ time: p.time, value: p.value - sg[i] })
  })
  return { macd: line, signal, hist }
}
