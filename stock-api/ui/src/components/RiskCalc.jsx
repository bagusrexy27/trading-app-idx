import { useState, useMemo } from 'react'
import { fmt } from '../utils'
import MoneyInput from './MoneyInput'
import { positionSize, averagePrice, plPct } from '../money'

export default function RiskCalc({ data }) {
  const lastClose = data?.summary?.price?.close ?? 0
  const atrData   = data?.atr ?? []
  const lastAtr   = atrData.length > 0 ? atrData[atrData.length - 1]?.value ?? 0 : 0

  const [modal,    setModal]    = useState('10000000')  // Rp 10jt default
  const [riskPct,  setRiskPct]  = useState('2')
  const [entry,    setEntry]    = useState(String(lastClose || ''))

  const calc = useMemo(() => {
    const m = parseFloat(modal)    || 0
    const rp = parseFloat(riskPct)
    const e = parseFloat(entry)    || lastClose
    const atr = lastAtr

    const p1 = positionSize({ modal: m, riskPct: rp, entry: e, atr, atrMult: 1 })
    const p2 = positionSize({ modal: m, riskPct: rp, entry: e, atr, atrMult: 2 })
    const riskRp = p1.riskRp
    const sl1x = p1.sl, sl2x = p2.sl
    const lots1x = p1.lots, lots2x = p2.lots
    const shares1 = p1.shares, shares2 = p2.shares
    const actualRisk1 = p1.actualRisk, actualRisk2 = p2.actualRisk
    const targets = p1.targets.map((t, i) => ({ r: t.r, tp1: t.price, tp2: p2.targets[i].price }))

    return { riskRp, sl1x, sl2x, lots1x, lots2x, shares1, shares2, targets, actualRisk1, actualRisk2, atr }
  }, [modal, riskPct, entry, lastClose, lastAtr])

  const inputCls = "w-full bg-tv-input border border-tv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-tv-blue transition-colors"

  return (
    <div className="p-5 space-y-5 animate-fade-in">
      <div>
        <h2 className="text-sm font-bold">Risk Calculator</h2>
        <p className="text-xs text-tv-muted mt-0.5">Position sizing berdasarkan ATR dan risk per trade</p>
      </div>

      {/* Inputs */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4 grid grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Modal (Rp)</label>
          <MoneyInput value={modal} onChange={setModal} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Risk / Trade %</label>
          <input type="number" step="0.5" min="0.5" max="10" value={riskPct} onChange={e => setRiskPct(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Harga Entry</label>
          <MoneyInput value={entry} onChange={setEntry} className={inputCls} />
        </div>
      </div>

      {calc.atr > 0 ? (
        <>
          {/* ATR info */}
          <div className="text-xs text-tv-muted flex items-center gap-3">
            <span>ATR(14): <span className="text-tv-text font-semibold">{fmt.price(calc.atr)}</span></span>
            <span>Risk: <span className="text-tv-red font-semibold">{fmt.price(calc.riskRp)}</span></span>
          </div>

          {/* Stop loss scenarios */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: '1× ATR Stop', sl: calc.sl1x, lots: calc.lots1x, shares: calc.shares1, actualRisk: calc.actualRisk1 },
              { label: '2× ATR Stop', sl: calc.sl2x, lots: calc.lots2x, shares: calc.shares2, actualRisk: calc.actualRisk2 },
            ].map(sc => (
              <div key={sc.label} className="bg-tv-card border border-tv-border rounded-xl p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase text-tv-muted">{sc.label}</div>
                <Row label="Stop Loss"     value={fmt.price(sc.sl)}       color="text-tv-red" />
                <Row label="Lot"           value={`${sc.lots} lot`}        color="text-tv-blue" />
                <Row label="Lembar"        value={`${sc.shares.toLocaleString()} lbr`} />
                <Row label="Modal Pakai"   value={fmt.price(parseFloat(entry || lastClose) * sc.shares)} />
                <Row label="Actual Risk"   value={fmt.price(sc.actualRisk)} color="text-tv-red" />

                {/* R:R targets */}
                <div className="pt-2 border-t border-tv-border space-y-1.5">
                  <div className="text-[9px] text-tv-muted uppercase font-bold mb-1">R:R Targets</div>
                  {calc.targets.map(t => (
                    <div key={t.r} className="flex justify-between items-center text-[11px]">
                      <span className="text-tv-muted">{t.r}R Target</span>
                      <span className="text-tv-green font-semibold tabular-nums">
                        {fmt.price(sc.label.startsWith('1') ? t.tp1 : t.tp2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-tv-muted text-sm">
          <div className="text-3xl mb-2">⚖️</div>
          Data ATR belum tersedia untuk {entry ? 'saham ini' : 'kalkulasi'}
        </div>
      )}
      <AvgCalc lastClose={lastClose} inputCls={inputCls} />
    </div>
  )
}

// Kalkulator average harga: posisi sekarang + pembelian baru → avg gabungan.
function AvgCalc({ lastClose, inputCls }) {
  const [curLot, setCurLot]     = useState('')
  const [curAvg, setCurAvg]     = useState('')
  const [buys, setBuys]         = useState([{ lot: '', price: String(lastClose || '') }])

  const setBuy = (i, key, val) =>
    setBuys(b => b.map((row, j) => j === i ? { ...row, [key]: val } : row))

  const c = useMemo(() => {
    const rows = [{ lot: curLot, price: curAvg }, ...buys]
      .map(r => ({ lot: parseFloat(r.lot) || 0, price: parseFloat(r.price) || 0 }))
    const { avg, totLot, totModal } = averagePrice(rows)
    return {
      avg, totLot, totModal,
      plOld: plPct(parseFloat(curAvg) || 0, lastClose || 0),
      plNew: plPct(avg, lastClose || 0),
    }
  }, [curLot, curAvg, buys, lastClose])

  const plTone = (v) => v >= 0 ? 'text-tv-green' : 'text-tv-red'

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold">🧮 Kalkulator Average Harga</h2>
        <p className="text-xs text-tv-muted mt-0.5">Hitung harga rata-rata baru kalau nambah beli (average up/down)</p>
      </div>

      {/* Posisi sekarang */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Lot Sekarang</label>
          <input type="number" value={curLot} onChange={e => setCurLot(e.target.value)} placeholder="cth: 9" className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Harga Avg Sekarang</label>
          <MoneyInput decimals value={curAvg} onChange={setCurAvg} placeholder="cth: 487,17" className={inputCls} />
        </div>
      </div>

      {/* Pembelian baru */}
      {buys.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Lot Beli {buys.length > 1 ? `#${i + 1}` : 'Baru'}</label>
            <input type="number" value={b.lot} onChange={e => setBuy(i, 'lot', e.target.value)} placeholder="lot" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Harga Beli {buys.length > 1 ? `#${i + 1}` : 'Baru'}</label>
            <MoneyInput value={b.price} onChange={v => setBuy(i, 'price', v)} placeholder="harga" className={inputCls} />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => setBuys(b => [...b, { lot: '', price: '' }])}
          className="px-3 py-1.5 text-xs rounded-lg border border-tv-border text-tv-muted hover:text-tv-blue hover:border-tv-blue/40 transition-colors">
          + Tambah pembelian
        </button>
        {buys.length > 1 && (
          <button onClick={() => setBuys(b => b.slice(0, -1))}
            className="px-3 py-1.5 text-xs rounded-lg border border-tv-border text-tv-muted hover:text-tv-red hover:border-tv-red/40 transition-colors">
            − Hapus baris
          </button>
        )}
      </div>

      {/* Hasil */}
      {c.totLot > 0 && (
        <div className="pt-3 border-t border-tv-border space-y-2">
          <Row label="Harga Average Baru" value={fmt.price(c.avg)} color="text-tv-blue" />
          <Row label="Total Lot" value={`${c.totLot} lot (${(c.totLot * 100).toLocaleString('id-ID')} lbr)`} />
          <Row label="Total Modal" value={fmt.price(c.totModal)} />
          {c.plNew != null && (
            <Row label={`P/L di harga pasar (${fmt.price(lastClose)})`}
              value={`${c.plNew >= 0 ? '+' : ''}${c.plNew.toFixed(2)}%${c.plOld != null ? ` (sebelumnya ${c.plOld >= 0 ? '+' : ''}${c.plOld.toFixed(2)}%)` : ''}`}
              color={plTone(c.plNew)} />
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex justify-between items-center text-xs border-b border-tv-border/50 pb-1.5">
      <span className="text-tv-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${color || 'text-tv-text'}`}>{value}</span>
    </div>
  )
}
