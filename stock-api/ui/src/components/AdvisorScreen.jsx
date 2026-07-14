import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt } from '../utils'

const SIGNAL = {
  STRONG_BUY:  { label: 'STRONG BUY',  icon: '🚀', badge: 'bg-tv-green/15 text-tv-green border-tv-green/40', bar: 'bg-tv-green' },
  BUY:         { label: 'BUY',         icon: '✅', badge: 'bg-tv-green/10 text-tv-green border-tv-green/30', bar: 'bg-tv-green' },
  WAIT:        { label: 'WAIT',        icon: '⏳', badge: 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30', bar: 'bg-tv-yellow' },
  SELL:        { label: 'SELL',        icon: '⚠️', badge: 'bg-tv-red/10 text-tv-red border-tv-red/30', bar: 'bg-tv-red' },
  STRONG_SELL: { label: 'STRONG SELL', icon: '🚫', badge: 'bg-tv-red/15 text-tv-red border-tv-red/40', bar: 'bg-tv-red' },
}

function Select({ label, value, onChange, options, strings = false }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-tv-muted">
      <span>{label}:</span>
      <select value={value} onChange={e => onChange(strings ? e.target.value : Number(e.target.value))}
        className="bg-tv-input border border-tv-border rounded-lg px-2 py-1.5 text-tv-text text-xs">
        {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
      </select>
    </div>
  )
}

function Chip({ children, tone = 'text-tv-muted' }) {
  return <span className={`text-[10px] px-1.5 py-0.5 rounded bg-tv-bg border border-tv-border ${tone}`}>{children}</span>
}

const trendToneOf = (t) =>
  t?.includes('Bullish') ? 'text-tv-green' : t?.includes('Bearish') ? 'text-tv-red' : 'text-tv-yellow'

function Card({ r, onSelect }) {
  const v = SIGNAL[r.signal] || SIGNAL.WAIT
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
        <Chip tone={trendToneOf(r.trend?.medium)}>Trend {r.trend?.medium}</Chip>
        <Chip>{r.structure}</Chip>
        <Chip>Vol {r.volume_state}</Chip>
        <Chip tone="text-tv-green">Naik {r.probability?.bullish}%</Chip>
        {r.syariah && <Chip tone="text-tv-green">☪ Syariah</Chip>}
      </div>

      {/* mini trade plan */}
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <div><div className="text-[9px] text-tv-muted uppercase">Entry</div><div className="text-xs font-bold tabular-nums">{fmt.price(r.entry_low)}–{fmt.price(r.entry_high)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">Stop</div><div className="text-xs font-bold tabular-nums text-tv-red">{fmt.price(r.stop)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">TP1</div><div className="text-xs font-bold tabular-nums text-tv-green">{fmt.price(r.target)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase">R/R</div><div className={`text-xs font-bold ${r.risk_reward >= 2 ? 'text-tv-green' : 'text-tv-yellow'}`}>1:{r.risk_reward?.toFixed(1)}</div></div>
      </div>

      {/* decision score bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-tv-bg overflow-hidden">
          <div className={`h-full ${v.bar}`} style={{ width: `${r.score}%` }} />
        </div>
        <span className="text-[10px] text-tv-muted tabular-nums">skor {r.score}/100 · yakin {r.confidence}%</span>
      </div>
    </button>
  )
}

export default function AdvisorScreen({ onSelectStock, showToast }) {
  const [mode, setMode]       = useState('buy')
  const [minTurn, setMinTurn] = useState(2)
  const [syariahOnly, setSyariahOnly] = useState(false)
  const [maxPrice, setMaxPrice]   = useState(0)   // 0 = semua
  const [minScore, setMinScore]   = useState(0)
  const [volFilter, setVolFilter] = useState('')  // '' = semua
  const [minRR, setMinRR]         = useState(0)
  const [trendFilter, setTrendFilter] = useState('') // '' | 'Bullish' | 'Bearish'
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

  // Semua filter tambahan jalan di client — data screener sudah lengkap.
  const results = (data?.results ?? []).filter(r =>
    (!syariahOnly || r.syariah) &&
    (!maxPrice || r.close <= maxPrice) &&
    (!minScore || r.score >= minScore) &&
    (!volFilter || r.volume_state === volFilter) &&
    (!minRR || r.risk_reward >= minRR) &&
    (!trendFilter || r.trend?.medium?.includes(trendFilter))
  )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold flex items-center gap-2">🧭 Advisor Screener</h1>
        <p className="text-xs text-tv-muted mt-1">
          Decision Engine ke semua saham: skor berbobot 7 faktor (struktur, trend, volume, S/R, momentum, candle, R/R). Diurutkan dari skor tertinggi.
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
        <Select label="Likuiditas" value={minTurn} onChange={setMinTurn} options={[[0, 'Semua'], [2, '≥2 bn/hr'], [5, '≥5 bn/hr'], [20, '≥20 bn/hr']]} />
        <Select label="Harga" value={maxPrice} onChange={setMaxPrice} options={[[0, 'Semua'], [500, '≤500'], [1000, '≤1.000'], [2000, '≤2.000'], [5000, '≤5.000']]} />
        <Select label="Skor" value={minScore} onChange={setMinScore} options={[[0, 'Semua'], [50, '≥50'], [60, '≥60'], [70, '≥70']]} />
        <Select label="Volume" value={volFilter} onChange={setVolFilter} strings options={[['', 'Semua'], ['Above Average', 'Di atas rata²'], ['Normal', 'Normal'], ['Below Average', 'Di bawah rata²']]} />
        <Select label="R/R" value={minRR} onChange={setMinRR} options={[[0, 'Semua'], [1.5, '≥1.5'], [2, '≥2'], [3, '≥3']]} />
        <Select label="Trend" value={trendFilter} onChange={setTrendFilter} strings options={[['', 'Semua'], ['Bullish', 'Bullish'], ['Bearish', 'Bearish'], ['Sideways', 'Sideways']]} />
        <button onClick={() => setSyariahOnly(s => !s)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${syariahOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}>
          ☪ Syariah aja
        </button>
        <button onClick={() => setReloadKey(k => k + 1)} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Summary line */}
      {data && !loading && (
        <div className="text-[11px] text-tv-muted mb-4">
          {data.scanned} saham dipindai · <b className="text-tv-text">{results.length}</b> lolos {mode === 'buy' ? 'setup beli (skor ≥60)' : 'filter'}{results.length !== data.matched ? ` (dari ${data.matched} sebelum filter)` : ''}
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
      ) : results.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map(r => <Card key={r.symbol} r={r} onSelect={onSelectStock} />)}
        </div>
      ) : (
        <div className="text-center py-16 px-6">
          <div className="text-5xl mb-4">🌊</div>
          <div className="text-tv-text font-semibold mb-1">Belum ada setup beli yang valid</div>
          <p className="text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
            {mode === 'buy'
              ? 'Pasar lagi lemah — gak ada saham dengan skor ≥60 (BUY). Ini normal & sehat: sistem nolak entry paksa. Sabar, tahan cash, cek lagi nanti. Atau lihat "📋 Semua" untuk gambaran pasar.'
              : 'Gak ada data. Coba turunkan filter likuiditas.'}
          </p>
        </div>
      )}

      <p className="text-[10px] text-tv-muted text-center pt-6">
        Bukan ajakan beli/jual. Analisa probabilistik — keputusan & risiko di tangan kamu.
      </p>
    </div>
  )
}
