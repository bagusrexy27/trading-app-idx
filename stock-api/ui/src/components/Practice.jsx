import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { api } from '../api'
import { fmt, APEX_DARK } from '../utils'

const ReactApexChart = lazy(() => import('react-apexcharts'))

// ── Latihan Prediksi Candle ──────────────────────────────────────────────────
// Game: chart historis acak (saham & tanggal disembunyikan), tebak arah candle
// besok, lalu dibedah: apa kata trend / RSI / pola candle — belajar dari tiap
// tebakan. Skor & streak tersimpan di localStorage.

const SCORE_KEY = 'idx_practice_v1'
const WINDOW = 60          // candle yang ditampilkan
const loadScore = () => {
  try { return JSON.parse(localStorage.getItem(SCORE_KEY)) || { total: 0, correct: 0, streak: 0, best: 0 } }
  catch { return { total: 0, correct: 0, streak: 0, best: 0 } }
}

// ── mini indicator math (client-side, cukup untuk edukasi) ──────────────────
const sma = (a, n) => a.length < n ? null : a.slice(-n).reduce((s, v) => s + v, 0) / n
function rsi14(closes) {
  if (closes.length < 15) return null
  let g = 0, l = 0
  for (let i = closes.length - 14; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch > 0) g += ch; else l -= ch
  }
  if (l === 0) return 100
  return 100 - 100 / (1 + (g / 14) / (l / 14))
}
function candleLabel(bars) {
  const c = bars[bars.length - 1], p = bars[bars.length - 2]
  if (!c || !p) return ['—', 'netral']
  const body = Math.abs(c.close - c.open), rng = c.high - c.low || 1
  const lower = Math.min(c.close, c.open) - c.low
  const upper = c.high - Math.max(c.close, c.open)
  if (p.close < p.open && c.close > c.open && c.close >= p.open && c.open <= p.close) return ['Bullish Engulfing', 'naik']
  if (p.close > p.open && c.close < c.open && c.open >= p.close && c.close <= p.open) return ['Bearish Engulfing', 'turun']
  if (lower > 2 * body && upper < body && body / rng < 0.4) return ['Hammer', 'naik']
  if (upper > 2 * body && lower < body && body / rng < 0.4) return ['Shooting Star', 'turun']
  if (body / rng < 0.1) return ['Doji', 'netral']
  return [c.close > c.open ? 'Bar hijau' : 'Bar merah', c.close > c.open ? 'naik' : 'turun']
}

export default function Practice({ stocks = [] }) {
  const [score, setScore]     = useState(loadScore)
  const [round, setRound]     = useState(null)   // { symbol, bars, answerBar, futureBars }
  const [phase, setPhase]     = useState('load') // load | guess | reveal
  const [guess, setGuess]     = useState(null)   // 'up' | 'down'
  const [err, setErr]         = useState(null)

  const eligible = useMemo(() => stocks.filter(s => (s.data_points || 0) >= WINDOW + 30), [stocks])

  const saveScore = (s) => { setScore(s); localStorage.setItem(SCORE_KEY, JSON.stringify(s)) }

  const newRound = async () => {
    setPhase('load'); setGuess(null); setErr(null)
    try {
      if (!eligible.length) throw new Error('Butuh minimal 1 saham dengan ≥90 hari data — tambah saham dulu di Watchlist.')
      const pick = eligible[Math.floor(Math.random() * eligible.length)]
      const resp = await api.stocks.get(pick.symbol, 2000)
      const all = resp?.prices || []
      if (all.length < WINDOW + 10) throw new Error(`Data ${pick.symbol} kurang panjang, coba lagi.`)
      // titik potong acak: sisakan ≥4 bar masa depan untuk konteks reveal
      const cut = WINDOW + Math.floor(Math.random() * (all.length - WINDOW - 4))
      setRound({
        symbol: pick.symbol,
        bars: all.slice(cut - WINDOW, cut),
        answerBar: all[cut],
        futureBars: all.slice(cut + 1, cut + 4),
      })
      setPhase('guess')
    } catch (e) { setErr(e.message); setPhase('guess') }
  }

  useEffect(() => { newRound() }, [])   // first round on mount

  const answer = (dir) => {
    if (phase !== 'guess' || !round) return
    setGuess(dir)
    const lastClose = round.bars[round.bars.length - 1].close
    const up = round.answerBar.close > lastClose
    const correct = (dir === 'up') === up
    const streak = correct ? score.streak + 1 : 0
    saveScore({
      total: score.total + 1,
      correct: score.correct + (correct ? 1 : 0),
      streak,
      best: Math.max(score.best, streak),
    })
    setPhase('reveal')
  }

  // ── derived (analisis edukatif) ────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!round) return null
    const closes = round.bars.map(b => b.close)
    const last = closes[closes.length - 1]
    const s20 = sma(closes, 20), s50 = sma(closes, 50)
    const trend = s50 == null ? 'Sideways' : last > s50 && s20 > s50 ? 'Naik' : last < s50 && s20 < s50 ? 'Turun' : 'Sideways'
    const r = rsi14(closes)
    const [pattern, patternDir] = candleLabel(round.bars)
    const up = round.answerBar.close > last
    const chg = (round.answerBar.close / last - 1) * 100
    return { trend, rsi: r, pattern, patternDir, up, chg, lastClose: last }
  }, [round])

  const correct = phase === 'reveal' && guess != null && analysis != null && ((guess === 'up') === analysis.up)
  const accuracy = score.total > 0 ? (score.correct / score.total) * 100 : 0

  // ── chart series ───────────────────────────────────────────────────────────
  const series = useMemo(() => {
    if (!round) return []
    const shown = phase === 'reveal'
      ? [...round.bars, round.answerBar, ...round.futureBars]
      : round.bars
    return [{
      data: shown.map((b, i) => ({ x: i, y: [b.open, b.high, b.low, b.close] })),
    }]
  }, [round, phase])

  const chartOpts = useMemo(() => ({
    ...APEX_DARK,
    chart: { ...APEX_DARK.chart, type: 'candlestick', height: 340, toolbar: { show: false }, animations: { enabled: true, speed: 350 } },
    plotOptions: { candlestick: { colors: { upward: '#2ebd85', downward: '#f6465d' } } },
    // sembunyikan tanggal supaya tidak bisa "hafal" — sumbu pakai index
    xaxis: { type: 'numeric', labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { labels: { style: { colors: '#8a8f98', fontSize: '10px' }, formatter: v => fmt.price(v) } },
    grid: { borderColor: 'rgba(255,255,255,0.06)' },
    tooltip: { theme: 'dark' },
    annotations: phase === 'reveal' && round ? {
      xaxis: [{ x: WINDOW - 0.5, borderColor: '#5e6ad2', strokeDashArray: 4, label: { text: 'tebakanmu di sini', orientation: 'horizontal', style: { background: '#5e6ad2', color: '#fff', fontSize: '9px' } } }],
    } : {},
  }), [phase, round])

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto">
      {/* ── Hero + skor ────────────────────────────────────── */}
      <div className="text-center mb-5 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          <span className="float-y">🎮</span> <span className="text-gradient-animate">Latihan Prediksi</span>
        </h1>
        <p className="text-xs text-tv-muted mt-1.5">Chart asli IDX, saham & tanggal dirahasiakan. Tebak arah candle besok — lalu pelajari kenapa.</p>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Akurasi', val: `${accuracy.toFixed(0)}%`, tone: accuracy >= 55 ? 'text-tv-green' : accuracy >= 45 ? 'text-tv-yellow' : 'text-tv-red' },
          { label: 'Benar', val: `${score.correct}/${score.total}`, tone: 'text-tv-text' },
          { label: 'Streak', val: `${score.streak} 🔥`, tone: 'text-tv-text' },
          { label: 'Best', val: score.best, tone: 'text-tv-purple' },
        ].map(c => (
          <div key={c.label} className="bg-tv-card border border-tv-border rounded-xl px-3 py-2.5 text-center">
            <div className="text-[9px] text-tv-muted uppercase font-bold">{c.label}</div>
            <div className={`text-base font-extrabold tabular-nums ${c.tone}`}>{c.val}</div>
          </div>
        ))}
      </div>

      {err && (
        <div className="text-center py-10 text-tv-muted text-sm">
          ⚠️ {err}
          <div className="mt-3"><button onClick={newRound} className="px-4 py-2 text-xs rounded-xl border border-tv-border hover:border-tv-blue/40 hover:text-tv-blue transition-all">Coba lagi</button></div>
        </div>
      )}

      {!err && (
        <div className="bg-tv-card border border-tv-border rounded-2xl p-4 animate-slide-up">
          {/* header misteri / reveal */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-tv-muted">
              {phase === 'reveal' && round
                ? <>📌 Jawaban: <span className="text-tv-blue">{round.symbol}</span> · {round.answerBar.date}</>
                : <>Saham: <span className="text-tv-purple">???</span> · Periode: <span className="text-tv-purple">???</span></>}
            </span>
            <span className="text-[10px] text-tv-muted">{WINDOW} candle terakhir</span>
          </div>

          {phase === 'load' ? (
            <div className="h-[340px] rounded-xl shimmer-bg" />
          ) : (
            <Suspense fallback={<div className="h-[340px] rounded-xl shimmer-bg" />}>
              <ReactApexChart type="candlestick" height={340} series={series} options={chartOpts} />
            </Suspense>
          )}

          {/* ── tombol tebak / hasil ──────────────────────────── */}
          {phase === 'guess' && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => answer('up')}
                className="flex-1 max-w-[220px] py-3.5 rounded-xl font-extrabold text-sm border-2 border-tv-green/40 bg-tv-green/10 text-tv-green
                  transition-all duration-200 hover:bg-tv-green/20 hover:scale-[1.03] hover:shadow-[0_0_24px_rgba(46,189,133,0.3)] active:scale-95">
                📈 NAIK
              </button>
              <button onClick={() => answer('down')}
                className="flex-1 max-w-[220px] py-3.5 rounded-xl font-extrabold text-sm border-2 border-tv-red/40 bg-tv-red/10 text-tv-red
                  transition-all duration-200 hover:bg-tv-red/20 hover:scale-[1.03] hover:shadow-[0_0_24px_rgba(246,70,93,0.3)] active:scale-95">
                📉 TURUN
              </button>
            </div>
          )}

          {phase === 'reveal' && analysis && (
            <div className="mt-4 space-y-3 animate-slide-up">
              {/* hasil */}
              <div className={`pop-in rounded-xl border-2 p-4 text-center ${correct ? 'border-tv-green/40 bg-tv-green/5' : 'border-tv-red/40 bg-tv-red/5'}`}>
                <div className={`text-xl font-extrabold ${correct ? 'text-tv-green' : 'text-tv-red'}`}>
                  {correct ? '✅ BENAR!' : '❌ SALAH'}
                </div>
                <div className="text-xs text-tv-muted mt-1">
                  Besoknya {analysis.up ? 'NAIK' : 'TURUN'} <b className={analysis.up ? 'text-tv-green' : 'text-tv-red'}>{analysis.chg >= 0 ? '+' : ''}{analysis.chg.toFixed(2)}%</b>
                  {' '}(close {fmt.price(analysis.lastClose)} → {fmt.price(round.answerBar.close)})
                  {correct && score.streak > 1 && <span className="ml-1">· streak {score.streak} 🔥</span>}
                </div>
              </div>

              {/* bedah analisis — bagian informatif */}
              <div className="bg-tv-bg border border-tv-border rounded-xl p-4">
                <div className="text-[10px] font-bold text-tv-muted uppercase mb-2">🔬 Bedah: apa kata analisis sebelum candle ini?</div>
                <div className="grid sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-tv-card rounded-lg p-2.5 border border-tv-border">
                    <div className="text-[9px] text-tv-muted uppercase">Tren (SMA20/50)</div>
                    <div className={`font-bold ${analysis.trend === 'Naik' ? 'text-tv-green' : analysis.trend === 'Turun' ? 'text-tv-red' : 'text-tv-yellow'}`}>{analysis.trend}</div>
                  </div>
                  <div className="bg-tv-card rounded-lg p-2.5 border border-tv-border">
                    <div className="text-[9px] text-tv-muted uppercase">RSI 14</div>
                    <div className="font-bold">{analysis.rsi?.toFixed(0) ?? '—'} <span className="text-[10px] text-tv-muted font-normal">{analysis.rsi >= 70 ? '(overbought)' : analysis.rsi <= 30 ? '(oversold)' : '(netral)'}</span></div>
                  </div>
                  <div className="bg-tv-card rounded-lg p-2.5 border border-tv-border">
                    <div className="text-[9px] text-tv-muted uppercase">Candle terakhir</div>
                    <div className="font-bold">{analysis.pattern} <span className={`text-[10px] font-normal ${analysis.patternDir === 'naik' ? 'text-tv-green' : analysis.patternDir === 'turun' ? 'text-tv-red' : 'text-tv-muted'}`}>→ bias {analysis.patternDir}</span></div>
                  </div>
                </div>
                <p className="text-[11px] text-tv-muted mt-3 leading-relaxed">
                  {analysis.trend !== 'Sideways'
                    ? <>Tren <b className="text-tv-text">{analysis.trend.toLowerCase()}</b> — aturan #1 price action: candle tunggal lebih sering <i>melanjutkan tren</i> daripada melawannya. </>
                    : <>Pasar <b className="text-tv-text">sideways</b> — arah harian nyaris koin lempar; di sinilah trader disiplin memilih <i>tidak trading</i>. </>}
                  {analysis.rsi >= 70 && 'RSI overbought menaikkan peluang koreksi. '}
                  {analysis.rsi <= 30 && 'RSI oversold menaikkan peluang pantulan. '}
                  Satu candle = noise; yang menghasilkan uang adalah <b className="text-tv-text">probabilitas + risk management</b>, bukan tebakan sempurna. Akurasi 55% dengan R/R 1:2 sudah sangat profitable.
                </p>
              </div>

              <button onClick={newRound}
                className="w-full py-3 rounded-xl font-bold text-sm bg-tv-accent text-white transition-all
                  hover:bg-tv-accent/80 hover:shadow-[0_0_20px_rgba(94,106,210,0.4)] active:scale-[0.98]">
                Ronde Berikutnya ▶
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-tv-muted text-center pt-4">
        Data candle asli dari saham IDX di watchlist-mu, titik waktu diacak. Skor tersimpan lokal.
      </p>
    </div>
  )
}
