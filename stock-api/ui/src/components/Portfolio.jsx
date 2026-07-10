import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { fmt, colorOf } from '../utils'

const STORAGE_KEY = 'idx_portfolio_v1'

function loadPositions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function savePositions(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

export default function Portfolio({ showToast }) {
  const [positions, setPositions] = useState(loadPositions)
  const [prices, setPrices]       = useState({})
  const [showAdd, setShowAdd]     = useState(false)

  // Fetch latest prices for all held symbols
  const refreshPrices = useCallback(async () => {
    if (positions.length === 0) return
    try {
      const data = await api.stocks.list()
      const map = {}
      ;(data || []).forEach(s => { map[s.symbol] = s.last_close })
      setPrices(map)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }, [positions, showToast])

  useEffect(() => { refreshPrices() }, [refreshPrices])

  const addPosition = (pos) => {
    const next = [...positions, { ...pos, id: Date.now() }]
    setPositions(next)
    savePositions(next)
    setShowAdd(false)
    showToast(`✓ ${pos.symbol} ditambahkan ke portfolio`)
  }

  const removePosition = (id) => {
    const next = positions.filter(p => p.id !== id)
    setPositions(next)
    savePositions(next)
  }

  // Compute derived values
  const enriched = positions.map(pos => {
    const cur   = prices[pos.symbol] ?? pos.buyPrice
    const lots  = pos.qty / 100
    const invest= pos.buyPrice * pos.qty
    const curVal= cur * pos.qty
    const pnl   = curVal - invest
    const pnlPct= invest > 0 ? (pnl / invest) * 100 : 0
    const stopHit = pnlPct <= -7   // aturan disiplin: stop loss -7%
    return { ...pos, cur, lots, invest, curVal, pnl, pnlPct, stopHit }
  })
  const breached = enriched.filter(p => p.stopHit)

  const totalInvest = enriched.reduce((s, p) => s + p.invest, 0)
  const totalCur    = enriched.reduce((s, p) => s + p.curVal, 0)
  const totalPnl    = totalCur - totalInvest
  const totalPct    = totalInvest > 0 ? (totalPnl / totalInvest) * 100 : 0
  const best  = enriched.reduce((b, p) => (!b || p.pnlPct > b.pnlPct) ? p : b, null)
  const worst = enriched.reduce((w, p) => (!w || p.pnlPct < w.pnlPct) ? p : w, null)

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Portfolio Tracker</h2>
          <p className="text-xs text-tv-muted mt-0.5">Lacak posisi saham dan P&L Anda</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-xs font-semibold bg-tv-blue rounded-lg text-white hover:bg-tv-blue/80 transition-colors"
        >
          + Tambah Posisi
        </button>
      </div>

      {/* Summary cards */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Invested',  value: fmt.price(totalInvest), color: 'text-tv-text' },
            { label: 'Current Value',   value: fmt.price(totalCur),    color: 'text-tv-text' },
            { label: 'Total P&L',       value: `${fmt.price(totalPnl)} (${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%)`, color: colorOf(totalPnl) },
            { label: 'Posisi',          value: `${positions.length} saham`, color: 'text-tv-text' },
          ].map((c, i) => (
            <div key={c.label}
              className="bg-tv-card border border-tv-border rounded-xl p-4 animate-slide-up"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <div className="text-[10px] text-tv-muted uppercase font-bold mb-1.5">{c.label}</div>
              <div className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stop-loss breach warning */}
      {breached.length > 0 && (
        <div className="border-2 border-tv-red/40 bg-tv-red/5 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-lg">🚨</span>
            <span className="text-sm font-extrabold text-tv-red">STOP LOSS TERTEMBUS ({breached.length} posisi)</span>
          </div>
          <p className="text-xs text-tv-muted leading-relaxed">
            {breached.map(p => `${p.symbol} (${p.pnlPct.toFixed(1)}%)`).join(' · ')} sudah turun lebih dari batas -7%.
            Aturan disiplin: <b className="text-tv-text">potong kecil sebelum jadi besar</b> — evaluasi keluar, jangan average down.
          </p>
        </div>
      )}

      {/* Best/Worst */}
      {best && worst && best.symbol !== worst.symbol && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-tv-card border border-tv-green/20 rounded-xl p-3 flex items-center gap-3">
            <span className="text-tv-green text-lg">▲</span>
            <div>
              <div className="text-[10px] text-tv-muted">Best Performer</div>
              <div className="text-sm font-bold">{best.symbol}</div>
              <div className="text-xs text-tv-green font-semibold">+{best.pnlPct.toFixed(2)}%</div>
            </div>
          </div>
          <div className="bg-tv-card border border-tv-red/20 rounded-xl p-3 flex items-center gap-3">
            <span className="text-tv-red text-lg">▼</span>
            <div>
              <div className="text-[10px] text-tv-muted">Worst Performer</div>
              <div className="text-sm font-bold">{worst.symbol}</div>
              <div className={`text-xs font-semibold ${colorOf(worst.pnlPct)}`}>{worst.pnlPct.toFixed(2)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Positions table */}
      {positions.length === 0 ? (
        <div className="text-center py-20 text-tv-muted">
          <div className="text-5xl mb-4">💼</div>
          <p className="text-sm font-medium">Belum ada posisi</p>
          <p className="text-xs mt-1">Klik "+ Tambah Posisi" untuk mulai tracking portfolio</p>
        </div>
      ) : (
        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-tv-border">
            <span className="text-[10px] font-bold uppercase text-tv-muted">Posisi ({positions.length})</span>
            <button onClick={refreshPrices} className="text-[10px] text-tv-muted hover:text-tv-blue transition-colors">↻ Refresh Harga</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-tv-border">
                {['Saham', 'Lot', 'Harga Beli', 'Harga Kini', 'Invested', 'Cur. Value', 'P&L', '%', ''].map(h => (
                  <th key={h} className="text-[10px] text-tv-muted uppercase font-bold px-3 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((pos, i) => (
                <tr key={pos.id}
                  className={`border-b border-tv-border/50 last:border-0 hover:bg-tv-hover transition-colors animate-slide-up ${pos.stopHit ? 'bg-tv-red/5' : ''}`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-tv-text">{pos.symbol}</span>
                      {pos.stopHit && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-tv-red/15 text-tv-red border border-tv-red/40">
                          STOP LOSS
                        </span>
                      )}
                    </div>
                    {pos.buyDate && <div className="text-[10px] text-tv-muted">{pos.buyDate}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{pos.lots.toFixed(0)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fmt.price(pos.buyPrice)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">{fmt.price(pos.cur)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-tv-muted">{fmt.price(pos.invest)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{fmt.price(pos.curVal)}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${colorOf(pos.pnl)}`}>{fmt.chg(pos.pnl)}</td>
                  <td className={`px-3 py-2.5 text-xs tabular-nums font-bold ${colorOf(pos.pnlPct)}`}>
                    {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => removePosition(pos.id)} className="text-tv-muted hover:text-tv-red transition-colors text-xs">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddPositionModal onAdd={addPosition} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function AddPositionModal({ onAdd, onClose }) {
  const [symbol,   setSymbol]   = useState('')
  const [qty,      setQty]      = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [buyDate,  setBuyDate]  = useState('')

  const handle = (e) => {
    e.preventDefault()
    if (!symbol || !qty || !buyPrice) return
    onAdd({ symbol: symbol.toUpperCase(), qty: +qty, buyPrice: +buyPrice, buyDate })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-tv-card border border-tv-border rounded-2xl p-6 w-80 animate-slide-up shadow-2xl">
        <div className="text-sm font-bold mb-4">Tambah Posisi</div>
        <form onSubmit={handle} className="space-y-3">
          {[
            { label: 'Kode Saham',   value: symbol,   set: setSymbol,   type: 'text',   ph: 'BBCA' },
            { label: 'Jumlah Lembar',value: qty,      set: setQty,      type: 'number', ph: '1000' },
            { label: 'Harga Beli',   value: buyPrice, set: setBuyPrice, type: 'number', ph: '9800' },
            { label: 'Tanggal Beli', value: buyDate,  set: setBuyDate,  type: 'date',   ph: '' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1">{f.label}</label>
              <input
                type={f.type}
                value={f.value}
                onChange={e => f.set(e.target.value)}
                placeholder={f.ph}
                className="w-full bg-tv-input border border-tv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-tv-blue transition-colors"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-xs rounded-lg border border-tv-border text-tv-muted hover:text-tv-text transition-colors">
              Batal
            </button>
            <button type="submit"
              className="flex-1 py-2 text-xs rounded-lg bg-tv-blue text-white font-semibold hover:bg-tv-blue/80 transition-colors">
              Tambah
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
