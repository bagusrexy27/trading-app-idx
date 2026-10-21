import { useEffect, useMemo, useRef } from 'react'
import { createChart, AreaSeries, LineSeries, HistogramSeries } from 'lightweight-charts'
import { fmt, LW_BASE } from '../utils'

// 1.2B / 3.4M / 560K — keeps the sign (OBV goes negative)
const compact = (v, d = 2) => {
  if (v == null) return ''
  const abs = Math.abs(v)
  if (abs >= 1e9) return (v / 1e9).toFixed(d) + 'B'
  if (abs >= 1e6) return (v / 1e6).toFixed(d) + 'M'
  if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'K'
  return v.toFixed(0)
}

// Every chart gets one point per price date — a whitespace point ({ time })
// during an indicator's warm-up — so logical indexes line up across charts
// and the pan/zoom sync below maps bar-to-bar.
const align = (dates, map, toPoint) => dates.map(time => map.has(time) ? { time, ...toPoint(map.get(time)) } : { time })

export default function Indicators({ data }) {
  const { rsi, macd, prices, obv } = data
  const dates = useMemo(() => prices.map(p => p.date), [prices])

  // Pan/zoom one chart → the others follow.
  const charts = useRef(new Set())
  const syncing = useRef(false)
  const register = (chart) => {
    charts.current.add(chart)
    const onRange = (range) => {
      if (syncing.current || !range) return
      syncing.current = true
      charts.current.forEach(c => c !== chart && c.timeScale().setVisibleLogicalRange(range))
      syncing.current = false
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    return () => charts.current.delete(chart)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="animate-slide-up stagger-1"><RSIChart  rsi={rsi}       dates={dates} register={register} /></div>
      <div className="animate-slide-up stagger-2"><MACDChart macd={macd}     dates={dates} register={register} /></div>
      <div className="animate-slide-up stagger-3"><OBVChart  obv={obv ?? []} dates={dates} register={register} /></div>
    </div>
  )
}

// Creates the chart, lets `build` add series + data, registers it for sync.
// Rebuilt whenever deps change — data here is small (≤ a few hundred bars).
function LWChart({ height, register, build, deps }) {
  const ref = useRef(null)
  useEffect(() => {
    const chart = createChart(ref.current, LW_BASE)
    build(chart)
    chart.timeScale().fitContent()
    const unregister = register(chart)
    return () => { unregister(); chart.remove() }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} style={{ height }} />
}

/* ── RSI ─────────────────────────────────────────────────────────────── */
function RSIChart({ rsi, dates, register }) {
  const val   = rsi[rsi.length - 1]?.value ?? 0
  const label = val >= 70 ? 'Overbought' : val <= 30 ? 'Oversold' : 'Neutral'
  const color = val >= 70 ? '#ef5350'   : val <= 30 ? '#26a69a'   : '#9c6bff'

  const build = (chart) => {
    const s = chart.addSeries(AreaSeries, {
      lineColor: color, lineWidth: 1.5, topColor: color + '33', bottomColor: color + '00',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    })
    s.setData(align(dates, new Map(rsi.map(p => [p.date, p.value])), value => ({ value })))
    s.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.05 } })
    s.createPriceLine({ price: 70, color: '#ef535090', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '' })
    s.createPriceLine({ price: 30, color: '#26a69a90', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: '' })
  }

  return (
    <IndicatorCard
      title="RSI (14)"
      current={fmt.num(val)}
      badge={label}
      badgeColor={val >= 70 ? 'text-tv-red bg-tv-red/10 border-tv-red/30' : val <= 30 ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-purple bg-tv-purple/10 border-tv-purple/30'}
    >
      <LWChart height={180} register={register} build={build} deps={[rsi, dates]} />
    </IndicatorCard>
  )
}

/* ── MACD ─────────────────────────────────────────────────────────────── */
function MACDChart({ macd, dates, register }) {
  const last  = macd[macd.length - 1]
  const isPos = (last?.histogram ?? 0) >= 0

  const build = (chart) => {
    const map = new Map(macd.map(p => [p.date, p]))
    const fmt2 = { type: 'price', precision: 2, minMove: 0.01 }
    const hist = chart.addSeries(HistogramSeries, { priceFormat: fmt2, priceLineVisible: false, lastValueVisible: false })
    hist.setData(align(dates, map, p => ({ value: p.histogram, color: p.histogram >= 0 ? '#26a69a88' : '#ef535088' })))
    hist.createPriceLine({ price: 0, color: '#2a2e39', lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' })
    const line = (color, key) => chart.addSeries(LineSeries, { color, lineWidth: 1.5, priceFormat: fmt2, priceLineVisible: false, crosshairMarkerVisible: false })
      .setData(align(dates, map, p => ({ value: p[key] })))
    line('#2196f3', 'macd')
    line('#ffc107', 'signal')
  }

  return (
    <IndicatorCard
      title="MACD (12, 26, 9)"
      current={`H: ${last?.histogram > 0 ? '+' : ''}${fmt.num(last?.histogram)}`}
      badge={isPos ? 'Bullish' : 'Bearish'}
      badgeColor={isPos ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-red bg-tv-red/10 border-tv-red/30'}
      legend={[['MACD', '#2196f3'], ['Signal', '#ffc107'], ['Histogram', '#26a69a']]}
    >
      <LWChart height={200} register={register} build={build} deps={[macd, dates]} />
    </IndicatorCard>
  )
}

/* ── OBV ─────────────────────────────────────────────────────────────── */
function OBVChart({ obv, dates, register }) {
  const last     = obv[obv.length - 1]
  const prev     = obv[obv.length - 2]
  const trending = last && prev ? (last.value > prev.value ? 'Rising' : last.value < prev.value ? 'Falling' : 'Flat') : '—'
  const trendColor = trending === 'Rising' ? 'text-tv-green bg-tv-green/10 border-tv-green/30'
                   : trending === 'Falling' ? 'text-tv-red bg-tv-red/10 border-tv-red/30'
                   : 'text-tv-muted bg-tv-muted/10 border-tv-muted/20'

  const build = (chart) => {
    const s = chart.addSeries(AreaSeries, {
      lineColor: '#ffc107', lineWidth: 1.5, topColor: '#ffc10726', bottomColor: '#ffc10700',
      priceFormat: { type: 'custom', formatter: v => compact(v, 1) },
    })
    s.setData(align(dates, new Map(obv.map(p => [p.date, p.value])), value => ({ value })))
    s.createPriceLine({ price: 0, color: '#2a2e39', lineWidth: 1, lineStyle: 0, axisLabelVisible: false, title: '' })
  }

  return (
    <IndicatorCard title="OBV (On-Balance Volume)" current={compact(last?.value ?? 0)} badge={trending} badgeColor={trendColor}>
      <LWChart height={160} register={register} build={build} deps={[obv, dates]} />
    </IndicatorCard>
  )
}

/* ── Shared card wrapper ─────────────────────────────────────────────── */
function IndicatorCard({ title, current, badge, badgeColor, legend, children }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums text-tv-text">{current}</span>
          {badge && (
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
      </div>
      {children}
      {legend && (
        <div className="flex gap-3 mt-1 text-[10px] text-tv-muted">
          {legend.map(([name, color]) => (
            <span key={name} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: color }} />{name}</span>
          ))}
        </div>
      )}
    </div>
  )
}
