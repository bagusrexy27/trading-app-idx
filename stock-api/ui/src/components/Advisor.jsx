import { useState, useEffect } from 'react'
import { api } from '../api'
import { fmt, REGIME_LABEL, signalLabel } from '../utils'
import { ProjectionCard } from './Projection'
import ValuationCard from './ValuationCard'

const SIGNAL = {
  BUY:  { text: 'text-tv-green',  banner: 'border-tv-green/40 bg-tv-green/5' },
  WAIT: { text: 'text-tv-yellow', banner: 'border-tv-yellow/40 bg-tv-yellow/5' },
  SELL: { text: 'text-tv-red',    banner: 'border-tv-red/40 bg-tv-red/5' },
}

const trendToneOf = (t) =>
  t?.includes('Bullish') ? 'text-tv-green' : t?.includes('Bearish') ? 'text-tv-red' : 'text-tv-yellow'

function Pill({ label, value, tone = 'text-tv-text' }) {
  return (
    <div className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2">
      <div className="text-[10px] text-tv-muted uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
    </div>
  )
}

// Rekam jejak nyata: hasil rencana ATR (stop −1,5 ATR, target +3 ATR) pada
// hari-hari dengan saran & kondisi IHSG yang sama (replay semua saham, tanpa
// look-ahead, setelah biaya).
function CalibCard({ c }) {
  const good = c.avg_pnl_pct > 0
  return (
    <div className={`bg-tv-card border rounded-xl p-4 ${good ? 'border-tv-border' : 'border-tv-red/40'}`}>
      <div className="text-xs font-bold text-tv-muted uppercase mb-2">Rekam jejak historis</div>
      <p className="text-sm leading-relaxed">
        Saran "{signalLabel(c.signal)}" saat {REGIME_LABEL[c.regime]}: dari <b>{c.samples.toLocaleString('id-ID')}</b> kasus,
        kalau masuk rata-rata hasilnya <b className={good ? 'text-tv-green' : 'text-tv-red'}>{fmt.pct(c.avg_pnl_pct)}</b> per trade.
        <span className="text-tv-muted"> Target kena sebelum stop {Math.round(c.win_rate)}% dalam {c.horizon} hari bursa.</span>
      </p>
      {c.signal === 'BUY' && c.stock?.samples > 0 && (
        <p className="text-xs text-tv-muted mt-1.5">
          Saham ini sendiri: rata-rata {fmt.pct(c.stock.avg_pnl_pct)} dari {c.stock.samples} hari Tren naik ({Math.round(c.stock.win_rate)}% kena target).
        </p>
      )}
      {!good && <p className="text-xs text-tv-red mt-1.5">⚠️ Rata-rata historis negatif — masuk di kondisi seperti ini belum terbukti menguntungkan.</p>}
      {!c.reliable && <p className="text-xs text-tv-yellow mt-1.5">Sampel sedikit — angka ini belum bisa dipercaya.</p>}
      <p className="text-[10px] text-tv-muted mt-2">Data sejak 2020 (saham IPO setelahnya: sejak listing), setelah biaya 0,4%/trade; hari-hari berurutan saling tumpang-tindih, jadi jumlah kasus terlihat lebih besar dari aslinya. Bukan jaminan.</p>
    </div>
  )
}

export default function Advisor({ symbol, decisionData }) {
  const [dec, setDec]         = useState(null)
  const [bt, setBt]           = useState(null)
  const [loading, setLoading] = useState(true)
  const [btLoading, setBtLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)

    const loadDec = decisionData?.decision
      ? Promise.resolve({ decision: decisionData.decision, syariah: decisionData.syariah, calibration: decisionData.calibration, close: decisionData.close })
      : api.analysis.decision(symbol)

    loadDec
      .then(r => { if (alive) setDec({ ...r.decision, syariah: r.syariah, calibration: r.calibration, close: r.close }) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })

    setBtLoading(true)
    api.analysis.decisionBacktest(symbol)
      .then(r => { if (alive) setBt(r.backtest) })
      .catch(() => { if (alive) setBt(null) })
      .finally(() => { if (alive) setBtLoading(false) })

    return () => { alive = false }
  }, [symbol, decisionData])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-tv-muted">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />
        <span className="text-sm">Memeriksa {symbol}…</span>
      </div>
    </div>
  )
  if (error) return <div className="p-6 text-tv-red text-sm">{error}</div>
  if (!dec)  return null

  const v = SIGNAL[dec.signal] || SIGNAL.WAIT
  const isBuy = dec.signal === 'BUY'
  const hasPlan = dec.stop_loss > 0 && dec.take_profit?.length > 0

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">

      <div className={`rounded-xl border-2 p-5 ${v.banner} ${isBuy ? 'breathe-green' : ''}`}>
        <div className={`text-xl font-extrabold ${v.text} flex items-center gap-2`}>
          {signalLabel(dec.signal)}
          {dec.syariah && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-tv-green/10 text-tv-green border border-tv-green/30">Syariah</span>
          )}
        </div>
        <div className="text-[11px] text-tv-muted">
          Pola "tren naik belum pucuk" — Tren naik kalau keempat syarat di bawah terpenuhi. Masih diuji maju (Nov 2026 – Jan 2027).
        </div>
        {dec.note && (
          <div className="mt-2 text-[12px] text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/20 rounded-lg px-3 py-2">⚠️ {dec.note}</div>
        )}
      </div>

      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">Syarat Tren naik</div>
        <div className="space-y-1.5">
          {dec.components?.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <span className="w-5 shrink-0">{c.score === 100 ? '✅' : '❌'}</span>
              <span className="w-40 shrink-0">{c.name}</span>
              <span className="text-tv-muted truncate" title={c.note}>{c.note}</span>
            </div>
          ))}
        </div>
        {dec.signal === 'SELL' && (
          <p className="text-[11px] text-tv-muted mt-3">Tren turun = tren pendek dan menengah sama-sama turun. Hanya gambaran, bukan ajakan jual.</p>
        )}
      </div>

      {dec.calibration?.samples > 0 && <CalibCard c={dec.calibration} />}

      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">Kalau masuk (rencana ATR)</div>
        {hasPlan ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-tv-muted">Harga acuan (close)</div>
              <div className="font-bold tabular-nums">{fmt.price(dec.entry_zone.ideal)}</div>
            </div>
            <div>
              <div className="text-[11px] text-tv-muted">Batas rugi (−1,5 ATR)</div>
              <div className="font-bold tabular-nums text-tv-red">{fmt.price(dec.stop_loss)}</div>
            </div>
            <div>
              <div className="text-[11px] text-tv-muted">Target (+3 ATR)</div>
              <div className="font-bold tabular-nums text-tv-green">{fmt.price(dec.take_profit[0].price)}</div>
            </div>
            <div>
              <div className="text-[11px] text-tv-muted">Risk / reward</div>
              <div className="font-bold">1 : {dec.risk_reward?.toFixed(1)}</div>
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-tv-muted">Tidak ada rencana untuk Tren turun.</div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] mt-3">
          <span className="text-tv-muted">Support: <b className="text-tv-green tabular-nums">{dec.support?.map(fmt.price).join(' · ')}</b></span>
          <span className="text-tv-muted">Resistance: <b className="text-tv-red tabular-nums">{dec.resistance?.map(fmt.price).join(' · ')}</b></span>
        </div>
        {hasPlan && !isBuy && (
          <div className="mt-3 text-[11px] text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/20 rounded-lg px-3 py-2">
            Saran saat ini <b>{signalLabel(dec.signal)}</b> — angka di atas hanya ukuran risiko kalau tetap masuk, bukan ajakan beli.
          </div>
        )}
        <p className="text-[10px] text-tv-muted mt-2">Hitung jumlah lot dari modal & batas rugi di tab Risk.</p>
      </div>

      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-xs font-bold text-tv-muted uppercase mb-3">Backtest saran di saham ini</div>
        {btLoading ? (
          <div className="text-sm text-tv-muted">Menghitung kinerja historis…</div>
        ) : !bt || (bt.total === 0 && bt.open_trades === 0) ? (
          <div className="text-sm text-tv-muted">Belum ada Tren naik di riwayat saham ini.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-tv-muted">Rata-rata / trade</div>
                <div className={`font-bold ${bt.expectancy_pct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{bt.expectancy_pct > 0 ? '+' : ''}{bt.expectancy_pct?.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-[11px] text-tv-muted">Kena target</div>
                <div className="font-bold text-tv-muted">{bt.win_rate?.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[11px] text-tv-muted">Trade (selesai)</div>
                <div className="font-bold">{bt.total} <span className="text-tv-muted font-normal">({bt.wins}W / {bt.losses}L{bt.timeouts ? ` / ${bt.timeouts} timeout` : ''}{bt.open_trades ? ` · ${bt.open_trades} berjalan` : ''})</span></div>
              </div>
              <div>
                <div className="text-[11px] text-tv-muted">R:R rencana</div>
                <div className="font-bold">1 : {bt.avg_rr?.toFixed(1)}</div>
              </div>
            </div>
            <p className="text-[10px] text-tv-muted mt-2">
              Simulasi: masuk open besok saat Tren naik, keluar di stop/target atau close setelah 20 hari bursa. Aturan sama dengan rekam jejak, setelah biaya, tanpa look-ahead.
            </p>
          </>
        )}
      </div>

      <ValuationCard v={dec.valuation} />

      {dec.close > 0 && <ProjectionCard calibration={dec.calibration} close={dec.close} />}

      <div className="grid grid-cols-3 gap-2">
        <Pill label="Tren panjang" value={dec.trend.long} tone={trendToneOf(dec.trend.long)} />
        <Pill label="Tren menengah" value={dec.trend.medium} tone={trendToneOf(dec.trend.medium)} />
        <Pill label="Tren pendek" value={dec.trend.short} tone={trendToneOf(dec.trend.short)} />
      </div>

      <p className="text-[10px] text-tv-muted text-center pt-2">
        Bukan ajakan jual/beli. Analisa probabilistik — keputusan dan risiko di tangan Anda.
      </p>
    </div>
  )
}
