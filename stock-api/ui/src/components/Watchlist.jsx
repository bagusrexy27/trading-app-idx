import { useState, useMemo } from 'react'
import { fmt } from '../utils'

// Saham syariah populer (konstituen JII / ISSI yang ramai diperdagangkan).
// Catatan: status syariah mengikuti Daftar Efek Syariah OJK — bisa berubah tiap review.
const SYARIAH_PICKS = [
  { s: 'TLKM', n: 'Telkom Indonesia' },
  { s: 'BRIS', n: 'Bank Syariah Indonesia' },
  { s: 'ANTM', n: 'Aneka Tambang' },
  { s: 'ADRO', n: 'Alamtri (Adaro)' },
  { s: 'UNTR', n: 'United Tractors' },
  { s: 'PGAS', n: 'Perusahaan Gas Negara' },
  { s: 'PTBA', n: 'Bukit Asam' },
  { s: 'ICBP', n: 'Indofood CBP' },
  { s: 'INDF', n: 'Indofood Sukses Makmur' },
  { s: 'KLBF', n: 'Kalbe Farma' },
  { s: 'CPIN', n: 'Charoen Pokphand' },
  { s: 'ISAT', n: 'Indosat Ooredoo' },
  { s: 'EXCL', n: 'XLSmart' },
  { s: 'SMGR', n: 'Semen Indonesia' },
  { s: 'BRPT', n: 'Barito Pacific' },
  { s: 'TPIA', n: 'Chandra Asri' },
  { s: 'ACES', n: 'Aspirasi Hidup (ACE)' },
  { s: 'AKRA', n: 'AKR Corporindo' },
  { s: 'MDKA', n: 'Merdeka Copper Gold' },
  { s: 'INCO', n: 'Vale Indonesia' },
]

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return <div className="h-9" />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 130, H = 36
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - 4 - ((v - min) / range) * (H - 8),
  }))
  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  const color = positive ? '#2ebd85' : '#f6465d'
  const gid = `spark-${positive ? 'up' : 'dn'}`
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function StockCard({ s, onSelect, delay }) {
  const pct = s.change_pct
  const pos = (pct ?? 0) >= 0
  return (
    <button
      onClick={() => onSelect(s.symbol)}
      style={{ animationDelay: `${delay}ms` }}
      className="group text-left bg-tv-card border border-tv-border rounded-2xl p-4 animate-slide-up
        transition-all duration-300 ease-cinema cursor-pointer
        hover:-translate-y-1 hover:border-tv-accent/50 hover:shadow-[0_10px_40px_-8px_rgba(94,106,210,0.35)]
        active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <div className="font-extrabold text-base tracking-tight group-hover:text-tv-blue transition-colors">
            {s.symbol}
          </div>
          <div className="text-[10px] text-tv-muted">{s.newest_date?.slice(5)} · {s.data_points}d</div>
        </div>
        {pct != null && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border tabular-nums
            ${pos ? 'text-tv-green bg-tv-green/10 border-tv-green/30' : 'text-tv-red bg-tv-red/10 border-tv-red/30'}`}>
            {pos ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
          </span>
        )}
      </div>
      <div className="text-xl font-extrabold tabular-nums mb-2">
        {s.last_close != null ? fmt.price(s.last_close) : '—'}
      </div>
      <Sparkline data={s.sparkline} positive={pos} />
    </button>
  )
}

export default function Watchlist({ stocks = [], loading, onSelect, onAdd, onUpdateAll, onQuickAdd }) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(null)   // symbol currently being quick-added

  const owned = useMemo(() => new Set(stocks.map(s => s.symbol)), [stocks])
  const filtered = stocks.filter(s => !search || s.symbol.toLowerCase().includes(search.toLowerCase()))
  const gainers = stocks.filter(s => (s.change_pct ?? 0) > 0).length
  const losers  = stocks.filter(s => (s.change_pct ?? 0) < 0).length
  const suggestions = SYARIAH_PICKS.filter(p => !owned.has(p.s))

  const quickAdd = async (sym) => {
    setAdding(sym)
    try { await onQuickAdd(sym) } finally { setAdding(null) }
  }

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="text-center mb-7 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          ⭐ Watchlist
        </h1>
        <p className="text-xs text-tv-muted mt-1.5">
          {stocks.length} saham dipantau
          {stocks.length > 0 && (
            <> · <span className="text-tv-green font-semibold">{gainers} naik</span> · <span className="text-tv-red font-semibold">{losers} turun</span></>
          )}
        </p>
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Cari kode saham..."
          className="w-64 bg-tv-input border border-tv-border rounded-xl px-4 py-2.5 text-sm
            text-tv-text placeholder-tv-muted outline-none focus:border-tv-accent transition-colors"
        />
        <button onClick={onAdd}
          className="px-4 py-2.5 text-xs font-bold rounded-xl bg-tv-accent text-white
            hover:bg-tv-accent/80 hover:shadow-[0_0_20px_rgba(94,106,210,0.4)] transition-all">
          + Tambah
        </button>
        {stocks.length > 0 && (
          <button onClick={onUpdateAll}
            className="px-4 py-2.5 text-xs font-medium rounded-xl border border-tv-border
              text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all">
            ↻ Update Semua
          </button>
        )}
      </div>

      {/* ── Grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl shimmer-bg" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((s, i) => (
            <StockCard key={s.symbol} s={s} onSelect={onSelect} delay={Math.min(i * 35, 500)} />
          ))}
        </div>
      ) : stocks.length > 0 ? (
        <div className="text-center py-14 text-tv-muted text-sm">Tidak ditemukan "{search}"</div>
      ) : (
        <div className="text-center py-10 animate-fade-in">
          <div className="text-6xl mb-4">🌱</div>
          <p className="text-sm font-semibold text-tv-text">Watchlist masih kosong</p>
          <p className="text-xs text-tv-muted mt-1">Mulai dari saham syariah populer di bawah 👇</p>
        </div>
      )}

      {/* ── Syariah quick-add ─────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div className="mt-10 animate-fade-in">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold">🕌 Saham Syariah Populer</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-tv-green/10 text-tv-green border border-tv-green/30">JII</span>
          </div>
          <p className="text-[10px] text-tv-muted mb-3">
            Konstituen Jakarta Islamic Index yang ramai diperdagangkan — klik untuk tambah ke watchlist.
            Status syariah mengikuti Daftar Efek Syariah OJK (di-review berkala).
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((p, i) => (
              <button key={p.s}
                onClick={() => quickAdd(p.s)}
                disabled={adding !== null}
                title={p.n}
                style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                className="animate-slide-up px-3 py-1.5 rounded-full border border-tv-border bg-tv-card text-xs
                  font-semibold text-tv-muted transition-all duration-200
                  hover:text-tv-green hover:border-tv-green/50 hover:bg-tv-green/5 hover:scale-105
                  disabled:opacity-40 disabled:hover:scale-100"
              >
                {adding === p.s ? '⏳ ' : '+ '}{p.s}
                <span className="text-[9px] text-tv-muted font-normal ml-1 hidden sm:inline">{p.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
