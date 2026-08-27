import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { fmt, colorOf, signalStyle, signalLabel } from '../utils'
import IHSGChart from './IHSGChart'

const SIGNAL_ORDER = ['STRONG_BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG_SELL']

const SUMMARY_CARDS = [
  { signal: 'STRONG_BUY',  label: 'Strong Buy',  cls: 'bg-tv-green text-white' },
  { signal: 'BUY',         label: 'Buy',          cls: 'bg-tv-green/15 text-tv-green border border-tv-green/30' },
  { signal: 'NEUTRAL',     label: 'Neutral',      cls: 'bg-tv-muted/10 text-tv-muted border border-tv-muted/20' },
  { signal: 'SELL',        label: 'Sell',         cls: 'bg-tv-red/15 text-tv-red border border-tv-red/30' },
  { signal: 'STRONG_SELL', label: 'Strong Sell',  cls: 'bg-tv-red text-white' },
]

const COLUMNS = [
  { label: 'Saham',    key: 'symbol',    left: true },
  { label: 'Harga',    key: 'close'                 },
  { label: '1D%',      key: 'pct_1d'                },
  { label: '5D%',      key: 'pct_5d'                },
  { label: '1M%',      key: 'pct_1m'                },
  { label: 'RSI',      key: 'rsi'                   },
  { label: 'Trend',    key: 'trend',     center: true },
  { label: 'Vol/Avg',  key: 'vol_ratio'             },
  { label: 'Signal',   key: 'signal'                },
  { label: 'Score',    key: 'score'                 },
]

function trendInfo(trend) {
  if (trend === 'bullish') return { icon: '▲', cls: 'text-tv-green' }
  if (trend === 'bearish') return { icon: '▼', cls: 'text-tv-red' }
  return { icon: '▶', cls: 'text-tv-muted' }
}

function getSortVal(item, key) {
  if (key === 'signal') return item.max_score ? item.score / item.max_score : 0
  if (key === 'trend')  return item.trend === 'bullish' ? 2 : item.trend === 'bearish' ? 0 : 1
  return item[key]
}

export default function MarketOverview({ onSelectStock, showToast }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState(-1) // -1 = desc

  const load = useCallback(() => {
    setLoading(true)
    api.overview()
      .then(setItems)
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => { load() }, [load])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => -d)
    } else {
      setSortKey(key)
      setSortDir(key === 'symbol' ? 1 : -1)
    }
  }

  const sorted = [...items].sort((a, b) => {
    const av = getSortVal(a, sortKey)
    const bv = getSortVal(b, sortKey)
    if (typeof av === 'string') return sortDir * av.localeCompare(bv)
    return sortDir * (av - bv)
  })

  const counts = Object.fromEntries(SIGNAL_ORDER.map(s => [s, 0]))
  items.forEach(item => { if (counts[item.signal] !== undefined) counts[item.signal]++ })

  return (
    <div className="p-6 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Market Overview</h2>
          <p className="text-tv-muted text-sm mt-0.5">
            {items.length} saham tersimpan · sinyal teknikal real-time
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-tv-border
            text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all disabled:opacity-50"
        >
          {loading
            ? <span className="w-3 h-3 border border-tv-muted border-t-tv-blue rounded-full animate-spin" />
            : '↻'
          }
          Refresh
        </button>
      </div>

      {/* IHSG live chart */}
      <IHSGChart />

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {SUMMARY_CARDS.map(({ signal, label, cls }) => (
          <div key={signal} className={`rounded-xl px-3 py-3 text-center ${cls}`}>
            <div className="text-2xl font-bold">{counts[signal]}</div>
            <div className="text-[11px] font-medium mt-0.5 opacity-80">{label}</div>
          </div>
        ))}
      </div>

      {/* Loading first time */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-tv-muted">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Menghitung sinyal semua saham...</span>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-tv-muted py-20 text-sm">
          Belum ada saham. Tambahkan saham dari sidebar.
        </div>
      ) : (
        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-tv-border">
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer
                        hover:text-tv-text transition-colors select-none whitespace-nowrap
                        ${col.left ? 'text-left' : col.center ? 'text-center' : 'text-right'}
                        ${sortKey === col.key ? 'text-tv-blue' : 'text-tv-muted'}`}
                    >
                      {col.label}{sortKey === col.key ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => {
                  const trend = trendInfo(item.trend)
                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => onSelectStock(item.symbol)}
                      className={`hover:bg-tv-hover cursor-pointer transition-colors
                        ${i < sorted.length - 1 ? 'border-b border-tv-border/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-tv-text">{item.symbol}</div>
                        <div className="text-[10px] text-tv-muted">{item.date?.slice(5)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-tv-text whitespace-nowrap">
                        {fmt.price(item.close)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-medium ${colorOf(item.pct_1d)}`}>
                        {fmt.pct(item.pct_1d)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-medium ${colorOf(item.pct_5d)}`}>
                        {fmt.pct(item.pct_5d)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-xs font-medium ${colorOf(item.pct_1m)}`}>
                        {fmt.pct(item.pct_1m)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-semibold ${
                          item.rsi >= 70 ? 'text-tv-red' :
                          item.rsi <= 30 ? 'text-tv-green' : 'text-tv-text'
                        }`}>
                          {fmt.num(item.rsi)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold ${trend.cls}`}>{trend.icon}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs ${item.vol_ratio >= 1.5 ? 'text-tv-yellow font-semibold' : 'text-tv-muted'}`}>
                          {fmt.num(item.vol_ratio)}x
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border whitespace-nowrap ${signalStyle(item.signal)}`}>
                          {signalLabel(item.signal)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <SignalScore score={item.score} max={item.max_score} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SignalScore({ score, max }) {
  if (!max) return <span className="text-tv-muted text-xs">-</span>
  const pct = Math.abs(score / max) * 100
  const barColor = score > 0 ? 'bg-tv-green' : score < 0 ? 'bg-tv-red' : 'bg-tv-muted/40'
  const textColor = score > 0 ? 'text-tv-green' : score < 0 ? 'text-tv-red' : 'text-tv-muted'
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`text-xs font-semibold ${textColor}`}>
        {score > 0 ? '+' : ''}{score}/{max}
      </span>
      <div className="w-12 h-1 bg-tv-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
