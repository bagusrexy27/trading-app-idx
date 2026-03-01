import { useState, useMemo } from 'react'
import { fmt } from '../utils'

export default function RiskCalc({ data }) {
  const lastClose = data?.summary?.price?.close ?? 0
  const atrData   = data?.atr ?? []
  const lastAtr   = atrData.length > 0 ? atrData[atrData.length - 1]?.value ?? 0 : 0

  const [modal,    setModal]    = useState('10000000')  // Rp 10jt default
  const [riskPct,  setRiskPct]  = useState('2')
  const [entry,    setEntry]    = useState(String(lastClose || ''))

  const calc = useMemo(() => {
    const m = parseFloat(modal)    || 0
    const r = parseFloat(riskPct)  / 100
    const e = parseFloat(entry)    || lastClose
    const atr = lastAtr

    const riskRp   = m * r
    const sl1x     = e - atr
    const sl2x     = e - 2 * atr
    const slDist1  = e - sl1x
    const slDist2  = e - sl2x

    // lots (1 lot = 100 shares)
    const lots1x = slDist1 > 0 ? Math.floor(riskRp / (slDist1 * 100)) : 0
    const lots2x = slDist2 > 0 ? Math.floor(riskRp / (slDist2 * 100)) : 0
    const shares1 = lots1x * 100
    const shares2 = lots2x * 100

    // R:R targets
    const targets = [1, 2, 3].map(r => ({
      r,
      tp1: e + r * slDist1,
      tp2: e + r * slDist2,
    }))

    const actualRisk1 = slDist1 * shares1
    const actualRisk2 = slDist2 * shares2

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
          <input type="number" value={modal} onChange={e => setModal(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Risk / Trade %</label>
          <input type="number" step="0.5" min="0.5" max="10" value={riskPct} onChange={e => setRiskPct(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] text-tv-muted uppercase font-bold block mb-1.5">Harga Entry</label>
          <input type="number" value={entry} onChange={e => setEntry(e.target.value)} className={inputCls} />
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
