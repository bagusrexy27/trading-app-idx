import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { fmt, colorOf } from '../utils'
import { IconSharia } from './icons'

// Alasan satu baris: pakai note dari engine kalau ada; kalau tidak, rakit dari
// trend / structure / volume_state / probability — tanpa teks dikarang di frontend.
function reasonOf(r) {
  if (r.note) return r.note
  const bits = []
  if (r.trend?.overall) bits.push(r.trend.overall)
  if (r.structure) bits.push(r.structure)
  if (r.volume_state) bits.push(`Vol ${r.volume_state}`)
  if (r.probability?.bullish != null) bits.push(`Bull ${r.probability.bullish}%`)
  return bits.join(' · ') || '—'
}

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return <div className="h-7 w-16" />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 64, H = 28
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / range) * (H - 6)).toFixed(1)}`).join(' ')
  const color = positive ? '#2ebd85' : '#f6465d'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ScoreChip({ score }) {
  const tone = score >= 60 ? 'text-tv-green border-tv-green/30 bg-tv-green/10'
    : score >= 40 ? 'text-tv-yellow border-tv-yellow/30 bg-tv-yellow/10'
    : 'text-tv-red border-tv-red/30 bg-tv-red/10'
  return (
    <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded border ${tone}`}>
      {score}
    </span>
  )
}

function TickerCard({ r, onSelect }) {
  const pct = r.change_pct
  const pos = (pct ?? 0) >= 0
  const buyish = r.signal === 'BUY' || r.signal === 'STRONG_BUY'
  return (
    <button
      onClick={() => onSelect(r.symbol)}
      className="w-full text-left px-3 py-2.5 rounded-xl border border-tv-border bg-tv-card
        hover:border-tv-accent/50 hover:bg-tv-hover/40 transition-all group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-extrabold text-sm tracking-tight group-hover:text-tv-blue transition-colors">{r.symbol}</span>
        {r.syariah && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-tv-green border border-tv-green/30 bg-tv-green/10 px-1.5 py-0.5 rounded">
            <IconSharia /> Sharia
          </span>
        )}
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded border
          ${buyish ? 'text-tv-green border-tv-green/30 bg-tv-green/10' : 'text-tv-red border-tv-red/30 bg-tv-red/10'}`}>
          {r.signal?.replace(/_/g, ' ')}
        </span>
        <ScoreChip score={r.score} />
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tabular-nums">{fmt.price(r.close)}</span>
            {pct != null && (
              <span className={`text-[11px] font-semibold tabular-nums ${colorOf(pct)}`}>
                {fmt.pct(pct)}
              </span>
            )}
            {r.risk_reward > 0 && (
              <span className="text-[10px] text-tv-muted tabular-nums">R:R 1:{r.risk_reward.toFixed(1)}</span>
            )}
          </div>
          <div className="text-[11px] text-tv-muted truncate mt-0.5" title={reasonOf(r)}>{reasonOf(r)}</div>
        </div>
        <Sparkline data={r.sparkline} positive={pos} />
      </div>
    </button>
  )
}

function Column({ title, tone, rows, onSelect, empty }) {
  return (
    <section className="min-w-0 flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className={`text-sm font-extrabold tracking-tight ${tone}`}>{title}</h2>
        <span className="text-[10px] text-tv-muted tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-tv-muted px-1 py-6 border border-dashed border-tv-border rounded-xl">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(r => <TickerCard key={r.symbol} r={r} onSelect={onSelect} />)}
        </div>
      )}
    </section>
  )
}

export default function DecisionBoard({ stocks = [], loading: stocksLoading, onSelect, onAdd, onUpdateAll }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('score') // score | rr | volume
  const [shariaOnly, setShariaOnly] = useState(false)
  const [error, setError] = useState(null)

  const sparkBySym = useMemo(() => {
    const m = {}
    for (const s of stocks) m[s.symbol] = { sparkline: s.sparkline, change_pct: s.change_pct, syariah: s.syariah }
    return m
  }, [stocks])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    // mode=all + minTurnover=0 supaya saham tidak likuid tetap muncul di "stay away"
    api.advisorScreen('all', 0)
      .then(d => {
        if (!alive) return
        const merged = (d?.results || []).map(r => ({
          ...r,
          sparkline: sparkBySym[r.symbol]?.sparkline,
          change_pct: sparkBySym[r.symbol]?.change_pct,
          // syariah dari screen; fallback ke stocks list kalau ada
          syariah: r.syariah || !!sparkBySym[r.symbol]?.syariah,
        }))
        setRows(merged)
      })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [sparkBySym])

  const sorted = useMemo(() => {
    let list = shariaOnly ? rows.filter(r => r.syariah) : rows.slice()
    list.sort((a, b) => {
      if (sort === 'rr') return (b.risk_reward || 0) - (a.risk_reward || 0)
      if (sort === 'volume') return (b.turnover_bn || 0) - (a.turnover_bn || 0)
      return (b.score || 0) - (a.score || 0)
    })
    return list
  }, [rows, sort, shariaOnly])

  const buy = sorted.filter(r => r.signal === 'BUY' || r.signal === 'STRONG_BUY')
  const buySyms = new Set(buy.map(r => r.symbol))
  // Stay away: SELL/STRONG_SELL atau skor <40 — exclude yang sudah di kolom buy
  const avoid = sorted
    .filter(r => !buySyms.has(r.symbol) && (r.signal === 'SELL' || r.signal === 'STRONG_SELL' || (r.score ?? 100) < 40))
    .sort((a, b) => (a.score || 0) - (b.score || 0))
  const avoidSyms = new Set(avoid.map(r => r.symbol))
  const waiting = sorted.filter(r => !buySyms.has(r.symbol) && !avoidSyms.has(r.symbol))

  const busy = loading || stocksLoading

  return (
    <div className="p-5 sm:p-7 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Today</h1>
          <p className="text-xs text-tv-muted mt-1">
            Ranked from the Decision Engine across your watchlist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-tv-input border border-tv-border rounded-lg px-2.5 py-1.5 text-xs text-tv-text outline-none"
          >
            <option value="score">Sort: Score</option>
            <option value="rr">Sort: R:R</option>
            <option value="volume">Sort: Volume</option>
          </select>
          <button
            onClick={() => setShariaOnly(v => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all inline-flex items-center gap-1
              ${shariaOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}
          >
            <IconSharia /> Sharia
          </button>
          <button onClick={onAdd}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-tv-accent text-white hover:bg-tv-accent/80 transition-all">
            + Add
          </button>
          {stocks.length > 0 && (
            <button onClick={onUpdateAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all">
              Update all
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-tv-red border border-tv-red/30 bg-tv-red/10 rounded-xl px-4 py-3">{error}</div>
      )}

      {busy ? (
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 shimmer-bg rounded" />
              {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-20 shimmer-bg rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm font-semibold">Watchlist is empty</p>
          <p className="text-xs text-tv-muted mt-1 mb-4">Add a ticker to see ranked buy / avoid columns.</p>
          <button onClick={onAdd} className="px-4 py-2 text-xs font-bold rounded-lg bg-tv-accent text-white">+ Add stock</button>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <Column
              title="Worth buying"
              tone="text-tv-green"
              rows={buy}
              onSelect={onSelect}
              empty="No BUY setups right now."
            />
            <Column
              title="Stay away today"
              tone="text-tv-red"
              rows={avoid}
              onSelect={onSelect}
              empty="Nothing flagged to avoid."
            />
          </div>
          {waiting.length > 0 && (
            <button
              onClick={() => onSelect(waiting[0].symbol)}
              className="mt-5 w-full text-left px-4 py-3 rounded-xl border border-tv-border bg-tv-card/60
                text-xs text-tv-muted hover:text-tv-text hover:border-tv-accent/40 transition-all"
            >
              <span className="font-semibold text-tv-text">{waiting.length} tickers waiting</span>
              <span className="ml-2">
                {waiting.slice(0, 8).map(r => r.symbol).join(' · ')}
                {waiting.length > 8 ? '…' : ''}
              </span>
            </button>
          )}
        </>
      )}
    </div>
  )
}
