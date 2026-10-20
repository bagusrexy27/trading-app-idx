import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../api'
import { fmt } from '../utils'

// Kalender dividen. Backend mengambil riwayat dividen semua saham dari Yahoo
// (ex date + nominal) dan memproyeksikan pola 12 bulan terakhir ke tahun depan
// sebagai "perkiraan". Input manual hanya untuk pengumuman resmi yang belum
// masuk Yahoo (Yahoo baru mencatat dividen setelah ex date lewat).

const PORTFOLIO_KEY = 'idx_portfolio_v1' // sama dengan Portfolio.jsx
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const EMPTY = { symbol: '', type: 'interim', fiscal_year: new Date().getFullYear(), amount: '', status: 'resmi', cum_date: '', pay_date: '', est_month: '', note: '', source: '' }

function loadHoldings() {
  try {
    const qty = {}
    for (const p of JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '[]')) qty[p.symbol] = (qty[p.symbol] || 0) + (p.qty || 0)
    return qty
  } catch { return {} }
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const keyDate = (d) => d.cum_date || d.ex_date || ''
const monthOf = (d) => (keyDate(d) || d.est_month).slice(0, 7)
const monthLabel = (ym) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`
const dateLabel = (s) => s ? `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '-'
const daysUntil = (s) => Math.round((new Date(s + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 864e5)

export default function Dividends({ stocks, onSelectStock, showToast }) {
  const [list, setList]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState(null) // null | entry being added/edited
  const [showPast, setShowPast] = useState(false)
  const [mineOnly, setMineOnly] = useState(false)
  const holdings = useMemo(loadHoldings, [])
  const prices = useMemo(() => Object.fromEntries((stocks || []).map(s => [s.symbol, s.last_close])), [stocks])

  const load = useCallback((refresh) => {
    setLoading(true)
    return api.dividends.list(refresh)
      .then(d => setList(d || []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => { load(false) }, [load])

  const manual = list.filter(d => !d.auto)
  const persist = async (next, msg) => {
    try {
      await api.dividends.save(next)
      await load(false)
      showToast(msg)
      return true
    } catch (e) {
      showToast(e.message, 'error')
      return false
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const entry = { ...form, symbol: form.symbol.trim().toUpperCase(), amount: Number(form.amount) || 0, fiscal_year: Number(form.fiscal_year) || 0 }
    if (entry.status === 'resmi') entry.est_month = ''
    else entry.cum_date = ''
    const next = entry.id ? manual.map(d => d.id === entry.id ? entry : d) : [...manual, { ...entry, id: String(Date.now()) }]
    if (await persist(next, `✓ Dividen ${entry.symbol} disimpan`)) setForm(null)
  }

  const remove = (d) => {
    if (!confirm(`Hapus catatan dividen ${d.symbol}?`)) return
    persist(manual.filter(x => x.id !== d.id), `${d.symbol} dihapus`)
  }

  // Akan datang: tanggal (cum/ex) belum lewat, atau bulan perkiraan >= bulan ini.
  const today = todayStr()
  const isUpcoming = (d) => d.status !== 'riwayat' && (keyDate(d) ? keyDate(d) >= today : d.est_month >= today.slice(0, 7))
  const shown = mineOnly ? list.filter(d => holdings[d.symbol] > 0) : list
  const groups = (items, desc) => {
    const g = {}
    for (const d of items) (g[monthOf(d)] ||= []).push(d)
    return Object.entries(g).sort(([a], [b]) => desc ? b.localeCompare(a) : a.localeCompare(b))
  }
  const upcoming = groups(shown.filter(isUpcoming), false)
  const past     = groups(shown.filter(d => !isUpcoming(d)), true)
  const rowProps = { prices, holdings, onSelect: onSelectStock, onEdit: setForm, onDelete: remove }

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Kalender Dividen</h2>
          <p className="text-xs text-tv-muted mt-0.5 max-w-2xl">
            Otomatis dari riwayat dividen semua saham di watchlist (Yahoo Finance). <b className="text-tv-text">Perkiraan</b> = pola
            tahun lalu, belum resmi. Beli paling lambat di <b className="text-tv-text">cum date</b> (1 hari bursa sebelum ex date)
            supaya dapat dividen; di ex date harga biasanya turun ± sebesar dividen.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button onClick={() => load(true)} disabled={loading}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-tv-border text-tv-muted hover:text-tv-text disabled:opacity-50">
            {loading ? 'Mencari…' : '↻ Perbarui'}
          </button>
          <button onClick={() => setForm({ ...EMPTY })}
            className="px-3 py-2 text-xs font-semibold bg-tv-blue rounded-lg text-white hover:bg-tv-blue/80">
            + Pengumuman resmi
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-tv-muted">
        <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} />
        Hanya saham di Portofolio ⭐
      </label>

      {loading && list.length === 0 ? (
        <div className="text-xs text-tv-muted">Mengambil riwayat dividen semua saham…</div>
      ) : (
        <>
          {upcoming.length === 0 && <div className="text-xs text-tv-muted">Tidak ada dividen yang akan datang.</div>}
          {upcoming.map(([ym, items]) => <MonthGroup key={ym} ym={ym} items={items} {...rowProps} />)}

          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast(v => !v)} className="text-xs font-semibold text-tv-muted hover:text-tv-text">
                {showPast ? '▾' : '▸'} Riwayat ({past.reduce((n, [, i]) => n + i.length, 0)})
              </button>
              {showPast && (
                <div className="mt-3 space-y-5 opacity-80">
                  {past.map(([ym, items]) => <MonthGroup key={ym} ym={ym} items={items} past {...rowProps} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {form && <DividendForm form={form} setForm={setForm} onSubmit={onSubmit} onClose={() => setForm(null)} />}
    </div>
  )
}

function MonthGroup({ ym, items, past, prices, holdings, ...rest }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-tv-muted mb-2">{monthLabel(ym)}</div>
      <div className="space-y-2">
        {items.map(d => <DividendRow key={d.id} d={d} price={prices[d.symbol]} qty={holdings[d.symbol]} past={past} {...rest} />)}
      </div>
    </div>
  )
}

const BADGE = {
  resmi:     ['RESMI', 'bg-tv-green/15 text-tv-green'],
  perkiraan: ['PERKIRAAN', 'bg-tv-hover text-tv-muted'],
  riwayat:   ['SUDAH DIBAGI', 'bg-tv-hover text-tv-muted'],
}

function DividendRow({ d, price, qty, past, onSelect, onEdit, onDelete }) {
  const est = d.status === 'perkiraan'
  const yieldPct = d.amount > 0 && price ? (d.amount / price) * 100 : null
  const when = keyDate(d)
  const days = when ? daysUntil(when) : null
  const [badge, badgeCls] = BADGE[d.status] || BADGE.perkiraan
  return (
    <div className={`bg-tv-card border rounded-xl p-3 ${est ? 'border-dashed border-tv-border' : 'border-tv-border'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onSelect(d.symbol)} className="text-sm font-bold hover:text-tv-blue">{d.symbol}</button>
        {qty > 0 && <span title="Ada di Portofolio">⭐</span>}
        {d.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-tv-hover text-tv-muted capitalize">{d.type}{d.fiscal_year ? ` TB ${d.fiscal_year}` : ''}</span>}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls}`}>{badge}</span>
        {!past && days != null && days >= 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${days <= 7 ? 'bg-tv-yellow/15 text-tv-yellow' : 'bg-tv-blue/15 text-tv-blue'}`}>
            {est ? '± ' : ''}{days === 0 ? 'HARI INI' : `H-${days}`}
          </span>
        )}
        {!d.auto && (
          <div className="ml-auto flex gap-1">
            <button onClick={() => onEdit({ ...d, amount: d.amount || '' })} className="text-[11px] px-2 py-0.5 text-tv-muted hover:text-tv-text">Edit</button>
            <button onClick={() => onDelete(d)} className="text-[11px] px-2 py-0.5 text-tv-muted hover:text-tv-red">Hapus</button>
          </div>
        )}
      </div>

      <div className={`mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs ${est ? 'text-tv-muted' : ''}`}>
        <Field label={est ? 'Nominal (pola lalu)' : 'Nominal'} value={d.amount > 0 ? `Rp${fmt.price(Math.round(d.amount * 100) / 100)}/saham` : 'belum diketahui'} />
        <Field label="Yield (harga kini)" value={yieldPct != null ? `${yieldPct.toFixed(1)}% · ${fmt.price(price)}` : '-'} />
        {d.cum_date
          ? <Field label="Cum date" value={dateLabel(d.cum_date)} />
          : d.ex_date
            ? <Field label={est ? 'Ex date (perkiraan)' : 'Ex date'} value={`${est ? '± ' : ''}${dateLabel(d.ex_date)}`} />
            : <Field label="Cum date" value={`± ${monthLabel(d.est_month)}`} />}
        <Field label="Bayar" value={dateLabel(d.pay_date)} />
      </div>

      {qty > 0 && d.amount > 0 && !past && (
        <div className="mt-2 text-xs text-tv-green">
          Lo pegang {fmt.price(qty / 100)} lot → ± Rp{fmt.price(Math.round(d.amount * qty))} (sebelum pajak)
        </div>
      )}
      {(d.note || d.source) && (
        <div className="mt-1.5 text-[11px] text-tv-muted">
          {d.note}
          {d.source && <> {d.note && '· '}{d.source.startsWith('http')
            ? <a href={d.source} target="_blank" rel="noreferrer" className="underline hover:text-tv-text">sumber</a>
            : d.source}</>}
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value }) => (
  <div>
    <div className="text-[10px] text-tv-muted">{label}</div>
    <div className="font-semibold tabular-nums">{value}</div>
  </div>
)

function DividendForm({ form, setForm, onSubmit, onClose }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const est = form.status === 'perkiraan'
  const input = 'w-full bg-tv-input border border-tv-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-tv-blue'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form onSubmit={onSubmit} onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-tv-card border border-tv-border rounded-xl p-5 space-y-3 max-h-[90vh] overflow-auto">
        <h3 className="text-sm font-bold">{form.id ? 'Edit' : 'Catat'} Pengumuman Dividen</h3>
        <p className="text-[11px] text-tv-muted">Opsional — riwayat & perkiraan sudah otomatis. Pakai ini kalau emiten sudah mengumumkan jadwal resmi.</p>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Kode saham"><input required value={form.symbol} onChange={set('symbol')} placeholder="AADI" className={input} /></Label>
          <Label text="Status">
            <select value={form.status} onChange={set('status')} className={input}>
              <option value="resmi">Resmi</option>
              <option value="perkiraan">Perkiraan</option>
            </select>
          </Label>
          <Label text="Jenis">
            <select value={form.type} onChange={set('type')} className={input}>
              <option value="interim">Interim</option>
              <option value="final">Final</option>
              <option value="spesial">Spesial</option>
            </select>
          </Label>
          <Label text="Tahun buku"><input type="number" value={form.fiscal_year} onChange={set('fiscal_year')} className={input} /></Label>
          <Label text="Rp per saham"><input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} placeholder="kosong = belum tahu" className={input} /></Label>
          {est
            ? <Label text="Perkiraan bulan cum"><input type="month" required value={form.est_month} onChange={set('est_month')} className={input} /></Label>
            : <Label text="Cum date"><input type="date" required value={form.cum_date} onChange={set('cum_date')} className={input} /></Label>}
          <Label text="Tanggal bayar"><input type="date" value={form.pay_date} onChange={set('pay_date')} className={input} /></Label>
        </div>
        <Label text="Catatan"><input value={form.note} onChange={set('note')} className={input} /></Label>
        <Label text="Link sumber"><input type="url" value={form.source} onChange={set('source')} placeholder="https://…" className={input} /></Label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-tv-muted hover:text-tv-text">Batal</button>
          <button type="submit" className="px-4 py-2 text-xs font-semibold bg-tv-blue rounded-lg text-white hover:bg-tv-blue/80">Simpan</button>
        </div>
      </form>
    </div>
  )
}

const Label = ({ text, children }) => (
  <label className="block">
    <span className="block text-[10px] text-tv-muted mb-1">{text}</span>
    {children}
  </label>
)
