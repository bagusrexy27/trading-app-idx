import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import Sidebar, { usePanelOpen } from './components/Sidebar'
import StockPanel from './components/StockPanel'
import AlertsPanel, { useAlertChecker } from './components/AlertsPanel'
import AddStockModal from './components/AddStockModal'
import IHSGBadge from './components/IHSGBadge'
import { api } from './api'

const MarketOverview = lazy(() => import('./components/MarketOverview'))
const SessionPrep    = lazy(() => import('./components/SessionPrep'))
const Portfolio      = lazy(() => import('./components/Portfolio'))
const AdvisorScreen  = lazy(() => import('./components/AdvisorScreen'))
const DecisionBoard  = lazy(() => import('./components/DecisionBoard'))
const Practice       = lazy(() => import('./components/Practice'))

const ViewLoading = () => (
  <div className="flex items-center justify-center h-full text-tv-muted">
    <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
  </div>
)

export default function App() {
  const [stocks, setStocks]       = useState([])
  const [selected, setSelected]   = useState(null)
  const [view, setView]           = useState('today') // today | stock | overview | session | advisor | portfolio | practice
  const [showAdd, setShowAdd]     = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState(null)
  const [panelOpen, setPanelOpen] = usePanelOpen()
  const [mobileDrawer, setMobileDrawer] = useState(false)

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
  }, [])

  useEffect(() => {
    const s = window.history.state
    if (s?.view) {
      // Migrate legacy view names from older builds
      const v = s.view === 'watchlist' ? 'today' : s.view === 'home' ? 'stock' : s.view
      setView(v)
      setSelected(s.selected ?? null)
    } else {
      window.history.replaceState({ view: 'today', selected: null, idx: 0 }, '')
    }
    const onPop = (e) => {
      const v = e.state?.view
      const mapped = v === 'watchlist' ? 'today' : v === 'home' ? 'stock' : (v ?? 'today')
      setView(mapped)
      setSelected(e.state?.selected ?? null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Backspace') return
      const t = e.target
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return
      if (showAdd || showAlerts) return
      e.preventDefault()
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
  useAlertChecker(stocks)

  const handleAdded = (symbol) => {
    setShowAdd(false)
    loadStocks()
    navigate('stock', symbol)
    showToast(`${symbol} added to watchlist`)
  }

  const handleDeleted = () => {
    loadStocks()
    navigate('today')
    showToast('Removed from watchlist')
  }

  const handleSelectStock = (symbol) => {
    navigate('stock', symbol)
  }

  const handleUpdateAll = async () => {
    showToast('Updating all tickers…')
    try {
      const results = await api.stocks.updateAll()
      loadStocks()
      const total = (results || []).reduce((s, r) => s + (r.added || 0), 0)
      showToast(`Update done — ${total} new bars`)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  return (
    <div className="flex h-screen bg-transparent text-tv-text overflow-hidden">
      <Sidebar
        stocks={stocks}
        selected={selected}
        activeView={view}
        loading={loading}
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        mobileDrawer={mobileDrawer}
        onCloseMobile={() => setMobileDrawer(false)}
        onSelect={handleSelectStock}
        onAdd={() => setShowAdd(true)}
        onUpdateAll={handleUpdateAll}
        onViewToday={()     => navigate('today')}
        onViewOverview={()  => navigate('overview', selected)}
        onViewSession={()   => navigate('session', selected)}
        onViewAdvisor={()   => navigate('advisor', selected)}
        onViewPortfolio={() => navigate('portfolio', selected)}
        onViewPractice={()  => navigate('practice', selected)}
        onOpenAlerts={() => setShowAlerts(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 glass border-b border-tv-border">
          <button
            onClick={() => setMobileDrawer(true)}
            className="md:hidden px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-tv-border text-tv-muted hover:text-tv-text"
          >
            Watchlist
          </button>
          <div className="ml-auto">
            <IHSGBadge />
          </div>
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
            ) : view === 'stock' && selected ? (
              <StockPanel
                key={selected}
                symbol={selected}
                onDeleted={handleDeleted}
                onUpdated={loadStocks}
                showToast={showToast}
              />
            ) : (
              <DecisionBoard
                stocks={stocks}
                loading={loading}
                onSelect={handleSelectStock}
                onAdd={() => setShowAdd(true)}
                onUpdateAll={handleUpdateAll}
              />
            )}
          </Suspense>
        </div>
      </main>

      {showAdd && (
        <AddStockModal
          onClose={() => setShowAdd(false)}
          onSuccess={handleAdded}
          showToast={showToast}
          owned={stocks.map(s => s.symbol)}
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
