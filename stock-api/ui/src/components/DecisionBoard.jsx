import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { fmt, colorOf, calibShort, REGIME_LABEL } from '../utils'
import { valuationTitle } from './ValuationCard'
import { IconSharia } from './icons'
import OmbakMeter from './OmbakMeter'
import { tip } from '../glossary'
import { ScenarioBar, pickProj } from './Projection'

// Kolom beli memakai gerbang yang sama dengan screener mode=buy
// (handlers/advisor_screen.go): R/R ≥ 1 dan transaksi ≥ 2 M/hari. Saham yang
// BUY tapi tidak lolos jatuh ke "menunggu", bukan ke "hindari".
const MIN_RR = 1, MIN_TURNOVER_BN = 2
const isBuy = r => (r.signal === 'BUY' || r.signal === 'STRONG_BUY') && r.risk_reward >= MIN_RR && r.turnover_bn >= MIN_TURNOVER_BN

// Alasan satu baris: pakai note dari engine kalau ada; kalau tidak, rakit dari
// trend / structure / volume_state — tanpa teks dikarang di frontend.
function reasonOf(r) {
  if (r.note) return r.note
  const bits = []
  if (r.trend?.overall) bits.push(r.trend.overall)
  if (r.structure) bits.push(r.structure)
  if (r.volume_state) bits.push(`Vol ${r.volume_state}`)
  return bits.join(' · ') || '—'
}

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return <div className="h-7 w-16" />
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 64, H = 28
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / range) * (H - 6)).toFixed(1)}`).join(' ')
  const color = positive ? '#2ebd85' : '#f6465d'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ScoreChip({ score }) {
  const tone = score >= 60 ? 'text-tv-green border-tv-green/30 bg-tv-green/10'
    : score >= 40 ? 'text-tv-yellow border-tv-yellow/30 bg-tv-yellow/10'
    : 'text-tv-red border-tv-red/30 bg-tv-red/10'
  return (
    <span className={`text-[11px] font-bold tabular-nums px-2 py-0.5 rounded border ${tone}`}>
      {score}
    </span>
  )
}

function TickerCard({ r, onSelect }) {
  const pct = r.change_pct
  const pos = (pct ?? 0) >= 0
  const buyish = r.signal === 'BUY' || r.signal === 'STRONG_BUY'
  const c = r.calibration
  const proj = buyish ? pickProj(c, 20) : null
  return (
    <button
      onClick={() => onSelect(r.symbol)}
      className="w-full text-left px-3 py-2.5 rounded-xl border border-tv-border bg-tv-card
        hover:border-tv-accent/50 hover:bg-tv-hover/40 transition-all group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-extrabold text-sm tracking-tight group-hover:text-tv-blue transition-colors">{r.symbol}</span>
        {r.syariah && (
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-tv-green border border-tv-green/30 bg-tv-green/10 px-1.5 py-0.5 rounded">
            <IconSharia /> Syariah
          </span>
        )}
        {(r.idx30 || r.lq45) && (
          <span className="text-[9px] font-bold text-tv-blue border border-tv-blue/30 bg-tv-blue/10 px-1.5 py-0.5 rounded">
            {r.idx30 ? 'IDX30' : 'LQ45'}
          </span>
        )}
        {r.valuation?.undervalue && (
          <span title={valuationTitle(r.valuation)}
            className="text-[9px] font-bold text-tv-green border border-tv-green/30 bg-tv-green/10 px-1.5 py-0.5 rounded cursor-help">
            💎 PBV {r.valuation.pbv.toFixed(2)}x
          </span>
        )}
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded border
          ${buyish ? 'text-tv-green border-tv-green/30 bg-tv-green/10' : 'text-tv-red border-tv-red/30 bg-tv-red/10'}`}>
          {r.signal?.replace(/_/g, ' ')}
        </span>
        <ScoreChip score={r.score} />
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tabular-nums">{fmt.price(r.close)}</span>
            {pct != null && (
              <span className={`text-[11px] font-semibold tabular-nums ${colorOf(pct)}`}>
                {fmt.pct(pct)}
              </span>
            )}
            {r.risk_reward > 0 && (
              <span className="text-[10px] text-tv-muted tabular-nums" title={tip('rr')}>R:R 1:{r.risk_reward.toFixed(1)}</span>
            )}
          </div>
          <div className="text-[11px] text-tv-muted truncate mt-0.5" title={reasonOf(r)}>{reasonOf(r)}</div>
          {buyish && calibShort(c) && (
            <div className={`text-[10px] mt-0.5 ${c.avg_pnl_pct > 0 ? 'text-tv-green' : 'text-tv-red'}`}
              title={`Skor ${c.score_lo}–${c.score_hi} saat ${REGIME_LABEL[c.regime] ?? 'semua kondisi IHSG'}: rencana kena TP1 sebelum stop dalam ${c.horizon} hari bursa.`}>
              {c.avg_pnl_pct > 0 ? '' : '⚠️ '}{calibShort(c)} · rata-rata {fmt.pct(c.avg_pnl_pct)}/trade
            </div>
          )}
        </div>
        <Sparkline data={r.sparkline} positive={pos} />
      </div>
      {proj && (
        <div className="mt-2" title={`Dari ${proj.samples} kasus serupa, 20 hari bursa kemudian. 8 dari 10 kasus: ${fmt.pct(proj.band_pct[0])} s/d ${fmt.pct(proj.band_pct[4])}.`}>
          <div className="text-[9px] text-tv-muted uppercase mb-0.5">Proyeksi 20 hari (terukur)</div>
          <ScenarioBar p={proj} compact />
        </div>
      )}
    </button>
  )
}

function Column({ title, tone, rows, onSelect, empty }) {
  return (
    <section className="min-w-0 flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className={`text-sm font-extrabold tracking-tight ${tone}`}>{title}</h2>
        <span className="text-[10px] text-tv-muted tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-tv-muted px-1 py-6 border border-dashed border-tv-border rounded-xl">{empty}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(r => <TickerCard key={r.symbol} r={r} onSelect={onSelect} />)}
        </div>
      )}
    </section>
  )
}

export default function DecisionBoard({ stocks = [], loading: stocksLoading, onSelect, onAdd, onUpdateAll }) {
  const [screen, setScreen] = useState([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('score') // score | rr | volume
  const [shariaOnly, setShariaOnly] = useState(false)
  const [undervalueOnly, setUndervalueOnly] = useState(false)
  const [index, setIndex] = useState('') // '' | 'idx30' | 'lq45'
  const [error, setError] = useState(null)
  const [regime, setRegime] = useState('unknown')
  const [indexInfo, setIndexInfo] = useState({ stale: false, until: '', sharia: false, shariaUntil: '' })

  // Fetch sekali setelah daftar saham termuat, dan ulang tiap daftar berubah
  // (tambah / hapus / update). Sparkline digabung terpisah — tidak memicu fetch.
  useEffect(() => {
    if (stocksLoading) return
    let alive = true
    setLoading(true); setError(null)
    // mode=all + minTurnover=0 supaya saham tidak likuid tetap muncul di "hindari";
    // kolom beli disaring sendiri dengan isBuy.
    api.advisorScreen({ mode: 'all', minTurnover: 0 })
      .then(d => {
        if (!alive) return
        setRegime(d?.regime || 'unknown')
        setIndexInfo({ stale: !!d?.index_stale, until: d?.index_until || '', sharia: !!d?.syariah_stale, shariaUntil: d?.syariah_until || '' })
        setScreen(d?.results || [])
      })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [stocks, stocksLoading])

  const rows = useMemo(() => {
    const bySym = Object.fromEntries(stocks.map(s => [s.symbol, s]))
    return screen.map(r => ({
      ...r,
      sparkline: bySym[r.symbol]?.sparkline,
      change_pct: bySym[r.symbol]?.change_pct,
      // syariah dari screen; fallback ke stocks list kalau ada
      syariah: r.syariah || !!bySym[r.symbol]?.syariah,
    }))
  }, [screen, stocks])

  // 'score' = urutan backend apa adanya (skor → keyakinan → R/R), sama dengan screener.
  const sorted = useMemo(() => {
    const list = rows.filter(r => (!shariaOnly || r.syariah) && (!index || r[index]) && (!undervalueOnly || r.valuation?.undervalue))
    if (sort === 'rr') list.sort((a, b) => (b.risk_reward || 0) - (a.risk_reward || 0))
    if (sort === 'volume') list.sort((a, b) => (b.turnover_bn || 0) - (a.turnover_bn || 0))
    return list
  }, [rows, sort, shariaOnly, index, undervalueOnly])

  const buy = sorted.filter(isBuy)
  const buySyms = new Set(buy.map(r => r.symbol))
  // Hindari: SELL/STRONG_SELL atau skor <40. Urut skor terendah dulu, kecuali user memilih urutan lain.
  const avoid = sorted
    .filter(r => !buySyms.has(r.symbol) && (r.signal === 'SELL' || r.signal === 'STRONG_SELL' || (r.score ?? 100) < 40))
  if (sort === 'score') avoid.reverse()
  const avoidSyms = new Set(avoid.map(r => r.symbol))
  const waiting = sorted.filter(r => !buySyms.has(r.symbol) && !avoidSyms.has(r.symbol))

  const busy = loading || stocksLoading

  return (
    <div className="p-5 sm:p-7 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Hari Ini</h1>
          <p className="text-xs text-tv-muted mt-1">
            Peringkat Decision Engine untuk semua saham yang kamu lacak. Kolom beli hanya setup dengan R/R ≥ {MIN_RR} dan transaksi ≥ {MIN_TURNOVER_BN} M/hari.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-tv-input border border-tv-border rounded-lg px-2.5 py-1.5 text-xs text-tv-text outline-none"
          >
            <option value="score">Urut: Skor</option>
            <option value="rr">Urut: R:R</option>
            <option value="volume">Urut: Likuiditas</option>
          </select>
          <select
            value={index}
            onChange={e => setIndex(e.target.value)}
            className="bg-tv-input border border-tv-border rounded-lg px-2.5 py-1.5 text-xs text-tv-text outline-none"
          >
            <option value="">Indeks: Semua</option>
            <option value="lq45">LQ45</option>
            <option value="idx30">IDX30</option>
          </select>
          <button
            onClick={() => setShariaOnly(v => !v)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all inline-flex items-center gap-1
              ${shariaOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}
          >
            <IconSharia /> Syariah
          </button>
          <button
            onClick={() => setUndervalueOnly(v => !v)}
            title="PBV di bawah rata-rata 3 tahun + lolos saringan: listing >10 th, dividend yield ≥5%, rata-rata ROE >12%, laba selalu positif"
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all
              ${undervalueOnly ? 'bg-tv-green/15 text-tv-green border-tv-green/40' : 'text-tv-muted border-tv-border hover:text-tv-text'}`}
          >
            💎 Undervalue
          </button>
          <button onClick={onAdd}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-tv-accent text-white hover:bg-tv-accent/80 transition-all">
            + Tambah
          </button>
          {stocks.length > 0 && (
            <button onClick={onUpdateAll}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-all">
              Update semua
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-tv-red border border-tv-red/30 bg-tv-red/10 rounded-xl px-4 py-3">Gagal memuat screener: {error}</div>
      )}

      {busy ? (
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 shimmer-bg rounded" />
              {Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-20 shimmer-bg rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm font-semibold">Belum ada saham yang dilacak</p>
          <p className="text-xs text-tv-muted mt-1 mb-4">Tambah saham untuk melihat kolom beli / hindari.</p>
          <button onClick={onAdd} className="px-4 py-2 text-xs font-bold rounded-lg bg-tv-accent text-white">+ Tambah saham</button>
        </div>
      ) : error ? null : (
        <>
          {index && indexInfo.stale && (
            <div className="text-xs text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/30 rounded-lg px-3 py-2 mb-3">
              ⚠️ Daftar IDX30/LQ45 berlaku s/d {indexInfo.until}. BEI sudah ganti periode, jadi filter ini mungkin sudah basi (edit handlers/indices.go).
            </div>
          )}
          {shariaOnly && indexInfo.sharia && (
            <div className="text-xs text-tv-yellow bg-tv-yellow/10 border border-tv-yellow/30 rounded-lg px-3 py-2 mb-3">
              ⚠️ Daftar syariah (DES OJK) berlaku s/d {indexInfo.shariaUntil}. OJK sudah terbitkan periode baru, jadi label ☪ mungkin sudah basi (edit handlers/syariah.go).
            </div>
          )}
          <OmbakMeter regime={regime} buy={buy.length} wait={waiting.length} sell={avoid.length} />
          <div className="grid md:grid-cols-2 gap-6">
            <Column
              title="Layak dibeli"
              tone="text-tv-green"
              rows={buy}
              onSelect={onSelect}
              empty={`Belum ada setup beli yang layak (R/R ≥ ${MIN_RR}, likuid).`}
            />
            <Column
              title="Hindari hari ini"
              tone="text-tv-red"
              rows={avoid}
              onSelect={onSelect}
              empty="Tidak ada yang perlu dihindari."
            />
          </div>
          {waiting.length > 0 && (
            <div className="mt-5 px-4 py-3 rounded-xl border border-tv-border bg-tv-card/60 text-xs text-tv-muted">
              <span className="font-semibold text-tv-text mr-2">{waiting.length} saham menunggu</span>
              {waiting.map(r => (
                <button key={r.symbol} onClick={() => onSelect(r.symbol)}
                  title={r.signal === 'BUY' || r.signal === 'STRONG_BUY'
                    ? `${r.signal.replace('_', ' ')} tapi R/R ${r.risk_reward?.toFixed(1)} · likuiditas ${r.turnover_bn} M/hari`
                    : r.signal}
                  className="mr-2 hover:text-tv-blue transition-colors">
                  {r.symbol}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
