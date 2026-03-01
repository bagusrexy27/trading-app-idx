import { useMemo, useState } from 'react'
import ReactApexChart from 'react-apexcharts'
import { fmt, APEX_DARK } from '../utils'

// ── AMD colour palette ────────────────────────────────────────────────────────
const COLOR = {
  accum:  { bg: '#f59e0b', bgAlpha: '#f59e0b22', text: '#f59e0b', label: 'A' },
  manip:  { bg: '#ef5350', bgAlpha: '#ef535033', text: '#ef5350', label: 'M' },
  distrib_bullish: { bg: '#26a69a', bgAlpha: '#26a69a22', text: '#26a69a' },
  distrib_bearish: { bg: '#ef5350', bgAlpha: '#ef535022', text: '#ef5350' },
}

const PHASE_LABEL = {
  accum:           'ACCUMULATION',
  manip:           'MANIPULATION',
  distrib:         'DISTRIBUTION',
  potential_accum: 'POTENTIAL ACCUMULATION',
  none:            'No Active Pattern',
}

const PHASE_COLOR = {
  accum:           'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  manip:           'text-red-400 border-red-400/30 bg-red-400/10',
  distrib:         'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  potential_accum: 'text-yellow-300 border-yellow-300/20 bg-yellow-300/5',
  none:            'text-tv-muted border-tv-border bg-tv-bg',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const fmtDate = v => {
  if (!v || !v.includes('-')) return ''
  const p = v.split('-')
  return `${+p[2]} ${MONTHS[+p[1]]}`
}

function confColor(c) {
  if (c >= 70) return 'text-tv-green'
  if (c >= 50) return 'text-tv-yellow'
  return 'text-tv-red'
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AMD({ data }) {
  const { amd, prices } = data

  if (!amd || !amd.bar_phases) {
    return (
      <div className="flex items-center justify-center h-64 text-tv-muted text-sm">
        Tidak ada data AMD tersedia.
      </div>
    )
  }

  const zones = amd.zones ?? []
  const currentPhase = amd.current_phase ?? 'none'
  const currentZone = amd.current_zone

  return (
    <div className="p-4 space-y-4">
      {/* ── Current Phase Card ───────────────────────────────────────────────── */}
      <div className="animate-slide-up stagger-1">
        <CurrentPhaseCard
          phase={currentPhase}
          zone={currentZone}
          totalZones={zones.length}
        />
      </div>

      {/* ── Price Chart with AMD annotations ─────────────────────────────────── */}
      <div className="animate-slide-up stagger-2">
        <AMDChart amd={amd} prices={prices} />
      </div>

      {/* ── Detected Zones Table ─────────────────────────────────────────────── */}
      {zones.length > 0 && (
        <div className="animate-slide-up stagger-3">
          <ZonesTable zones={zones} />
        </div>
      )}

      {/* ── AMD Guide ────────────────────────────────────────────────────────── */}
      <div className="animate-slide-up stagger-4">
        <AMDGuide />
      </div>
    </div>
  )
}

// ── Current Phase Card ────────────────────────────────────────────────────────
function CurrentPhaseCard({ phase, zone, totalZones }) {
  const phaseClass = PHASE_COLOR[phase] || PHASE_COLOR.none
  const label = PHASE_LABEL[phase] || phase.toUpperCase()

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Phase indicator */}
        <div>
          <div className="text-xs text-tv-muted font-medium mb-2 uppercase tracking-wider">
            Fase AMD Saat Ini
          </div>
          <div className="flex items-center gap-3 mb-3">
            {/* Phase steps */}
            {['A', 'M', 'D'].map((s, idx) => {
              const active =
                (s === 'A' && (phase === 'accum' || phase === 'potential_accum')) ||
                (s === 'M' && phase === 'manip') ||
                (s === 'D' && phase === 'distrib')
              const colors = [COLOR.accum.bg, COLOR.manip.bg, '#26a69a']
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                    style={{
                      backgroundColor: active ? colors[idx] : 'transparent',
                      border: `2px solid ${active ? colors[idx] : '#2a2e39'}`,
                      color: active ? '#fff' : '#787b86',
                      boxShadow: active ? `0 0 12px ${colors[idx]}66` : 'none',
                    }}
                  >
                    {s}
                  </div>
                  {idx < 2 && <div className="text-tv-border text-xs">→</div>}
                </div>
              )
            })}
          </div>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold ${phaseClass}`}
          >
            {label}
            {zone && phase === 'distrib' && (
              <span className="text-xs font-normal opacity-80">
                — {zone.distrib_dir === 'bullish' ? '↑ Bullish' : '↓ Bearish'}
              </span>
            )}
          </div>
        </div>

        {/* Zone details */}
        {zone ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Range High" value={fmt.price(zone.range_high)} color="text-tv-green" />
            <StatBox label="Range Low"  value={fmt.price(zone.range_low)}  color="text-tv-red" />
            <StatBox label="Range Lebar" value={`${zone.range_pct}%`} color="text-tv-yellow" />
            <StatBox label="Konfiden" value={`${zone.confidence}%`} color={confColor(zone.confidence)} />
            <StatBox label="Manip Level"  value={fmt.price(zone.manip_level)} color="text-tv-purple" />
            <StatBox label="Manip Spike"  value={`${zone.manip_pct}%`}        color="text-tv-purple" />
            <StatBox label="Distrib Move" value={zone.distrib_pct > 0 ? `${zone.distrib_pct}%` : '—'} color="text-tv-blue" />
            <StatBox label="Akumulasi"    value={`${zone.accum_bars} hari`}  color="text-tv-muted" />
          </div>
        ) : (
          <div className="text-tv-muted text-sm">
            <div className="mb-1 font-medium">
              {totalZones} pola AMD terdeteksi dalam periode ini.
            </div>
            <div className="text-xs">
              {phase === 'potential_accum'
                ? 'Harga sedang dalam range sempit — waspadai sinyal manipulasi.'
                : 'Tidak ada pola AMD aktif saat ini. Tunggu akumulasi berikutnya.'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-tv-bg rounded-lg p-2.5 border border-tv-border">
      <div className="text-[10px] text-tv-muted mb-0.5">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

// ── AMD Chart ─────────────────────────────────────────────────────────────────
function AMDChart({ amd, prices }) {
  const [lookback, setLookback] = useState(100)

  const displayPrices = useMemo(() => {
    if (!prices || prices.length === 0) return []
    return prices.slice(-lookback)
  }, [prices, lookback])

  const displayDates = useMemo(() => displayPrices.map(p => p.date), [displayPrices])

  // Build bar_phases map for quick lookup
  const phaseMap = useMemo(() => {
    const m = {}
    for (const bp of amd.bar_phases ?? []) m[bp.date] = bp
    return m
  }, [amd.bar_phases])

  // Close price series (aligned to displayDates)
  const closeSeries = useMemo(
    () => displayPrices.map(p => ({ x: p.date, y: p.close })),
    [displayPrices]
  )

  // Build xaxis annotations from zones
  const xAnnotations = useMemo(() => {
    if (!amd.zones) return []
    const anns = []

    for (const z of amd.zones) {
      // Only show zones that overlap the displayed date range
      const firstDate = displayDates[0]
      if (!firstDate || z.distrib_start < firstDate && z.accum_end < firstDate) continue

      // Accumulation band
      anns.push({
        x: z.accum_start,
        x2: z.accum_end,
        fillColor: COLOR.accum.bgAlpha,
        borderColor: COLOR.accum.bg,
        borderWidth: 1,
        opacity: 1,
        label: {
          text: 'A',
          borderColor: COLOR.accum.bg,
          style: {
            background: COLOR.accum.bg,
            color: '#131722',
            fontSize: '10px',
            fontWeight: 700,
            padding: { top: 2, bottom: 2, left: 5, right: 5 },
          },
        },
      })

      // Manipulation bar
      anns.push({
        x: z.manip_date,
        x2: z.manip_date,
        fillColor: COLOR.manip.bgAlpha,
        borderColor: COLOR.manip.bg,
        borderWidth: 2,
        opacity: 1,
        label: {
          text: 'M',
          borderColor: COLOR.manip.bg,
          style: {
            background: COLOR.manip.bg,
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: { top: 2, bottom: 2, left: 5, right: 5 },
          },
        },
      })

      // Distribution band
      if (z.distrib_start) {
        const dColor = z.distrib_dir === 'bullish' ? COLOR.distrib_bullish : COLOR.distrib_bearish
        // Find last date of distrib in our display range
        const distribEnd = displayDates[displayDates.length - 1] // use last displayed date as cap
        anns.push({
          x: z.distrib_start,
          x2: distribEnd,
          fillColor: dColor.bgAlpha,
          borderColor: dColor.bg,
          borderWidth: 1,
          opacity: 1,
          label: {
            text: 'D',
            borderColor: dColor.bg,
            style: {
              background: dColor.bg,
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              padding: { top: 2, bottom: 2, left: 5, right: 5 },
            },
          },
        })
      }
    }
    return anns
  }, [amd.zones, displayDates])

  // yaxis annotations: range high/low for current/last zone
  const yAnnotations = useMemo(() => {
    if (!amd.current_zone) return []
    const z = amd.current_zone
    return [
      {
        y: z.range_high,
        borderColor: COLOR.accum.bg,
        strokeDashArray: 4,
        label: {
          text: `Range H: ${fmt.price(z.range_high)}`,
          borderColor: COLOR.accum.bg,
          style: { background: '#131722', color: COLOR.accum.bg, fontSize: '10px' },
          position: 'left',
        },
      },
      {
        y: z.range_low,
        borderColor: COLOR.accum.bg,
        strokeDashArray: 4,
        label: {
          text: `Range L: ${fmt.price(z.range_low)}`,
          borderColor: COLOR.accum.bg,
          style: { background: '#131722', color: COLOR.accum.bg, fontSize: '10px' },
          position: 'left',
        },
      },
      {
        y: z.manip_level,
        borderColor: COLOR.manip.bg,
        strokeDashArray: 6,
        label: {
          text: `Manip: ${fmt.price(z.manip_level)}`,
          borderColor: COLOR.manip.bg,
          style: { background: '#131722', color: COLOR.manip.bg, fontSize: '10px' },
          position: 'left',
        },
      },
    ]
  }, [amd.current_zone])

  const options = useMemo(() => ({
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      id: 'amd-chart',
      type: 'area',
      height: 340,
      toolbar: {
        show: true,
        autoSelected: 'pan',
        tools: { download: false, selection: false, zoom: false, zoomin: true, zoomout: true, pan: true, reset: true },
      },
      zoom: { enabled: false },
      animations: { enabled: false },
    },
    xaxis: {
      type: 'category',
      categories: displayDates,
      tickAmount: 8,
      axisBorder: { show: false },
      axisTicks: { show: false },
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
    },
    yaxis: {
      labels: {
        style: { colors: '#787b86', fontSize: '10px' },
        formatter: v => fmt.price(v),
      },
    },
    annotations: {
      xaxis: xAnnotations,
      yaxis: yAnnotations,
    },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.15,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    colors: ['#9c6bff'],
    tooltip: {
      theme: 'dark',
      x: { show: true, formatter: v => v },
      y: { formatter: v => fmt.price(v) },
    },
    grid: { ...APEX_DARK.grid },
    legend: { show: false },
  }), [displayDates, xAnnotations, yAnnotations])

  const RANGES = [
    { label: '1B', n: 30 },
    { label: '3B', n: 65 },
    { label: '6B', n: 130 },
    { label: '1T', n: 252 },
  ]

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-tv-text">Chart AMD — Close Price</span>
        <div className="flex gap-1">
          {RANGES.map(({ label, n }) => (
            <button
              key={label}
              onClick={() => setLookback(n)}
              className={`px-2 py-1 text-xs rounded transition-colors
                ${lookback === n
                  ? 'bg-tv-blue/20 text-tv-blue border border-tv-blue/30'
                  : 'text-tv-muted hover:text-tv-text border border-transparent'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {[
          { color: COLOR.accum.bg,           label: 'Accumulation' },
          { color: COLOR.manip.bg,            label: 'Manipulation' },
          { color: COLOR.distrib_bullish.bg,  label: 'Distrib Bullish' },
          { color: COLOR.distrib_bearish.bg,  label: 'Distrib Bearish' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm opacity-70" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-tv-muted">{label}</span>
          </div>
        ))}
      </div>

      <ReactApexChart
        key={`${lookback}`}
        options={options}
        series={[{ name: 'Close', data: closeSeries }]}
        type="area"
        height={340}
      />
    </div>
  )
}

// ── Zones Table ───────────────────────────────────────────────────────────────
function ZonesTable({ zones }) {
  const sorted = [...zones].reverse() // most recent first

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-tv-border flex items-center justify-between">
        <span className="text-xs font-semibold text-tv-text">Riwayat Pola AMD Terdeteksi</span>
        <span className="text-xs text-tv-muted">{zones.length} pola</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-tv-muted border-b border-tv-border bg-tv-bg/50">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Akumulasi</th>
              <th className="px-3 py-2 text-center">Dur.</th>
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-center">Manipulasi</th>
              <th className="px-3 py-2 text-center">Tipe</th>
              <th className="px-3 py-2 text-right">Move</th>
              <th className="px-3 py-2 text-right">Konfiden</th>
              <th className="px-3 py-2 text-center">Fase</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((z, idx) => {
              const isBull = z.manip_type === 'bull_manip'
              return (
                <tr
                  key={z.id}
                  className="border-b border-tv-border/50 hover:bg-tv-hover/30 transition-colors"
                >
                  <td className="px-3 py-2.5 text-tv-muted">{zones.length - idx}</td>
                  <td className="px-3 py-2.5 text-tv-text">
                    <div>{fmtDate(z.accum_start)}</div>
                    <div className="text-tv-muted">{fmtDate(z.accum_end)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-tv-muted">{z.accum_bars}h</td>
                  <td className="px-3 py-2.5">
                    <div className="text-tv-green">{fmt.price(z.range_high)}</div>
                    <div className="text-tv-red">{fmt.price(z.range_low)}</div>
                    <div className="text-tv-muted text-[10px]">{z.range_pct}%</div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="text-tv-text">{fmtDate(z.manip_date)}</div>
                    <div
                      className="text-[10px] font-medium"
                      style={{ color: isBull ? '#26a69a' : '#ef5350' }}
                    >
                      {fmt.price(z.manip_level)} ({z.manip_pct}%)
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                      style={{
                        color: isBull ? '#26a69a' : '#ef5350',
                        borderColor: isBull ? '#26a69a44' : '#ef535044',
                        background: isBull ? '#26a69a11' : '#ef535011',
                      }}
                    >
                      {isBull ? '↑ Bullish' : '↓ Bearish'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {z.distrib_pct > 0 ? (
                      <span className={isBull ? 'text-tv-green' : 'text-tv-red'}>
                        {isBull ? '+' : '-'}{z.distrib_pct}%
                      </span>
                    ) : (
                      <span className="text-tv-muted">—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-bold ${confColor(z.confidence)}`}>
                    {z.confidence}%
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <PhaseChip phase={z.phase} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PhaseChip({ phase }) {
  const map = {
    accumulation: { label: 'Accum', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
    manipulation: { label: 'Manip', cls: 'text-red-400 bg-red-400/10 border-red-400/30' },
    distribution: { label: 'Distrib', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
    completed:    { label: 'Selesai', cls: 'text-tv-muted bg-tv-bg border-tv-border' },
  }
  const { label, cls } = map[phase] || map.completed
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

// ── AMD Guide ─────────────────────────────────────────────────────────────────
function AMDGuide() {
  const [open, setOpen] = useState(false)

  const phases = [
    {
      letter: 'A',
      color: COLOR.accum.bg,
      title: 'Accumulation (Akumulasi)',
      desc: 'Smart money diam-diam membangun posisi dalam range harga yang sempit. Volume cenderung rendah, harga bergerak sideways. Retail traders merasa pasar "boring" dan tidak tertarik.',
    },
    {
      letter: 'M',
      color: COLOR.manip.bg,
      title: 'Manipulation (Manipulasi)',
      desc: 'Harga "digoreng" palsu menembus batas atas/bawah range untuk menjebak retail. Stop-loss dan pending order retail tereksekusi — ini disebut "liquidity grab" atau "stop hunt". Smart money menggunakan likuiditas ini untuk mengisi posisi mereka.',
    },
    {
      letter: 'D',
      color: '#26a69a',
      title: 'Distribution (Distribusi)',
      desc: 'Harga bergerak kuat dalam arah BERLAWANAN dengan manipulasi. Smart money mulai mendistribusikan (menutup) posisi mereka dengan menjual ke retail yang baru masuk. Ini adalah pergerakan "nyata".',
    },
  ]

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-tv-hover/30 transition-colors"
      >
        <span className="text-xs font-semibold text-tv-text">Panduan AMD — Smart Money Concepts</span>
        <span className="text-tv-muted text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-tv-border">
          {phases.map(({ letter, color, title, desc }) => (
            <div key={letter} className="flex gap-3 pt-3">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: `${color}22`, color, border: `1.5px solid ${color}66` }}
              >
                {letter}
              </div>
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color }}>
                  {title}
                </div>
                <div className="text-xs text-tv-muted leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}

          <div className="mt-3 p-3 bg-tv-bg rounded-lg border border-tv-border">
            <div className="text-xs text-tv-muted leading-relaxed">
              <span className="text-tv-yellow font-semibold">⚡ Tips Trading: </span>
              Setelah manipulasi terdeteksi, tunggu konfirmasi candle penutupan di atas/bawah range sebelum entry.
              Gunakan Range Low/High sebagai area stop-loss. Kombinasikan dengan RSI, volume, dan level support/resistance.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
