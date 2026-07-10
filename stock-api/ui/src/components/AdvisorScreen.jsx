import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt } from '../utils'

const VERDICT = {
  STRONG_BUY: { label: 'BELI KUAT', icon: '🚀', badge: 'bg-tv-green/15 text-tv-green border-tv-green/40', bar: 'bg-tv-green' },
  BUY:        { label: 'BELI',      icon: '✅', badge: 'bg-tv-green/10 text-tv-green border-tv-green/30', bar: 'bg-tv-green' },
  REDUCE:     { label: 'KURANGI',   icon: '✂️', badge: 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30', bar: 'bg-tv-yellow' },
  WAIT:       { label: 'TUNGGU',    icon: '⏳', badge: 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30', bar: 'bg-tv-yellow' },
  AVOID:      { label: 'HINDARI',   icon: '🚫', badge: 'bg-tv-red/10 text-tv-red border-tv-red/30', bar: 'bg-tv-red' },
}

function Chip({ children, tone = 'text-tv-muted' }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded bg-tv-bg border border-tv-border ${tone}`}>{children}</span>
}

function Card({ r, onSelect }) {
  const v = VERDICT[r.verdict] || VERDICT.WAIT
  const trendTone = r.trend === 'Naik' ? 'text-tv-green' : r.trend === 'Turun' ? 'text-tv-red' : 'text-tv-yellow'
  return (
    <button
      onClick={() => onSelect(r.symbol)}
      className="text-left w-full bg-tv-card border border-tv-border rounded-xl p-4 hover:border-tv-blue/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{v.icon}</span>
          <div>
            <div className="font-extrabold text-base tracking-tight group-hover:text-tv-blue transition-colors">{r.symbol}</div>
            <div className="text-[11px] text-tv-muted tabular-nums">{fmt.price(r.close)} · likuid {r.turnover_bn}bn/hr</div>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${v.badge}`}>{v.label}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <Chip tone={trendTone}>Tren {r.trend}</Chip>
        <Chip>{r.location}</Chip>
        <Chip>{r.candle}</Chip>
        <Chip>Vol {r.volume_state}</Chip>
        <Chip tone="text-tv-muted">RSI {r.rsi?.toFixed(0)}</Chip>
      </div>

      {/* mini trade plan */}
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <div><div className="text-[9px] text-tv-muted uppercase">Entry</div><div className="text-xs font-bold tabular-nums">{fmt.price(r.entry)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">Stop</div><div className="text-xs font-bold tabular-nums text-tv-red">{fmt.price(r.stop)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">Target</div><div className="text-xs font-bold tabular-nums text-tv-green">{fmt.price(r.target)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">R/R</div><div className={`text-xs font-bold ${r.risk_reward >= 2 ? 'text-tv-green' : 'text-tv-yellow'}`}>1:{r.risk_reward?.toFixed(1)}</div></div>
      </div>

      {/* checklist score bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-tv-bg overflow-hidden">
          <div className={`h-full ${v.bar}`} style={{ width: `${(r.pass_count / 7) * 100}%` }} />
        </div>
        <span className="text-[10px] text-tv-muted tabular-nums">{r.pass_count}/7 aturan</span>
      </div>
    </button>
  )
}

export default function AdvisorScreen({ onSelectStock, showToast }) {
  const [mode, setMode]       = useState('buy')
  const [minTurn, setMinTurn] = useState(2)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.advisorScreen(mode, minTurn)
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) showToast?.(e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [mode, minTurn, reloadKey])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold flex items-center gap-2">🧭 Advisor Screener</h1>
        <p className="text-xs text-tv-muted mt-1">
          Metode Price Action ke semua saham: trend → lokasi → candle → volume → risk/reward. Cuma tampilkan yang setup-nya valid.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex rounded-lg border border-tv-border overflow-hidden">
          {[['buy', '✅ Setup Beli'], ['all', '📋 Semua']].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? 'bg-tv-blue/15 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-tv-muted">
          <span>Min likuiditas:</span>
          <select value={minTurn} onChange={e => setMinTurn(Number(e.target.value))}
            className="bg-tv-input border border-tv-border rounded-lg px-2 py-1.5 text-tv-text text-xs">
            <option value={0}>Semua</option>
            <option value={2}>2 bn/hari</option>
            <option value={5}>5 bn/hari</option>
            <option value={20}>20 bn/hari</option>
          </select>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Summary line */}
      {data && !loading && (
        <div className="text-[11px] text-tv-muted mb-4">
          {data.scanned} saham dipindai · <b className="text-tv-text">{data.matched}</b> lolos {mode === 'buy' ? 'setup beli' : 'filter'}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-tv-muted">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
            <span className="text-sm">Memindai semua saham...</span>
          </div>
        </div>
      ) : data?.results?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.results.map(r => <Card key={r.symbol} r={r} onSelect={onSelectStock} />)}
        </div>
      ) : (
        <div className="text-center py-16 px-6">
          <div className="text-5xl mb-4">🌊</div>
          <div className="text-tv-text font-semibold mb-1">Belum ada setup beli yang valid</div>
          <p className="text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
            {mode === 'buy'
              ? 'Pasar lagi lemah — gak ada saham yang memenuhi semua syarat (tren naik + di support + candle konfirmasi + R/R bagus). Ini normal & sehat: sistem nolak entry paksa. Sabar, tahan cash, cek lagi nanti. Atau lihat "📋 Semua" untuk gambaran pasar.'
              : 'Gak ada data. Coba turunkan filter likuiditas.'}
          </p>
        </div>
      )}

      <p className="text-[10px] text-tv-muted text-center pt-6">
        Bukan ajakan beli/jual. Alat bantu belajar price action — keputusan & risiko di tangan kamu.
      </p>
    </div>
  )
}
