import { useState } from 'react'

const GROUP_KEY = 'idx_groups_v1'
function loadGroups() { try { return JSON.parse(localStorage.getItem(GROUP_KEY) || '{}') } catch { return {} } }
function saveGroups(g) { localStorage.setItem(GROUP_KEY, JSON.stringify(g)) }

export default function Sidebar({ stocks, selected, activeView, loading, onSelect, onAdd, onUpdateAll,
  onViewOverview, onViewSession, onViewAdvisor, onViewPortfolio, onOpenAlerts }) {
  const [search, setSearch]           = useState('')
  const [groups, setGroups]           = useState(loadGroups)
  const [activeGroup, setActiveGroup] = useState('ALL')
  const [newGroup, setNewGroup]       = useState('')
  const [showGroupAdd, setShowGroupAdd] = useState(false)
  const [contextStock, setContextStock] = useState(null) // for group assign

  const groupNames = ['ALL', ...Object.keys(groups)]

  const filtered = (stocks || []).filter(s => {
    if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false
    if (activeGroup !== 'ALL') {
      const g = groups[activeGroup] || []
      if (!g.includes(s.symbol)) return false
    }
    return true
  })

  const addGroup = () => {
    if (!newGroup.trim()) return
    const next = { ...groups, [newGroup.trim()]: [] }
    setGroups(next); saveGroups(next); setNewGroup(''); setShowGroupAdd(false)
  }

  const assignToGroup = (symbol, group) => {
    const cur = groups[group] || []
    const next = { ...groups, [group]: cur.includes(symbol) ? cur.filter(s => s !== symbol) : [...cur, symbol] }
    setGroups(next); saveGroups(next)
  }

  const removeGroup = (name) => {
    const { [name]: _, ...rest } = groups
    setGroups(rest); saveGroups(rest)
    if (activeGroup === name) setActiveGroup('ALL')
  }

  return (
    <aside className="w-[220px] flex-shrink-0 glass border-r border-tv-border flex flex-col">
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
            className="w-6 h-6 rounded-md bg-tv-blue text-white text-lg font-bold flex items-center justify-center
              hover:bg-tv-blue/80 transition-colors leading-none pb-0.5"
          >+</button>
        </div>
      </div>

      {/* Nav buttons */}
      {stocks?.length > 0 && (
        <div className="border-b border-tv-border">
          <NavBtn icon="📊" label="Market Overview" badge={stocks.length} active={activeView === 'overview'} onClick={onViewOverview} />
          <NavBtn icon="🕯️" label="Last Session"    badge={null}         active={activeView === 'session'}  onClick={onViewSession} />
          <NavBtn icon="🧭" label="Advisor Screener" badge={null}        active={activeView === 'advisor'} onClick={onViewAdvisor} />
          <NavBtn icon="💼" label="Portfolio"       badge={null}         active={activeView === 'portfolio'} onClick={onViewPortfolio} />
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-tv-border">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Cari kode saham..."
          className="w-full bg-tv-input border border-tv-border rounded-md px-3 py-1.5 text-xs
            text-tv-text placeholder-tv-muted outline-none focus:border-tv-blue transition-colors"
        />
      </div>

      {/* Watchlist Groups */}
      {Object.keys(groups).length > 0 && (
        <div className="px-3 py-1.5 border-b border-tv-border flex gap-1 flex-wrap">
          {groupNames.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors
                ${activeGroup === g ? 'bg-tv-blue/20 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Stock list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-tv-muted text-xs text-center py-10">Memuat...</div>
        ) : filtered.length === 0 ? (
          <div className="text-tv-muted text-xs text-center py-10">
            {search ? 'Tidak ditemukan' : 'Belum ada saham.\nKlik + untuk menambah.'}
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.symbol} className="relative group/item">
              <StockItem
                stock={s}
                active={s.symbol === selected && !['overview', 'session', 'advisor', 'portfolio'].includes(activeView)}
                onClick={() => onSelect(s.symbol)}
              />
              {/* Group assign button */}
              {Object.keys(groups).length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setContextStock(contextStock === s.symbol ? null : s.symbol) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100
                    text-[10px] text-tv-muted hover:text-tv-blue transition-all px-1"
                >
                  ⋯
                </button>
              )}
              {contextStock === s.symbol && (
                <div className="absolute right-0 top-full z-30 bg-tv-card border border-tv-border rounded-lg shadow-xl py-1 w-40">
                  <div className="text-[9px] text-tv-muted px-3 py-1 uppercase font-bold">Assign ke grup</div>
                  {Object.keys(groups).map(g => {
                    const inGroup = (groups[g] || []).includes(s.symbol)
                    return (
                      <button key={g} onClick={() => { assignToGroup(s.symbol, g); setContextStock(null) }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-tv-hover transition-colors flex items-center justify-between">
                        <span>{g}</span>
                        {inGroup && <span className="text-tv-blue">✓</span>}
                      </button>
                    )
                  })}
                  <button onClick={() => setContextStock(null)} className="w-full text-left px-3 py-1.5 text-xs text-tv-muted hover:bg-tv-hover">Tutup</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 pt-2 border-t border-tv-border space-y-1.5">
        {stocks?.length > 0 && (
          <button
            onClick={onUpdateAll}
            className="w-full py-2 text-xs font-medium rounded-md border border-tv-border
              text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all"
          >
            ↻ Update Semua ({stocks.length})
          </button>
        )}
        {/* Watchlist group manager */}
        {showGroupAdd ? (
          <div className="flex gap-1">
            <input
              value={newGroup}
              onChange={e => setNewGroup(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addGroup()}
              placeholder="Nama grup..."
              autoFocus
              className="flex-1 bg-tv-input border border-tv-border rounded px-2 py-1 text-xs outline-none focus:border-tv-blue"
            />
            <button onClick={addGroup} className="px-2 py-1 text-xs bg-tv-blue text-white rounded">+</button>
            <button onClick={() => setShowGroupAdd(false)} className="px-2 py-1 text-xs text-tv-muted">✕</button>
          </div>
        ) : (
          <button onClick={() => setShowGroupAdd(true)}
            className="w-full py-1.5 text-[10px] text-tv-muted hover:text-tv-text transition-colors flex items-center justify-center gap-1">
            <span>+</span> <span>Buat Watchlist Grup</span>
          </button>
        )}
        {/* Remove groups */}
        {Object.keys(groups).length > 0 && activeGroup !== 'ALL' && (
          <button onClick={() => removeGroup(activeGroup)}
            className="w-full py-1 text-[10px] text-tv-red/60 hover:text-tv-red transition-colors">
            Hapus grup "{activeGroup}"
          </button>
        )}
      </div>
    </aside>
  )
}

function NavBtn({ icon, label, badge, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium
        transition-all text-left border-l-2
        ${active
          ? 'bg-tv-blue/8 text-tv-blue border-l-tv-blue'
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

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 56, H = 22
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = positive ? '#26a69a' : '#ef5350'
  return (
    <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function StockItem({ stock, active, onClick }) {
  const pct = stock.change_pct
  const positive = pct >= 0
  const pctStr = pct != null
    ? `${positive ? '+' : ''}${pct.toFixed(2)}%`
    : null

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all
        border-l-2 hover:bg-tv-hover
        ${active
          ? 'border-l-tv-blue bg-tv-blue/5 text-tv-blue animate-fade-in'
          : 'border-l-transparent text-tv-text'}`}
    >
      {/* Left: symbol + meta */}
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm leading-tight ${active ? 'text-tv-blue' : ''}`}>
          {stock.symbol}
        </div>
        <div className="text-[10px] text-tv-muted mt-0.5">
          {stock.newest_date?.slice(5)} · {stock.data_points}d
        </div>
        {pctStr && (
          <div className={`text-[11px] font-semibold mt-0.5 ${positive ? 'text-tv-green' : 'text-tv-red'}`}>
            {pctStr}
          </div>
        )}
      </div>

      {/* Right: sparkline */}
      {stock.sparkline?.length >= 2 && (
        <div className="flex-shrink-0">
          <Sparkline data={stock.sparkline} positive={positive} />
        </div>
      )}
    </button>
  )
}
