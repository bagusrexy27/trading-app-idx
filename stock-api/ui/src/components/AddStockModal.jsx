import { useState } from 'react'
import { api } from '../api'

// Saham syariah populer (konstituen JII / ISSI). Status mengikuti DES OJK.
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

export default function AddStockModal({ onClose, onSuccess, showToast, owned = [] }) {
  const [symbol, setSymbol]   = useState('')
  const [from, setFrom]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [adding, setAdding]   = useState(null)

  const ownedSet = new Set(owned)
  const suggestions = SYARIAH_PICKS.filter(p => !ownedSet.has(p.s))

  const addSymbol = async (sym) => {
    const code = sym.trim().toUpperCase().replace(/\.JK$/i, '')
    if (!code) { setError('Enter a ticker symbol first'); return }
    setLoading(true)
    setError('')
    setAdding(code)
    try {
      await api.stocks.add(code, from || undefined)
      onSuccess(code)
    } catch (e) {
      setError(e.message)
      showToast?.(e.message, 'error')
    } finally {
      setLoading(false)
      setAdding(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    await addSymbol(symbol)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-tv-card border border-tv-border rounded-2xl w-[420px] max-w-[95vw] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border sticky top-0 bg-tv-card z-10">
          <h3 className="font-bold text-base">Add IDX stock</h3>
          <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition-colors text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-tv-muted uppercase tracking-wider mb-2">
              Ticker
            </label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. BBCA · TLKM · GOTO"
              autoFocus
              className="w-full bg-tv-input border border-tv-border rounded-lg px-4 py-2.5 text-sm
                text-tv-text placeholder-tv-muted outline-none focus:border-tv-blue transition-colors font-medium"
            />
            <p className="text-[10px] text-tv-muted mt-1.5">No need to append .JK</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-tv-muted uppercase tracking-wider mb-2">
              Fetch from (optional)
            </label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full bg-tv-input border border-tv-border rounded-lg px-4 py-2.5 text-sm
                text-tv-text outline-none focus:border-tv-blue transition-colors"
            />
            <p className="text-[10px] text-tv-muted mt-1.5">Leave blank for the last ~1 year</p>
          </div>

          {error && (
            <div className="bg-tv-red/10 border border-tv-red/30 text-tv-red text-xs px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-tv-bg border border-tv-border
                text-tv-muted hover:text-tv-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !symbol.trim()}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-tv-blue text-white
                hover:bg-tv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center gap-2"
            >
              {loading && !adding && <span className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />}
              {loading && !adding ? 'Fetching…' : 'Add & fetch'}
            </button>
          </div>
        </form>

        {suggestions.length > 0 && (
          <div className="px-6 pb-5 border-t border-tv-border pt-4">
            <div className="text-xs font-bold mb-1">Popular sharia picks</div>
            <p className="text-[10px] text-tv-muted mb-3">
              JII names — already-tracked tickers are hidden. Status follows OJK DES reviews.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(p => (
                <button
                  key={p.s}
                  type="button"
                  disabled={loading}
                  title={p.n}
                  onClick={() => addSymbol(p.s)}
                  className="px-2.5 py-1 rounded-lg border border-tv-border bg-tv-bg text-[11px]
                    font-semibold text-tv-muted hover:text-tv-green hover:border-tv-green/50 hover:bg-tv-green/5
                    transition-all disabled:opacity-40"
                >
                  {adding === p.s ? '…' : '+'} {p.s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
