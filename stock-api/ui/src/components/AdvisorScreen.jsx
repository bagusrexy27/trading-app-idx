import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt, calibShort, REGIME_LABEL, signalLabel } from '../utils'
import { ValuationChip } from './ValuationCard'
import { tip } from '../glossary'
import { HorizonToggle, ScenarioBar, pickProj, projEdge } from './Projection'

const SIGNAL = {
  BUY:         { icon: '✅', badge: 'bg-tv-green/10 text-tv-green border-tv-green/30', bar: 'bg-tv-green' },
  WAIT:        { icon: '⏳', badge: 'bg-tv-yellow/10 text-tv-yellow border-tv-yellow/30', bar: 'bg-tv-yellow' },
  SELL:        { icon: '⚠️', badge: 'bg-tv-red/10 text-tv-red border-tv-red/30', bar: 'bg-tv-red' },
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

function Card({ r, h, onSelect }) {
  const v = SIGNAL[r.signal] || SIGNAL.WAIT
  const p = pickProj(r.calibration, h)
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
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${v.badge}`}>{signalLabel(r.signal)}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <span title={`Panjang: ${r.trend?.long} · Menengah: ${r.trend?.medium} · Pendek: ${r.trend?.short}`}>
          <Chip tone={trendToneOf(r.trend?.overall)}>Trend {r.trend?.overall}</Chip>
        </span>
        {calibShort(r.calibration) && (
          <span title={`Saran "${signalLabel(r.calibration.signal)}", ${REGIME_LABEL[r.calibration.regime]}: kalau masuk, target +3 ATR kena sebelum stop dalam ${r.calibration.horizon} hari bursa. Rata-rata hasil ${fmt.pct(r.calibration.avg_pnl_pct)}/trade setelah biaya.`}>
            <Chip tone={r.calibration.avg_pnl_pct > 0 ? 'text-tv-green' : 'text-tv-red'}>{calibShort(r.calibration)}</Chip>
          </span>
        )}
        {r.syariah && <Chip tone="text-tv-green">☪ Syariah</Chip>}
        {(r.idx30 || r.lq45) && <Chip tone="text-tv-blue">{r.idx30 ? 'IDX30' : 'LQ45'}</Chip>}
        <ValuationChip v={r.valuation} />
      </div>

      {/* mini ATR plan — Tren turun carries none */}
      {r.stop > 0 && (
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <div><div className="text-[9px] text-tv-muted uppercase cursor-help" title={tip('entry')}>Acuan</div><div className="text-xs font-bold tabular-nums">{fmt.price(r.entry_ideal)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase cursor-help" title={tip('stop')}>Stop</div><div className="text-xs font-bold tabular-nums text-tv-red">{fmt.price(r.stop)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase cursor-help" title={tip('target')}>Target</div><div className="text-xs font-bold tabular-nums text-tv-green">{fmt.price(r.target)}</div></div>
        <div><div className="text-[9px] text-tv-muted uppercase cursor-help" title={tip('rr')}>R/R</div><div className="text-xs font-bold">1:{r.risk_reward?.toFixed(1)}</div></div>
      </div>
      )}

      {p && (
        <div className="mb-3" title={`Dari ${p.samples} kasus serupa, ${h} hari bursa kemudian. Ambang ±${p.threshold_pct.toFixed(1)}% sesuai gerak wajar saham ini. 8 dari 10 kasus: ${fmt.pct(p.band_pct[0])} s/d ${fmt.pct(p.band_pct[4])}.`}>
          <div className="text-[9px] text-tv-muted uppercase mb-1">Proyeksi {h} hari (terukur{p.reliable ? '' : ', sampel sedikit'})</div>
          <ScenarioBar p={p} compact />
        </div>
      )}

      {r.note && (
        <p className="text-[10px] text-tv-yellow/90 leading-snug border-l-2 border-tv-yellow/40 pl-2">
          {r.note}
        </p>
      )}
    </button>
  )
}

export default function AdvisorScreen({ onSelectStock, showToast }) {
  const [mode, setMode]       = useState('buy')
  const [minTurn, setMinTurn] = useState(2)
  const [syariahOnly, setSyariahOnly] = useState(false)
  const [undervalueOnly, setUndervalueOnly] = useState(false)
  const [index, setIndex] = useState('') // '' | 'idx30' | 'lq45'
  const [maxPrice, setMaxPrice]   = useState(0)   // 0 = semua
  const [trendFilter, setTrendFilter] = useState('') // '' | 'Bullish' | 'Bearish'
  const [horizon, setHorizon] = useState(20)
  const [sortBy, setSortBy]   = useState('turnover') // 'turnover' (backend) | 'proj'
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.advisorScreen({
      mode,
      minTurnover: minTurn,
      syariah: syariahOnly || undefined,
      undervalue: undervalueOnly || undefined,
      index: index || undefined,
    })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) showToast?.(e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [mode, minTurn, syariahOnly, undervalueOnly, index, reloadKey, showToast])

  // Filter harga/trend di client — backend sudah handle likuiditas, syariah, indeks, undervalue.
  const results = (data?.results ?? []).filter(r =>
    (!maxPrice || r.close <= maxPrice) &&
    (!trendFilter || r.trend?.overall?.includes(trendFilter))
  )
  if (sortBy === 'proj') {
    results.sort((a, b) => projEdge(pickProj(b.calibration, horizon)) - projEdge(pickProj(a.calibration, horizon)))
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold flex items-center gap-2">🧭 Advisor Screener</h1>
        <p className="text-xs text-tv-muted mt-1">
          Saran ke semua saham: Tren naik = pola "tren naik belum pucuk" (tren pendek & menengah naik, harga 0–1,5 ATR di atas EMA20, RSI 50–65). Bukan peringkat saham terbaik — diurutkan menurut likuiditas, atau proyeksi terukur (Bullish% − Bearish%).
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex rounded-lg border border-tv-border overflow-hidden">
          {[['buy', '✅ Tren naik'], ['all', '📋 Semua']].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? 'bg-tv-blue/15 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <Select label="Likuiditas" value={minTurn} onChange={setMinTurn} options={[[0, 'Semua'], [2, '≥2 bn/hr'], [5, '≥5 bn/hr'], [20, '≥20 bn/hr']]} />
        <Select label="Harga" value={maxPrice} onChange={setMaxPrice} options={[[0, 'Semua'], [500, '≤500'], [1000, '≤1.000'], [2000, '≤2.000'], [5000, '≤5.000']]} />
        <Select label="Indeks" value={index} onChange={setIndex} strings options={[['', 'Semua'], ['lq45', 'LQ45'], ['idx30', 'IDX30']]} />
        <Select label="Trend" value={trendFilter} onChange={setTrendFilter} strings options={[['', 'Semua'], ['Bullish', 'Bullish'], ['Bearish', 'Bearish'], ['Sideways', 'Sideways']]} />
        <Select label="Urutkan" value={sortBy} onChange={setSortBy} strings options={[['turnover', 'Likuiditas'], ['proj', 'Proyeksi terbaik']]} />
        <HorizonToggle value={horizon} onChange={setHorizon} />
        <button onClick={() => setSyariahOnly(s => !s)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${syariahOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}>
          ☪ Syariah aja
        </button>
        <button onClick={() => setUndervalueOnly(s => !s)}
          title="PBV di bawah rata-rata 3 tahun + lolos saringan: listing >10 th, dividend yield ≥5%, rata-rata ROE >12%, laba selalu positif"
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${undervalueOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}>
          💎 Undervalue aja
        </button>
        <button onClick={() => setReloadKey(k => k + 1)} className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-tv-bg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {index && data?.index_stale && (
        <div className="text-xs text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/30 rounded-lg px-3 py-2 mb-3">
          ⚠️ Daftar IDX30/LQ45 berlaku s/d {data.index_until}. BEI sudah ganti periode, jadi filter ini mungkin sudah basi (edit handlers/indices.go).
        </div>
      )}

      {syariahOnly && data?.syariah_stale && (
        <div className="text-xs text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/30 rounded-lg px-3 py-2 mb-3">
          ⚠️ Daftar syariah (DES OJK) berlaku s/d {data.syariah_until}. OJK sudah terbitkan periode baru, jadi label ☪ mungkin sudah basi (edit handlers/syariah.go).
        </div>
      )}

      {data?.regime === 'down' && !loading && (
        <div className="text-xs text-tv-red bg-tv-red/10 border border-tv-red/30 rounded-lg px-3 py-2 mb-3">
          ⚠️ {REGIME_LABEL.down} (pasar sedang turun). Saran Tren naik tetap ditampilkan, tapi secara historis masuk di kondisi ini rata-rata <b>rugi</b> — lihat rekam jejak di tiap kartu.
        </div>
      )}

      {/* Summary line */}
      {data && !loading && (
        <div className="text-[11px] text-tv-muted mb-4">
          {data.scanned} saham dipindai · <b className="text-tv-text">{results.length}</b> lolos {mode === 'buy' ? 'Tren naik' : 'filter'}{results.length !== data.matched ? ` (dari ${data.matched} sebelum filter)` : ''}
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
          {results.map(r => <Card key={r.symbol} r={r} h={horizon} onSelect={onSelectStock} />)}
        </div>
      ) : (
        <div className="text-center py-16 px-6">
          <div className="text-5xl mb-4">🌊</div>
          <div className="text-tv-text font-semibold mb-1">Belum ada saham tren naik yang lolos</div>
          <p className="text-xs text-tv-muted max-w-md mx-auto leading-relaxed">
            {mode !== 'buy'
              ? 'Gak ada data. Coba turunkan filter likuiditas.'
              : 'Hari ini belum ada saham yang memenuhi keempat syarat Tren naik. Itu normal — polanya memang jarang. Lihat "📋 Semua" untuk gambaran pasar.'}
          </p>
        </div>
      )}

      <p className="text-[10px] text-tv-muted text-center pt-6">
        Bukan ajakan beli/jual. Analisa probabilistik — keputusan & risiko di tangan kamu.
      </p>
    </div>
  )
}
