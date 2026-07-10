import { useMemo, useState } from 'react'
import ReactApexChart from 'react-apexcharts'
import { fmt, APEX_DARK } from '../utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function trendOf(series, lookback = 5) {
  if (!series || series.length < lookback + 1) return 0
  const tail = series.slice(-lookback - 1)
  const first = tail[0]?.value ?? 0
  const last = tail[tail.length - 1]?.value ?? 0
  if (last > first) return 1
  if (last < first) return -1
  return 0
}

function fmtBig(v) {
  if (v == null) return '-'
  const abs = Math.abs(v)
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (v / 1e9).toFixed(2)  + 'B'
  if (abs >= 1e6)  return (v / 1e6).toFixed(2)  + 'M'
  if (abs >= 1e3)  return (v / 1e3).toFixed(0)  + 'K'
  return v.toFixed(0)
}

// AMD score: accum/potential_accum = +1, distrib bullish = +1, distrib bearish = -1
function amdScore(amd) {
  if (!amd) return { score: 0, label: 'N/A' }
  const phase = amd.current_phase
  const zone = amd.current_zone

  if (phase === 'accum')           return { score: +1, label: 'Accumulation' }
  if (phase === 'potential_accum') return { score: +1, label: 'Potential Accum' }
  if (phase === 'manip')           return { score:  0, label: 'Manipulation' }
  if (phase === 'distrib') {
    if (zone?.distrib_dir === 'bullish') return { score: +1, label: 'Distrib ↑' }
    if (zone?.distrib_dir === 'bearish') return { score: -1, label: 'Distrib ↓' }
    return { score: 0, label: 'Distribution' }
  }
  return { score: 0, label: 'None' }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SmartMoney({ data }) {
  const { obv, adline, cmf, mfi, amd } = data

  // ── Scoring ───────────────────────────────────────────────────────────────
  const obvTrend = trendOf(obv, 5)
  const adTrend  = trendOf(adline, 5)
  const cmfLast  = cmf?.length ? cmf[cmf.length - 1].value : 0
  const mfiLast  = mfi?.length ? mfi[mfi.length - 1].value : 50
  const amdSig   = amdScore(amd)

  const cmfScore = cmfLast >  0.05 ? 1 : cmfLast < -0.05 ? -1 : 0
  const mfiScore = mfiLast <= 20   ? 1 : mfiLast >= 80   ? -1 : 0

  const components = [
    { key: 'obv',  label: 'OBV',     score: obvTrend, detail: obvTrend > 0 ? 'Rising' : obvTrend < 0 ? 'Falling' : 'Flat',
      value: obv?.length ? fmtBig(obv[obv.length - 1].value) : '-' },
    { key: 'ad',   label: 'A/D Line', score: adTrend,  detail: adTrend > 0 ? 'Rising' : adTrend < 0 ? 'Falling' : 'Flat',
      value: adline?.length ? fmtBig(adline[adline.length - 1].value) : '-' },
    { key: 'cmf',  label: 'CMF(20)',  score: cmfScore, detail: cmfScore > 0 ? 'Accum > 0.05' : cmfScore < 0 ? 'Distrib < -0.05' : 'Netral',
      value: cmfLast.toFixed(3) },
    { key: 'mfi',  label: 'MFI(14)',  score: mfiScore, detail: mfiScore > 0 ? 'Oversold ≤20' : mfiScore < 0 ? 'Overbought ≥80' : 'Netral',
      value: fmt.num(mfiLast) },
    { key: 'amd',  label: 'AMD',      score: amdSig.score, detail: amdSig.label,
      value: amd?.current_phase ?? '-' },
  ]

  const total = components.reduce((s, c) => s + c.score, 0)
  const accumCount = components.filter(c => c.score > 0).length
  const distribCount = components.filter(c => c.score < 0).length

  // Verdict (range -5..+5)
  let verdict, verdictColor, verdictDesc
  if (total >= 3) {
    verdict = 'AKUMULASI KUAT'
    verdictColor = 'bg-tv-green text-white border-tv-green'
    verdictDesc = 'Mayoritas indikator menunjukkan tekanan beli institusional. Smart money proxy positif.'
  } else if (total >= 1) {
    verdict = 'AKUMULASI'
    verdictColor = 'bg-tv-green/15 text-tv-green border-tv-green/30'
    verdictDesc = 'Bias akumulasi ringan. Tunggu konvergensi tambahan sebelum entry agresif.'
  } else if (total <= -3) {
    verdict = 'DISTRIBUSI KUAT'
    verdictColor = 'bg-tv-red text-white border-tv-red'
    verdictDesc = 'Mayoritas indikator menunjukkan tekanan jual. Hindari posisi long baru.'
  } else if (total <= -1) {
    verdict = 'DISTRIBUSI'
    verdictColor = 'bg-tv-red/15 text-tv-red border-tv-red/30'
    verdictDesc = 'Bias distribusi ringan. Pertimbangkan kurangi posisi atau tunggu reversal.'
  } else {
    verdict = 'NETRAL'
    verdictColor = 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
    verdictDesc = 'Sinyal terbagi rata. Tidak ada bias smart money yang jelas — wait & see.'
  }

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* ── Header verdict ──────────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-2xl p-6 text-center">
        <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-3">
          Smart Money Proxy · Konvergensi Indikator Volume
        </div>

        <div className={`inline-block px-8 py-3 rounded-xl border-2 text-2xl font-black tracking-tight mb-3 ${verdictColor}`}>
          {verdict}
        </div>

        <div className="text-sm text-tv-muted mb-2">
          Skor Komposit: <b className="text-tv-text tabular-nums">{total > 0 ? '+' : ''}{total}</b> / {components.length}
          <span className="mx-2">·</span>
          <span className="text-tv-green">▲ {accumCount}</span>
          <span className="mx-1.5 text-tv-muted">vs</span>
          <span className="text-tv-red">▼ {distribCount}</span>
        </div>

        {/* Strength bar */}
        <div className="relative h-2.5 bg-tv-bg rounded-full overflow-hidden w-72 mx-auto mt-3">
          <div className="absolute inset-y-0 left-1/2 w-px bg-tv-border z-10" />
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-700
              ${total > 0 ? 'bg-tv-green left-1/2' : total < 0 ? 'bg-tv-red right-1/2' : 'bg-tv-muted'}`}
            style={{ width: `${(Math.abs(total) / 5) * 50}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-tv-muted mt-1 w-72 mx-auto">
          <span>Distribusi −5</span>
          <span>0</span>
          <span>+5 Akumulasi</span>
        </div>

        <p className="mt-4 text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
          {verdictDesc}
        </p>
      </div>

      {/* ── Indicator breakdown cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {components.map((c, i) => (
          <ComponentCard key={c.key} comp={c} delay={i * 0.05} />
        ))}
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="OBV — On-Balance Volume" series={obv} color="#ffc107" formatY={fmtBig} />
        <ChartCard title="A/D Line — Accumulation / Distribution" series={adline} color="#2196f3" formatY={fmtBig} />
        <ChartCard title="CMF(20) — Chaikin Money Flow" series={cmf} color="#9c6bff"
          formatY={v => v?.toFixed(3) ?? '-'}
          bands={[{ y:  0.05, color: '#26a69a60', label: '+0.05 Accum' },
                   { y: -0.05, color: '#ef535060', label: '−0.05 Distrib' },
                   { y:  0,    color: '#2a2e39',   label: '0' }]} />
        <ChartCard title="MFI(14) — Money Flow Index" series={mfi} color="#26a69a"
          formatY={v => v?.toFixed(1) ?? '-'} yMin={0} yMax={100}
          bands={[{ y: 80, color: '#ef535060', label: '80 Overbought' },
                   { y: 20, color: '#26a69a60', label: '20 Oversold' }]} />
      </div>

      {/* ── Guide ──────────────────────────────────────────────────────── */}
      <GuideCard />

      {/* Disclaimer */}
      <p className="text-[10px] text-tv-muted text-center px-4 leading-relaxed">
        ⚠️ Smart Money Proxy adalah pendekatan berbasis volume — bukan data broker summary asli.
        Bandarmologi sejati butuh net flow per broker yang tidak tersedia dari Yahoo Finance.
      </p>
    </div>
  )
}

// ── Component card (per indicator) ───────────────────────────────────────────

function ComponentCard({ comp, delay }) {
  const { label, score, detail, value } = comp
  const bgScore = score > 0 ? 'bg-tv-green/10 border-tv-green/30 text-tv-green'
                : score < 0 ? 'bg-tv-red/10 border-tv-red/30 text-tv-red'
                :             'bg-tv-muted/10 border-tv-muted/20 text-tv-muted'
  const arrow = score > 0 ? '▲' : score < 0 ? '▼' : '●'

  return (
    <div
      className="bg-tv-card border border-tv-border rounded-xl p-4 animate-slide-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">{label}</span>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${bgScore}`}>
          {arrow} {score > 0 ? '+1' : score < 0 ? '-1' : '0'}
        </span>
      </div>
      <div className="text-lg font-bold tabular-nums text-tv-text mb-1">{value}</div>
      <div className="text-[10px] text-tv-muted">{detail}</div>
    </div>
  )
}

// ── Chart card ───────────────────────────────────────────────────────────────

function ChartCard({ title, series, color, formatY, bands, yMin, yMax }) {
  const dataPoints = useMemo(() => {
    if (!series || series.length === 0) return []
    return series.map(p => ({ x: p.date, y: p.value }))
  }, [series])

  const options = useMemo(() => ({
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      type: 'area',
      height: 200,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
    },
    xaxis: {
      type: 'category',
      tickAmount: 6,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: '#787b86', fontSize: '9px' },
        formatter: v => v ? v.slice(5) : '',
      },
    },
    yaxis: {
      min: yMin, max: yMax,
      labels: {
        style: { colors: '#787b86', fontSize: '10px' },
        formatter: formatY,
      },
    },
    stroke: { width: 1.5, curve: 'smooth' },
    colors: [color],
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', gradientToColors: [color], opacityFrom: 0.25, opacityTo: 0, stops: [0, 100] },
    },
    annotations: bands ? {
      yaxis: bands.map(b => ({
        y: b.y, borderColor: b.color, strokeDashArray: 4,
        label: { text: b.label, borderColor: 'transparent',
          style: { background: 'transparent', color: '#787b86', fontSize: '9px' } },
      })),
    } : undefined,
    tooltip: { theme: 'dark', y: { formatter: formatY } },
  }), [color, formatY, bands, yMin, yMax])

  const last = series?.[series.length - 1]?.value

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">{title}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{formatY(last)}</span>
      </div>
      {dataPoints.length > 0 ? (
        <ReactApexChart type="area" height={200} series={[{ name: title, data: dataPoints }]} options={options} />
      ) : (
        <div className="h-[200px] flex items-center justify-center text-tv-muted text-xs">Data belum cukup</div>
      )}
    </div>
  )
}

// ── Guide ────────────────────────────────────────────────────────────────────

function GuideCard() {
  const [open, setOpen] = useState(false)

  const items = [
    { name: 'OBV',     desc: 'Volume kumulatif berdasarkan arah close. Naik = pembeli dominan. Divergensi vs harga = early warning.' },
    { name: 'A/D Line', desc: 'Mirip OBV tapi memperhitungkan posisi close dalam range bar. Lebih sensitif terhadap wick shape.' },
    { name: 'CMF(20)', desc: 'Net money flow 20 hari dinormalisasi. >0.05 akumulasi, <−0.05 distribusi. Range −1 .. +1.' },
    { name: 'MFI(14)', desc: 'RSI versi volume. <20 oversold (potensi akumulasi), >80 overbought (potensi distribusi).' },
    { name: 'AMD',      desc: 'Wyckoff/SMC phase detector. Cari Accumulation → Manipulation → Distribution. Lihat tab AMD untuk detail.' },
  ]

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-tv-hover/30 transition-colors"
      >
        <span className="text-xs font-semibold text-tv-text">Panduan Indikator Smart Money</span>
        <span className="text-tv-muted text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-tv-border pt-3">
          {items.map(it => (
            <div key={it.name} className="text-xs">
              <span className="font-bold text-tv-blue">{it.name}</span>
              <span className="text-tv-muted ml-2">— {it.desc}</span>
            </div>
          ))}
          <div className="mt-3 p-3 bg-tv-bg rounded-lg border border-tv-border text-xs text-tv-muted leading-relaxed">
            <span className="text-tv-yellow font-semibold">⚡ Cara Pakai: </span>
            Cari konvergensi ≥3 indikator searah. Akumulasi kuat di harga sideways/koreksi = sinyal high-probability.
            Distribusi kuat di harga puncak = warning exit. Kombinasikan dengan tab AMD dan price action.
          </div>
        </div>
      )}
    </div>
  )
}
