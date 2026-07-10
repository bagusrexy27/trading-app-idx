// Slim navigation sidebar — the stock list itself lives in the Watchlist view.
export default function Sidebar({ stocks, activeView, onAdd, onUpdateAll,
  onViewWatchlist, onViewOverview, onViewSession, onViewAdvisor, onViewPortfolio, onOpenAlerts }) {
  return (
    <aside className="w-[200px] flex-shrink-0 glass border-r border-tv-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-tv-border">
        <span className="font-bold text-sm tracking-tight">📈 IDX Analyzer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenAlerts}
            title="Price Alerts"
            className="w-6 h-6 rounded-md text-tv-muted hover:text-tv-yellow text-sm flex items-center justify-center transition-colors"
          >🔔</button>
          <button
            onClick={onAdd}
            title="Tambah saham"
            className="w-6 h-6 rounded-md bg-tv-accent text-white text-lg font-bold flex items-center justify-center
              hover:bg-tv-accent/80 transition-colors leading-none pb-0.5"
          >+</button>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-2">
        <NavBtn icon="⭐" label="Watchlist"        badge={stocks?.length || null} active={activeView === 'watchlist' || activeView === 'home'} onClick={onViewWatchlist} />
        <NavBtn icon="📊" label="Market Overview"  badge={null} active={activeView === 'overview'}  onClick={onViewOverview} />
        <NavBtn icon="🕯️" label="Last Session"     badge={null} active={activeView === 'session'}   onClick={onViewSession} />
        <NavBtn icon="🧭" label="Advisor Screener" badge={null} active={activeView === 'advisor'}   onClick={onViewAdvisor} />
        <NavBtn icon="💼" label="Portfolio"        badge={null} active={activeView === 'portfolio'} onClick={onViewPortfolio} />
      </div>

      {/* Footer */}
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
  )
}

function NavBtn({ icon, label, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium
        transition-all text-left border-l-2
        ${active
          ? 'bg-tv-accent/10 text-tv-blue border-l-tv-accent'
          : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover border-l-transparent'}`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge != null && (
        <span className="ml-auto text-[10px] bg-tv-border rounded px-1.5 py-0.5">{badge}</span>
      )}
    </button>
  )
}
