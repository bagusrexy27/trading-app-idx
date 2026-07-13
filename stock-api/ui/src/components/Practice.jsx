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

// Kumpulan sinyal pra-tebakan: tiap sinyal punya arah + alasan singkat.
// Dipakai untuk bedah "kenapa naik/turun" — di reveal, tiap sinyal diberi ✓/✗.
function buildSignals(bars) {
  const closes = bars.map(b => b.close)
  const last = bars[bars.length - 1]
  const signals = []

  // 1. Tren — posisi harga & SMA20 vs SMA50
  const s20 = sma(closes, 20), s50 = sma(closes, 50)
  if (s50 != null) {
    const dir = last.close > s50 && s20 > s50 ? 'naik' : last.close < s50 && s20 < s50 ? 'turun' : 'netral'
    signals.push({
      nama: 'Tren (SMA20/50)', arah: dir,
      detail: dir === 'netral'
        ? 'Harga & MA saling silang — tidak ada tren jelas'
        : `Harga ${last.close > s50 ? 'di atas' : 'di bawah'} SMA50 dan SMA20 ${s20 > s50 ? '>' : '<'} SMA50 — tren ${dir}`,
    })
  }

  // 2. RSI 14
  const r = rsi14(closes)
  if (r != null) {
    signals.push({
      nama: 'RSI 14', arah: r >= 70 ? 'turun' : r <= 30 ? 'naik' : 'netral',
      detail: r >= 70 ? `RSI ${r.toFixed(0)} overbought — rawan koreksi`
        : r <= 30 ? `RSI ${r.toFixed(0)} oversold — rawan pantulan`
        : `RSI ${r.toFixed(0)} netral — tidak ekstrem`,
    })
  }

  // 3. Pola candle terakhir
  const [pattern, patternDir] = candleLabel(bars)
  signals.push({
    nama: `Pola: ${pattern}`, arah: patternDir,
    detail: patternDir === 'netral' ? 'Doji/netral — pasar ragu' : `${pattern} — bias ${patternDir}`,
  })

  // 4. Volume candle terakhir vs rata-rata 20 hari
  const avgVol = sma(bars.map(b => b.volume), 20)
  if (avgVol) {
    const ratio = last.volume / avgVol
    const lastDir = last.close > last.open ? 'naik' : last.close < last.open ? 'turun' : 'netral'
    const strong = ratio >= 1.5
    signals.push({
      nama: 'Volume', arah: strong ? lastDir : 'netral',
      detail: strong
        ? `Volume ${ratio.toFixed(1)}× rata-rata — candle ${lastDir === 'naik' ? 'hijau' : 'merah'} terkonfirmasi tenaga besar`
        : `Volume ${ratio.toFixed(1)}× rata-rata — biasa saja, tanpa konfirmasi kuat`,
    })
  }

  // 5. Posisi vs support/resistance (swing low/high window, exclude 3 bar terakhir)
  const body = bars.slice(0, -3)
  if (body.length > 10) {
    const support = Math.min(...body.map(b => b.low))
    const resist = Math.max(...body.map(b => b.high))
    const pos = (last.close - support) / (resist - support || 1)   // 0 = di support, 1 = di resistance
    signals.push({
      nama: 'Support/Resistance',
      arah: pos <= 0.15 ? 'naik' : pos >= 0.85 ? 'turun' : 'netral',
      detail: pos <= 0.15 ? `Harga nempel support ${fmt.price(support)} — area pantulan umum`
        : pos >= 0.85 ? `Harga nempel resistance ${fmt.price(resist)} — area tolakan umum`
        : `Di tengah range ${fmt.price(support)}–${fmt.price(resist)} — jauh dari level kunci`,
    })
  }

  // 6. Momentum 3 candle terakhir
  const last3 = bars.slice(-3)
  if (last3.length === 3) {
    const ups = last3.filter(b => b.close > b.open).length
    signals.push({
      nama: 'Momentum 3 hari',
      arah: ups === 3 ? 'naik' : ups === 0 ? 'turun' : 'netral',
      detail: ups === 3 ? '3 candle hijau beruntun — momentum beli (tapi hati-hati jenuh)'
        : ups === 0 ? '3 candle merah beruntun — momentum jual (tapi rawan pantulan teknikal)'
        : `${ups} hijau ${3 - ups} merah dari 3 hari — campur, tidak ada momentum searah`,
    })
  }

  return signals
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
    const tie = round.answerBar.close === lastClose
    const up = round.answerBar.close > lastClose
    // seri (close sama persis) tidak dihitung salah — dianggap benar apa pun tebakannya
    const correct = tie || (dir === 'up') === up
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
    const last = round.bars[round.bars.length - 1].close
    const a = round.answerBar
    const up = a.close > last
    const tie = a.close === last
    const chg = (a.close / last - 1) * 100
    // anatomi candle jawaban: gap open + pergerakan intraday
    const gap = a.open - last
    const gapPct = (gap / last) * 100
    const intraday = a.close - a.open
    const candleGreen = a.close > a.open
    // divergensi: warna candle ≠ arah close-to-close (biang "kok hijau tapi salah?")
    const divergence = !tie && candleGreen !== up && intraday !== 0
    const signals = buildSignals(round.bars)
    const naik = signals.filter(s => s.arah === 'naik').length
    const turun = signals.filter(s => s.arah === 'turun').length
    const konsensus = naik > turun ? 'naik' : turun > naik ? 'turun' : 'netral'
    return { up, tie, chg, lastClose: last, gap, gapPct, intraday, candleGreen, divergence, signals, naik, turun, konsensus }
  }, [round])

  const correct = phase === 'reveal' && guess != null && analysis != null && (analysis.tie || (guess === 'up') === analysis.up)
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
            <>
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
              <p className="text-[10px] text-tv-muted text-center mt-2">
                Yang dinilai: <b className="text-tv-text">close besok vs close terakhir</b> — bukan warna candle. Candle hijau bisa tetap "turun" kalau open-nya gap ke bawah.
              </p>
            </>
          )}

          {phase === 'reveal' && analysis && (
            <div className="mt-4 space-y-3 animate-slide-up">
              {/* hasil */}
              <div className={`pop-in rounded-xl border-2 p-4 text-center ${correct ? 'border-tv-green/40 bg-tv-green/5' : 'border-tv-red/40 bg-tv-red/5'}`}>
                <div className={`text-xl font-extrabold ${correct ? 'text-tv-green' : 'text-tv-red'}`}>
                  {analysis.tie ? '🤝 SERI — dihitung benar' : correct ? '✅ BENAR!' : '❌ SALAH'}
                </div>
                <div className="text-xs text-tv-muted mt-1">
                  {analysis.tie
                    ? <>Close sama persis ({fmt.price(analysis.lastClose)})</>
                    : <>Besoknya {analysis.up ? 'NAIK' : 'TURUN'} <b className={analysis.up ? 'text-tv-green' : 'text-tv-red'}>{analysis.chg >= 0 ? '+' : ''}{analysis.chg.toFixed(2)}%</b>
                      {' '}(close {fmt.price(analysis.lastClose)} → {fmt.price(round.answerBar.close)})</>}
                  {correct && score.streak > 1 && <span className="ml-1">· streak {score.streak} 🔥</span>}
                </div>
              </div>

              {/* anatomi candle jawaban — kenapa hijau/merah ≠ naik/turun */}
              {analysis.divergence && (
                <div className="rounded-xl border border-tv-yellow/40 bg-tv-yellow/5 p-3 text-[11px] leading-relaxed">
                  <b className="text-tv-yellow">⚠️ Candle-nya {analysis.candleGreen ? 'HIJAU' : 'MERAH'} tapi dinilai {analysis.up ? 'NAIK' : 'TURUN'} — ini bukan bug.</b>{' '}
                  <span className="text-tv-muted">
                    Harga open {analysis.gap > 0 ? 'gap NAIK' : 'gap TURUN'} <b className="text-tv-text">{analysis.gapPct >= 0 ? '+' : ''}{analysis.gapPct.toFixed(2)}%</b> dari close kemarin
                    ({fmt.price(analysis.lastClose)} → open {fmt.price(round.answerBar.open)}), lalu intraday bergerak {analysis.intraday > 0 ? 'naik' : 'turun'} {fmt.price(Math.abs(analysis.intraday))}.
                    Warna candle = open→close <i>hari itu</i>; penilaian = close→close <i>antar hari</i>. Dua hal berbeda — gap yang menentukan.
                  </span>
                </div>
              )}

              {/* bedah analisis — tiap sinyal dinilai benar/salah */}
              <div className="bg-tv-bg border border-tv-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-tv-muted uppercase">🔬 Bedah: {analysis.signals.length} sinyal sebelum candle ini</span>
                  <span className="text-[10px] text-tv-muted">
                    konsensus: <b className={analysis.konsensus === 'naik' ? 'text-tv-green' : analysis.konsensus === 'turun' ? 'text-tv-red' : 'text-tv-yellow'}>{analysis.konsensus.toUpperCase()}</b> ({analysis.naik}↑ {analysis.turun}↓)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {analysis.signals.map(s => {
                    const actual = analysis.up ? 'naik' : 'turun'
                    const hit = analysis.tie ? null : s.arah === 'netral' ? null : s.arah === actual
                    return (
                      <div key={s.nama} className="flex items-start gap-2 bg-tv-card rounded-lg px-3 py-2 border border-tv-border text-[11px]">
                        <span className="w-5 text-center shrink-0">{hit == null ? '·' : hit ? '✓' : '✗'}</span>
                        <div className="min-w-0">
                          <span className="font-bold">{s.nama}</span>
                          <span className={`ml-1.5 font-semibold ${s.arah === 'naik' ? 'text-tv-green' : s.arah === 'turun' ? 'text-tv-red' : 'text-tv-yellow'}`}>→ {s.arah}</span>
                          <div className="text-tv-muted mt-0.5">{s.detail}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-tv-muted mt-3 leading-relaxed">
                  {analysis.konsensus !== 'netral'
                    ? <>Mayoritas sinyal bilang <b className="text-tv-text">{analysis.konsensus}</b>{!analysis.tie && ((analysis.konsensus === 'naik') === analysis.up
                        ? <> — dan pasar menurutinya. Begini rasanya trading <i>dengan</i> konfluensi.</>
                        : <> — tapi pasar melawan. Ini pelajaran penting: sinyal = probabilitas, bukan kepastian.</>)}</>
                    : <>Sinyal berimbang — arah harian nyaris koin lempar; di sinilah trader disiplin memilih <i>tidak trading</i>.</>}
                  {' '}Satu candle = noise; yang menghasilkan uang adalah <b className="text-tv-text">probabilitas + risk management</b>. Akurasi 55% dengan R/R 1:2 sudah sangat profitable.
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
