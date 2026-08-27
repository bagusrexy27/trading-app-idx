import { useState, useMemo } from 'react'
import { fmt } from '../utils'

const NAV = [
  { id: 'watchlist', icon: '⭐', label: 'Watchlist', badgeFrom: 'stocks' },
  { id: 'overview',  icon: '📊', label: 'Market Overview' },
  { id: 'session',   icon: '🕯️', label: 'Last Session' },
  { id: 'advisor',   icon: '🧭', label: 'Advisor Screener' },
  { id: 'portfolio', icon: '💼', label: 'Portfolio' },
  { id: 'practice',  icon: '🎮', label: 'Latihan' },
]

// Nav + quick watchlist jump. Collapsed icon rail saves space on desktop.
export default function Sidebar({
  stocks, selectedSymbol, activeView, recentSymbols = [], mobileOpen, collapsed, onToggleCollapse,
  onMobileClose, onAdd, onUpdateAll, onSelectStock,
  onViewWatchlist, onViewOverview, onViewSession,
  onViewAdvisor, onViewPortfolio, onViewPractice, onOpenAlerts,
}) {
  const [query, setQuery] = useState('')
  const [listSort, setListSort] = useState('symbol') // symbol | pct
  const nav = (fn) => () => { fn(); onMobileClose?.() }

  const viewFns = {
    watchlist: onViewWatchlist,
    overview: onViewOverview,
    session: onViewSession,
    advisor: onViewAdvisor,
    portfolio: onViewPortfolio,
    practice: onViewPractice,
  }

  const expanded = mobileOpen || !collapsed

  const marketPulse = useMemo(() => {
    const list = stocks || []
    const gainers = list.filter(s => (s.change_pct ?? 0) > 0).length
    const losers  = list.filter(s => (s.change_pct ?? 0) < 0).length
    return { gainers, losers, total: list.length }
  }, [stocks])

  const recent = useMemo(
    () => recentSymbols.filter(sym => (stocks || []).some(s => s.symbol === sym)),
    [recentSymbols, stocks],
  )

  const watchlistRows = useMemo(() => {
    const q = query.trim().toUpperCase()
    let list = [...(stocks || [])]
    if (q) list = list.filter(s => s.symbol.includes(q))
    if (listSort === 'pct') {
      list.sort((a, b) => (b.change_pct ?? -999) - (a.change_pct ?? -999))
    } else {
      list.sort((a, b) => a.symbol.localeCompare(b.symbol))
    }
    return list
  }, [stocks, query, listSort])

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex-shrink-0 glass border-r border-tv-border flex flex-col
          transform transition-[width,transform] duration-200 ease-out
          ${mobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0'}
          ${!mobileOpen && (collapsed ? 'md:w-[52px]' : 'md:w-[240px]')}`}
        aria-label="Navigasi utama"
      >
        {/* Header */}
        <div className={`flex items-center border-b border-tv-border shrink-0
          ${expanded ? 'justify-between px-3 py-3' : 'flex-col gap-1 py-2 px-1'}`}>
          {expanded ? (
            <span className="font-bold text-sm tracking-tight truncate">📈 IDX Analyzer</span>
          ) : (
            <span className="text-lg leading-none" title="IDX Analyzer">📈</span>
          )}
          <div className={`flex items-center ${expanded ? 'gap-1' : 'flex-col gap-1'}`}>
            <IconBtn label="Alert harga" onClick={onOpenAlerts}>🔔</IconBtn>
            <IconBtn label="Tambah saham" onClick={onAdd} accent>+</IconBtn>
            {mobileOpen && (
              <IconBtn label="Tutup menu" onClick={onMobileClose}>×</IconBtn>
            )}
          </div>
        </div>

        {selectedSymbol && activeView === 'home' && expanded && (
          <div className="px-3 py-2 text-[11px] font-semibold text-tv-blue border-b border-tv-border bg-tv-blue/5 shrink-0">
            📊 {selectedSymbol}
          </div>
        )}

        <nav className="py-1 shrink-0 border-b border-tv-border/50" aria-label="Menu">
          {NAV.map(item => (
            <NavBtn
              key={item.id}
              icon={item.icon}
              label={item.label}
              compact={!expanded}
              badge={item.badgeFrom === 'stocks' ? (stocks?.length || null) : null}
              active={activeView === item.id}
              onClick={nav(viewFns[item.id])}
            />
          ))}
        </nav>

        {/* Quick watchlist — isi ruang kosong dengan data yang berguna */}
        {expanded && stocks?.length > 0 && (
          <div className="flex-1 min-h-0 flex flex-col px-2 pt-2 pb-1">
            <div className="shrink-0 space-y-1.5 mb-2">
              <div className="flex items-center justify-between gap-1 px-1">
                <span className="text-[10px] font-semibold text-tv-muted uppercase tracking-wider">
                  Akses cepat
                </span>
                <span className="text-[10px] text-tv-muted tabular-nums">
                  <span className="text-tv-green">{marketPulse.gainers}</span>
                  {' · '}
                  <span className="text-tv-red">{marketPulse.losers}</span>
                </span>
              </div>

              {recent.length > 0 && (
                <div className="flex flex-wrap gap-1 px-0.5">
                  {recent.slice(0, 5).map(sym => (
                    <button
                      key={sym}
                      onClick={nav(() => onSelectStock?.(sym))}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold transition-colors
                        ${sym === selectedSymbol
                          ? 'bg-tv-blue/15 border-tv-blue/40 text-tv-blue'
                          : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              )}

              <input
                id="sidebar-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cari kode..."
                aria-label="Cari saham di watchlist"
                className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs
                  text-tv-text placeholder-tv-muted outline-none focus:border-tv-blue"
              />

              <div className="flex gap-1 px-0.5">
                {[['symbol', 'A–Z'], ['pct', '% hari ini']].map(([id, lbl]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setListSort(id)}
                    className={`flex-1 text-[10px] py-0.5 rounded border transition-colors
                      ${listSort === id
                        ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue font-semibold'
                        : 'border-tv-border text-tv-muted hover:text-tv-text'}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-tv-border/60 bg-tv-bg/40">
              {watchlistRows.length === 0 ? (
                <p className="text-[10px] text-tv-muted text-center py-4 px-2">Tidak ada cocok</p>
              ) : (
                watchlistRows.map(s => (
                  <WatchlistRow
                    key={s.symbol}
                    s={s}
                    active={s.symbol === selectedSymbol && activeView === 'home'}
                    onClick={nav(() => onSelectStock?.(s.symbol))}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {expanded && !stocks?.length && (
          <div className="flex-1 px-3 py-4 text-center">
            <p className="text-[11px] text-tv-muted leading-relaxed">
              Belum ada saham. Tekan <b className="text-tv-text">+</b> untuk tambah, atau buka Watchlist.
            </p>
          </div>
        )}

        {!expanded && <div className="flex-1 min-h-0" aria-hidden="true" />}

        <div className={`shrink-0 border-t border-tv-border ${expanded ? 'px-3 py-2 space-y-1.5' : 'p-1.5 space-y-1'}`}>
          {stocks?.length > 0 && (
            <button
              onClick={onUpdateAll}
              title={`Update semua ${stocks.length} saham`}
              className={`w-full font-medium rounded-md border border-tv-border text-tv-muted
                hover:text-tv-blue hover:border-tv-blue/40 transition-all
                ${expanded ? 'py-2 text-xs' : 'py-2 text-sm'}`}
            >
              {expanded ? `↻ Update Semua (${stocks.length})` : '↻'}
            </button>
          )}
          {!mobileOpen && (
            <button
              onClick={onToggleCollapse}
              title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              className="hidden md:flex w-full items-center justify-center py-1.5 text-[10px] text-tv-muted
                hover:text-tv-text rounded-md hover:bg-tv-hover transition-colors"
            >
              {collapsed ? '» Perluas' : '« Sembunyikan'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

function WatchlistRow({ s, active, onClick }) {
  const pct = s.change_pct
  const up = (pct ?? 0) >= 0
  const hasPct = pct != null

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left border-b border-tv-border/40 last:border-0
        transition-colors text-[11px]
        ${active ? 'bg-tv-blue/10' : 'hover:bg-tv-hover'}`}
    >
      <span className={`font-bold shrink-0 w-11 ${active ? 'text-tv-blue' : 'text-tv-text'}`}>
        {s.symbol}
      </span>
      <span className="flex-1 tabular-nums text-tv-muted truncate text-[10px]">
        {s.last_close != null ? fmt.price(s.last_close) : '—'}
      </span>
      {hasPct ? (
        <span className={`tabular-nums font-semibold shrink-0 w-12 text-right ${up ? 'text-tv-green' : 'text-tv-red'}`}>
          {up ? '+' : ''}{pct.toFixed(2)}%
        </span>
      ) : (
        <span className="text-tv-muted shrink-0 w-12 text-right">—</span>
      )}
    </button>
  )
}

function IconBtn({ children, label, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-7 h-7 rounded-md text-sm flex items-center justify-center transition-colors
        ${accent
          ? 'bg-tv-accent text-white text-lg font-bold hover:bg-tv-accent/80 leading-none pb-0.5'
          : 'text-tv-muted hover:text-tv-text'}`}
    >
      {children}
    </button>
  )
}

function NavBtn({ icon, label, badge, active, compact, onClick }) {
  return (
    <button
      onClick={onClick}
      title={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? label : undefined}
      className={`w-full flex items-center transition-all border-l-2
        ${compact
          ? 'justify-center px-0 py-2.5 text-base'
          : 'gap-2 px-3 py-2 text-xs font-medium text-left'}
        ${active
          ? 'bg-tv-accent/10 text-tv-blue border-l-tv-accent'
          : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover border-l-transparent'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {!compact && (
        <>
          <span>{label}</span>
          {badge != null && (
            <span className="ml-auto text-[10px] bg-tv-border rounded px-1.5 py-0.5">{badge}</span>
          )}
        </>
      )}
    </button>
  )
}
