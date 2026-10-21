import { useState, useEffect, useMemo, useRef } from 'react'
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import { api } from '../api'
import { fmt, LW_BASE } from '../utils'
import MoneyInput from './MoneyInput'
import { DEFAULT_SCORE, DAILY_GOAL, BADGES, nextScore, dayStr, liveDayStreak, simulateTrade } from '../practiceScore'

// ── Latihan Trading Plan ─────────────────────────────────────────────────────
// Game: chart historis acak (saham & tanggal disembunyikan), user pasang
// Entry / TP / SL, lalu HORIZON candle berikutnya dibuka: TP kena duluan = benar.
// Dinilai juga dalam R (untung ÷ risiko) supaya TP mepet + SL jauh tidak "menang".
// Skor & streak tersimpan di localStorage.

const SCORE_KEY = 'idx_practice_v2'   // v1 = game tebak arah, aturannya beda — statistik dimulai ulang
const WINDOW = 60          // candle yang ditampilkan
const HORIZON = 10         // candle masa depan untuk menjalankan trade
const RESULT_TEXT = {
  tp: ['✅ TP KENA — BENAR', 'text-tv-green', 'border-tv-green/40 bg-tv-green/5'],
  sl: ['❌ KENA SL — SALAH', 'text-tv-red', 'border-tv-red/40 bg-tv-red/5'],
  timeout: [`⏳ ${HORIZON} HARI HABIS — TP tidak kena`, 'text-tv-yellow', 'border-tv-yellow/40 bg-tv-yellow/5'],
  unfilled: ['🚫 ORDER TIDAK TERISI', 'text-tv-muted', 'border-tv-border bg-tv-bg'],
}
const fmtR = r => `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`
// merge dengan default: skor lama (tanpa field streak harian/badge) tetap terbaca
const loadScore = () => {
  try { return { ...DEFAULT_SCORE, ...JSON.parse(localStorage.getItem(SCORE_KEY)) } }
  catch { return { ...DEFAULT_SCORE } }
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
  const [round, setRound]     = useState(null)   // { symbol, bars, futureBars }
  const [phase, setPhase]     = useState('load') // load | guess | reveal
  const [plan, setPlan]       = useState({ entry: '', tp: '', sl: '' })
  const [trade, setTrade]     = useState(null)   // hasil simulateTrade
  const [err, setErr]         = useState(null)
  const [earned, setEarned]   = useState([])     // badge baru dari trade terakhir

  const eligible = useMemo(() => stocks.filter(s => (s.data_points || 0) >= WINDOW + 30), [stocks])

  const saveScore = (s) => {
    setScore(s)
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)) } catch { /* private mode: skor cuma di memori */ }
  }

  const newRound = async () => {
    setPhase('load'); setTrade(null); setErr(null); setEarned([])
    try {
      if (!eligible.length) throw new Error('Butuh minimal 1 saham dengan ≥90 hari data — tambah saham dulu di Watchlist.')
      const pick = eligible[Math.floor(Math.random() * eligible.length)]
      const resp = await api.stocks.get(pick.symbol, 2000)
      const all = resp?.prices || []
      if (all.length < WINDOW + HORIZON) throw new Error(`Data ${pick.symbol} kurang panjang, coba lagi.`)
      // titik potong acak: sisakan HORIZON bar masa depan untuk menjalankan trade
      const cut = WINDOW + Math.floor(Math.random() * (all.length - WINDOW - HORIZON + 1))
      const bars = all.slice(cut - WINDOW, cut)
      const last = bars[bars.length - 1].close
      setRound({ symbol: pick.symbol, bars, futureBars: all.slice(cut, cut + HORIZON) })
      // default: entry di close terakhir, SL -3%, TP +6% (R/R 1:2) — tinggal digeser
      setPlan({ entry: last, sl: Math.round(last * 0.97), tp: Math.round(last * 1.06) })
      setPhase('guess')
    } catch (e) { setErr(e.message); setPhase('guess') }
  }

  useEffect(() => { newRound() }, [])   // first round on mount

  const entry = Number(plan.entry), tp = Number(plan.tp), sl = Number(plan.sl)
  const planErr = !(entry > 0 && tp > 0 && sl > 0) ? 'Isi Entry, TP, dan SL dengan harga.'
    : !(sl < entry && entry < tp) ? 'Harus SL < Entry < TP (ini latihan beli/long).'
    : null
  const rr = planErr ? null : (tp - entry) / (entry - sl)

  const submit = () => {
    if (phase !== 'guess' || !round || planErr) return
    const t = simulateTrade(round.bars[round.bars.length - 1].close, round.futureBars, { entry, tp, sl })
    setTrade(t)
    // order tidak terisi = tidak ada trade → tidak dinilai
    if (t.result !== 'unfilled') {
      // konsensus sinyal dihitung dari bar sebelum entry — tidak bocor jawaban
      const next = nextScore(score, { correct: t.result === 'tp', followed: analysis?.konsensus === 'naik', r: t.r, today: dayStr() })
      saveScore(next.score)
      setEarned(next.earned)
    }
    setPhase('reveal')
  }

  // ── derived (analisis edukatif) ────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (!round) return null
    const signals = buildSignals(round.bars)
    const naik = signals.filter(s => s.arah === 'naik').length
    const turun = signals.filter(s => s.arah === 'turun').length
    const konsensus = naik > turun ? 'naik' : turun > naik ? 'turun' : 'netral'
    return { lastClose: round.bars[round.bars.length - 1].close, signals, naik, turun, konsensus }
  }, [round])

  // arah "sebenarnya" untuk menilai sinyal: TP = naik, SL = turun, timeout = tanda R
  const actual = !trade || trade.result === 'unfilled' ? null
    : trade.result === 'tp' ? 'naik' : trade.result === 'sl' ? 'turun' : trade.r >= 0 ? 'naik' : 'turun'
  const accuracy = score.total > 0 ? (score.correct / score.total) * 100 : 0
  const today = dayStr()
  const roundsToday = score.day === today ? score.dayRounds : 0
  const dayStreak = liveDayStreak(score, today)

  // ── chart ──────────────────────────────────────────────────────────────────
  const shown = useMemo(() => !round ? [] : phase === 'reveal' ? [...round.bars, ...round.futureBars] : round.bars, [round, phase])
  const lines = planErr ? [] : [['TP', tp, '#2ebd85'], ['Entry', entry, '#5e6ad2'], ['SL', sl, '#f6465d']]

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto">
      {/* ── Hero + skor ────────────────────────────────────── */}
      <div className="text-center mb-5 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          <span className="float-y">🎮</span> <span className="text-gradient-animate">Latihan Trading Plan</span>
        </h1>
        <p className="text-xs text-tv-muted mt-1.5">Chart asli IDX, saham & tanggal dirahasiakan. Pasang Entry, TP, dan SL — lalu lihat {HORIZON} hari berikutnya.</p>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'TP kena', val: `${accuracy.toFixed(0)}%`, tone: 'text-tv-text', title: 'Persentase trade yang kena TP duluan' },
          { label: 'Benar', val: `${score.correct}/${score.total}`, tone: 'text-tv-text' },
          { label: 'Total R', val: fmtR(score.totalR), tone: score.totalR >= 0 ? 'text-tv-green' : 'text-tv-red', title: 'Jumlah untung/rugi dalam satuan risiko. +1R = untung sebesar jarak Entry→SL' },
          { label: 'Streak', val: `${score.streak} 🔥`, tone: 'text-tv-text', title: `Terbaik ${score.best}` },
        ].map(c => (
          <div key={c.label} title={c.title} className="bg-tv-card border border-tv-border rounded-xl px-3 py-2.5 text-center">
            <div className="text-[9px] text-tv-muted uppercase font-bold">{c.label}</div>
            <div className={`text-base font-extrabold tabular-nums ${c.tone}`}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* ── target harian + streak harian + badge ─────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-5 px-1 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="text-tv-muted" title={`Target ${DAILY_GOAL} ronde per hari`}>
            <span className="text-sm tracking-[0.15em] text-tv-blue">
              {'●'.repeat(Math.min(roundsToday, DAILY_GOAL))}
              <span className="text-tv-border">{'●'.repeat(Math.max(DAILY_GOAL - roundsToday, 0))}</span>
            </span>
            <span className="ml-1.5 tabular-nums">{Math.min(roundsToday, DAILY_GOAL)}/{DAILY_GOAL} hari ini</span>
          </span>
          <span className="text-tv-muted" title={`Hari beruntun mencapai target · terbaik ${score.bestDayStreak}`}>
            📅 streak <b className="text-tv-text tabular-nums">{dayStreak}</b> hari
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BADGES.map(b => {
            const got = score.badges.includes(b.id)
            return (
              <span key={b.id} title={`${b.nama} — ${b.syarat}${got ? ' ✓' : ''}`}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold
                  ${got ? 'border-tv-purple/40 bg-tv-purple/10 text-tv-text' : 'border-tv-border text-tv-muted opacity-50 grayscale'}`}>
                {b.emoji} {b.nama}
              </span>
            )
          })}
        </div>
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
                ? <>📌 Jawaban: <span className="text-tv-blue">{round.symbol}</span> · {round.futureBars[0].date}</>
                : <>Saham: <span className="text-tv-purple">???</span> · Periode: <span className="text-tv-purple">???</span></>}
            </span>
            <span className="text-[10px] text-tv-muted">{WINDOW} candle terakhir</span>
          </div>

          {phase === 'load' ? (
            <div className="h-[340px] rounded-xl shimmer-bg" />
          ) : (
            <PracticeChart bars={shown} lines={lines} reveal={phase === 'reveal'} />
          )}

          {/* ── form plan / hasil ──────────────────────────────── */}
          {phase === 'guess' && round && (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { key: 'entry', label: 'Entry (beli)', tone: 'text-tv-blue border-tv-blue/40' },
                  { key: 'tp', label: 'Take Profit', tone: 'text-tv-green border-tv-green/40' },
                  { key: 'sl', label: 'Stop Loss', tone: 'text-tv-red border-tv-red/40' },
                ].map(f => (
                  <label key={f.key} className="text-[10px] font-bold text-tv-muted uppercase">
                    {f.label}
                    <MoneyInput value={plan[f.key]}
                      onChange={v => setPlan(p => ({ ...p, [f.key]: v }))}
                      className={`mt-1 w-full bg-tv-input border rounded-lg px-3 py-2 text-sm font-bold tabular-nums ${f.tone}`} />
                    {f.key !== 'entry' && entry > 0 && Number(plan[f.key]) > 0 && (
                      <span className="block mt-0.5 font-normal normal-case tabular-nums">
                        {((Number(plan[f.key]) / entry - 1) * 100).toFixed(1)}% dari entry
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="text-[11px] text-center mt-2 text-tv-muted">
                Close terakhir <b className="text-tv-text">{fmt.price(analysis.lastClose)}</b>
                {rr != null && <> · R/R <b className={rr >= 1.5 ? 'text-tv-green' : rr >= 1 ? 'text-tv-yellow' : 'text-tv-red'}>1 : {rr.toFixed(2)}</b></>}
                {planErr && <div className="text-tv-red mt-1">{planErr}</div>}
              </div>
              <button onClick={submit} disabled={!!planErr}
                className="w-full mt-3 py-3.5 rounded-xl font-extrabold text-sm border-2 border-tv-blue/40 bg-tv-blue/10 text-tv-blue
                  transition-all duration-200 hover:bg-tv-blue/20 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none">
                ▶ Jalankan {HORIZON} hari ke depan
              </button>
              <p className="text-[10px] text-tv-muted text-center mt-2 leading-relaxed">
                <b className="text-tv-text">Benar</b> = harga menyentuh TP sebelum SL dalam {HORIZON} hari.
                Entry di bawah harga sekarang = tunggu harga turun ke situ; di atas = beli saat tembus. Kalau tidak pernah tersentuh, order tidak terisi (tidak dinilai).
                {' '}<b className="text-tv-text">R</b> = untung ÷ risiko: TP mepet + SL jauh mungkin sering "benar", tapi Total R-nya bisa minus.
              </p>
            </>
          )}

          {phase === 'reveal' && analysis && trade && (
            <div className="mt-4 space-y-3 animate-slide-up">
              {/* hasil */}
              <div className={`pop-in rounded-xl border-2 p-4 text-center ${RESULT_TEXT[trade.result][2]}`}>
                <div className={`text-xl font-extrabold ${RESULT_TEXT[trade.result][1]}`}>
                  {RESULT_TEXT[trade.result][0]}
                  {trade.result !== 'unfilled' && <span className="ml-2 tabular-nums">{fmtR(trade.r)}</span>}
                </div>
                <div className="text-xs text-tv-muted mt-1 leading-relaxed">
                  {trade.result === 'unfilled'
                    ? <>Harga tidak pernah menyentuh entry {fmt.price(entry)} dalam {HORIZON} hari — tidak ada trade, skor tidak berubah.</>
                    : <>Terisi hari ke-{trade.fillIdx + 1} di {fmt.price(trade.fillPrice)}
                      {' '}→ {trade.result === 'timeout' ? `ditutup di close hari ke-${HORIZON}` : `${trade.result === 'tp' ? 'TP' : 'SL'} kena hari ke-${trade.exitIdx + 1}`} di {fmt.price(trade.exitPrice)}
                      {' '}(<b className={trade.exitPrice >= trade.fillPrice ? 'text-tv-green' : 'text-tv-red'}>{trade.exitPrice >= trade.fillPrice ? '+' : ''}{((trade.exitPrice / trade.fillPrice - 1) * 100).toFixed(2)}%</b>)
                      {trade.result === 'tp' && score.streak > 1 && <span className="ml-1">· streak {score.streak} 🔥</span>}</>}
                </div>
              </div>

              {earned.length > 0 && (
                <div className="pop-in rounded-xl border border-tv-purple/40 bg-tv-purple/10 px-4 py-2.5 text-center text-xs font-bold">
                  {earned.map(id => BADGES.find(b => b.id === id)).map(b => (
                    <div key={b.id}>🏅 Badge baru: {b.emoji} {b.nama} <span className="font-normal text-tv-muted">— {b.syarat}</span></div>
                  ))}
                </div>
              )}
              {roundsToday === DAILY_GOAL && (
                <div className="pop-in text-center text-[11px] text-tv-blue">
                  ✅ Target {DAILY_GOAL} ronde hari ini tercapai · streak {dayStreak} hari
                </div>
              )}

              {/* bedah analisis — tiap sinyal dinilai benar/salah */}
              <div className="bg-tv-bg border border-tv-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-tv-muted uppercase">🔬 Bedah: {analysis.signals.length} sinyal saat plan dipasang</span>
                  <span className="text-[10px] text-tv-muted">
                    konsensus: <b className={analysis.konsensus === 'naik' ? 'text-tv-green' : analysis.konsensus === 'turun' ? 'text-tv-red' : 'text-tv-yellow'}>{analysis.konsensus.toUpperCase()}</b> ({analysis.naik}↑ {analysis.turun}↓)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {analysis.signals.map(s => {
                    const hit = actual == null || s.arah === 'netral' ? null : s.arah === actual
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
                    ? <>Mayoritas sinyal bilang <b className="text-tv-text">{analysis.konsensus}</b>{actual != null && (analysis.konsensus === actual
                        ? <> — dan pasar menurutinya. Begini rasanya trading <i>dengan</i> konfluensi.</>
                        : <> — tapi pasar melawan. Ini pelajaran penting: sinyal = probabilitas, bukan kepastian.</>)}
                        {analysis.konsensus === 'turun' && <> Beli saat mayoritas sinyal turun = melawan arus.</>}</>
                    : <>Sinyal berimbang — di sinilah trader disiplin sering memilih <i>tidak trading</i>.</>}
                  {' '}Satu trade = noise; yang menghasilkan uang adalah <b className="text-tv-text">probabilitas + risk management</b>. TP kena 40% saja sudah untung kalau R/R-nya 1:2.
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

// Candles on a fake daily clock (index → day) with the time axis hidden, so the
// date can't give the answer away. TP/Entry/SL are price lines; the price scale
// stretches to keep them in view even when they sit outside the candles.
function PracticeChart({ bars, lines, reveal }) {
  const ref = useRef(null)
  const chartRef = useRef(null)
  const series = useRef(null)
  const markers = useRef(null)
  const priceLines = useRef([])

  useEffect(() => {
    const chart = createChart(ref.current, {
      ...LW_BASE,
      timeScale: { ...LW_BASE.timeScale, visible: false },
      localization: { priceFormatter: v => fmt.price(Math.round(v)), timeFormatter: () => '' },
    })
    series.current = chart.addSeries(CandlestickSeries, {
      upColor: '#2ebd85', downColor: '#f6465d', wickUpColor: '#2ebd85', wickDownColor: '#f6465d', borderVisible: false,
    })
    markers.current = createSeriesMarkers(series.current, [])
    chartRef.current = chart
    return () => chart.remove()
  }, [])

  const key = lines.map(l => l[1]).join('|')
  useEffect(() => {
    const s = series.current
    s.setData(bars.map((b, i) => ({ time: (i + 1) * 86400, open: b.open, high: b.high, low: b.low, close: b.close })))
    priceLines.current.forEach(pl => s.removePriceLine(pl))
    priceLines.current = lines.map(([title, price, color]) =>
      s.createPriceLine({ price, color, lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title }))
    const prices = lines.map(l => l[1])
    s.applyOptions({
      autoscaleInfoProvider: base => {
        const r = base()
        if (!r || !prices.length) return r
        return { ...r, priceRange: {
          minValue: Math.min(r.priceRange.minValue, ...prices),
          maxValue: Math.max(r.priceRange.maxValue, ...prices),
        } }
      },
    })
    markers.current.setMarkers(reveal && bars.length > WINDOW
      ? [{ time: (WINDOW + 1) * 86400, position: 'aboveBar', shape: 'arrowDown', color: '#8a8f98', text: 'plan dipasang di sini' }]
      : [])
    chartRef.current.timeScale().fitContent()
  }, [bars, key, reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className="h-[340px]" />
}
