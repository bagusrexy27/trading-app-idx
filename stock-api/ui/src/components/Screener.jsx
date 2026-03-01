import { useState, useEffect, useMemo } from 'react'
import { api } from '../api'
import { fmt, colorOf, signalStyle } from '../utils'

const SIGNAL_OPTS = ['ALL', 'STRONG BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG SELL']
const TREND_OPTS  = ['ALL', 'bullish', 'bearish', 'neutral']

export default function Screener({ onSelectStock, showToast }) {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [signal, setSignal]   = useState('ALL')
  const [trend, setTrend]     = useState('ALL')
  const [rsiMax, setRsiMax]   = useState(100)
  const [rsiMin, setRsiMin]   = useState(0)
  const [volMin, setVolMin]   = useState(0)
  const [pctMin, setPctMin]   = useState(-100)

  useEffect(() => {
    api.overview()
      .then(d => setItems(d?.stocks || []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return items.filter(s => {
      if (signal !== 'ALL' && s.signal !== signal) return false
      if (trend  !== 'ALL' && s.trend  !== trend)  return false
      if (s.rsi != null && (s.rsi < rsiMin || s.rsi > rsiMax)) return false
      if (s.vol_ratio != null && s.vol_ratio < volMin) return false
      if (s.change_pct != null && s.change_pct < pctMin) return false
      return true
    })
  }, [items, signal, trend, rsiMin, rsiMax, volMin, pctMin])

  const activeCount = [
    signal !== 'ALL', trend !== 'ALL',
    rsiMin > 0, rsiMax < 100,
    volMin > 0, pctMin > -100,
  ].filter(Boolean).length

  const reset = () => {
    setSignal('ALL'); setTrend('ALL')
    setRsiMin(0); setRsiMax(100)
    setVolMin(0); setPctMin(-100)
  }

  return (
    <div className="p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Stock Screener</h2>
          <p className="text-xs text-tv-muted mt-0.5">Filter saham berdasarkan kriteria teknikal</p>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="text-xs bg-tv-blue/10 border border-tv-blue/30 text-tv-blue px-2.5 py-1 rounded-full font-semibold">
              {activeCount} filter aktif
            </span>
          )}
          <span className="text-xs text-tv-muted">{filtered.length} / {items.length} saham</span>
          <button
            onClick={reset}
            className="text-xs text-tv-muted hover:text-tv-text border border-tv-border px-3 py-1.5 rounded-lg transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <FilterSelect label="Sinyal" value={signal} onChange={setSignal} options={SIGNAL_OPTS} />
        <FilterSelect label="Trend MA" value={trend} onChange={setTrend} options={TREND_OPTS} />

        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">RSI Min</label>
          <input type="number" min="0" max="100" value={rsiMin} onChange={e => setRsiMin(+e.target.value)}
            className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue" />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">RSI Max</label>
          <input type="number" min="0" max="100" value={rsiMax} onChange={e => setRsiMax(+e.target.value)}
            className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue" />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Vol/Avg Min</label>
          <input type="number" min="0" step="0.1" value={volMin} onChange={e => setVolMin(+e.target.value)}
            className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue" />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">%Chg Min</label>
          <input type="number" step="0.5" value={pctMin} onChange={e => setPctMin(+e.target.value)}
            className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue" />
        </div>
      </div>

      {/* Results table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-tv-muted text-sm">
          <div className="text-3xl mb-3">🔍</div>
          Tidak ada saham yang memenuhi filter
        </div>
      ) : (
        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-tv-border">
                {['Saham', 'Close', '1D %', 'RSI(14)', 'Vol/Avg', 'Trend MA', 'Sinyal'].map(h => (
                  <th key={h} className="text-[10px] text-tv-muted uppercase font-bold px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr
                  key={s.symbol}
                  onClick={() => onSelectStock(s.symbol)}
                  className="border-b border-tv-border/50 last:border-0 hover:bg-tv-hover cursor-pointer transition-colors animate-slide-up"
                  style={{ animationDelay: `${i * 0.03}s` }}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-sm text-tv-blue">{s.symbol}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-semibold">
                    {s.last_close != null ? fmt.price(s.last_close) : '–'}
                  </td>
                  <td className={`px-4 py-2.5 text-xs tabular-nums font-semibold ${colorOf(s.change_pct)}`}>
                    {s.change_pct != null ? fmt.pct(s.change_pct) : '–'}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">
                    {s.rsi != null ? (
                      <span className={s.rsi >= 70 ? 'text-tv-red font-bold' : s.rsi <= 30 ? 'text-tv-green font-bold' : 'text-tv-text'}>
                        {s.rsi.toFixed(1)}
                      </span>
                    ) : '–'}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">
                    {s.vol_ratio != null ? (
                      <span className={s.vol_ratio > 1.5 ? 'text-tv-green font-bold' : s.vol_ratio < 0.5 ? 'text-tv-red' : 'text-tv-text'}>
                        {s.vol_ratio.toFixed(2)}x
                      </span>
                    ) : '–'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold
                      ${s.trend === 'bullish' ? 'bg-tv-green/10 text-tv-green'
                      : s.trend === 'bearish' ? 'bg-tv-red/10 text-tv-red'
                      : 'bg-tv-muted/10 text-tv-muted'}`}>
                      {s.trend || '–'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {s.signal ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${signalStyle(s.signal)}`}>
                        {s.signal}
                      </span>
                    ) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-tv-input border border-tv-border rounded-md px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
