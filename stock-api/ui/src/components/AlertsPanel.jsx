import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const STORAGE_KEY = 'idx_alerts_v1'
const ALERT_TYPES = [
  { value: 'price_above',    label: 'Harga di atas' },
  { value: 'price_below',    label: 'Harga di bawah' },
  { value: 'rsi_oversold',   label: 'RSI < 30 (Oversold)' },
  { value: 'rsi_overbought', label: 'RSI > 70 (Overbought)' },
  { value: 'signal_buy',     label: 'Sinyal BUY muncul' },
  { value: 'signal_sell',    label: 'Sinyal SELL muncul' },
]

function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveAlerts(a) { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) }

export function useAlertChecker(stocks) {
  const check = useCallback(async () => {
    const alerts = loadAlerts().filter(a => a.active)
    if (alerts.length === 0) return
    try {
      const data = await api.overview()
      const map = {}
      ;(data?.stocks || []).forEach(s => { map[s.symbol] = s })

      alerts.forEach(alert => {
        const s = map[alert.symbol]
        if (!s) return
        let triggered = false
        let msg = ''

        if (alert.type === 'price_above' && s.last_close >= parseFloat(alert.value)) {
          triggered = true
          msg = `${alert.symbol} menyentuh harga ${s.last_close} (target: ${alert.value})`
        } else if (alert.type === 'price_below' && s.last_close <= parseFloat(alert.value)) {
          triggered = true
          msg = `${alert.symbol} turun ke ${s.last_close} (target: ${alert.value})`
        } else if (alert.type === 'rsi_oversold' && s.rsi != null && s.rsi < 30) {
          triggered = true
          msg = `${alert.symbol} RSI oversold: ${s.rsi?.toFixed(1)}`
        } else if (alert.type === 'rsi_overbought' && s.rsi != null && s.rsi > 70) {
          triggered = true
          msg = `${alert.symbol} RSI overbought: ${s.rsi?.toFixed(1)}`
        } else if (alert.type === 'signal_buy' && (s.signal === 'BUY' || s.signal === 'STRONG BUY')) {
          triggered = true
          msg = `${alert.symbol} sinyal: ${s.signal}`
        } else if (alert.type === 'signal_sell' && (s.signal === 'SELL' || s.signal === 'STRONG SELL')) {
          triggered = true
          msg = `${alert.symbol} sinyal: ${s.signal}`
        }

        if (triggered && Notification.permission === 'granted') {
          new Notification('IDX Analyzer Alert', { body: msg, icon: '/favicon.ico' })
        }
      })
    } catch {/* ignore */}
  }, [])

  useEffect(() => {
    if (!stocks || stocks.length === 0) return
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [stocks, check])
}

export default function AlertsPanel({ stocks, onClose }) {
  const [alerts, setAlerts]   = useState(loadAlerts)
  const [showAdd, setShowAdd] = useState(false)
  const [symbol, setSymbol]   = useState('')
  const [type,   setType]     = useState('price_above')
  const [value,  setValue]    = useState('')
  const needsValue = type === 'price_above' || type === 'price_below'

  const requestNotif = async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  const addAlert = () => {
    if (!symbol) return
    const next = [...alerts, { id: Date.now(), symbol: symbol.toUpperCase(), type, value, active: true }]
    setAlerts(next); saveAlerts(next); setShowAdd(false); setValue(''); setSymbol('')
  }

  const toggle = (id) => {
    const next = alerts.map(a => a.id === id ? { ...a, active: !a.active } : a)
    setAlerts(next); saveAlerts(next)
  }

  const remove = (id) => {
    const next = alerts.filter(a => a.id !== id)
    setAlerts(next); saveAlerts(next)
  }

  const typeLabel = (t) => ALERT_TYPES.find(a => a.value === t)?.label || t

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 animate-fade-in"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-tv-card border-l border-tv-border h-full w-80 shadow-2xl flex flex-col animate-slide-down">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-tv-border">
          <span className="font-bold text-sm">🔔 Price Alerts</span>
          <div className="flex items-center gap-2">
            {Notification.permission !== 'granted' && (
              <button onClick={requestNotif}
                className="text-[10px] text-tv-yellow border border-tv-yellow/30 px-2 py-1 rounded hover:bg-tv-yellow/10 transition-colors">
                Aktifkan Notif
              </button>
            )}
            <button onClick={onClose} className="text-tv-muted hover:text-tv-text text-lg leading-none">×</button>
          </div>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-tv-muted text-xs">
              <div className="text-3xl mb-2">🔕</div>
              Belum ada alert. Tambahkan alert untuk mulai monitoring.
            </div>
          ) : alerts.map(a => (
            <div key={a.id}
              className={`flex items-start gap-2 bg-tv-bg border rounded-lg p-2.5 transition-colors
                ${a.active ? 'border-tv-blue/30' : 'border-tv-border opacity-50'}`}>
              <button onClick={() => toggle(a.id)}
                className={`w-4 h-4 mt-0.5 flex-shrink-0 rounded border-2 flex items-center justify-center
                  ${a.active ? 'bg-tv-blue border-tv-blue' : 'border-tv-border'}`}>
                {a.active && <span className="text-white text-[8px] font-bold">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold">{a.symbol}</div>
                <div className="text-[10px] text-tv-muted">{typeLabel(a.type)}{a.value ? ` ${a.value}` : ''}</div>
              </div>
              <button onClick={() => remove(a.id)} className="text-tv-muted hover:text-tv-red text-xs">✕</button>
            </div>
          ))}
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="border-t border-tv-border p-3 space-y-2.5 bg-tv-bg">
            <div className="text-[10px] font-bold uppercase text-tv-muted mb-1">Alert Baru</div>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="w-full bg-tv-card border border-tv-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-tv-blue">
              <option value="">Pilih saham...</option>
              {(stocks || []).map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-tv-card border border-tv-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-tv-blue">
              {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {needsValue && (
              <input type="number" value={value} onChange={e => setValue(e.target.value)}
                placeholder="Harga target"
                className="w-full bg-tv-card border border-tv-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-tv-blue" />
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-1.5 text-xs border border-tv-border rounded-lg text-tv-muted hover:text-tv-text">Batal</button>
              <button onClick={addAlert} className="flex-1 py-1.5 text-xs bg-tv-blue text-white font-semibold rounded-lg hover:bg-tv-blue/80">Tambah</button>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-tv-border">
          <button onClick={() => setShowAdd(v => !v)}
            className="w-full py-2 text-xs font-semibold border border-tv-border rounded-lg text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all">
            {showAdd ? 'Batal' : '+ Tambah Alert'}
          </button>
        </div>
      </div>
    </div>
  )
}
