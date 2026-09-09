import { useState, useEffect, useRef, lazy, Suspense, memo } from 'react'
import { api } from '../api'
import { fmt, colorOf, signalStyle, signalLabel } from '../utils'
import Overview from './Overview'
import RiskCalc from './RiskCalc'
import ReportUpload from './ReportUpload'
import Advisor from './Advisor'

// Chart selalu ter-mount di atas panel — lazy sekali, jangan unmount saat ganti tab.
const ChartTab   = lazy(() => import('./ChartTab'))
const Indicators = lazy(() => import('./Indicators'))

const PANELS = [
  { id: 'decision',   label: 'Decision' },
  { id: 'indicators', label: 'Indicators' },
  { id: 'risk',       label: 'Risk' },
  { id: 'reports',    label: 'Reports' },
]

// ChartPane dibungkus memo; hanya terima prices/sma20/sma50/symbol.
// Jangan tambahkan prop baru yang dibuat inline (object/array literal).
const ChartPane = memo(function ChartPane({ prices, sma20, sma50, symbol }) {
  return (
    <Suspense fallback={<TabLoading />}>
      <ChartTab data={{ prices, sma20, sma50 }} symbol={symbol} compact />
    </Suspense>
  )
})

export default function StockPanel({ symbol, onDeleted, onUpdated, showToast }) {
  const [tab, setTab]         = useState('decision')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [updating, setUpdating] = useState(false)
  const [aiResult, setAiResult]   = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOpen, setAiOpen]       = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const hasDataRef = useRef(false)

  // Core + SMA untuk chart permanen di-load awal.
  // Jangan set loading=true kalau data sudah ada — itu unmount ChartPane & reset zoom.
  const load = async () => {
    const cold = !hasDataRef.current
    if (cold) setLoading(true)
    setError(null)
    try {
      const [summary, pricesResp, decision, sma20, sma50] = await Promise.all([
        api.analysis.summary(symbol),
        api.stocks.get(symbol, 300),
        api.analysis.decision(symbol),
        api.analysis.sma(symbol, 20, 300).then(r => r?.data || []).catch(() => []),
        api.analysis.sma(symbol, 50, 300).then(r => r?.data || []).catch(() => []),
      ])
      setData(d => ({
        ...(d || {}),
        summary,
        prices: pricesResp?.prices || [],
        decision,
        sma20,
        sma50,
      }))
      hasDataRef.current = true
    } catch (e) {
      setError(e.message)
    } finally {
      if (cold) setLoading(false)
      setLastRefresh(new Date())
    }
  }

  useEffect(() => { hasDataRef.current = false; setData(null); load() }, [symbol])

  // Prefetch menyusut: chart (sma) sudah di awal; sisa hanya indicators + risk.
  const TAB_NEEDS = {
    indicators: ['rsi', 'macd', 'obv'],
    risk:       ['atr'],
  }

  useEffect(() => {
    if (!data) return
    const needs = (TAB_NEEDS[tab] || []).filter(k => data[k] === undefined)
    if (!needs.length) return
    const fetchers = {
      rsi:  () => api.analysis.rsi(symbol, 300).then(r => r?.data || []),
      macd: () => api.analysis.macd(symbol, 300).then(r => r?.data || []),
      obv:  () => api.analysis.obv(symbol, 300).then(r => r?.data || []),
      atr:  () => api.analysis.atr(symbol, 300).then(r => r?.data || []),
    }
    let alive = true
    Promise.all(needs.map(k => fetchers[k]().catch(() => [])))
      .then(vals => {
        if (!alive) return
        setData(d => d ? { ...d, ...Object.fromEntries(needs.map((k, i) => [k, vals[i]])) } : d)
      })
    return () => { alive = false }
  }, [tab, data, symbol])

  useEffect(() => { setAiResult(null); setAiOpen(false); setTab('decision') }, [symbol])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(), 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [autoRefresh, symbol])

  const handleAI = async () => {
    setAiOpen(true)
    if (aiResult) return
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
      showToast(`${symbol}: ${r.added} new bars`)
      await load()
      onUpdated?.()
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Remove ${symbol} from watchlist?`)) return
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
        <span className="text-sm">Loading {symbol}…</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-tv-red">
        <p className="text-sm font-medium">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 text-xs bg-tv-card border border-tv-border rounded-lg hover:border-tv-blue transition-colors text-tv-text">
          Retry
        </button>
      </div>
    </div>
  )

  const { summary } = data
  const p = summary.price
  const c = summary.changes['1d']
  const dec = data.decision?.decision
  const signalNow = dec?.signal
  const buyish = signalNow === 'BUY' || signalNow === 'STRONG_BUY'
  const avoidish = signalNow === 'SELL' || signalNow === 'STRONG_SELL'
  const verdictLabel = buyish ? 'BUY TODAY' : (avoidish ? 'AVOID' : signalLabel(signalNow) || 'WAIT')
  const verdictTone = buyish
    ? { wrap: 'bg-tv-green/5 border-tv-green/20', text: 'text-tv-green' }
    : avoidish
      ? { wrap: 'bg-tv-red/5 border-tv-red/20', text: 'text-tv-red' }
      : { wrap: 'bg-tv-yellow/5 border-tv-yellow/20', text: 'text-tv-yellow' }

  return (
    <div className="flex flex-col">
      {/* Header sticky; chart ikut scroll supaya panel di bawah kebaca penuh */}
      <div className="sticky top-0 z-20 glass border-b border-tv-border">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">{symbol}</span>
            <span className="text-[10px] text-tv-muted bg-tv-bg border border-tv-border px-2 py-0.5 rounded">
              {summary.exchange}
            </span>
            {data.decision?.syariah && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-tv-green/10 text-tv-green border border-tv-green/30">Sharia</span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{fmt.price(p.close)}</span>
            <div className={`text-sm font-semibold tabular-nums ${colorOf(c.pct)}`}>
              {fmt.chg(c.change)} ({fmt.pct(c.pct)})
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[11px] text-tv-muted border-l border-tv-border pl-4">
            <span>O <b className="text-tv-text">{fmt.price(p.open)}</b></span>
            <span>H <b className="text-tv-green">{fmt.price(p.high)}</b></span>
            <span>L <b className="text-tv-red">{fmt.price(p.low)}</b></span>
            <span>V <b className="text-tv-text">{fmt.vol(p.volume)}</b></span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:flex flex-col items-end text-[11px] text-tv-muted leading-tight">
              <span>{p.date}</span>
              {lastRefresh && (
                <span>Updated {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              title={autoRefresh ? 'Disable auto-refresh' : 'Auto-refresh every 15 min'}
              className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-all
                ${autoRefresh
                  ? 'bg-tv-green/10 border-tv-green/30 text-tv-green'
                  : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
            >
              Auto
            </button>
            <button
              onClick={handleAI}
              disabled={aiLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-purple/10 border border-tv-purple/30
                text-tv-purple hover:bg-tv-purple/20 transition-all disabled:opacity-40 hidden sm:flex"
            >
              {aiLoading ? 'Analyzing…' : 'AI write-up'}
            </button>
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-bg border border-tv-border
                text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all disabled:opacity-40"
            >
              {updating ? '…' : 'Update'}
            </button>
            <a
              href={api.stocks.exportUrl(symbol)}
              download
              title="Export CSV"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-bg border border-tv-border
                text-tv-muted hover:text-tv-green hover:border-tv-green/40 transition-all"
            >
              CSV
            </a>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-tv-red/5 border border-tv-red/20
                text-tv-red hover:bg-tv-red/10 transition-all"
            >
              Remove
            </button>
          </div>
        </div>

        {dec && (
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 border-t ${verdictTone.wrap}`}>
            <span className={`text-sm font-extrabold tracking-wide ${verdictTone.text}`}>
              {verdictLabel}
            </span>
            <span className="text-xs text-tv-muted">
              Score <b className="text-tv-text tabular-nums">{dec.score}</b>
              <span className="mx-1.5 text-tv-border">·</span>
              Conf <b className="text-tv-text tabular-nums">{dec.confidence}%</b>
            </span>
            <span className="text-xs text-tv-muted tabular-nums">
              Entry <b className="text-tv-text">{fmt.price(dec.entry_zone?.ideal ?? dec.entry_zone?.buy?.[0])}</b>
              <span className="mx-1.5 text-tv-border">·</span>
              Stop <b className="text-tv-red">{fmt.price(dec.stop_loss)}</b>
              <span className="mx-1.5 text-tv-border">·</span>
              Target <b className="text-tv-green">{fmt.price(dec.take_profit?.[0]?.price)}</b>
              <span className="mx-1.5 text-tv-border">·</span>
              R:R <b className={dec.risk_reward >= 2 ? 'text-tv-green' : 'text-tv-text'}>1:{dec.risk_reward?.toFixed(1)}</b>
            </span>
            {signalNow && (
              <span className={`ml-auto hidden md:inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${signalStyle(signalNow)}`}>
                {signalLabel(signalNow)}
              </span>
            )}
          </div>
        )}
      </div>

      {aiOpen && (
        <AIPanel result={aiResult} loading={aiLoading} onClose={() => setAiOpen(false)} onRefresh={refreshAI} />
      )}

      {/* Chart ikut scroll (bukan flex-shrink-0 lock); tetap mounted saat ganti tab */}
      <div className="border-b border-tv-border">
        <ChartPane
          prices={data.prices}
          sma20={data.sma20}
          sma50={data.sma50}
          symbol={symbol}
        />
      </div>

      <div className="border-b border-tv-border px-4 flex glass">
        {PANELS.map(t => (
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

      <div className="animate-slide-up pb-8">
        {(() => {
          const extrasReady = (TAB_NEEDS[tab] || []).every(k => data[k] !== undefined)
          return (
            <Suspense fallback={<TabLoading />}>
              {tab === 'decision'   && <Advisor symbol={symbol} decisionData={data.decision} />}
              {tab === 'indicators' && (
                <div className="space-y-0">
                  <Overview data={data} />
                  <div className="border-t border-tv-border">
                    {extrasReady ? <Indicators data={data} /> : <TabLoading />}
                  </div>
                </div>
              )}
              {tab === 'risk'    && (extrasReady ? <RiskCalc data={data} /> : <TabLoading />)}
              {tab === 'reports' && <ReportUpload symbol={symbol} showToast={showToast} />}
            </Suspense>
          )
        })()}
      </div>
    </div>
  )
}

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-40 text-tv-muted">
      <div className="w-6 h-6 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
    </div>
  )
}

function AIPanel({ result, loading, onClose, onRefresh }) {
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
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-tv-purple font-bold text-sm">AI write-up</span>
            <span className="text-[10px] text-tv-muted bg-tv-purple/10 border border-tv-purple/20 px-2 py-0.5 rounded">
              rule-based
            </span>
            {result && (
              <span className="text-[10px] text-tv-muted">Generated {result.generated}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {result && !loading && (
              <button onClick={onRefresh} className="text-[11px] text-tv-muted hover:text-tv-purple transition-colors">
                Refresh
              </button>
            )}
            <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition-colors text-lg leading-none">×</button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center gap-3 py-3">
            <div className="w-5 h-5 border-2 border-tv-purple/20 border-t-tv-purple rounded-full animate-spin" />
            <span className="text-sm text-tv-muted animate-pulse">Analyzing technical data…</span>
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
