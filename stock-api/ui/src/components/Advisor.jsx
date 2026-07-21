import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt } from '../utils'

// Decision-engine signal → banner styling (5 levels, static classes for JIT).
const SIGNAL = {
  STRONG_BUY:  { label: 'STRONG BUY',  icon: '🚀', text: 'text-tv-green',  banner: 'border-tv-green/40 bg-tv-green/5' },
  BUY:         { label: 'BUY',         icon: '✅', text: 'text-tv-green',  banner: 'border-tv-green/40 bg-tv-green/5' },
  WAIT:        { label: 'WAIT',        icon: '⏳', text: 'text-tv-yellow', banner: 'border-tv-yellow/40 bg-tv-yellow/5' },
  SELL:        { label: 'SELL',        icon: '⚠️', text: 'text-tv-red',    banner: 'border-tv-red/40 bg-tv-red/5' },
  STRONG_SELL: { label: 'STRONG SELL', icon: '🚫', text: 'text-tv-red',    banner: 'border-tv-red/40 bg-tv-red/5' },
}

const trendToneOf = (t) =>
  t?.includes('Bullish') ? 'text-tv-green' : t?.includes('Bearish') ? 'text-tv-red' : 'text-tv-yellow'

function ScoreBar({ score }) {
  const color = score >= 60 ? 'bg-tv-green' : score >= 40 ? 'bg-tv-yellow' : 'bg-tv-red'
  return (
    <div className="w-16 h-1.5 bg-tv-bg rounded-full overflow-hidden shrink-0">
      <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
    </div>
  )
}

function Pill({ label, value, tone = 'text-tv-text' }) {
  return (
    <div className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2">
      <div className="text-[10px] text-tv-muted uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
    </div>
  )
}

export default function Advisor({ symbol }) {
  const [dec, setDec]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    api.analysis.decision(symbol)
      .then(r => { if (alive) setDec({ ...r.decision, syariah: r.syariah }) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [symbol])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-tv-muted">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
        <span className="text-sm">Menghitung skor multi-faktor {symbol}...</span>
      </div>
    </div>
  )
  if (error) return <div className="p-6 text-tv-red text-sm">⚠️ {error}</div>
  if (!dec)  return null

  const v = SIGNAL[dec.signal] || SIGNAL.WAIT
  const canTrade = dec.signal === 'STRONG_BUY' || dec.signal === 'BUY'

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">

      {/* ── Verdict banner ─────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-5 ${v.banner} ${canTrade ? 'breathe-green' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl float-y">{v.icon}</span>
          <div>
            <div className={`text-xl font-extrabold ${v.text} flex items-center gap-2`}>
              {v.label}
              {dec.syariah && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-tv-green/10 text-tv-green border border-tv-green/30">☪ Syariah</span>
              )}
            </div>
            <div className="text-[11px] text-tv-muted">
              Skor <b className="text-tv-text">{dec.score}/100</b> · keyakinan <b className="text-tv-text">{dec.confidence}%</b> · Decision Engine (skor berbobot 9 faktor)
            </div>
            {dec.note && (
              <div className="mt-1.5 text-[11px] text-tv-yellow">⚠️ {dec.note}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Probability distribution ───────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">🎲 Probabilitas Skenario</div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-tv-bg">
          <div className="bg-tv-green" style={{ width: `${dec.probability.bullish}%` }} />
          <div className="bg-tv-yellow" style={{ width: `${dec.probability.sideways}%` }} />
          <div className="bg-tv-red" style={{ width: `${dec.probability.bearish}%` }} />
        </div>
        <div className="flex justify-between text-[11px] mt-1">
          <span className="text-tv-green">Naik {dec.probability.bullish}%</span>
          <span className="text-tv-yellow">Sideways {dec.probability.sideways}%</span>
          <span className="text-tv-red">Turun {dec.probability.bearish}%</span>
        </div>
      </div>

      {/* ── Trend + structure pills ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Pill label="Trend Panjang" value={dec.trend.long} tone={trendToneOf(dec.trend.long)} />
        <Pill label="Trend Menengah" value={dec.trend.medium} tone={trendToneOf(dec.trend.medium)} />
        <Pill label="Trend Pendek" value={dec.trend.short} tone={trendToneOf(dec.trend.short)} />
        <Pill label="Struktur" value={`${dec.market_structure.state} (${dec.market_structure.strength})`} />
      </div>

      {/* ── Trade plan ─────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">📐 Rencana Trading</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-tv-muted">Entry Zone (ideal {fmt.price(dec.entry_zone.ideal)})</div>
            <div className="font-bold tabular-nums">{fmt.price(dec.entry_zone.buy[0])} – {fmt.price(dec.entry_zone.buy[1])}</div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Stop Loss</div>
            <div className="font-bold tabular-nums text-tv-red">{fmt.price(dec.stop_loss)}</div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Take Profit</div>
            <div className="font-bold tabular-nums text-tv-green">
              {dec.take_profit.map(t => `${fmt.price(t.price)} (${t.portion})`).join(' · ')}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Risk / Reward</div>
            <div className={`font-bold ${dec.risk_reward >= 2 ? 'text-tv-green' : 'text-tv-red'}`}>1 : {dec.risk_reward?.toFixed(1)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] mt-3">
          <span className="text-tv-muted">Support: <b className="text-tv-green tabular-nums">{dec.support.map(fmt.price).join(' · ')}</b></span>
          <span className="text-tv-muted">Resistance: <b className="text-tv-red tabular-nums">{dec.resistance.map(fmt.price).join(' · ')}</b></span>
        </div>
        {!canTrade && (
          <div className="mt-3 text-[11px] text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/20 rounded-lg px-3 py-2">
            ℹ️ Rencana di atas hanya berlaku KALAU setup sudah valid. Sinyal sekarang <b>{v.label}</b> — belum saatnya entry.
          </div>
        )}
      </div>

      {/* ── Transparent factor breakdown ───────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">🧠 Breakdown Skor per Faktor</div>
        <div className="space-y-1.5">
          {dec.components?.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-36 shrink-0 text-tv-muted">{c.name} <span className="text-[10px]">({c.weight}%)</span></span>
              <ScoreBar score={c.score} />
              <span className="w-7 text-right tabular-nums font-bold">{c.score}</span>
              <span className="text-tv-muted truncate">{c.note}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-tv-muted mt-3 leading-relaxed">
          Skor 50 = netral. Bobot: Struktur 30% · Trend 20% · Volume 15% · S/R 15% · Momentum 10% · Candle 5% · R/R 5%.
          Keyakinan = seberapa searah semua faktor menunjuk arah yang sama, bukan jaminan harga.
        </p>
      </div>

      <p className="text-[10px] text-tv-muted text-center pt-2">
        Bukan ajakan beli/jual. Analisa probabilistik, bukan kepastian — keputusan & risiko di tangan kamu.
      </p>
    </div>
  )
}
