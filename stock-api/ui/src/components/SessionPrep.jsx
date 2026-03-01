import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { fmt, colorOf, signalStyle } from '../utils'

// ── Mini Candlestick (SVG) ────────────────────────────────────────────────────
function MiniCandle({ open, high, low, close }) {
  const W = 18, H = 54
  const range = high - low
  if (range === 0) return (
    <div style={{ width: W, height: H }} className="flex items-center justify-center">
      <div className="w-px h-full bg-tv-muted/40" />
    </div>
  )

  const toY = (p) => Math.max(0, Math.min(H, ((high - p) / range) * H))
  const bullish = close >= open
  const color = bullish ? '#26a69a' : '#ef5350'

  const bodyTop    = bullish ? close : open
  const bodyBottom = bullish ? open  : close
  const bodyTopY   = toY(bodyTop)
  const bodyBotY   = toY(bodyBottom)
  const bodyH      = Math.max(bodyBotY - bodyTopY, 2)
  const midX       = W / 2

  return (
    <svg width={W} height={H} className="inline-block">
      {/* Upper wick */}
      {bodyTopY > 0 && (
        <line x1={midX} y1={0} x2={midX} y2={bodyTopY} stroke={color} strokeWidth={1.5} />
      )}
      {/* Body */}
      <rect x={3} y={bodyTopY} width={W - 6} height={bodyH} fill={color} rx={1} />
      {/* Lower wick */}
      {bodyTopY + bodyH < H && (
        <line x1={midX} y1={bodyTopY + bodyH} x2={midX} y2={H} stroke={color} strokeWidth={1.5} />
      )}
    </svg>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PATTERN_CLS = {
  bullish: 'bg-tv-green/15 text-tv-green border-tv-green/30',
  bearish: 'bg-tv-red/15 text-tv-red border-tv-red/30',
  neutral: 'bg-tv-muted/10 text-tv-muted border-tv-muted/20',
}

const COLUMNS = [
  { label: 'Saham',      key: 'symbol',     left: true  },
  { label: 'Candle',     key: '_candle',    center: true, noSort: true },
  { label: 'Chg%',       key: 'change_pct'              },
  { label: 'Pattern',    key: '_pattern',   noSort: true },
  { label: 'Open',       key: 'open'                    },
  { label: 'High ®',     key: 'high'                    },
  { label: 'Low ©',      key: 'low'                     },
  { label: 'Close',      key: 'close'                   },
  { label: 'Body%',      key: 'body_pct'                },
  { label: 'Vol/Avg',    key: 'vol_ratio'               },
  { label: 'Signal',     key: 'signal'                  },
]

// ── Main Component ────────────────────────────────────────────────────────────
export default function SessionPrep({ onSelectStock, showToast }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('change_pct')
  const [sortDir, setSortDir] = useState(-1)

  const load = useCallback(() => {
    setLoading(true)
    api.session()
      .then(setItems)
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => { load() }, [load])

  const handleSort = (key) => {
    if (sortKey === key) { setSortDir(d => -d) }
    else { setSortKey(key); setSortDir(key === 'symbol' ? 1 : -1) }
  }

  const getSortVal = (item, key) => {
    if (key === 'signal') return item.max_score ? item.score / item.max_score : 0
    return item[key]
  }

  const sorted = [...items].sort((a, b) => {
    const av = getSortVal(a, sortKey)
    const bv = getSortVal(b, sortKey)
    if (typeof av === 'string') return sortDir * av.localeCompare(bv)
    return sortDir * (av - bv)
  })

  // Summary stats
  const sessionDate  = items[0]?.date || '-'
  const bullishCount = items.filter(i => i.pattern?.type === 'bullish').length
  const bearishCount = items.filter(i => i.pattern?.type === 'bearish').length
  const highVolCount = items.filter(i => i.vol_ratio >= 1.5).length
  const avgChange    = items.length
    ? (items.reduce((s, i) => s + i.change_pct, 0) / items.length).toFixed(2)
    : '0.00'

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-tv-muted">
          <div className="w-5 h-5 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Menganalisis sesi terakhir...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Last Session</h2>
          <p className="text-tv-muted text-sm mt-0.5">
            Sesi terakhir:{' '}
            <span className="text-tv-text font-medium">{sessionDate}</span>
            {' · '}Gunakan sebagai acuan trading hari ini
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

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard value={bullishCount} label="Candle Bullish" valueClass="text-tv-green" />
        <StatCard value={bearishCount} label="Candle Bearish" valueClass="text-tv-red" />
        <StatCard value={highVolCount} label="Volume Tinggi ≥1.5×" valueClass="text-tv-yellow" />
        <StatCard
          value={`${parseFloat(avgChange) > 0 ? '+' : ''}${avgChange}%`}
          label="Rata-rata Perubahan"
          valueClass={parseFloat(avgChange) >= 0 ? 'text-tv-green' : 'text-tv-red'}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-tv-muted mb-4">
        <span>
          <span className="text-tv-red font-semibold">High ®</span> = Resistance hari ini
        </span>
        <span>
          <span className="text-tv-green font-semibold">Low ©</span> = Support hari ini
        </span>
        <span className="text-tv-muted">Klik baris untuk lihat chart lengkap</span>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center text-tv-muted py-20 text-sm">
          Belum ada data saham.
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
                      onClick={() => !col.noSort && handleSort(col.key)}
                      className={[
                        'px-3 py-3 text-xs font-semibold uppercase tracking-wider select-none whitespace-nowrap transition-colors',
                        col.noSort ? 'cursor-default' : 'cursor-pointer hover:text-tv-text',
                        col.left ? 'text-left' : col.center ? 'text-center' : 'text-right',
                        sortKey === col.key ? 'text-tv-blue' : 'text-tv-muted',
                      ].join(' ')}
                    >
                      {col.label}
                      {!col.noSort && sortKey === col.key ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, i) => (
                  <SessionRow
                    key={item.symbol}
                    item={item}
                    isLast={i === sorted.length - 1}
                    onClick={() => onSelectStock(item.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
function SessionRow({ item, isLast, onClick }) {
  const bullish = item.close >= item.open

  return (
    <tr
      onClick={onClick}
      className={`hover:bg-tv-hover cursor-pointer transition-colors
        ${!isLast ? 'border-b border-tv-border/40' : ''}`}
    >
      {/* Symbol */}
      <td className="px-3 py-2.5">
        <div className="font-bold text-tv-text">{item.symbol}</div>
        <div className="text-[10px] text-tv-muted">{item.date?.slice(5)}</div>
      </td>

      {/* Mini Candle */}
      <td className="px-3 py-2.5">
        <div className="flex justify-center">
          <MiniCandle
            open={item.open} high={item.high}
            low={item.low}   close={item.close}
          />
        </div>
      </td>

      {/* Change% */}
      <td className={`px-3 py-2.5 text-right font-mono text-sm font-bold ${colorOf(item.change_pct)}`}>
        {fmt.pct(item.change_pct)}
      </td>

      {/* Pattern badge */}
      <td className="px-3 py-2.5">
        <div className="min-w-[110px]">
          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap
            ${PATTERN_CLS[item.pattern?.type] || PATTERN_CLS.neutral}`}
          >
            {item.pattern?.name || '-'}
          </span>
          <div className="text-[9px] text-tv-muted mt-0.5 leading-tight max-w-[130px]">
            {item.pattern?.description}
          </div>
        </div>
      </td>

      {/* Open */}
      <td className="px-3 py-2.5 text-right font-mono text-xs text-tv-muted">
        {fmt.price(item.open)}
      </td>

      {/* High — Resistance */}
      <td className="px-3 py-2.5 text-right">
        <span className="font-mono text-xs font-semibold text-tv-red">{fmt.price(item.high)}</span>
      </td>

      {/* Low — Support */}
      <td className="px-3 py-2.5 text-right">
        <span className="font-mono text-xs font-semibold text-tv-green">{fmt.price(item.low)}</span>
      </td>

      {/* Close */}
      <td className="px-3 py-2.5 text-right">
        <span className={`font-mono text-xs font-bold ${bullish ? 'text-tv-green' : 'text-tv-red'}`}>
          {fmt.price(item.close)}
        </span>
      </td>

      {/* Body% bar */}
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-tv-muted w-7 text-right">{item.body_pct?.toFixed(0)}%</span>
          <div className="w-10 h-1.5 bg-tv-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${bullish ? 'bg-tv-green' : 'bg-tv-red'}`}
              style={{ width: `${Math.min(item.body_pct ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </td>

      {/* Vol ratio */}
      <td className="px-3 py-2.5 text-right">
        <span className={`text-xs ${item.vol_ratio >= 1.5 ? 'text-tv-yellow font-semibold' : 'text-tv-muted'}`}>
          {fmt.num(item.vol_ratio)}×
        </span>
      </td>

      {/* Signal */}
      <td className="px-3 py-2.5">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${signalStyle(item.signal)}`}>
          {item.signal}
        </span>
      </td>
    </tr>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ value, label, valueClass }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-tv-muted mt-0.5">{label}</div>
    </div>
  )
}
