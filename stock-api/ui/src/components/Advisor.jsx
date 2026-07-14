import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt } from '../utils'

// Verdict → full Tailwind class strings (static, so JIT keeps them) + label + emoji.
const VERDICT = {
  STRONG_BUY: { label: 'BELI KUAT',              icon: '🚀', text: 'text-tv-green',  banner: 'border-tv-green/40 bg-tv-green/5' },
  BUY:        { label: 'BELI (hati-hati)',       icon: '✅', text: 'text-tv-green',  banner: 'border-tv-green/40 bg-tv-green/5' },
  WAIT:       { label: 'TUNGGU',                 icon: '⏳', text: 'text-tv-yellow', banner: 'border-tv-yellow/40 bg-tv-yellow/5' },
  REDUCE:     { label: 'KURANGI / JANGAN ENTRY', icon: '✂️', text: 'text-tv-yellow', banner: 'border-tv-yellow/40 bg-tv-yellow/5' },
  AVOID:      { label: 'HINDARI',                icon: '🚫', text: 'text-tv-red',    banner: 'border-tv-red/40 bg-tv-red/5' },
}

// Decision-engine signal → label + tone (5 levels).
const SIGNAL = {
  STRONG_BUY:  { label: 'STRONG BUY',  tone: 'text-tv-green' },
  BUY:         { label: 'BUY',         tone: 'text-tv-green' },
  WAIT:        { label: 'WAIT',        tone: 'text-tv-yellow' },
  SELL:        { label: 'SELL',        tone: 'text-tv-red' },
  STRONG_SELL: { label: 'STRONG SELL', tone: 'text-tv-red' },
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
  const [adv, setAdv]         = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [bt, setBt]           = useState(null)
  const [dec, setDec]         = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null); setBt(null); setDec(null)
    api.analysis.advisor(symbol)
      .then(r => { if (alive) setAdv(r.advice) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    // Historical performance of this exact method on this stock (non-blocking).
    api.analysis.advisorBacktest(symbol)
      .then(r => { if (alive) setBt(r.backtest) })
      .catch(() => {})
    // Weighted multi-factor decision engine (non-blocking).
    api.analysis.decision(symbol)
      .then(r => { if (alive) setDec(r.decision) })
      .catch(() => {})
    return () => { alive = false }
  }, [symbol])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-tv-muted">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
        <span className="text-sm">Menganalisa price action {symbol}...</span>
      </div>
    </div>
  )
  if (error) return <div className="p-6 text-tv-red text-sm">⚠️ {error}</div>
  if (!adv)  return null

  const v = VERDICT[adv.verdict] || VERDICT.WAIT
  const trendTone = adv.trend === 'Naik' ? 'text-tv-green' : adv.trend === 'Turun' ? 'text-tv-red' : 'text-tv-yellow'
  const canTrade = adv.verdict === 'STRONG_BUY' || adv.verdict === 'BUY'

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">

      {/* ── Verdict banner ─────────────────────────────────────── */}
      <div className={`rounded-xl border-2 p-5 ${v.banner} ${canTrade ? 'breathe-green' : ''}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl float-y">{v.icon}</span>
          <div>
            <div className={`text-xl font-extrabold ${v.text}`}>{v.label}</div>
            <div className="text-[11px] text-tv-muted">
              Keyakinan: <b className="text-tv-text">{adv.confidence}</b> · metode Price Action (trend → lokasi → candle → volume → risk/reward)
            </div>
          </div>
        </div>
        <p className="text-sm text-tv-text leading-relaxed">{adv.action}</p>
      </div>

      {/* ── Decision Engine (skor berbobot multi-faktor) ───────── */}
      {dec && (
        <div className="bg-tv-card border border-tv-border rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-tv-muted uppercase">🤖 Decision Engine</div>
            <div className="text-sm">
              <span className={`font-extrabold ${(SIGNAL[dec.signal] || SIGNAL.WAIT).tone}`}>
                {(SIGNAL[dec.signal] || SIGNAL.WAIT).label}
              </span>
              <span className="text-tv-muted"> · skor <b className="text-tv-text">{dec.score}</b>/100 · keyakinan <b className="text-tv-text">{dec.confidence}%</b></span>
            </div>
          </div>

          {/* Probability distribution */}
          <div>
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

          {/* Multi-timeframe trend + structure */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Pill label="Trend Panjang" value={dec.trend.long} tone={trendToneOf(dec.trend.long)} />
            <Pill label="Trend Menengah" value={dec.trend.medium} tone={trendToneOf(dec.trend.medium)} />
            <Pill label="Trend Pendek" value={dec.trend.short} tone={trendToneOf(dec.trend.short)} />
            <Pill label="Struktur" value={`${dec.market_structure.state} (${dec.market_structure.strength})`} />
          </div>

          {/* Trade plan zone */}
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

          {/* S/R zones */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            <span className="text-tv-muted">Support: <b className="text-tv-green tabular-nums">{dec.support.map(fmt.price).join(' · ')}</b></span>
            <span className="text-tv-muted">Resistance: <b className="text-tv-red tabular-nums">{dec.resistance.map(fmt.price).join(' · ')}</b></span>
          </div>

          {/* Transparent factor breakdown */}
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
          <p className="text-[10px] text-tv-muted">
            Skor 50 = netral. Bobot: Struktur 30% · Trend 20% · Volume 15% · S/R 15% · Momentum 10% · Candle 5% · R/R 5%.
            Keyakinan = seberapa searah semua faktor, bukan jaminan harga.
          </p>
        </div>
      )}

      {/* ── Snapshot pills ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Pill label="Tren" value={adv.trend} tone={trendTone} />
        <Pill label="Lokasi Harga" value={adv.location} />
        <Pill label="Candle Terakhir" value={adv.candle} />
        <Pill label="Volume" value={adv.volume_state} />
      </div>

      {/* ── Trade plan ─────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">📐 Rencana Trading</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-tv-muted">Entry (harga skrg)</div>
            <div className="font-bold tabular-nums">{fmt.price(adv.entry)}</div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Stop Loss (support)</div>
            <div className="font-bold tabular-nums text-tv-red">
              {fmt.price(adv.stop)} <span className="text-[11px]">({adv.stop_pct?.toFixed(1)}%)</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Target (resistance)</div>
            <div className="font-bold tabular-nums text-tv-green">
              {fmt.price(adv.target)} <span className="text-[11px]">(+{adv.target_pct?.toFixed(1)}%)</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Risk / Reward</div>
            <div className={`font-bold ${adv.risk_reward >= 2 ? 'text-tv-green' : 'text-tv-red'}`}>
              1 : {adv.risk_reward?.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">RSI (14)</div>
            <div className="font-bold tabular-nums">{adv.rsi?.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-[11px] text-tv-muted">Support / Resistance</div>
            <div className="font-bold tabular-nums text-[13px]">{fmt.price(adv.support)} / {fmt.price(adv.resistance)}</div>
          </div>
        </div>
        {!canTrade && (
          <div className="mt-3 text-[11px] text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/20 rounded-lg px-3 py-2">
            ℹ️ Rencana di atas hanya berlaku KALAU setup sudah valid. Verdict sekarang <b>{v.label}</b> — belum saatnya entry.
          </div>
        )}
      </div>

      {/* ── Reasons ────────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">🧠 Kenapa?</div>
        <ul className="space-y-2">
          {adv.reasons?.map((r, i) => (
            <li key={i} className="text-sm text-tv-text flex gap-2">
              <span className="text-tv-blue">•</span><span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Checklist ──────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">✅ Checklist 7 Aturan</div>
        <div className="space-y-1.5">
          {adv.checklist?.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={c.pass ? 'text-tv-green' : 'text-tv-red'}>{c.pass ? '✓' : '✗'}</span>
              <span className={c.pass ? 'text-tv-text' : 'text-tv-muted'}>{c.label}</span>
              <span className="ml-auto text-[11px] text-tv-muted text-right">{c.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scenarios ──────────────────────────────────────────── */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">🔮 Skenario "Kalau... Maka..."</div>
        <ul className="space-y-2">
          {adv.scenarios?.map((s, i) => (
            <li key={i} className="text-sm text-tv-muted leading-relaxed flex gap-2">
              <span className="text-tv-purple">→</span><span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Historical backtest of this method ─────────────────── */}
      {bt && bt.total > 0 && (
        <div className="bg-tv-card border border-tv-border rounded-xl p-4">
          <div className="text-xs font-bold text-tv-muted uppercase mb-3">📊 Uji Historis Metode Ini (saham ini)</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div>
              <div className="text-[10px] text-tv-muted uppercase">Sinyal Beli</div>
              <div className="text-lg font-extrabold tabular-nums">{bt.total}</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">Win Rate</div>
              <div className={`text-lg font-extrabold tabular-nums ${bt.win_rate >= 50 ? 'text-tv-green' : 'text-tv-red'}`}>{bt.win_rate?.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">Avg Untung</div>
              <div className="text-lg font-extrabold tabular-nums text-tv-green">+{bt.avg_win_pct?.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">Avg Rugi</div>
              <div className="text-lg font-extrabold tabular-nums text-tv-red">{bt.avg_loss_pct?.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-tv-muted uppercase">Expectancy</div>
              <div className={`text-lg font-extrabold tabular-nums ${bt.expectancy_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{bt.expectancy_pct >= 0 ? '+' : ''}{bt.expectancy_pct?.toFixed(2)}%</div>
            </div>
          </div>
          <p className="text-[10px] text-tv-muted mt-3 leading-relaxed">
            Simulasi entry di sinyal BELI historis (tanpa look-ahead), exit di stop/target. Expectancy positif = metode ini
            menghasilkan rata-rata untung per trade di saham ini. Masa lalu tidak menjamin masa depan.
          </p>
        </div>
      )}

      <p className="text-[10px] text-tv-muted text-center pt-2">
        Bukan ajakan beli/jual. Alat bantu belajar price action — keputusan & risiko di tangan kamu.
      </p>
    </div>
  )
}
