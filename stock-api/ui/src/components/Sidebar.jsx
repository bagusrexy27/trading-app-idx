// Slim navigation sidebar — stock list lives in the Watchlist view.
export default function Sidebar({
  stocks, selectedSymbol, activeView, mobileOpen, onMobileClose,
  onAdd, onUpdateAll, onViewWatchlist, onViewOverview, onViewSession,
  onViewAdvisor, onViewPortfolio, onViewPractice, onOpenAlerts,
}) {
  const nav = (fn) => () => { fn(); onMobileClose?.() }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-[240px] md:w-[200px] flex-shrink-0 glass border-r border-tv-border flex flex-col
          transform transition-transform duration-200 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        aria-label="Navigasi utama"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-tv-border">
          <span className="font-bold text-sm tracking-tight">📈 IDX Analyzer</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenAlerts}
              aria-label="Buka alert harga"
              title="Price Alerts"
              className="w-7 h-7 rounded-md text-tv-muted hover:text-tv-yellow text-sm flex items-center justify-center transition-colors"
            >🔔</button>
            <button
              onClick={onAdd}
              aria-label="Tambah saham"
              title="Tambah saham"
              className="w-7 h-7 rounded-md bg-tv-accent text-white text-lg font-bold flex items-center justify-center
                hover:bg-tv-accent/80 transition-colors leading-none pb-0.5"
            >+</button>
            <button
              onClick={onMobileClose}
              aria-label="Tutup menu"
              className="md:hidden w-7 h-7 rounded-md text-tv-muted hover:text-tv-text text-lg flex items-center justify-center"
            >×</button>
          </div>
        </div>

        {selectedSymbol && activeView === 'home' && (
          <div className="px-4 py-2 text-[11px] font-semibold text-tv-blue border-b border-tv-border bg-tv-blue/5">
            📊 {selectedSymbol}
          </div>
        )}

        <nav className="flex-1 py-2 overflow-y-auto" aria-label="Menu">
          <NavBtn icon="⭐" label="Watchlist" badge={stocks?.length || null} active={activeView === 'watchlist'} onClick={nav(onViewWatchlist)} />
          <NavBtn icon="📊" label="Market Overview" active={activeView === 'overview'} onClick={nav(onViewOverview)} />
          <NavBtn icon="🕯️" label="Last Session" active={activeView === 'session'} onClick={nav(onViewSession)} />
          <NavBtn icon="🧭" label="Advisor Screener" active={activeView === 'advisor'} onClick={nav(onViewAdvisor)} />
          <NavBtn icon="💼" label="Portfolio" active={activeView === 'portfolio'} onClick={nav(onViewPortfolio)} />
          <NavBtn icon="🎮" label="Latihan" active={activeView === 'practice'} onClick={nav(onViewPractice)} />
        </nav>

        {stocks?.length > 0 && (
          <div className="px-3 pb-3 pt-2 border-t border-tv-border">
            <button
              onClick={onUpdateAll}
              className="w-full py-2 text-xs font-medium rounded-md border border-tv-border
                text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all"
            >
              ↻ Update Semua ({stocks.length})
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function NavBtn({ icon, label, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium
        transition-all text-left border-l-2
        ${active
          ? 'bg-tv-accent/10 text-tv-blue border-l-tv-accent'
          : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover border-l-transparent'}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {badge != null && (
        <span className="ml-auto text-[10px] bg-tv-border rounded px-1.5 py-0.5">{badge}</span>
      )}
    </button>
  )
}
