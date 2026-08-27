import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import StockPanel from './components/StockPanel'
import AlertsPanel, { useAlertChecker } from './components/AlertsPanel'
import AddStockModal from './components/AddStockModal'
import IHSGBadge from './components/IHSGBadge'
import { api } from './api'

// Heavy views load on demand (code-splitting)
const MarketOverview = lazy(() => import('./components/MarketOverview'))
const SessionPrep    = lazy(() => import('./components/SessionPrep'))
const Portfolio      = lazy(() => import('./components/Portfolio'))
const AdvisorScreen  = lazy(() => import('./components/AdvisorScreen'))
const Watchlist      = lazy(() => import('./components/Watchlist'))
const Practice       = lazy(() => import('./components/Practice'))

const ViewLoading = () => (
  <div className="flex items-center justify-center h-full text-tv-muted">
    <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
  </div>
)

export default function App() {
  const [stocks, setStocks]       = useState([])
  const [selected, setSelected]   = useState(null)
  const [view, setView]           = useState('watchlist') // 'watchlist'|'home'|'overview'|'session'|'advisor'|'portfolio'
  const [showAdd, setShowAdd]     = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Navigasi terdaftar ke history browser: back mouse, Alt+←/→, tombol back
  // browser, dan Backspace semuanya jalan lewat pushState/popstate.
  const viewRef = useRef(view);     viewRef.current = view
  const selRef  = useRef(selected); selRef.current  = selected
  const navigate = useCallback((nextView, nextSelected = null) => {
    if (viewRef.current !== nextView || selRef.current !== nextSelected) {
      const idx = (window.history.state?.idx ?? 0) + 1
      window.history.pushState({ view: nextView, selected: nextSelected, idx }, '')
    }
    setView(nextView)
    setSelected(nextSelected)
    setSidebarOpen(false)
  }, [])

  useEffect(() => {
    // Entry awal + pulihkan view terakhir saat halaman di-refresh.
    const s = window.history.state
    if (s?.view) {
      setView(s.view)
      setSelected(s.selected ?? null)
    } else {
      window.history.replaceState({ view: 'watchlist', selected: null, idx: 0 }, '')
    }
    const onPop = (e) => {
      setView(e.state?.view ?? 'watchlist')
      setSelected(e.state?.selected ?? null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Backspace') return
      const t = e.target
      // Jangan bajak backspace saat mengetik atau saat modal terbuka.
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
      if (showAdd || showAlerts) return
      e.preventDefault()
      // Jangan keluar dari app: mundur hanya kalau masih ada riwayat milik app.
      if ((window.history.state?.idx ?? 0) > 0) window.history.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdd, showAlerts])

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
    navigate('home', symbol)
    showToast(`✓ ${symbol} berhasil ditambahkan`)
  }

  const handleDeleted = () => {
    loadStocks()
    navigate('watchlist')
    showToast('Saham dihapus dari tracking')
  }

  // Quick-add dari chip syariah di Watchlist (tanpa modal)
  const handleQuickAdd = async (symbol) => {
    try {
      await api.stocks.add(symbol, '')
      showToast(`✓ ${symbol} ditambahkan ke watchlist`)
      loadStocks()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleSelectStock = (symbol) => {
    navigate('home', symbol)
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
    <div className="flex h-screen bg-transparent text-tv-text overflow-hidden">
      <Sidebar
        stocks={stocks}
        selectedSymbol={selected}
        activeView={view}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onAdd={() => setShowAdd(true)}
        onUpdateAll={handleUpdateAll}
        onViewWatchlist={()   => navigate('watchlist')}
        onViewOverview={()    => navigate('overview', selected)}
        onViewSession={()     => navigate('session', selected)}
        onViewAdvisor={()     => navigate('advisor', selected)}
        onViewPortfolio={()   => navigate('portfolio', selected)}
        onViewPractice={()    => navigate('practice', selected)}
        onOpenAlerts={() => setShowAlerts(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2 glass border-b border-tv-border">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden px-2 py-1.5 text-sm rounded-lg border border-tv-border text-tv-muted hover:text-tv-text"
            aria-label="Buka menu navigasi"
          >
            ☰ Menu
          </button>
          <div className="flex-1 md:flex-none" />
          <IHSGBadge />
        </div>
        <div className="flex-1 overflow-auto">
        <Suspense fallback={<ViewLoading />}>
        {view === 'overview' ? (
          <MarketOverview onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'session' ? (
          <SessionPrep onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'advisor' ? (
          <AdvisorScreen onSelectStock={handleSelectStock} showToast={showToast} />
        ) : view === 'portfolio' ? (
          <Portfolio showToast={showToast} />
        ) : view === 'practice' ? (
          <Practice stocks={stocks} />
        ) : view !== 'watchlist' && selected ? (
          <StockPanel
            key={selected}
            symbol={selected}
            onDeleted={handleDeleted}
            onUpdated={loadStocks}
            showToast={showToast}
          />
        ) : (
          <Watchlist
            stocks={stocks}
            loading={loading}
            onSelect={handleSelectStock}
            onAdd={() => setShowAdd(true)}
            onUpdateAll={handleUpdateAll}
            onQuickAdd={handleQuickAdd}
          />
        )}
        </Suspense>
        </div>
      </main>

      {showAdd && (
        <AddStockModal
          onClose={() => setShowAdd(false)}
          onSuccess={handleAdded}
        />
      )}

      {showAlerts && (
        <AlertsPanel stocks={stocks} onClose={() => setShowAlerts(false)} />
      )}

      {toast && (
        <div
          role="alert"
          aria-live="polite"
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
