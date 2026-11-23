import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { GRADES, KIND_LABEL, MOODS, PERIODS, isGood, fmtMetric, directionText, filterRows, pctView } from '../rapor'

const tone = (g) => (g === true ? 'text-tv-green' : g === false ? 'text-tv-red' : 'text-tv-muted')

function GradeBadge({ r }) {
  const g = GRADES[r.grade] || GRADES.D
  return (
    <span title={g.label}
      className={`inline-flex items-center justify-center w-8 h-7 rounded-md border text-sm font-extrabold ${g.cls}`}>
      {r.grade}
    </span>
  )
}

function Metric({ r, v }) {
  return <span className={`tabular-nums ${tone(isGood(r, v))}`}>{fmtMetric(r, v)}</span>
}

function Cells({ r, keys, values, counts }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map(([k, label]) => (
        <div key={k} className="bg-tv-bg border border-tv-border rounded-md px-2 py-1 text-center min-w-[64px]">
          <div className="text-[10px] text-tv-muted">{label}</div>
          <div className="text-xs font-semibold"><Metric r={r} v={values?.[k]} /></div>
          {counts && <div className="text-[9px] text-tv-muted">n {counts[k] ?? 0}</div>}
        </div>
      ))}
    </div>
  )
}

function Detail({ r, bench }) {
  const years = Object.keys(r.by_year || {}).sort().map(y => [y, y])
  return (
    <div className="px-4 pb-4 pt-1 space-y-3 text-xs">
      <p className="text-tv-text/85 leading-relaxed">{r.explain}</p>
      {r.note && <p className="text-tv-yellow">⚠️ {r.note}</p>}
      <div className="bg-tv-bg border border-tv-border rounded-md px-3 py-2 space-y-0.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Kenapa nilai {r.grade}</div>
        {(r.reasons || []).map(x => <div key={x}>• {x}</div>)}
        <div className="text-tv-muted">
          p (block bootstrap per bulan) {r.p?.toFixed(4)} · {r.n_eff} bulan berbeda
          {r.random_entry && <> · beli acak: median {fmtMetric(r, r.random_entry.p50)}, p95 {fmtMetric(r, r.random_entry.p95)}</>}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Edge setelah biaya (−0,4%/trade)</div>
        <Cells r={{ ...r, kind: 'signal' }} keys={PERIODS} values={r.edge_net} />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Per tahun</div>
        <Cells r={r} keys={years} values={r.by_year} />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Per suasana pasar (RSI IHSG)</div>
        <Cells r={r} keys={MOODS.map(m => [m, m])} values={r.by_mood} counts={r.mood_n} />
      </div>
      {r.kind !== 'timing' && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Horizon (hari bursa)</div>
          <Cells r={r} keys={['5', '10', '20', '60'].map(h => [h, `${h} hari`])} values={r.horizons} />
        </div>
      )}
      {r.kind === 'signal' && r.trade_atr && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">
            Kalau ditradingkan (stop −1,5 ATR, target +3 ATR, maks 20 hari) — rata-rata hasil/trade
          </div>
          <Cells r={r} keys={PERIODS} values={r.trade_atr} />
          <p className="text-tv-muted mt-1">Menang lawan pasar: {r.hit_pct?.toFixed(1)}% dari {r.n.toLocaleString('id-ID')} sinyal.</p>
        </div>
      )}
      {r.portfolio && <PortfolioCard p={r.portfolio} bench={bench} />}
      {r.params?.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">
            Parameter tetangga (±30%) — {r.stable == null ? 'belum diuji' : r.stable ? 'stabil (arah sama, efek ≥ ½)' : 'tidak stabil'}
          </div>
          <Cells r={pctView(r)} keys={r.params.map(c => [c.label, c.label])} values={Object.fromEntries(r.params.map(c => [c.label, c.excess]))} />
        </div>
      )}
      {Object.entries(r.groups || {}).map(([g, stats]) => (
        <div key={g}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">Per {g} (hanya deskriptif — tidak menaikkan nilai)</div>
          <Cells r={pctView(r)} keys={Object.keys(stats).sort().map(k => [k, k])}
            values={Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.excess]))}
            counts={Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.n]))} />
        </div>
      ))}
    </div>
  )
}

function PortfolioCard({ p, bench }) {
  const items = [
    ['CAGR', `${p.cagr_pct.toFixed(2)}%`, p.cagr_pct > bench.cagr],
    ['Sharpe', p.sharpe.toFixed(2), p.sharpe > 0],
    ['Max drawdown', `−${p.max_dd_pct.toFixed(1)}%`, p.max_dd_pct < bench.dd],
    ['Profit factor', p.profit_factor.toFixed(2), p.profit_factor > 1],
    ['Win rate', `${p.win_rate_pct.toFixed(1)}%`, null],
    ['Rata-rata untung / rugi', `+${p.avg_win_pct.toFixed(2)}% / ${p.avg_loss_pct.toFixed(2)}%`, null],
    ['Trade', p.trades.toLocaleString('id-ID'), null],
    ['Waktu pegang posisi', `${p.exposure_pct.toFixed(0)}%`, null],
  ]
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted mb-1">
        Sebagai portofolio (maks 10 posisi, setelah biaya + ARB/ARA) vs IHSG beli-dan-tahan: CAGR {bench.cagr.toFixed(2)}%, drawdown −{bench.dd.toFixed(1)}%
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(([k, v, good]) => (
          <div key={k} className="bg-tv-bg border border-tv-border rounded-md px-2 py-1 text-center min-w-[80px]">
            <div className="text-[10px] text-tv-muted">{k}</div>
            <div className={`text-xs font-semibold ${tone(good)}`}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Rapor() {
  const [rep, setRep] = useState(null)
  const [err, setErr] = useState(null)
  const [f, setF] = useState({ q: '', grade: '', kind: '', cat: '', appOnly: false })
  const [open, setOpen] = useState(null)
  const [universe, setUniverse] = useState('')

  useEffect(() => {
    let alive = true // a slower response for the previous tab must not overwrite this one
    setRep(null); setErr(null)
    api.rapor(universe).then(d => alive && setRep(d)).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [universe])

  const rows = useMemo(() => filterRows(rep?.indicators || [], f), [rep, f])
  const cats = useMemo(() => [...new Set((rep?.indicators || []).map(r => r.category))].sort(), [rep])
  const counts = useMemo(() => {
    const c = {}
    for (const r of rep?.indicators || []) c[r.grade] = (c[r.grade] || 0) + 1
    return c
  }, [rep])
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const tabs = (
    <div className="flex gap-1 mb-3">
      {[['', 'Semua saham likuid'], ['sehat', 'Saham sehat']].map(([u, l]) => (
        <button key={u} onClick={() => setUniverse(u)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${universe === u ? 'border-tv-blue text-tv-blue bg-tv-blue/10' : 'border-tv-border text-tv-muted hover:text-tv-text'}`}>
          {l}
        </button>
      ))}
    </div>
  )
  if (err) return <div className="p-7">{tabs}<p className="text-sm text-tv-red">{err}</p></div>
  if (!rep) return <div className="p-7">{tabs}<p className="text-sm text-tv-muted">Memuat rapor…</p></div>

  return (
    <div className="p-4 sm:p-7 max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight">Rapor Indikator</h1>
      <div className="mt-3">{tabs}</div>
      {universe === 'sehat' && (
        <p className="text-xs text-tv-yellow mb-2 max-w-3xl">
          Saham sehat = tiap hari, dari 40 saham dengan transaksi 20 hari terbesar dan harga ≥ Rp500, diambil separuh yang paling tenang (ATR terendah) — ±20 saham. Pembandingnya sesama saham sehat di hari yang sama.
        </p>
      )}
      <p className="text-xs text-tv-muted mt-1 mb-4 max-w-3xl leading-relaxed">
        {rep.indicators.length} indikator diuji di {rep.stocks} saham sejak {rep.from.slice(0, 4)} (data sampai {rep.as_of}).
        Angka = seberapa jauh hasil 20 hari setelah sinyal <b>mengalahkan rata-rata semua saham di hari yang sama</b>.
        Untuk indikator "nilai", angkanya korelasi peringkat (IC); untuk "waktu pasar", selisih return pasar dibanding rata-ratanya.
        Hijau = mengarah ke sisi yang membantu.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(GRADES).map(([g, m]) => (
          <button key={g} onClick={() => setF(p => ({ ...p, grade: p.grade === g ? '' : g }))}
            title={m.desc}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors
              ${f.grade === g ? m.cls : 'border-tv-border text-tv-muted hover:text-tv-text'}`}>
            <b>{g}</b> {m.label} <span className="opacity-70">{counts[g] || 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input type="search" value={f.q} onChange={set('q')} placeholder="Cari indikator…"
          className="flex-1 min-w-[180px] bg-tv-input border border-tv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-tv-blue" />
        <select value={f.kind} onChange={set('kind')} className="bg-tv-input border border-tv-border rounded-lg px-2 py-2 text-sm">
          <option value="">Semua jenis</option>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={f.cat} onChange={set('cat')} className="bg-tv-input border border-tv-border rounded-lg px-2 py-2 text-sm">
          <option value="">Semua kategori</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-tv-muted cursor-pointer">
          <input type="checkbox" checked={f.appOnly} onChange={set('appOnly')} /> Hanya yang ada di app
        </label>
      </div>

      <div className="bg-tv-card border border-tv-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-tv-muted border-b border-tv-border">
              <th className="px-3 py-2 text-left">Nilai</th>
              <th className="px-3 py-2 text-left">Indikator</th>
              {PERIODS.map(([k, l]) => <th key={k} className="px-3 py-2 text-right whitespace-nowrap">{l}</th>)}
              <th className="px-3 py-2 text-right" title="q = p-value setelah koreksi Benjamini-Hochberg atas semua indikator; < 0,05 = signifikan">q</th>
              <th className="px-3 py-2 text-right whitespace-nowrap" title="Sinyal yang tercatat sejak log uji maju dimulai, dinilai setelah 20 hari bursa">Uji maju</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Tahun menang</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border/60">
            {rows.map(r => (
              <Row key={r.name} r={r} bench={{ cagr: rep.ihsg_cagr_pct ?? 0, dd: rep.ihsg_max_dd_pct ?? 0 }} open={open === r.name} onToggle={() => setOpen(o => (o === r.name ? null : r.name))} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-tv-muted">Tidak ada indikator yang cocok.</p>}
      </div>

      <ul className="mt-4 text-[11px] text-tv-muted space-y-0.5 list-disc pl-4">
        {rep.notes.map(n => <li key={n}>{n}</li>)}
        <li>Periode Des 2025+ sudah sering dilihat selama pengembangan, jadi bukan holdout bersih. Bukti bersih = kolom "Uji maju" (sinyal dicatat sejak hari pertama log, dinilai 20 hari bursa kemudian).</li>
      </ul>
    </div>
  )
}

function Row({ r, bench, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-tv-hover/60">
        <td className="px-3 py-2 align-top"><GradeBadge r={r} /></td>
        <td className="px-3 py-2 align-top">
          <div className="font-semibold flex items-center gap-1.5 flex-wrap">
            {r.name}
            {r.in_app && <span className="text-[9px] px-1.5 py-0.5 rounded bg-tv-blue/15 text-tv-blue font-bold">DI APP</span>}
          </div>
          <div className="text-[11px] text-tv-muted">
            {KIND_LABEL[r.kind]} · {r.category} · n {r.n.toLocaleString('id-ID')}
            {directionText(r) && <> · {directionText(r)}</>}
          </div>
        </td>
        {PERIODS.map(([k]) => (
          <td key={k} className="px-3 py-2 text-right align-top"><Metric r={r} v={r.split?.[k]} /></td>
        ))}
        <td className={`px-3 py-2 text-right align-top tabular-nums ${r.q < 0.05 ? 'font-bold text-tv-green' : 'text-tv-muted'}`}>
          {r.q?.toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums text-tv-muted">
          {r.forward?.n ? <Metric r={r} v={r.forward.excess} /> : '–'}
          {r.forward?.n ? <div className="text-[10px]">n {r.forward.n}</div> : null}
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums text-tv-muted">{r.years_won}</td>
      </tr>
      {open && (
        <tr className="bg-tv-bg/40">
          <td colSpan={8}><Detail r={r} bench={bench} /></td>
        </tr>
      )}
    </>
  )
}
