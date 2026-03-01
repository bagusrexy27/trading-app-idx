import { useMemo } from 'react'
import ReactApexChart from 'react-apexcharts'
import { fmt, APEX_DARK } from '../utils'

// Format "YYYY-MM-DD" → "4 Feb", "24 Jan"
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = v => {
  if (!v || !v.includes('-')) return ''
  const p = v.split('-')
  return `${+p[2]} ${MONTHS[+p[1]]}`
}

// type:'category' — only columns for dates that exist in the data (no weekend/holiday gaps)
const CAT_XAXIS = {
  type: 'category',
  tickAmount: 6,
  axisBorder: { show: false },
  axisTicks:  { show: false },
  labels: {
    style: { colors: '#787b86', fontSize: '10px' },
    rotate: 0,
    formatter: fmtDate,
  },
  crosshairs: {
    show: true,
    width: 1,
    position: 'back',
    stroke: { color: '#787b86', width: 1, dashArray: 3 },
  },
  tooltip: { enabled: false },
}

// Base chart config: grouped so all 4 indicators pan/zoom together
const indChart = (id, type, height) => ({
  ...APEX_DARK.chart,
  id,
  group: 'indicatorGroup',
  type,
  height,
  toolbar: {
    show: true,
    autoSelected: 'pan',
    // zoom:false removes drag-selection-zoom; drag ALWAYS pans. Zoom via +/- buttons still works.
    tools: { download: false, selection: false, zoom: false, zoomin: true, zoomout: true, pan: true, reset: true },
  },
  // enabled:false disables drag-to-zoom at the engine level; zoom +/- buttons still work via API
  zoom: { enabled: false, type: 'x', autoScaleYaxis: true },
})

export default function Indicators({ data }) {
  const { rsi, macd, bollinger, stoch, prices, obv } = data

  // Master date list from prices — all indicator charts use this as their category array.
  // This ensures all charts have identical category counts so group sync works correctly
  // even though RSI/MACD/etc have fewer points (warmup period → shown as null at the start).
  const dates = useMemo(() => prices.map(p => p.date), [prices])

  return (
    <div className="p-4 space-y-4">
      <div className="animate-slide-up stagger-1"><RSIChart       rsi={rsi}                  dates={dates} /></div>
      <div className="animate-slide-up stagger-2"><MACDChart      macd={macd}                dates={dates} /></div>
      <div className="animate-slide-up stagger-3"><BollingerChart bollinger={bollinger} prices={prices} dates={dates} /></div>
      <div className="animate-slide-up stagger-4"><StochChart     stoch={stoch}              dates={dates} /></div>
      <div className="animate-slide-up stagger-5"><OBVChart       obv={obv ?? []}            dates={dates} /></div>
    </div>
  )
}

/* ── RSI ─────────────────────────────────────────────────────────────── */
function RSIChart({ rsi, dates }) {
  const last  = rsi[rsi.length - 1]
  const val   = last?.value ?? 0
  const label = val >= 70 ? 'Overbought' : val <= 30 ? 'Oversold' : 'Neutral'
  const color = val >= 70 ? '#ef5350'   : val <= 30 ? '#26a69a'   : '#9c6bff'

  const rsiMap = useMemo(() => Object.fromEntries(rsi.map(p => [p.date, p.value])), [rsi])
  const rsiData = dates.map(date => ({ x: date, y: rsiMap[date] ?? null }))

  const opts = {
    ...APEX_DARK,
    chart: indChart('ind-rsi', 'line', 180),
    xaxis: CAT_XAXIS,
    stroke: { width: 1.5, curve: 'smooth' },
    colors: [color],
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', gradientToColors: [color], stops: [0, 100], opacityFrom: 0.2, opacityTo: 0 },
    },
    yaxis: {
      min: 0, max: 100,
      labels: { style: { colors: '#787b86', fontSize: '10px' } },
      tickAmount: 4,
    },
    annotations: {
      yaxis: [
        { y: 70, borderColor: '#ef535060', strokeDashArray: 5, label: { text: '70', style: { background: 'transparent', color: '#ef5350', fontSize: '10px' } } },
        { y: 30, borderColor: '#26a69a60', strokeDashArray: 5, label: { text: '30', style: { background: 'transparent', color: '#26a69a', fontSize: '10px' } } },
      ],
    },
    tooltip: { theme: 'dark', y: { formatter: v => v?.toFixed(2) } },
  }

  return (
    <IndicatorCard
      title="RSI (14)"
      current={fmt.num(val)}
      badge={label}
      badgeColor={val >= 70 ? 'text-tv-red bg-tv-red/10 border-tv-red/30' : val <= 30 ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-purple bg-tv-purple/10 border-tv-purple/30'}
    >
      <ReactApexChart type="area" height={180} series={[{ name: 'RSI', data: rsiData }]} options={opts} />
    </IndicatorCard>
  )
}

/* ── MACD ─────────────────────────────────────────────────────────────── */
function MACDChart({ macd, dates }) {
  const last  = macd[macd.length - 1]
  const isPos = (last?.histogram ?? 0) >= 0

  const macdMap = useMemo(() => Object.fromEntries(macd.map(p => [p.date, p])), [macd])

  const macdLine = dates.map(date => ({ x: date, y: macdMap[date]?.macd    ?? null }))
  const sigLine  = dates.map(date => ({ x: date, y: macdMap[date]?.signal  ?? null }))
  const histData = dates.map(date => {
    const v = macdMap[date]?.histogram ?? null
    return {
      x: date, y: v,
      fillColor:   v == null ? 'transparent' : v >= 0 ? '#26a69a55' : '#ef535055',
      strokeColor: v == null ? 'transparent' : v >= 0 ? '#26a69a'   : '#ef5350',
    }
  })

  const opts = {
    ...APEX_DARK,
    chart: indChart('ind-macd', 'line', 200),
    xaxis: CAT_XAXIS,
    stroke: { width: [1.5, 1.5, 0], curve: 'smooth' },
    colors: ['#2196f3', '#ffc107'],
    markers: { size: 0 },
    annotations: {
      yaxis: [{ y: 0, borderColor: '#2a2e39', strokeDashArray: 0 }],
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      y: [{ formatter: v => v?.toFixed(2) }, { formatter: v => v?.toFixed(2) }, { formatter: v => v?.toFixed(2) }],
    },
    legend: { show: true, labels: { colors: '#d1d4dc' }, fontSize: '10px' },
  }

  return (
    <IndicatorCard
      title="MACD (12, 26, 9)"
      current={`H: ${last?.histogram > 0 ? '+' : ''}${fmt.num(last?.histogram)}`}
      badge={isPos ? 'Bullish' : 'Bearish'}
      badgeColor={isPos ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-red bg-tv-red/10 border-tv-red/30'}
    >
      <ReactApexChart
        type="line"
        height={200}
        series={[
          { name: 'MACD',      type: 'line', data: macdLine },
          { name: 'Signal',    type: 'line', data: sigLine  },
          { name: 'Histogram', type: 'bar',  data: histData },
        ]}
        options={opts}
      />
    </IndicatorCard>
  )
}

/* ── Bollinger ─────────────────────────────────────────────────────────── */
function BollingerChart({ bollinger, prices, dates }) {
  const last = bollinger[bollinger.length - 1]
  const pb   = last?.percent_b ?? 50
  const zone = pb >= 95 ? 'Upper Band' : pb <= 5 ? 'Lower Band' : 'Mid Band'

  const bollMap  = useMemo(() => Object.fromEntries(bollinger.map(p => [p.date, p])), [bollinger])
  const closeMap = useMemo(() => Object.fromEntries(prices.map(p => [p.date, p.close])), [prices])

  const opts = {
    ...APEX_DARK,
    chart: indChart('ind-boll', 'line', 220),
    xaxis: CAT_XAXIS,
    stroke: { width: [1.5, 1, 1.5, 1], curve: 'smooth', dashArray: [0, 4, 0, 4] },
    colors: ['#d1d4dc', '#ef535066', '#ffc107', '#26a69a66'],
    fill: { type: 'solid', opacity: [1, 0.1, 1, 0.1] },
    markers: { size: 0 },
    yaxis: { labels: { style: { colors: '#787b86', fontSize: '10px' }, formatter: v => fmt.price(v) } },
    tooltip: { theme: 'dark', shared: true },
    legend: { show: true, labels: { colors: '#d1d4dc' }, fontSize: '10px' },
  }

  return (
    <IndicatorCard
      title="Bollinger Bands (20, 2)"
      current={`%B: ${fmt.num(pb)}%`}
      badge={zone}
      badgeColor={pb >= 95 ? 'text-tv-red bg-tv-red/10 border-tv-red/30' : pb <= 5 ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-muted bg-tv-muted/10 border-tv-muted/20'}
    >
      <ReactApexChart
        type="line"
        height={220}
        series={[
          { name: 'Close',  data: dates.map(date => ({ x: date, y: closeMap[date]       ?? null })) },
          { name: 'Upper',  data: dates.map(date => ({ x: date, y: bollMap[date]?.upper  ?? null })) },
          { name: 'Middle', data: dates.map(date => ({ x: date, y: bollMap[date]?.middle ?? null })) },
          { name: 'Lower',  data: dates.map(date => ({ x: date, y: bollMap[date]?.lower  ?? null })) },
        ]}
        options={opts}
      />
    </IndicatorCard>
  )
}

/* ── Stochastic ─────────────────────────────────────────────────────────── */
function StochChart({ stoch, dates }) {
  const last  = stoch[stoch.length - 1]
  const k     = last?.k ?? 0
  const label = k >= 80 ? 'Overbought' : k <= 20 ? 'Oversold' : 'Neutral'

  const stochMap = useMemo(() => Object.fromEntries(stoch.map(p => [p.date, p])), [stoch])

  const opts = {
    ...APEX_DARK,
    chart: indChart('ind-stoch', 'line', 180),
    xaxis: CAT_XAXIS,
    stroke: { width: [1.5, 1.5], curve: 'smooth' },
    colors: ['#2196f3', '#ffc107'],
    markers: { size: 0 },
    yaxis: {
      min: 0, max: 100,
      labels: { style: { colors: '#787b86', fontSize: '10px' } },
      tickAmount: 4,
    },
    annotations: {
      yaxis: [
        { y: 80, borderColor: '#ef535060', strokeDashArray: 5 },
        { y: 20, borderColor: '#26a69a60', strokeDashArray: 5 },
      ],
    },
    legend: { show: true, labels: { colors: '#d1d4dc' }, fontSize: '10px' },
    tooltip: {
      theme: 'dark',
      shared: true,
      y: [{ formatter: v => v?.toFixed(2) + '%' }, { formatter: v => v?.toFixed(2) + '%' }],
    },
  }

  return (
    <IndicatorCard
      title="Stochastic (14, 3)"
      current={`%K: ${fmt.num(k)}`}
      badge={label}
      badgeColor={k >= 80 ? 'text-tv-red bg-tv-red/10 border-tv-red/30' : k <= 20 ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-muted bg-tv-muted/10 border-tv-muted/20'}
    >
      <ReactApexChart
        type="line"
        height={180}
        series={[
          { name: '%K', data: dates.map(date => ({ x: date, y: stochMap[date]?.k ?? null })) },
          { name: '%D', data: dates.map(date => ({ x: date, y: stochMap[date]?.d ?? null })) },
        ]}
        options={opts}
      />
    </IndicatorCard>
  )
}

/* ── OBV ─────────────────────────────────────────────────────────────── */
function OBVChart({ obv, dates }) {
  const last     = obv[obv.length - 1]
  const prev     = obv[obv.length - 2]
  const trending = last && prev ? (last.value > prev.value ? 'Rising' : last.value < prev.value ? 'Falling' : 'Flat') : '—'
  const trendColor = trending === 'Rising' ? 'text-tv-green bg-tv-green/10 border-tv-green/30'
                   : trending === 'Falling' ? 'text-tv-red bg-tv-red/10 border-tv-red/30'
                   : 'text-tv-muted bg-tv-muted/10 border-tv-muted/20'

  const obvMap  = useMemo(() => Object.fromEntries(obv.map(p => [p.date, p.value])), [obv])
  const obvData = dates.map(date => ({ x: date, y: obvMap[date] ?? null }))

  const opts = {
    ...APEX_DARK,
    chart: indChart('ind-obv', 'line', 160),
    xaxis: CAT_XAXIS,
    stroke: { width: 1.5, curve: 'smooth' },
    colors: ['#ffc107'],
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', gradientToColors: ['#ffc107'], stops: [0, 100], opacityFrom: 0.15, opacityTo: 0 },
    },
    yaxis: {
      labels: {
        style: { colors: '#787b86', fontSize: '10px' },
        formatter: v => {
          if (v == null) return ''
          const abs = Math.abs(v)
          if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'B'
          if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M'
          if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'K'
          return v.toFixed(0)
        },
      },
    },
    annotations: {
      yaxis: [{ y: 0, borderColor: '#2a2e39', strokeDashArray: 0 }],
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: v => {
          if (v == null) return ''
          const abs = Math.abs(v)
          if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B'
          if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M'
          if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'K'
          return v.toFixed(0)
        },
      },
    },
  }

  return (
    <IndicatorCard
      title="OBV (On-Balance Volume)"
      current={(() => {
        const v = last?.value ?? 0
        const abs = Math.abs(v)
        if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B'
        if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M'
        if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'K'
        return v.toFixed(0)
      })()}
      badge={trending}
      badgeColor={trendColor}
    >
      <ReactApexChart type="area" height={160} series={[{ name: 'OBV', data: obvData }]} options={opts} />
    </IndicatorCard>
  )
}

/* ── Shared card wrapper ─────────────────────────────────────────────── */
function IndicatorCard({ title, current, badge, badgeColor, children }) {
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
    </div>
  )
}
