import { useState, useEffect, useMemo } from 'react'
import ReactApexChart from 'react-apexcharts'
import { api } from '../api'
import { fmt, APEX_DARK } from '../utils'

// Fibonacci retracement levels: key in API response, label, line color
const FIB_STYLE = [
  ['l0',   '0%',    '#8a8f98'],
  ['l236', '23.6%', '#7c8aff'],
  ['l382', '38.2%', '#2ebd85'],
  ['l500', '50%',   '#f5b950'],
  ['l618', '61.8%', '#f6465d'],
  ['l786', '78.6%', '#a78bfa'],
  ['l100', '100%',  '#8a8f98'],
]

const RANGES = ['1W', '1M', '3M', '6M', '1Y', 'All']
const RANGE_DAYS = { '1W': 5, '1M': 22, '3M': 66, '6M': 132, '1Y': 252, 'All': 9999 }

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = v => {
  if (!v || !v.includes('-')) return ''
  const p = v.split('-')
  return `${+p[2]} ${MONTHS[+p[1]]}`
}

export default function ChartTab({ data, symbol }) {
  const [range, setRange] = useState('3M')
  const [showFib, setShowFib] = useState(false)
  const [fib, setFib] = useState(null)          // FibLevels dari API (lookback 100 bar)
  // Indicator visibility toggles — klik legend untuk on/off
  const [showSma20, setShowSma20] = useState(true)
  const [showSma50, setShowSma50] = useState(true)
  const [showVol,   setShowVol]   = useState(true)
  const { prices, sma20, sma50 } = data

  // Fetch level fibonacci saat toggle pertama dinyalakan
  useEffect(() => {
    if (!showFib || fib || !symbol) return
    let alive = true
    api.analysis.fibonacci(symbol)
      .then(r => { if (alive) setFib(r.levels) })
      .catch(() => { if (alive) setShowFib(false) })
    return () => { alive = false }
  }, [showFib, fib, symbol])
  useEffect(() => { setFib(null); setShowFib(false) }, [symbol])

  const sliced   = useMemo(() => prices.slice(-RANGE_DAYS[range]), [prices, range])
  const sma20Map = useMemo(() => Object.fromEntries(sma20.map(p => [p.date, p.value])), [sma20])
  const sma50Map = useMemo(() => Object.fromEntries(sma50.map(p => [p.date, p.value])), [sma50])
  const cats     = useMemo(() => sliced.map(p => p.date), [sliced])

  const candleData = sliced.map(p => ({ x: p.date, y: [p.open, p.high, p.low, p.close] }))
  // Saat toggle off, seri diisi null agar index colors/stroke tetap sejajar
  const sma20Data  = sliced.map(p => ({ x: p.date, y: showSma20 ? (sma20Map[p.date] ?? null) : null }))
  const sma50Data  = sliced.map(p => ({ x: p.date, y: showSma50 ? (sma50Map[p.date] ?? null) : null }))
  const volumeData = sliced.map(p => ({
    x: p.date,
    y: p.volume,
    fillColor:   p.close >= p.open ? '#26a69a55' : '#ef535055',
    strokeColor: p.close >= p.open ? '#26a69a'   : '#ef5350',
  }))

  const last   = sliced[sliced.length - 1]
  const lastUp = last ? last.close >= last.open : true

  // Shared category x-axis base — explicit categories required so the crosshair
  // snaps to the center of each bar, not the category edge
  const catBase = useMemo(() => ({
    type: 'category',
    categories: cats,
    tickAmount: 8,
    axisBorder: { show: false },
    axisTicks:  { show: false },
    crosshairs: {
      show: true,
      width: 'barWidth',
      position: 'back',
      fill:   { type: 'solid', color: 'rgba(120,123,134,0.08)' },
      stroke: { color: '#787b86', width: 1, dashArray: 3 },
    },
    tooltip: { enabled: false },
  }), [cats])

  // ── Main chart: candlestick + SMA20 + SMA50 overlay ─────────────────
  const priceOpts = useMemo(() => ({
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      id: 'chart-candle',
      group: 'chartGroup',
      type: 'candlestick',
      height: 420,
      toolbar: {
        show: true,
        autoSelected: 'pan',
        // zoom:false removes drag-selection-zoom entirely; drag now ALWAYS pans (TradingView style)
        tools: { download: false, zoom: false, pan: true, reset: true, selection: false, zoomin: true, zoomout: true },
      },
      // enabled:false disables drag-to-zoom at the engine level; zoom buttons still work via API
      zoom: { enabled: false, type: 'x', autoScaleYaxis: true },
    },
    plotOptions: {
      candlestick: {
        colors: { upward: '#26a69a', downward: '#ef5350' },
        wick: { useFillColor: true },
      },
    },
    // stroke index: [candlestick_wick, SMA20, SMA50]
    stroke: { width: [1, 1.5, 1.5], curve: 'smooth', dashArray: [0, 0, 6] },
    // colors index: [OHLC (ignored by candlestick renderer), SMA20, SMA50]
    colors: ['transparent', '#ffc107', '#9c6bff'],
    // labels tampil di chart volume; kalau volume disembunyikan, tampilkan di sini
    xaxis: { ...catBase, labels: showVol ? { show: false } : { show: true, style: { colors: '#8a8f98', fontSize: '10px' }, rotate: 0, formatter: fmtDate } },
    yaxis: {
      tooltip: { enabled: true },
      tickAmount: 6,
      forceNiceScale: true,
      labels: {
        style: { colors: '#787b86', fontSize: '10px' },
        formatter: v => fmt.price(v),
      },
    },
    grid: {
      borderColor: '#2a2e3950',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { right: 8 },
    },
    annotations: {
      yaxis: [
        ...(last ? [{
          y: last.close,
          borderColor: lastUp ? '#26a69a' : '#ef5350',
          borderWidth: 1,
          strokeDashArray: 3,
          label: {
            borderColor: 'transparent',
            style: {
              background: lastUp ? '#26a69a20' : '#ef535020',
              color: lastUp ? '#26a69a' : '#ef5350',
              fontSize: '10px',
              fontWeight: '600',
              padding: { top: 2, bottom: 2, left: 6, right: 6 },
            },
            text: fmt.price(last.close),
            position: 'right',
            offsetX: -8,
          },
        }] : []),
        // ── Fibonacci retracement overlay (toggle 𝜑) ─────────────
        ...(showFib && fib ? FIB_STYLE.map(([key, lbl, color]) => ({
          y: fib[key],
          borderColor: color + '80',
          borderWidth: 1,
          strokeDashArray: 5,
          label: {
            borderColor: 'transparent',
            position: 'left',
            offsetX: 8,
            style: {
              background: '#13131aE6',
              color,
              fontSize: '9px',
              fontWeight: '600',
              padding: { top: 1, bottom: 1, left: 5, right: 5 },
            },
            text: `${lbl} · ${fmt.price(fib[key])}`,
          },
        })) : []),
      ],
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const d = sliced[dataPointIndex]
        if (!d) return ''
        const up   = d.close >= d.open
        const clr  = up ? '#26a69a' : '#ef5350'
        const chg  = d.close - d.open
        const pct  = d.open ? (chg / d.open * 100).toFixed(2) : '0.00'
        const s20  = showSma20 ? sma20Map[d.date] : null
        const s50  = showSma50 ? sma50Map[d.date] : null
        const sign = up ? '+' : ''
        return (
          '<div style="background:#1e222d;border:1px solid #2a2e39;border-radius:6px;' +
          'padding:10px 14px;font-size:11px;font-family:Inter,sans-serif;min-width:175px;line-height:1.5">' +
            '<div style="color:#787b86;font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:6px">' + d.date + '</div>' +
            '<div style="display:grid;grid-template-columns:auto 1fr;gap:1px 10px">' +
              '<span style="color:#787b86">O</span><b>' + fmt.price(d.open) + '</b>' +
              '<span style="color:#26a69a">H</span><b style="color:#26a69a">' + fmt.price(d.high) + '</b>' +
              '<span style="color:#ef5350">L</span><b style="color:#ef5350">' + fmt.price(d.low)  + '</b>' +
              '<span style="color:' + clr + '">C</span><b style="color:' + clr + '">' + fmt.price(d.close) + '</b>' +
              '<span style="color:#787b86">V</span><b style="color:#d1d4dc">' + fmt.vol(d.volume) + '</b>' +
            '</div>' +
            '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #2a2e39;' +
            'color:' + clr + ';font-weight:700;font-size:11px">' +
              sign + fmt.chg(chg) + ' (' + sign + pct + '%)' +
            '</div>' +
            ((s20 != null || s50 != null) ?
              '<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2a2e39;display:flex;gap:12px">' +
                (s20 != null ? '<span style="color:#ffc107;font-size:10px">SMA20&nbsp;<b>' + fmt.price(s20) + '</b></span>' : '') +
                (s50 != null ? '<span style="color:#9c6bff;font-size:10px">SMA50&nbsp;<b>' + fmt.price(s50) + '</b></span>' : '') +
              '</div>'
            : '') +
          '</div>'
        )
      },
    },
    legend: { show: false },
  }), [sliced, catBase, last, lastUp, sma20Map, sma50Map, showFib, fib, showSma20, showSma50, showVol])

  // ── Volume chart ─────────────────────────────────────────────────────
  const volOpts = useMemo(() => ({
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      id: 'chart-vol',
      group: 'chartGroup',
      type: 'bar',
      height: 80,
      toolbar: { show: true, autoSelected: 'pan', tools: { download: false, selection: false, zoom: false, zoomin: false, zoomout: false, pan: true, reset: false } },
      // enabled:false disables drag-to-zoom at the engine level; toolbar must be shown so autoSelected:'pan' initializes
      zoom: { enabled: false, type: 'x', autoScaleYaxis: true },
    },
    xaxis: {
      ...catBase,
      labels: {
        style: { colors: '#787b86', fontSize: '10px' },
        rotate: 0,
        formatter: fmtDate,
      },
    },
    plotOptions: { bar: { columnWidth: '80%' } },
    yaxis: {
      labels: { style: { colors: '#787b86', fontSize: '9px' }, formatter: v => fmt.vol(v) },
    },
    grid: {
      borderColor: '#2a2e3930',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: false } },
      padding: { right: 8 },
    },
    tooltip: { theme: 'dark', y: { formatter: v => fmt.vol(v) } },
  }), [catBase])

  const yesterday = prices.length >= 2 ? prices[prices.length - 2] : null
  const today     = prices.length >= 1 ? prices[prices.length - 1] : null

  return (
    <div className="p-4 space-y-3">

      {/* ── Range selector + SMA legend ───────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {RANGES.map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors
              ${range === r
                ? 'bg-tv-blue text-white'
                : 'text-tv-muted bg-tv-card border border-tv-border hover:text-tv-text'}`}
          >
            {r}
          </button>
        ))}
        <button
          onClick={() => setShowFib(v => !v)}
          title="Fibonacci retracement (swing high–low 100 bar terakhir)"
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all
            ${showFib
              ? 'bg-tv-yellow/15 text-tv-yellow border border-tv-yellow/40 shadow-[0_0_12px_rgba(245,185,80,0.25)]'
              : 'text-tv-muted bg-tv-card border border-tv-border hover:text-tv-text'}`}
        >
          𝜑 Fib
        </button>
        <div className="ml-auto flex items-center gap-2">
          <IndicatorToggle color="#ffc107" label="SMA20" dashed={false} active={showSma20} onClick={() => setShowSma20(v => !v)} />
          <IndicatorToggle color="#9c6bff" label="SMA50" dashed={true}  active={showSma50} onClick={() => setShowSma50(v => !v)} />
          <IndicatorToggle color="#8a8f98" label="Vol"   dashed={false} active={showVol}   onClick={() => setShowVol(v => !v)} />
          <span className="text-[10px] text-tv-muted tabular-nums ml-2">{sliced.length} bars</span>
        </div>
      </div>

      {/* ── Range performance stats bar ───────────────────────────── */}
      <RangeStats range={range} sliced={sliced} />

      {/* ── Yesterday session card (visible only on 1W range) ─────── */}
      {range === '1W' && yesterday && today && (
        <YesterdayCard yesterday={yesterday} today={today} />
      )}

      {/* ── Unified chart card: price (+ SMA overlay) + volume ───── */}
      <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden chart-scan">

        {/* Main: candlestick with SMA20 & SMA50 overlaid as lines */}
        <div className="px-3 pt-3 pb-0">
          <ReactApexChart
            key={`candle-${range}`}
            type="candlestick"
            height={420}
            series={[
              { name: 'OHLC',  type: 'candlestick', data: candleData },
              { name: 'SMA20', type: 'line',         data: sma20Data  },
              { name: 'SMA50', type: 'line',         data: sma50Data  },
            ]}
            options={priceOpts}
          />
        </div>

        {/* Volume — same group, syncs with main on pan/zoom; toggleable */}
        {showVol && (
          <>
            <div className="mx-3 border-t border-tv-border/40" />
            <div className="px-3 pb-2 pt-0 animate-fade-in">
              <div className="text-[9px] text-tv-muted/50 font-semibold uppercase tracking-wider pt-2 px-1 mb-0">
                Vol
              </div>
              <ReactApexChart
                key={`vol-${range}`}
                type="bar"
                height={78}
                series={[{ name: 'Volume', data: volumeData }]}
                options={volOpts}
              />
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Range performance stats bar ──────────────────────────────────────────────
function RangeStats({ range, sliced }) {
  if (sliced.length < 2) return null
  // key berubah setiap ganti range → komponen remount → animasi ulang

  const first  = sliced[0]
  const last   = sliced[sliced.length - 1]
  const chg    = last.close - first.close
  const pct    = first.close ? chg / first.close * 100 : 0
  const pos    = pct >= 0

  let hi = sliced[0].high, lo = sliced[0].low, totalVol = 0
  for (const p of sliced) {
    if (p.high > hi) hi = p.high
    if (p.low  < lo) lo = p.low
    totalVol += p.volume
  }
  const avgVol = totalVol / sliced.length

  const RANGE_LABELS = { '1W': '1 Minggu', '1M': '1 Bulan', '3M': '3 Bulan', '6M': '6 Bulan', '1Y': '1 Tahun', 'All': 'Semua Data' }

  return (
    <div key={range} className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 bg-tv-card border border-tv-border rounded-lg text-xs animate-slide-down">
      {/* Label periode */}
      <span className="text-tv-muted font-medium">{RANGE_LABELS[range]}</span>
      <span className="text-tv-border">|</span>

      {/* Perubahan harga */}
      <div className="flex items-center gap-1.5">
        <span className="text-tv-muted">Perubahan</span>
        <span className={`font-bold tabular-nums ${pos ? 'text-tv-green' : 'text-tv-red'}`}>
          {pos ? '+' : ''}{fmt.price(chg)} ({pos ? '+' : ''}{pct.toFixed(2)}%)
        </span>
      </div>

      {/* Range harga */}
      <div className="flex items-center gap-1.5">
        <span className="text-tv-muted">High</span>
        <span className="font-semibold tabular-nums text-tv-green">{fmt.price(hi)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-tv-muted">Low</span>
        <span className="font-semibold tabular-nums text-tv-red">{fmt.price(lo)}</span>
      </div>

      {/* Avg volume */}
      <div className="flex items-center gap-1.5">
        <span className="text-tv-muted">Avg Vol</span>
        <span className="font-semibold tabular-nums text-tv-text">{fmt.vol(avgVol)}</span>
      </div>

      {/* Periode tanggal */}
      <div className="ml-auto text-tv-muted/60 tabular-nums hidden sm:block">
        {first.date} → {last.date}
      </div>
    </div>
  )
}

// ── Yesterday vs latest session comparison card ───────────────────────────────
function YesterdayCard({ yesterday: y, today: t }) {
  const yUp   = y.close >= y.open
  const tUp   = t.close >= t.open
  const yChg  = y.close - y.open
  const tChg  = t.close - t.open
  const yPct  = y.open ? (yChg / y.open * 100) : 0
  const tPct  = t.open ? (tChg / t.open * 100) : 0
  const gap   = t.open - y.close  // gap dari close kemarin ke open hari ini
  const gapPct = y.close ? (gap / y.close * 100) : 0

  const clr = (up) => up ? '#26a69a' : '#ef5350'
  const cls = (up) => up ? 'text-tv-green' : 'text-tv-red'
  const sign = (v) => v > 0 ? '+' : ''

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">Session Comparison</span>
        <span className="text-[10px] text-tv-muted/60">yesterday vs latest</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Yesterday */}
        <div className="bg-tv-bg rounded-lg p-3 border border-tv-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-tv-muted">Yesterday</span>
            <span className="text-[10px] text-tv-muted">{y.date}</span>
          </div>
          {/* Mini candle visual */}
          <div className="flex items-center gap-2 mb-2">
            <CandleVisual p={y} />
            <div>
              <div className={`text-base font-bold tabular-nums ${cls(yUp)}`}>{fmt.price(y.close)}</div>
              <div className={`text-[11px] font-semibold tabular-nums ${cls(yUp)}`}>
                {sign(yChg)}{fmt.price(yChg)} ({sign(yPct)}{yPct.toFixed(2)}%)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <span className="text-tv-muted">O</span><span className="tabular-nums text-tv-text font-medium">{fmt.price(y.open)}</span>
            <span className="text-tv-green">H</span><span className="tabular-nums text-tv-green font-medium">{fmt.price(y.high)}</span>
            <span className="text-tv-red">L</span><span className="tabular-nums text-tv-red font-medium">{fmt.price(y.low)}</span>
            <span className="text-tv-muted">V</span><span className="tabular-nums text-tv-text font-medium">{fmt.vol(y.volume)}</span>
          </div>
        </div>

        {/* Latest / Today */}
        <div className="bg-tv-bg rounded-lg p-3 border border-tv-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-tv-muted">Latest</span>
            <span className="text-[10px] text-tv-muted">{t.date}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <CandleVisual p={t} />
            <div>
              <div className={`text-base font-bold tabular-nums ${cls(tUp)}`}>{fmt.price(t.close)}</div>
              <div className={`text-[11px] font-semibold tabular-nums ${cls(tUp)}`}>
                {sign(tChg)}{fmt.price(tChg)} ({sign(tPct)}{tPct.toFixed(2)}%)
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <span className="text-tv-muted">O</span><span className="tabular-nums text-tv-text font-medium">{fmt.price(t.open)}</span>
            <span className="text-tv-green">H</span><span className="tabular-nums text-tv-green font-medium">{fmt.price(t.high)}</span>
            <span className="text-tv-red">L</span><span className="tabular-nums text-tv-red font-medium">{fmt.price(t.low)}</span>
            <span className="text-tv-muted">V</span><span className="tabular-nums text-tv-text font-medium">{fmt.vol(t.volume)}</span>
          </div>
        </div>
      </div>

      {/* Gap info */}
      {gap !== 0 && (
        <div className="mt-3 pt-3 border-t border-tv-border/50 flex items-center justify-between text-[11px]">
          <span className="text-tv-muted">Gap Open (prev close → today open)</span>
          <span className={`font-bold tabular-nums ${gap > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {sign(gap)}{fmt.price(gap)} ({sign(gapPct)}{gapPct.toFixed(2)}%)
          </span>
        </div>
      )}
    </div>
  )
}

// Tiny inline candle SVG
function CandleVisual({ p }) {
  const up    = p.close >= p.open
  const color = up ? '#26a69a' : '#ef5350'
  const H     = 36
  const range = p.high - p.low || 1
  const toY   = v => H - ((v - p.low) / range) * H
  const bodyTop    = Math.min(toY(p.open), toY(p.close))
  const bodyHeight = Math.max(Math.abs(toY(p.open) - toY(p.close)), 2)
  return (
    <svg width="10" height={H} style={{ flexShrink: 0 }}>
      {/* Wick */}
      <line x1="5" y1={toY(p.high)} x2="5" y2={toY(p.low)} stroke={color} strokeWidth="1.5" />
      {/* Body */}
      <rect x="1" y={bodyTop} width="8" height={bodyHeight} fill={color} rx="1" />
    </svg>
  )
}

// Clickable indicator legend — toggles the series on/off
function IndicatorToggle({ color, label, dashed, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={`${active ? 'Sembunyikan' : 'Tampilkan'} ${label}`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all duration-200
        ${active
          ? 'border-tv-border bg-tv-card'
          : 'border-transparent bg-transparent opacity-40 hover:opacity-70'}`}
    >
      {dashed ? (
        <svg width="18" height="3" className="flex-shrink-0">
          <line x1="0" y1="1.5" x2="18" y2="1.5"
            stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
      ) : (
        <div className="w-4 flex-shrink-0 rounded" style={{ background: color, height: '1.5px' }} />
      )}
      <span className={`text-[10px] ${active ? 'text-tv-text' : 'text-tv-muted line-through'}`}>{label}</span>
    </button>
  )
}
