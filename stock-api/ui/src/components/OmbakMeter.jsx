import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmt, colorOf } from '../utils'
import Term from './Term'

// ── Ombak Meter ──────────────────────────────────────────────────────────────
// Kondisi pasar digambar sebagai laut: regime IHSG (vs MA50) + proporsi sinyal
// BUY/WAIT/SELL di watchlist → Tenang / Berombak / Badai.

// ponytail: ambang 0.5 heuristik; tuning setelah lihat beberapa minggu
export function ombakState(regime, buy, wait, sell) {
  const total = buy + wait + sell
  if (regime === 'down' && total > 0 && sell / total >= 0.5) return 'badai'
  if (regime === 'up' && buy >= sell) return 'tenang'
  return 'berombak'
}

const STATES = {
  tenang: {
    emoji: '🏝️', label: 'Tenang', tone: 'text-tv-green',
    colors: ['#2ebd85', '#2962ff'], amp: 6, dur: [22, 30],
    advice: 'Kondisi mendukung. Tetap pilih setup dengan R:R bagus dan pasang stop-loss.',
  },
  berombak: {
    emoji: '🌊', label: 'Berombak', tone: 'text-tv-yellow',
    colors: ['#f0b90b', '#2962ff'], amp: 14, dur: [11, 16],
    advice: 'Arah belum kompak. Selektif, ukuran posisi sedang.',
  },
  badai: {
    emoji: '⛈️', label: 'Badai', tone: 'text-tv-red',
    colors: ['#f6465d', '#7b61ff'], amp: 24, dur: [5, 8],
    advice: 'Sikap: tahan dulu / posisi kecil.',
  },
}

const REGIME_TEXT = {
  up: <>IHSG di atas <Term k="ma50">rata-rata 50 hari</Term></>,
  down: <>IHSG di bawah <Term k="ma50">rata-rata 50 hari</Term></>,
  unknown: <>Posisi IHSG vs <Term k="ma50">rata-rata 50 hari</Term> belum diketahui</>,
}

// Sinus dari q+t bezier; lebar 2400 = 2× viewBox supaya geser -50% mulus.
function wavePath(amp, base, len = 200, w = 2400, h = 120) {
  let d = `M0 ${base}`
  for (let x = 0; x < w; x += len) d += ` q ${len / 4} ${-amp} ${len / 2} 0 t ${len / 2} 0`
  return `${d} V ${h} H 0 Z`
}

function Waves({ s }) {
  const layers = [
    { color: s.colors[1], amp: s.amp * 0.7, base: 78, dur: s.dur[1], op: 0.14 },
    { color: s.colors[0], amp: s.amp, base: 92, dur: s.dur[0], op: 0.22 },
  ]
  return (
    <div className="absolute inset-x-0 bottom-0 h-[55%] overflow-hidden pointer-events-none" aria-hidden>
      {layers.map((l, i) => (
        <svg key={i} viewBox="0 0 2400 120" preserveAspectRatio="none"
          className="wave-layer absolute bottom-0 left-0 h-full" style={{ width: '200%', '--wave-dur': `${l.dur}s` }}>
          <path d={wavePath(l.amp, l.base)} fill={l.color} fillOpacity={l.op} />
        </svg>
      ))}
    </div>
  )
}

export default function OmbakMeter({ regime = 'unknown', buy = 0, wait = 0, sell = 0 }) {
  const [ihsg, setIhsg] = useState(null)
  const [calib, setCalib] = useState(null)

  useEffect(() => {
    let alive = true
    // gagal → bagian itu disembunyikan, meter tetap jalan dari data screener
    api.ihsg().then(d => alive && setIhsg(d)).catch(() => {})
    api.calibration().then(d => alive && setCalib(d?.calibration?.buy_calls)).catch(() => {})
    return () => { alive = false }
  }, [])

  const key = ombakState(regime, buy, wait, sell)
  const s = STATES[key]
  const total = buy + wait + sell
  const hist = calib?.[regime]
  const bar = [
    { n: buy, cls: 'bg-tv-green', label: 'BUY' },
    { n: wait, cls: 'bg-tv-muted/60', label: 'WAIT' },
    { n: sell, cls: 'bg-tv-red', label: 'HINDARI' },
  ]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-tv-border bg-tv-card mb-6 animate-fade-in">
      <Waves s={s} />
      <div className="relative flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5 min-h-[140px]">
        <div className="min-w-0 flex-1 basis-64">
          <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted">Ombak hari ini</div>
          <div className={`text-3xl font-extrabold tracking-tight mt-0.5 ${s.tone}`}>
            <span className="float-y mr-1">{s.emoji}</span>{s.label}
          </div>
          <p className="text-xs text-tv-text/90 mt-1.5 leading-relaxed max-w-md">
            {REGIME_TEXT[regime] || REGIME_TEXT.unknown} &amp; {sell} dari {total} saham sebaiknya dihindari. {s.advice}
          </p>
          {hist?.samples > 0 && (
            <p className="text-[11px] text-tv-muted mt-2">
              Historis sinyal BUY di kondisi ini: <Term k="winrate">kena target</Term> {hist.win_rate.toFixed(0)}% · <Term k="avgpnl">rata-rata</Term>{' '}
              <b className={colorOf(hist.avg_pnl_pct)}>{fmt.pct(hist.avg_pnl_pct)}</b>/trade (n={hist.samples})
            </p>
          )}
        </div>

        <div className="w-full sm:w-56 shrink-0 space-y-2">
          {ihsg && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-bold text-tv-muted">IHSG</span>
              <span className="text-sm font-bold tabular-nums">
                {fmt.price(Math.round(ihsg.last))}{' '}
                <span className={`text-[11px] ${colorOf(ihsg.change_pct)}`}>{fmt.pct(ihsg.change_pct)}</span>
              </span>
            </div>
          )}
          {total > 0 && (
            <>
              <div className="flex h-2 rounded-full overflow-hidden bg-tv-bg/60">
                {bar.map(b => b.n > 0 && (
                  <div key={b.label} className={b.cls} style={{ width: `${(b.n / total) * 100}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] tabular-nums">
                {bar.map(b => (
                  <span key={b.label} className="text-tv-muted">
                    <b className="text-tv-text">{b.n}</b> {b.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
