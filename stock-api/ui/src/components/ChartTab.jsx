import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createChart, CandlestickSeries, LineSeries, HistogramSeries, LineStyle, CrosshairMode } from 'lightweight-charts'
import { api } from '../api'
import { fmt } from '../utils'
import { FVGZonesPrimitive } from './chart/FVGZonesPrimitive'

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

const UP = '#26a69a', DOWN = '#ef5350'
const AVWAP_COLOR = '#29b6f6'

// AVWAP: harga tipikal tertimbang volume, kumulatif dari bar anchor → akhir data
const computeAvwap = (prices, anchorDate) => {
  const i0 = prices.findIndex(p => p.date === anchorDate)
  if (i0 < 0) return []
  let pv = 0, vv = 0
  const out = []
  for (let i = i0; i < prices.length; i++) {
    const p = prices[i]
    const tp = (p.high + p.low + p.close) / 3
    pv += tp * p.volume; vv += p.volume
    out.push({ time: p.date, value: vv ? pv / vv : tp })
  }
  return out
}

// param.time bisa berupa string 'YYYY-MM-DD' atau BusinessDay {year,month,day}
const timeToDate = t => typeof t === 'string'
  ? t
  : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`

export default function ChartTab({ data, symbol }) {
  const [range, setRange] = useState('3M')
  const [showFib, setShowFib] = useState(false)
  const [fib, setFib] = useState(null)          // FibLevels dari API (lookback 100 bar)
  const [showFvg, setShowFvg] = useState(false)
  const [fvgZones, setFvgZones] = useState(null) // 3 zona FVG/iFVG terdekat dari API
  // Indicator visibility toggles — klik legend untuk on/off
  const [showSma20, setShowSma20] = useState(true)
  const [showSma50, setShowSma50] = useState(true)
  const [showVol,   setShowVol]   = useState(true)
  // AVWAP: toggle on = klik candle untuk anchor; preset Low/High/Vol tersedia
  const [avwapOn, setAvwapOn]         = useState(false)
  const [avwapAnchor, setAvwapAnchor] = useState(null)  // date string
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
  useEffect(() => { setFib(null); setShowFib(false); setAvwapAnchor(null); setAvwapOn(false); setFvgZones(null); setShowFvg(false) }, [symbol])

  // Fetch zona FVG saat toggle pertama dinyalakan — hanya 3 zona terdekat
  useEffect(() => {
    if (!showFvg || fvgZones || !symbol) return
    let alive = true
    api.analysis.fvg(symbol)
      .then(r => { if (alive) setFvgZones(r.active?.slice(0, 3) ?? []) })
      .catch(() => { if (alive) setShowFvg(false) })
    return () => { alive = false }
  }, [showFvg, fvgZones, symbol])

  // gambar/hapus garis AVWAP saat anchor berubah
  useEffect(() => {
    const s = avwapRef.current
    if (!s) return
    s.setData(avwapOn && avwapAnchor ? computeAvwap(prices, avwapAnchor) : [])
  }, [avwapOn, avwapAnchor, prices])

  // preset anchor: swing low / swing high / volume tertinggi di window range aktif
  const presetAnchor = (kind) => {
    if (!sliced.length) return
    let pick = sliced[0]
    for (const p of sliced) {
      if (kind === 'low'  && p.low    < pick.low)    pick = p
      if (kind === 'high' && p.high   > pick.high)   pick = p
      if (kind === 'vol'  && p.volume > pick.volume) pick = p
    }
    setAvwapAnchor(pick.date)
  }

  // sliced hanya untuk RangeStats + bar count — chart memuat SEMUA data,
  // range selector cuma menggeser visible window (bisa pan mundur ke histori)
  const sliced = useMemo(() => prices.slice(-RANGE_DAYS[range]), [prices, range])

  const containerRef = useRef(null)   // div chart
  const tooltipRef   = useRef(null)   // div tooltip mengambang
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const sma20Ref     = useRef(null)
  const sma50Ref     = useRef(null)
  const volRef       = useRef(null)
  const barMapRef    = useRef({})     // date → price obj (untuk tooltip)
  const fibLinesRef  = useRef([])
  const fvgPrimRef   = useRef(null)
  const avwapRef     = useRef(null)
  const avwapOnRef   = useRef(false)  // dibaca handler klik (dibuat sekali di init)
  useEffect(() => { avwapOnRef.current = avwapOn }, [avwapOn])

  // ── Create chart once ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
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
        horzLines: { color: '#2a2e3950', style: LineStyle.Dashed },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#787b86', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#787b86', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.28 } },
      timeScale: { borderVisible: false, rightOffset: 3, minBarSpacing: 2 },
      localization: { priceFormatter: v => fmt.price(v) },
    })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DOWN,
      wickUpColor: UP, wickDownColor: DOWN,
      borderVisible: false,
    })
    const s20 = chart.addSeries(LineSeries, {
      color: '#ffc107', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    })
    const s50 = chart.addSeries(LineSeries, {
      color: '#9c6bff', lineWidth: 2, lineStyle: LineStyle.Dashed,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    })
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      priceLineVisible: false, lastValueVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false })

    const fvgPrim = new FVGZonesPrimitive()
    candle.attachPrimitive(fvgPrim)
    fvgPrimRef.current = fvgPrim

    const avwap = chart.addSeries(LineSeries, {
      color: AVWAP_COLOR, lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
    })

    // klik candle = set anchor AVWAP (hanya saat toggle aktif)
    const onClick = (param) => {
      if (!avwapOnRef.current || !param.time) return
      setAvwapAnchor(timeToDate(param.time))
    }
    chart.subscribeClick(onClick)

    // ── Tooltip OHLCV mengambang (subscribeCrosshairMove) ──────────────
    const onMove = (param) => {
      const tt = tooltipRef.current
      if (!tt) return
      if (!param.time || !param.point) { tt.style.display = 'none'; return }
      const d = barMapRef.current[timeToDate(param.time)]
      if (!d) { tt.style.display = 'none'; return }
      const up   = d.close >= d.open
      const clr  = up ? UP : DOWN
      const chg  = d.close - d.open
      const pct  = d.open ? (chg / d.open * 100).toFixed(2) : '0.00'
      const s20v = param.seriesData.get(s20)?.value   // undefined saat toggle off
      const s50v = param.seriesData.get(s50)?.value
      const sign = up ? '+' : ''
      tt.innerHTML =
        '<div style="color:#787b86;font-size:10px;font-weight:600;letter-spacing:.04em;margin-bottom:6px">' + d.date + '</div>' +
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:1px 10px">' +
          '<span style="color:#787b86">O</span><b>' + fmt.price(d.open) + '</b>' +
          '<span style="color:' + UP + '">H</span><b style="color:' + UP + '">' + fmt.price(d.high) + '</b>' +
          '<span style="color:' + DOWN + '">L</span><b style="color:' + DOWN + '">' + fmt.price(d.low)  + '</b>' +
          '<span style="color:' + clr + '">C</span><b style="color:' + clr + '">' + fmt.price(d.close) + '</b>' +
          '<span style="color:#787b86">V</span><b style="color:#d1d4dc">' + fmt.vol(d.volume) + '</b>' +
        '</div>' +
        '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #2a2e39;' +
        'color:' + clr + ';font-weight:700;font-size:11px">' +
          fmt.chg(chg) + ' (' + sign + pct + '%)' +
        '</div>' +
        ((s20v != null || s50v != null) ?
          '<div style="margin-top:5px;padding-top:5px;border-top:1px solid #2a2e39;display:flex;gap:12px">' +
            (s20v != null ? '<span style="color:#ffc107;font-size:10px">SMA20&nbsp;<b>' + fmt.price(s20v) + '</b></span>' : '') +
            (s50v != null ? '<span style="color:#9c6bff;font-size:10px">SMA50&nbsp;<b>' + fmt.price(s50v) + '</b></span>' : '') +
          '</div>'
        : '')
      tt.style.display = 'block'
      const pad = 16
      let x = param.point.x + pad
      if (x + tt.offsetWidth > el.clientWidth) x = param.point.x - tt.offsetWidth - pad
      let y = param.point.y + pad
      if (y + tt.offsetHeight > el.clientHeight) y = param.point.y - tt.offsetHeight - pad
      tt.style.left = Math.max(0, x) + 'px'
      tt.style.top  = Math.max(0, y) + 'px'
    }
    chart.subscribeCrosshairMove(onMove)

    chartRef.current  = chart
    candleRef.current = candle
    sma20Ref.current  = s20
    sma50Ref.current  = s50
    volRef.current    = vol
    avwapRef.current  = avwap
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.unsubscribeClick(onClick)
      candle.detachPrimitive(fvgPrim)
      fvgPrimRef.current = null
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // ── Visible window mengikuti range selector ──────────────────────────
  const applyRange = useCallback((r) => {
    const chart = chartRef.current
    if (!chart || !prices.length) return
    const ts = chart.timeScale()
    if (r === 'All') { ts.fitContent(); return }
    const n = Math.min(RANGE_DAYS[r], prices.length)
    ts.setVisibleLogicalRange({ from: prices.length - n - 0.5, to: prices.length + 2 })
  }, [prices.length])

  // ── Set data saat prices/SMA berubah ─────────────────────────────────
  useEffect(() => {
    const candle = candleRef.current
    if (!candle || !prices.length) return
    barMapRef.current = Object.fromEntries(prices.map(p => [p.date, p]))
    candle.setData(prices.map(p => ({ time: p.date, open: p.open, high: p.high, low: p.low, close: p.close })))
    sma20Ref.current.setData(sma20.map(p => ({ time: p.date, value: p.value })))
    sma50Ref.current.setData(sma50.map(p => ({ time: p.date, value: p.value })))
    volRef.current.setData(prices.map(p => ({
      time: p.date, value: p.volume,
      color: p.close >= p.open ? UP + '55' : DOWN + '55',
    })))
    applyRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, sma20, sma50])

  useEffect(() => { applyRange(range) }, [range, applyRange])

  // ── Indicator visibility toggles ─────────────────────────────────────
  useEffect(() => { sma20Ref.current?.applyOptions({ visible: showSma20 }) }, [showSma20])
  useEffect(() => { sma50Ref.current?.applyOptions({ visible: showSma50 }) }, [showSma50])
  useEffect(() => { volRef.current?.applyOptions({ visible: showVol }) },     [showVol])

  // ── Fibonacci retracement — horizontal price lines ───────────────────
  useEffect(() => {
    const candle = candleRef.current
    if (!candle) return
    fibLinesRef.current.forEach(l => candle.removePriceLine(l))
    fibLinesRef.current = []
    if (showFib && fib) {
      fibLinesRef.current = FIB_STYLE.map(([key, lbl, color]) => candle.createPriceLine({
        price: fib[key],
        color: color + '80',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: lbl,
      }))
    }
  }, [showFib, fib])

  // ── FVG/iFVG zone boxes — custom primitive ───────────────────────────
  useEffect(() => {
    fvgPrimRef.current?.updateZones(showFvg && fvgZones ? fvgZones : [])
  }, [showFvg, fvgZones])

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
        <button
          onClick={() => setAvwapOn(v => !v)}
          title="Anchored VWAP — aktifkan lalu klik candle untuk set anchor, atau pakai preset"
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all
            ${avwapOn
              ? 'bg-tv-blue/15 text-tv-blue border border-tv-blue/40 shadow-[0_0_12px_rgba(41,182,246,0.25)]'
              : 'text-tv-muted bg-tv-card border border-tv-border hover:text-tv-text'}`}
        >
          ⚓ AVWAP
        </button>
        <button
          onClick={() => setShowFvg(v => !v)}
          title="Fair Value Gap zones — gap 3-candle; kotak amber = iFVG (inverted)"
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all
            ${showFvg
              ? 'bg-tv-purple/15 text-tv-purple border border-tv-purple/40 shadow-[0_0_12px_rgba(167,139,250,0.25)]'
              : 'text-tv-muted bg-tv-card border border-tv-border hover:text-tv-text'}`}
        >
          ▦ FVG
        </button>
        {avwapOn && (
          <span className="flex items-center gap-1 text-[10px]">
            {[['low', 'Low'], ['high', 'High'], ['vol', 'Vol×']].map(([k, lbl]) => (
              <button key={k} onClick={() => presetAnchor(k)}
                className="px-2 py-0.5 rounded border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-colors">
                {lbl}
              </button>
            ))}
            <span className="text-tv-muted ml-1">
              {avwapAnchor ? <>⚓ <span style={{ color: AVWAP_COLOR }}>{avwapAnchor}</span></> : 'klik candle'}
            </span>
          </span>
        )}
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

      {/* ── Chart card: candlestick + SMA + volume dalam satu canvas ── */}
      <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden chart-scan p-3">
        <div className="relative" style={{ height: 500 }}>
          <div ref={containerRef} className="absolute inset-0" />
          <div
            ref={tooltipRef}
            style={{
              display: 'none', position: 'absolute', zIndex: 20, pointerEvents: 'none',
              background: '#1e222d', border: '1px solid #2a2e39', borderRadius: 6,
              padding: '10px 14px', fontSize: 11, fontFamily: 'Inter, sans-serif',
              minWidth: 175, lineHeight: 1.5, color: '#d1d4dc',
            }}
          />
        </div>
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
  const color = up ? UP : DOWN
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
