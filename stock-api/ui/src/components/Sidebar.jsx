import { useEffect, useState } from 'react'
import { fmt } from '../utils'
import {
  IconToday, IconMarket, IconSession, IconScreener, IconPortfolio, IconPractice,
  IconAlerts, IconPlus, IconChevronLeft, IconChevronRight, IconWatchlist,
} from './icons'

const PANEL_KEY = 'idx-panel-open'
const RAIL_W = 60
const PANEL_W = 232

// Rail ikon 60px selalu terlihat; panel watchlist 232px dibuka/tutup via chevron
// (disimpan di localStorage). Di mobile panel jadi drawer lewat tombol topbar.
export default function Sidebar({
  stocks, selected, activeView, loading, panelOpen, onPanelOpenChange,
  onSelect, onAdd, onUpdateAll, onOpenAlerts,
  onViewToday, onViewOverview, onViewSession, onViewAdvisor, onViewPortfolio, onViewPractice,
  mobileDrawer, onCloseMobile,
}) {
  const [search, setSearch] = useState('')
  const filtered = (stocks || []).filter(s =>
    !search || s.symbol.toLowerCase().includes(search.toLowerCase())
  )

  const open = mobileDrawer ? true : panelOpen

  return (
    <>
      {/* Mobile drawer backdrop */}
      {mobileDrawer && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`flex flex-shrink-0 glass border-r border-tv-border z-40
          ${mobileDrawer
            ? 'fixed inset-y-0 left-0 md:relative'
            : 'relative'}`}
        style={{ width: open ? RAIL_W + PANEL_W : RAIL_W }}
      >
        {/* ── Icon rail (selalu 60px) ─────────────────────────────── */}
        <div className="w-[60px] flex-shrink-0 flex flex-col border-r border-tv-border">
          <div className="h-12 flex items-center justify-center border-b border-tv-border">
            <span className="text-[10px] font-extrabold tracking-wider text-tv-blue">IDX</span>
          </div>

          <nav className="flex-1 py-2 flex flex-col gap-0.5">
            <RailBtn icon={<IconToday />} label="Today" active={activeView === 'today'} onClick={() => { onViewToday(); onCloseMobile?.() }} />
            <RailBtn icon={<IconMarket />} label="Market" active={activeView === 'overview'} onClick={() => { onViewOverview(); onCloseMobile?.() }} />
            <RailBtn icon={<IconSession />} label="Session" active={activeView === 'session'} onClick={() => { onViewSession(); onCloseMobile?.() }} />
            <RailBtn icon={<IconScreener />} label="Screen" active={activeView === 'advisor'} onClick={() => { onViewAdvisor(); onCloseMobile?.() }} />
            <RailBtn icon={<IconPortfolio />} label="Port" active={activeView === 'portfolio'} onClick={() => { onViewPortfolio(); onCloseMobile?.() }} />
            <RailBtn icon={<IconPractice />} label="Drill" active={activeView === 'practice'} onClick={() => { onViewPractice(); onCloseMobile?.() }} />
          </nav>

          <div className="py-2 flex flex-col items-center gap-1 border-t border-tv-border">
            <RailBtn icon={<IconAlerts />} label="Alerts" onClick={onOpenAlerts} />
            <RailBtn icon={<IconPlus />} label="Add" onClick={onAdd} />
            <button
              onClick={() => {
                if (mobileDrawer) { onCloseMobile?.(); return }
                onPanelOpenChange?.(!panelOpen)
              }}
              title={open ? 'Hide watchlist' : 'Show watchlist'}
              className="w-10 h-10 flex flex-col items-center justify-center rounded-lg text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
            >
              {open ? <IconChevronLeft /> : <IconChevronRight />}
              <span className="text-[8px] mt-0.5 leading-none">List</span>
            </button>
          </div>
        </div>

        {/* ── Watchlist panel (232px) ─────────────────────────────── */}
        {open && (
          <div className="w-[232px] flex-shrink-0 flex flex-col min-w-0">
            <div className="h-12 flex items-center gap-2 px-3 border-b border-tv-border">
              <IconWatchlist className="text-tv-muted flex-shrink-0" width={16} height={16} />
              <span className="text-xs font-bold tracking-tight">Watchlist</span>
              <span className="ml-auto text-[10px] text-tv-muted tabular-nums">{stocks?.length || 0}</span>
              {mobileDrawer && (
                <button onClick={onCloseMobile} className="text-tv-muted hover:text-tv-text text-lg leading-none md:hidden">×</button>
              )}
            </div>

            <div className="px-3 py-2 border-b border-tv-border">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search symbol…"
                className="w-full bg-tv-input border border-tv-border rounded-lg px-2.5 py-1.5 text-xs
                  text-tv-text placeholder-tv-muted outline-none focus:border-tv-accent transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {loading ? (
                <div className="px-3 py-6 text-center text-[11px] text-tv-muted">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-tv-muted">
                  {stocks?.length ? 'No match' : 'Empty — add a ticker'}
                </div>
              ) : (
                filtered.map(s => {
                  const pct = s.change_pct
                  const pos = (pct ?? 0) >= 0
                  const active = selected === s.symbol && activeView === 'stock'
                  return (
                    <button
                      key={s.symbol}
                      onClick={() => { onSelect(s.symbol); onCloseMobile?.() }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                        ${active ? 'bg-tv-accent/10 border-l-2 border-l-tv-accent' : 'border-l-2 border-l-transparent hover:bg-tv-hover'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-bold truncate ${active ? 'text-tv-blue' : 'text-tv-text'}`}>{s.symbol}</div>
                        <div className="text-[10px] text-tv-muted tabular-nums truncate">
                          {s.last_close != null ? fmt.price(s.last_close) : '—'}
                        </div>
                      </div>
                      {pct != null && (
                        <span className={`text-[10px] font-semibold tabular-nums ${pos ? 'text-tv-green' : 'text-tv-red'}`}>
                          {pos ? '+' : ''}{pct.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {stocks?.length > 0 && (
              <div className="px-3 py-2 border-t border-tv-border">
                <button
                  onClick={onUpdateAll}
                  className="w-full py-2 text-[11px] font-medium rounded-lg border border-tv-border
                    text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all"
                >
                  Update all ({stocks.length})
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

function RailBtn({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`mx-1 w-[52px] py-2 flex flex-col items-center gap-0.5 rounded-lg transition-colors
        ${active
          ? 'bg-tv-accent/15 text-tv-blue'
          : 'text-tv-muted hover:text-tv-text hover:bg-tv-hover'}`}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span className="text-[8px] font-semibold leading-none tracking-wide">{label}</span>
    </button>
  )
}

// Hook helper: persist panel open state (desktop). Dipakai App.jsx.
export function usePanelOpen() {
  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem(PANEL_KEY) !== '0' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0') } catch { /* ignore */ }
  }, [panelOpen])
  return [panelOpen, setPanelOpen]
}
