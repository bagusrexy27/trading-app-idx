import { useState, useMemo } from 'react'

const NAV = [
  { id: 'watchlist', icon: '⭐', label: 'Watchlist', badgeFrom: 'stocks' },
  { id: 'overview',  icon: '📊', label: 'Market Overview' },
  { id: 'session',   icon: '🕯️', label: 'Last Session' },
  { id: 'advisor',   icon: '🧭', label: 'Advisor Screener' },
  { id: 'portfolio', icon: '💼', label: 'Portfolio' },
  { id: 'practice',  icon: '🎮', label: 'Latihan' },
]

// Slim nav — stock grid lives in Watchlist. Collapsed icon rail saves horizontal space.
export default function Sidebar({
  stocks, selectedSymbol, activeView, recentSymbols = [], mobileOpen, collapsed, onToggleCollapse,
  onMobileClose, onAdd, onUpdateAll, onSelectStock,
  onViewWatchlist, onViewOverview, onViewSession,
  onViewAdvisor, onViewPortfolio, onViewPractice, onOpenAlerts,
}) {
  const [query, setQuery] = useState('')
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

  const searchHits = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q || q.length < 1) return []
    return (stocks || [])
      .filter(s => s.symbol.includes(q))
      .slice(0, 6)
  }, [query, stocks])

  const movers = useMemo(() => {
    const withPct = (stocks || []).filter(s => s.change_pct != null)
    if (!withPct.length) return { gainers: [], losers: [] }
    const sorted = [...withPct].sort((a, b) => b.change_pct - a.change_pct)
    return { gainers: sorted.slice(0, 3), losers: sorted.slice(-3).reverse() }
  }, [stocks])

  const recent = useMemo(
    () => recentSymbols.filter(sym => (stocks || []).some(s => s.symbol === sym)),
    [recentSymbols, stocks],
  )

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
          ${mobileOpen ? 'translate-x-0 w-[240px]' : '-translate-x-full md:translate-x-0'}
          ${!mobileOpen && (collapsed ? 'md:w-[52px]' : 'md:w-[220px]')}`}
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

        {/* Primary nav — tidak pakai flex-1 supaya tidak terlihat kosong */}
        <nav className="py-1 shrink-0" aria-label="Menu">
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

        {/* Konten tambahan hanya saat expanded — isi ruang dengan data berguna */}
        {expanded && (
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-tv-border/60 mt-1 px-3 py-2 space-y-3">
            <div>
              <label htmlFor="sidebar-search" className="text-[10px] font-semibold text-tv-muted uppercase tracking-wider">
                Cari saham
              </label>
              <input
                id="sidebar-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Kode..."
                className="mt-1 w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs
                  text-tv-text placeholder-tv-muted outline-none focus:border-tv-blue"
              />
              {searchHits.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {searchHits.map(s => (
                    <button
                      key={s.symbol}
                      onClick={nav(() => onSelectStock?.(s.symbol))}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-tv-bg border border-tv-border
                        text-tv-text hover:border-tv-blue/50 transition-colors font-semibold"
                    >
                      {s.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {recent.length > 0 && (
              <Section title="Terbaru dibuka">
                <div className="flex flex-wrap gap-1">
                  {recent.map(sym => (
                    <button
                      key={sym}
                      onClick={nav(() => onSelectStock?.(sym))}
                      className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold transition-colors
                        ${sym === selectedSymbol
                          ? 'bg-tv-blue/15 border-tv-blue/40 text-tv-blue'
                          : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {(movers.gainers.length > 0 || movers.losers.length > 0) && (
              <Section title="Pergerakan hari ini">
                {movers.gainers.map(s => (
                  <MoverRow key={`g-${s.symbol}`} s={s} onClick={nav(() => onSelectStock?.(s.symbol))} />
                ))}
                {movers.losers.map(s => (
                  <MoverRow key={`l-${s.symbol}`} s={s} onClick={nav(() => onSelectStock?.(s.symbol))} />
                ))}
              </Section>
            )}
          </div>
        )}

        {/* Collapsed: spacer tipis supaya footer nempel bawah */}
        {!expanded && <div className="flex-1 min-h-0" aria-hidden="true" />}

        {/* Footer */}
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
              {collapsed ? '»' : '« Ciutkan'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-tv-muted uppercase tracking-wider mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function MoverRow({ s, onClick }) {
  const up = (s.change_pct ?? 0) >= 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between text-[11px] py-0.5 px-1 rounded
        hover:bg-tv-hover transition-colors text-left"
    >
      <span className="font-semibold">{s.symbol}</span>
      <span className={`tabular-nums font-medium ${up ? 'text-tv-green' : 'text-tv-red'}`}>
        {up ? '+' : ''}{s.change_pct?.toFixed(2)}%
      </span>
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
