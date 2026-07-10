import { useState, useEffect, lazy, Suspense } from 'react'
import { api } from '../api'
import { fmt, colorOf, signalStyle } from '../utils'
import Overview from './Overview'
import RiskCalc from './RiskCalc'
import ReportUpload from './ReportUpload'
import Advisor from './Advisor'

// ApexCharts-heavy tabs load on demand (code-splitting)
const ChartTab   = lazy(() => import('./ChartTab'))
const Indicators = lazy(() => import('./Indicators'))

const TABS = [
  { id: 'overview',   label: '📋 Overview' },
  { id: 'chart',      label: '📊 Chart' },
  { id: 'indicators', label: '📉 Indicators' },
  { id: 'advisor',    label: '🧭 Saran' },
  { id: 'risk',       label: '⚖️ Risk' },
  { id: 'laporan',    label: '📄 Laporan' },
]

export default function StockPanel({ symbol, onDeleted, onUpdated, showToast }) {
  const [tab, setTab]         = useState('overview')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [updating, setUpdating] = useState(false)
  const [aiResult, setAiResult]   = useState(null)   // { analysis, generated, signal }
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOpen, setAiOpen]       = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Core data only — everything else lazy-loads per tab (see effect below).
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [summary, pricesResp, signals] = await Promise.all([
        api.analysis.summary(symbol),
        api.stocks.get(symbol, 300),
        api.analysis.signals(symbol),
      ])
      // Fresh object drops stale tab extras → the tab effect refetches them.
      setData({ summary, prices: pricesResp?.prices || [], signals })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }

  useEffect(() => { load() }, [symbol])

  // What each tab needs beyond core. Missing keys are fetched on tab activation.
  const TAB_NEEDS = {
    chart:      ['sma20', 'sma50'],
    indicators: ['rsi', 'macd', 'obv'],
    risk:       ['atr'],
  }

  useEffect(() => {
    if (!data) return
    const needs = (TAB_NEEDS[tab] || []).filter(k => data[k] === undefined)
    if (!needs.length) return
    const fetchers = {
      sma20: () => api.analysis.sma(symbol, 20, 300).then(r => r?.data || []),
      sma50: () => api.analysis.sma(symbol, 50, 300).then(r => r?.data || []),
      rsi:   () => api.analysis.rsi(symbol, 300).then(r => r?.data || []),
      macd:  () => api.analysis.macd(symbol, 300).then(r => r?.data || []),
      obv:   () => api.analysis.obv(symbol, 300).then(r => r?.data || []),
      atr:   () => api.analysis.atr(symbol, 300).then(r => r?.data || []),
    }
    let alive = true
    Promise.all(needs.map(k => fetchers[k]().catch(() => [])))
      .then(vals => {
        if (!alive) return
        setData(d => d ? { ...d, ...Object.fromEntries(needs.map((k, i) => [k, vals[i]])) } : d)
      })
    return () => { alive = false }
  }, [tab, data, symbol])
  // Reset AI state when symbol changes
  useEffect(() => { setAiResult(null); setAiOpen(false) }, [symbol])

  // Auto-refresh every 15 minutes
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(), 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, symbol])

  const handleAI = async () => {
    setAiOpen(true)
    if (aiResult) return   // already fetched — just re-open
    setAiLoading(true)
    try {
      const r = await api.analysis.ai(symbol)
      setAiResult(r)
    } catch (e) {
      showToast(e.message, 'error')
      setAiOpen(false)
    } finally {
      setAiLoading(false)
    }
  }

  const refreshAI = async () => {
    setAiLoading(true)
    try {
      const r = await api.analysis.ai(symbol)
      setAiResult(r)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      const r = await api.stocks.update(symbol)
      showToast(`✓ ${symbol}: ${r.added} data baru`)
      await load()
      onUpdated?.()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Hapus ${symbol} dari tracking?`)) return
    try {
      await api.stocks.delete(symbol)
      onDeleted?.()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3 text-tv-muted">
        <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
        <span className="text-sm">Memuat {symbol}...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-tv-red">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm font-medium">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 text-xs bg-tv-card border border-tv-border rounded-lg hover:border-tv-blue transition-colors text-tv-text">
          Coba lagi
        </button>
      </div>
    </div>
  )

  const { summary } = data
  const p = summary.price
  const c = summary.changes['1d']
  const signalNow = data.signals?.signal

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 glass border-b border-tv-border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          {/* Symbol + exchange */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">{symbol}</span>
            <span className="text-[10px] text-tv-muted bg-tv-bg border border-tv-border px-2 py-0.5 rounded-full">
              {summary.exchange}
            </span>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{fmt.price(p.close)}</span>
            <div className={`text-sm font-semibold tabular-nums ${colorOf(c.pct)}`}>
              {fmt.chg(c.change)} ({fmt.pct(c.pct)})
            </div>
          </div>

          {/* OHLV mini */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-tv-muted border-l border-tv-border pl-4">
            <span>O <b className="text-tv-text">{fmt.price(p.open)}</b></span>
            <span>H <b className="text-tv-green">{fmt.price(p.high)}</b></span>
            <span>L <b className="text-tv-red">{fmt.price(p.low)}</b></span>
            <span>V <b className="text-tv-text">{fmt.vol(p.volume)}</b></span>
          </div>

          {/* Signal badge */}
          {signalNow && (
            <span className={`hidden md:inline-flex px-2.5 py-0.5 rounded-full border text-xs font-bold ${signalStyle(signalNow)}`}>
              {signalNow}
            </span>
          )}

          {/* Date + actions */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:flex flex-col items-end text-[11px] text-tv-muted leading-tight">
              <span>{p.date}</span>
              {lastRefresh && (
                <span>Diperbarui: {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              title={autoRefresh ? 'Matikan auto-refresh' : 'Aktifkan auto-refresh 15 menit'}
              className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all
                ${autoRefresh
                  ? 'bg-tv-green/10 border-tv-green/30 text-tv-green'
                  : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
            >
              <span className={autoRefresh ? 'animate-spin' : ''} style={autoRefresh ? {animationDuration:'3s'} : {}}>↻</span>
              <span>Auto</span>
            </button>
            <button
              onClick={handleAI}
              disabled={aiLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-purple/10 border border-tv-purple/30
                text-tv-purple hover:bg-tv-purple/20 transition-all disabled:opacity-40 hidden sm:flex items-center gap-1.5"
            >
              <span>{aiLoading ? '⏳' : '✦'}</span>
              <span>{aiLoading ? 'Menganalisa...' : 'AI Analisa'}</span>
            </button>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-bg border border-tv-border
                text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all disabled:opacity-40"
            >
              {updating ? '↻ ...' : '↻ Update'}
            </button>
            <a
              href={api.stocks.exportUrl(symbol)}
              download
              title="Export CSV"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-bg border border-tv-border
                text-tv-muted hover:text-tv-green hover:border-tv-green/40 transition-all"
            >
              ⬇ CSV
            </a>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-red/5 border border-tv-red/20
                text-tv-red hover:bg-tv-red/10 transition-all"
            >
              🗑
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-tv-border px-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${tab === t.id
                  ? 'text-tv-blue border-tv-blue'
                  : 'text-tv-muted border-transparent hover:text-tv-text'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── AI Analysis Panel ───────────────────────────────────── */}
      {aiOpen && (
        <AIPanel
          result={aiResult}
          loading={aiLoading}
          onClose={() => setAiOpen(false)}
          onRefresh={refreshAI}
        />
      )}

      {/* ── Tab Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div key={tab} className="animate-slide-up h-full">
          {(() => {
            const extrasReady = (TAB_NEEDS[tab] || []).every(k => data[k] !== undefined)
            if (!extrasReady) return <TabLoading />
            return (
              <Suspense fallback={<TabLoading />}>
                {tab === 'overview'   && <Overview   data={data} />}
                {tab === 'chart'      && <ChartTab   data={data} />}
                {tab === 'indicators' && <Indicators data={data} />}
                {tab === 'advisor'    && <Advisor    symbol={symbol} />}
                {tab === 'risk'       && <RiskCalc      data={data} />}
                {tab === 'laporan'    && <ReportUpload  symbol={symbol} showToast={showToast} />}
              </Suspense>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ── Per-tab lazy-load spinner ─────────────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-40 text-tv-muted">
      <div className="w-6 h-6 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
    </div>
  )
}

// ── AI Analysis Panel ─────────────────────────────────────────────────────────

function AIPanel({ result, loading, onClose, onRefresh }) {
  // Render markdown bold (**text**) as <strong>
  const renderMarkdown = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-tv-text font-semibold">{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  return (
    <div className="animate-slide-down border-b border-tv-purple/20 bg-gradient-to-b from-tv-purple/5 to-transparent">
      <div className="px-6 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-tv-purple font-bold text-sm">✦ AI Analisa</span>
            <span className="text-[10px] text-tv-muted bg-tv-purple/10 border border-tv-purple/20 px-2 py-0.5 rounded-full">
              rule-based engine
            </span>
            {result && (
              <span className="text-[10px] text-tv-muted">
                Digenerate: {result.generated}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {result && !loading && (
              <button
                onClick={onRefresh}
                className="text-[11px] text-tv-muted hover:text-tv-purple transition-colors"
              >
                ↻ Refresh
              </button>
            )}
            <button
              onClick={onClose}
              className="text-tv-muted hover:text-tv-text transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-3 py-3">
            <div className="relative w-5 h-5 flex-shrink-0">
              <div className="absolute inset-0 border-2 border-tv-purple/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-transparent border-t-tv-purple rounded-full animate-spin" />
              <div className="absolute inset-1 border border-transparent border-t-tv-purple/50 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />
            </div>
            <span className="text-sm text-tv-muted animate-pulse">Menganalisa data teknikal dengan AI...</span>
          </div>
        ) : result ? (
          <div className="text-sm text-tv-muted leading-relaxed whitespace-pre-line animate-fade-in">
            {renderMarkdown(result.analysis)}
          </div>
        ) : null}
      </div>
    </div>
  )
}
