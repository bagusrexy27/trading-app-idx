import { useState } from 'react'
import { api } from '../api'

export default function AddStockModal({ onClose, onSuccess, showToast }) {
  const [symbol, setSymbol]   = useState('')
  const [from, setFrom]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase().replace(/\.JK$/i, '')
    if (!sym) { setError('Masukkan kode saham terlebih dahulu'); return }

    setLoading(true)
    setError('')
    try {
      await api.stocks.add(sym, from || undefined)
      onSuccess(sym)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-tv-card border border-tv-border rounded-2xl w-[400px] max-w-[95vw] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tv-border">
          <h3 className="font-bold text-base">Tambah Saham IDX</h3>
          <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition-colors text-xl leading-none">×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-tv-muted uppercase tracking-wider mb-2">
              Kode Saham
            </label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="cth: BBCA · TLKM · GOTO · GOTO"
              autoFocus
              className="w-full bg-tv-input border border-tv-border rounded-lg px-4 py-2.5 text-sm
                text-tv-text placeholder-tv-muted outline-none focus:border-tv-blue transition-colors font-medium"
            />
            <p className="text-[10px] text-tv-muted mt-1.5">Tidak perlu menambahkan .JK di belakang</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-tv-muted uppercase tracking-wider mb-2">
              Ambil Data Dari (opsional)
            </label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full bg-tv-input border border-tv-border rounded-lg px-4 py-2.5 text-sm
                text-tv-text outline-none focus:border-tv-blue transition-colors"
            />
            <p className="text-[10px] text-tv-muted mt-1.5">Kosongkan untuk mengambil 1 tahun terakhir</p>
          </div>

          {error && (
            <div className="bg-tv-red/10 border border-tv-red/30 text-tv-red text-xs px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-tv-bg border border-tv-border
              text-tv-muted hover:text-tv-text transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !symbol.trim()}
            className="px-5 py-2 text-xs font-semibold rounded-lg bg-tv-blue text-white
              hover:bg-tv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            {loading && <span className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />}
            {loading ? 'Mengambil data...' : 'Tambah & Ambil Data'}
          </button>
        </div>
      </div>
    </div>
  )
}
