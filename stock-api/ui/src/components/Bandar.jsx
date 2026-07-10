import { useState, useEffect, useMemo, useCallback } from 'react'
import ReactApexChart from 'react-apexcharts'
import { api } from '../api'
import { fmt, colorOf, APEX_DARK } from '../utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtIDR(v) {
  if (v == null) return '-'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}Rp${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `${sign}Rp${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `${sign}Rp${(abs / 1e6).toFixed(2)}Jt`
  if (abs >= 1e3)  return `${sign}Rp${(abs / 1e3).toFixed(0)}Rb`
  return `${sign}Rp${abs}`
}

function fmtSigned(v) {
  if (v == null) return '-'
  const s = fmtIDR(v)
  return v > 0 ? `+${s}` : s
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const fmtDate = v => {
  if (!v || !v.includes('-')) return ''
  const p = v.split('-')
  return `${+p[2]} ${MONTHS[+p[1]]}`
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Bandar({ symbol, showToast }) {
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [generating, setGen]    = useState(false)
  const [lookback, setLookback] = useState(20)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api.broker.summary(symbol, lookback, 5)
      setSummary(s)
    } catch (e) {
      setSummary(null)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [symbol, lookback])

  useEffect(() => { load() }, [load])

  const generateMock = async () => {
    setGen(true)
    try {
      const r = await api.broker.mock(symbol, 60)
      showToast(`✓ Mock broker data ${symbol}: ${r.days_written} hari`)
      await load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setGen(false)
    }
  }

  const deleteData = async () => {
    if (!confirm(`Hapus broker data ${symbol}?`)) return
    try {
      await api.broker.delete(symbol)
      showToast('Broker data dihapus')
      setSummary(null)
      setError('Broker data dihapus')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  if (loading) return <Loading />
  if (error && !summary) return <EmptyState symbol={symbol} onGenerate={generateMock} generating={generating} />

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <Header
        summary={summary}
        lookback={lookback}
        setLookback={setLookback}
        onRefresh={load}
        onRegen={generateMock}
        onDelete={deleteData}
        generating={generating}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BrokerTable
          title="Top Accumulators"
          subtitle={`${lookback} hari · Net BUY`}
          rows={summary.top_accumulators ?? []}
          accent="text-tv-green"
          icon="▲"
        />
        <BrokerTable
          title="Top Distributors"
          subtitle={`${lookback} hari · Net SELL`}
          rows={summary.top_distributors ?? []}
          accent="text-tv-red"
          icon="▼"
        />
      </div>

      <FlowChart flow={summary.flow ?? []} />

      <AllBrokers rows={summary.all_brokers ?? []} />

      <Disclaimer />
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({ summary, lookback, setLookback, onRefresh, onRegen, onDelete, generating }) {
  const score = summary?.bandar_score ?? 0
  let verdict, verdictCls, verdictDesc
  if (score >= 30) {
    verdict = 'AKUMULASI BANDAR'
    verdictCls = 'bg-tv-green text-white border-tv-green'
    verdictDesc = 'Bandar (top broker / foreign) net buy dominan. Indikasi akumulasi institusional.'
  } else if (score >= 10) {
    verdict = 'BIAS AKUMULASI'
    verdictCls = 'bg-tv-green/15 text-tv-green border-tv-green/30'
    verdictDesc = 'Bandar cenderung beli, tapi tidak agresif. Tunggu konfirmasi.'
  } else if (score <= -30) {
    verdict = 'DISTRIBUSI BANDAR'
    verdictCls = 'bg-tv-red text-white border-tv-red'
    verdictDesc = 'Bandar net sell dominan. Indikasi distribusi ke retail.'
  } else if (score <= -10) {
    verdict = 'BIAS DISTRIBUSI'
    verdictCls = 'bg-tv-red/15 text-tv-red border-tv-red/30'
    verdictDesc = 'Bandar cenderung jual ringan. Waspada exit position.'
  } else {
    verdict = 'NETRAL'
    verdictCls = 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'
    verdictDesc = 'Tidak ada bias bandar yang jelas. Volume seimbang.'
  }

  return (
    <div className="bg-tv-card border border-tv-border rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-2">
            Bandar Score · {summary?.days_in_data ?? 0} hari data · lookback {lookback}
          </div>
          <div className={`inline-block px-6 py-2.5 rounded-xl border-2 text-xl font-black tracking-tight mb-3 ${verdictCls}`}>
            {verdict} <span className="text-base font-bold opacity-80">({score > 0 ? '+' : ''}{score})</span>
          </div>
          <p className="text-xs text-tv-muted max-w-md leading-relaxed">{verdictDesc}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Lookback selector */}
          <div className="flex items-center gap-1">
            {[10, 20, 30, 60].map(n => (
              <button key={n} onClick={() => setLookback(n)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all
                  ${lookback === n ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue' : 'border-tv-border text-tv-muted hover:text-tv-text'}`}>
                {n}d
              </button>
            ))}
          </div>
          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onRefresh}
              className="px-3 py-1.5 text-xs rounded-lg bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all">
              ↻ Refresh
            </button>
            <button onClick={onRegen} disabled={generating}
              className="px-3 py-1.5 text-xs rounded-lg bg-tv-purple/10 border border-tv-purple/30 text-tv-purple hover:bg-tv-purple/20 transition-all disabled:opacity-40">
              {generating ? '⏳ ...' : '✦ Regenerate Mock'}
            </button>
            <button onClick={onDelete}
              className="px-3 py-1.5 text-xs rounded-lg bg-tv-red/5 border border-tv-red/20 text-tv-red hover:bg-tv-red/10 transition-all">
              🗑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Broker tables ────────────────────────────────────────────────────────────

function BrokerTable({ title, subtitle, rows, accent, icon }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-tv-border flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-tv-text">{title}</span>
          <div className="text-[10px] text-tv-muted mt-0.5">{subtitle}</div>
        </div>
        <span className={`text-lg ${accent}`}>{icon}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-8 text-xs text-tv-muted">Tidak ada data</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-tv-muted border-b border-tv-border bg-tv-bg/50">
              <th className="px-3 py-2 text-left">Broker</th>
              <th className="px-3 py-2 text-center">Tipe</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-center">Hari</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.broker} className="border-b border-tv-border/50 last:border-0 hover:bg-tv-hover/30 transition-colors animate-slide-up"
                style={{ animationDelay: `${i * 0.04}s` }}>
                <td className="px-3 py-2.5">
                  <div className="font-bold text-tv-text">{b.broker}</div>
                  <div className="text-[10px] text-tv-muted truncate max-w-[180px]">{b.name}</div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${b.type === 'F' ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-purple/15 text-tv-purple'}`}>
                    {b.type === 'F' ? 'Asing' : 'Lokal'}
                  </span>
                </td>
                <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${accent}`}>
                  {fmtSigned(b.net_value)}
                </td>
                <td className="px-3 py-2.5 text-center text-tv-muted tabular-nums">{b.days_active}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Flow chart (foreign vs local) ────────────────────────────────────────────

function FlowChart({ flow }) {
  const dates = useMemo(() => flow.map(f => f.date), [flow])

  // Cumulative for trend visibility
  const cumForeign = useMemo(() => {
    let acc = 0
    return flow.map(f => { acc += f.foreign_net; return acc })
  }, [flow])
  const cumLocal = useMemo(() => {
    let acc = 0
    return flow.map(f => { acc += f.local_net; return acc })
  }, [flow])

  const options = useMemo(() => ({
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      type: 'area',
      height: 280,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: false },
    },
    xaxis: {
      type: 'category',
      categories: dates,
      tickAmount: 8,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#787b86', fontSize: '10px' }, rotate: 0, formatter: fmtDate },
    },
    yaxis: {
      labels: { style: { colors: '#787b86', fontSize: '10px' }, formatter: v => fmtIDR(v) },
    },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#2196f3', '#9c6bff'],
    fill: {
      type: 'gradient',
      gradient: { shade: 'dark', opacityFrom: 0.2, opacityTo: 0, stops: [0, 100] },
    },
    annotations: {
      yaxis: [{ y: 0, borderColor: '#2a2e39', strokeDashArray: 0 }],
    },
    legend: { show: true, position: 'top', labels: { colors: '#d1d4dc' }, fontSize: '11px' },
    tooltip: { theme: 'dark', shared: true, y: { formatter: v => fmtSigned(v) } },
  }), [dates])

  const series = [
    { name: 'Asing (kumulatif)', data: cumForeign.map((v, i) => ({ x: dates[i], y: v })) },
    { name: 'Lokal (kumulatif)', data: cumLocal.map((v, i)   => ({ x: dates[i], y: v })) },
  ]

  // Today's net (last bar)
  const todayForeign = flow[flow.length - 1]?.foreign_net ?? 0
  const todayLocal   = flow[flow.length - 1]?.local_net ?? 0
  const totalForeign = cumForeign[cumForeign.length - 1] ?? 0
  const totalLocal   = cumLocal[cumLocal.length - 1] ?? 0

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-xs font-semibold text-tv-text">Net Flow Asing vs Lokal (Kumulatif)</span>
        <div className="flex gap-3 text-[10px] text-tv-muted">
          <span>Hari ini · Asing <b className={colorOf(todayForeign)}>{fmtSigned(todayForeign)}</b></span>
          <span>Lokal <b className={colorOf(todayLocal)}>{fmtSigned(todayLocal)}</b></span>
          <span className="text-tv-border">|</span>
          <span>Akumulasi · Asing <b className={colorOf(totalForeign)}>{fmtSigned(totalForeign)}</b></span>
          <span>Lokal <b className={colorOf(totalLocal)}>{fmtSigned(totalLocal)}</b></span>
        </div>
      </div>
      {flow.length === 0 ? (
        <div className="text-center py-12 text-xs text-tv-muted">Data flow belum tersedia</div>
      ) : (
        <ReactApexChart type="area" height={280} series={series} options={options} />
      )}
    </div>
  )
}

// ── All brokers table (sortable) ─────────────────────────────────────────────

function AllBrokers({ rows }) {
  const [sortKey, setSortKey] = useState('net_value')
  const [sortDir, setSortDir] = useState(-1)
  const [filter, setFilter]   = useState('ALL')

  const sorted = useMemo(() => {
    const f = filter === 'ALL' ? rows : rows.filter(r => r.type === (filter === 'F' ? 'F' : 'L'))
    const arr = [...f]
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string') return sortDir * av.localeCompare(bv)
      return sortDir * (av - bv)
    })
    return arr
  }, [rows, sortKey, sortDir, filter])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(key === 'broker' || key === 'name' ? 1 : -1) }
  }

  const cols = [
    { key: 'broker',    label: 'Broker',  left: true },
    { key: 'type',      label: 'Tipe',    center: true },
    { key: 'buy_value', label: 'Buy' },
    { key: 'sell_value',label: 'Sell' },
    { key: 'net_value', label: 'Net' },
    { key: 'days_active', label: 'Hari' },
  ]

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-tv-border flex items-center justify-between">
        <span className="text-xs font-semibold text-tv-text">Detail Per Broker ({sorted.length})</span>
        <div className="flex gap-1">
          {[['ALL','Semua'], ['F','Asing'], ['L','Lokal']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all
                ${filter === v ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue' : 'border-tv-border text-tv-muted hover:text-tv-text'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-tv-muted border-b border-tv-border bg-tv-bg/50">
              {cols.map(c => (
                <th key={c.key} onClick={() => handleSort(c.key)}
                  className={`px-3 py-2 cursor-pointer hover:text-tv-text uppercase font-semibold tracking-wider transition-colors select-none
                    ${c.left ? 'text-left' : c.center ? 'text-center' : 'text-right'}
                    ${sortKey === c.key ? 'text-tv-blue' : ''}`}>
                  {c.label}{sortKey === c.key ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => (
              <tr key={b.broker} className="border-b border-tv-border/50 last:border-0 hover:bg-tv-hover/30 transition-colors">
                <td className="px-3 py-2">
                  <div className="font-bold text-tv-text">{b.broker}</div>
                  <div className="text-[10px] text-tv-muted truncate max-w-[200px]">{b.name}</div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${b.type === 'F' ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-purple/15 text-tv-purple'}`}>
                    {b.type === 'F' ? 'Asing' : 'Lokal'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-tv-muted">{fmtIDR(b.buy_value)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-tv-muted">{fmtIDR(b.sell_value)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${colorOf(b.net_value)}`}>
                  {fmtSigned(b.net_value)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-tv-muted">{b.days_active}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Empty / Loading / Disclaimer ─────────────────────────────────────────────

function EmptyState({ symbol, onGenerate, generating }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6 py-16">
      <div className="text-6xl">🐋</div>
      <div>
        <h3 className="text-lg font-bold mb-1">Bandar Data Belum Ada</h3>
        <p className="text-tv-muted text-sm max-w-md leading-relaxed">
          Broker summary {symbol} belum tersedia. Generate <b className="text-tv-purple">mock data</b> untuk
          mulai eksplorasi bandarmologi (scraper Stockbit menyusul di Tier 3).
        </p>
      </div>
      <button onClick={onGenerate} disabled={generating}
        className="px-6 py-3 bg-tv-purple/10 border border-tv-purple/40 text-tv-purple rounded-lg
          font-semibold hover:bg-tv-purple/20 transition-colors disabled:opacity-40">
        {generating ? '⏳ Generating...' : '✦ Generate Mock 60 hari'}
      </button>
      <p className="text-[10px] text-tv-muted max-w-sm">
        Data yang dihasilkan deterministic per symbol (hash-seeded), realistic tapi <b>BUKAN data riil</b>.
      </p>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-tv-muted">
        <div className="w-5 h-5 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat data bandar...</span>
      </div>
    </div>
  )
}

function Disclaimer() {
  return (
    <div className="bg-tv-yellow/5 border border-tv-yellow/20 rounded-lg p-4 flex gap-3">
      <span className="text-tv-yellow flex-shrink-0">⚠️</span>
      <div className="text-xs text-tv-muted leading-relaxed">
        <b className="text-tv-yellow">Mock data</b> — angka di halaman ini dihasilkan deterministic dari hash symbol,
        bukan broker summary asli. Untuk data riil butuh integrasi dengan Stockbit / IPOT / IDX vendor feed (Tier 3 roadmap).
        Gunakan sebagai sandbox untuk validasi UI dan logika analisa, bukan keputusan trading.
      </div>
    </div>
  )
}
