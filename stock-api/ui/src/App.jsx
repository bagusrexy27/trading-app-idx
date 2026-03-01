import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import StockPanel from './components/StockPanel'
import MarketOverview from './components/MarketOverview'
import SessionPrep from './components/SessionPrep'
import Screener from './components/Screener'
import Portfolio from './components/Portfolio'
import Comparison from './components/Comparison'
import AlertsPanel, { useAlertChecker } from './components/AlertsPanel'
import AddStockModal from './components/AddStockModal'
import { api } from './api'

export default function App() {
  const [stocks, setStocks]       = useState([])
  const [selected, setSelected]   = useState(null)
  const [view, setView]           = useState('home') // 'home'|'overview'|'session'|'screener'|'portfolio'|'comparison'
  const [showAdd, setShowAdd]     = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadStocks = useCallback(async () => {
    try {
      const data = await api.stocks.list()
      setStocks(data || [])
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadStocks() }, [loadStocks])

  // Alert checker hook (polls every 5min)
  useAlertChecker(stocks)

  const handleAdded = (symbol) => {
    setShowAdd(false)
    loadStocks()
    setSelected(symbol)
    setView('home')
    showToast(`✓ ${symbol} berhasil ditambahkan`)
  }

  const handleDeleted = () => {
    loadStocks()
    setSelected(null)
    setView('home')
    showToast('Saham dihapus dari tracking')
  }

  const handleSelectStock = (symbol) => {
    setSelected(symbol)
    setView('home')
  }

  const handleUpdateAll = async () => {
    showToast('Mengupdate semua saham...')
    try {
      const results = await api.stocks.updateAll()
      loadStocks()
      const total = (results || []).reduce((s, r) => s + (r.added || 0), 0)
      showToast(`✓ Update selesai — ${total} data baru`)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="flex h-screen bg-tv-bg text-tv-text overflow-hidden">
      <Sidebar
        stocks={stocks}
        selected={selected}
        activeView={view}
        loading={loading}
        onSelect={handleSelectStock}
        onAdd={() => setShowAdd(true)}
        onUpdateAll={handleUpdateAll}
        onViewOverview={()    => setView('overview')}
        onViewSession={()     => setView('session')}
        onViewScreener={()    => setView('screener')}
        onViewPortfolio={()   => setView('portfolio')}
        onViewComparison={()  => setView('comparison')}
        onOpenAlerts={() => setShowAlerts(true)}
      />

      <main className="flex-1 overflow-auto min-w-0">
        {view === 'overview' ? (
          <MarketOverview onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'session' ? (
          <SessionPrep onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'screener' ? (
          <Screener onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'portfolio' ? (
          <Portfolio showToast={showToast} />
        ) : view === 'comparison' ? (
          <Comparison stocks={stocks} showToast={showToast} />
        ) : selected ? (
          <StockPanel
            key={selected}
            symbol={selected}
            onDeleted={handleDeleted}
            onUpdated={loadStocks}
            showToast={showToast}
          />
        ) : (
          <WelcomeScreen onAdd={() => setShowAdd(true)} />
        )}
      </main>

      {showAdd && (
        <AddStockModal
          onClose={() => setShowAdd(false)}
          onSuccess={handleAdded}
          showToast={showToast}
        />
      )}

      {showAlerts && (
        <AlertsPanel stocks={stocks} onClose={() => setShowAlerts(false)} />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border
            text-sm font-medium shadow-2xl animate-pulse-once
            ${toast.type === 'error'
              ? 'bg-tv-card border-tv-red/50 text-tv-red'
              : 'bg-tv-card border-tv-green/50 text-tv-green'}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function WelcomeScreen({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
      <div className="text-7xl select-none">📊</div>
      <div>
        <h2 className="text-2xl font-bold mb-2">IDX Stock Analyzer</h2>
        <p className="text-tv-muted max-w-sm leading-relaxed">
          Analisis teknikal saham Indonesia secara real‑time.
          Pilih saham dari sidebar atau tambahkan saham baru.
        </p>
      </div>
      <button
        onClick={onAdd}
        className="px-6 py-3 bg-tv-blue rounded-lg font-semibold hover:bg-tv-blue/80 transition-colors"
      >
        + Tambah Saham
      </button>
      <div className="grid grid-cols-3 gap-4 mt-4 text-left max-w-sm w-full">
        {[
          { icon: '📈', label: 'Price Chart', desc: 'Candlestick + SMA overlay' },
          { icon: '📉', label: 'Indicators', desc: 'RSI · MACD · Bollinger' },
          { icon: '🎯', label: 'Signals', desc: 'BUY / SELL otomatis' },
        ].map(f => (
          <div key={f.label} className="bg-tv-card border border-tv-border rounded-lg p-3">
            <div className="text-2xl mb-1">{f.icon}</div>
            <div className="text-xs font-semibold">{f.label}</div>
            <div className="text-xs text-tv-muted mt-0.5">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
