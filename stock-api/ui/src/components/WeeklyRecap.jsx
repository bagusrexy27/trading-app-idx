import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmt, colorOf } from '../utils'
import { groupBySector, avg } from '../sectors'
import Term from './Term'

// Rekap 5 hari bursa terakhir — murni dari data yang sudah ada:
// IHSG history (/api/ihsg) + pct_5d tiap saham (/api/overview).
const DAYS = 5

const BUYISH = new Set(['BUY', 'STRONG_BUY'])
const SELLISH = new Set(['SELL', 'STRONG_SELL'])

function Stat({ label, children }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function MoverList({ title, rows, onSelectStock }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted mb-2 px-1">{title}</h3>
      {rows.map(r => (
        <button key={r.symbol} onClick={() => onSelectStock(r.symbol)}
          className="w-full flex items-center justify-between px-1 py-1.5 rounded hover:bg-tv-hover text-sm">
          <span className="font-bold">{r.symbol}</span>
          <span className="flex items-baseline gap-3 tabular-nums">
            <span className="text-xs text-tv-muted">{fmt.price(r.close)}</span>
            <span className={`text-xs font-semibold w-16 text-right ${colorOf(r.pct_5d)}`}>{fmt.pct(r.pct_5d)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default function WeeklyRecap({ items, onSelectStock }) {
  const [hist, setHist] = useState(null)

  useEffect(() => {
    let alive = true
    api.ihsg().then(d => alive && setHist(d?.history || [])).catch(() => alive && setHist([]))
    return () => { alive = false }
  }, [])

  const week = hist?.length > DAYS ? hist.slice(-(DAYS + 1)) : null
  const ihsgPct = week ? (week[DAYS].close / week[0].close - 1) * 100 : null
  const hi = week && Math.max(...week.slice(1).map(b => b.high))
  const lo = week && Math.min(...week.slice(1).map(b => b.low))

  const up = items.filter(i => i.pct_5d > 0).length
  const down = items.filter(i => i.pct_5d < 0).length
  const byPct = [...items].sort((a, b) => b.pct_5d - a.pct_5d)
  const gainers = byPct.slice(0, 5).filter(i => i.pct_5d > 0)
  const losers = byPct.slice(-5).reverse().filter(i => i.pct_5d < 0)

  const sectors = groupBySector(items)
    .map(g => ({ sector: g.sector, n: g.items.length, pct: avg(g.items.map(i => i.pct_5d)) }))
    .sort((a, b) => b.pct - a.pct)
  const best = sectors[0], worst = sectors[sectors.length - 1]

  const nBuy = items.filter(i => BUYISH.has(i.signal)).length
  const nSell = items.filter(i => SELLISH.has(i.signal)).length

  // Satu kalimat rangkuman, dirakit dari angka di atas (bukan teks karangan).
  const mood = up > down * 1.5 ? 'mayoritas saham naik' : down > up * 1.5 ? 'mayoritas saham turun' : 'saham naik & turun berimbang'
  const summary = [
    ihsgPct != null && `IHSG ${ihsgPct >= 0 ? 'naik' : 'turun'} ${fmt.pct(Math.abs(ihsgPct)).replace('+', '')} dalam ${DAYS} hari bursa`,
    `${mood} (${up} naik, ${down} turun)`,
    best && worst && best !== worst && `sektor terkuat ${best.sector}, terlemah ${worst.sector}`,
  ].filter(Boolean).join('; ') + '.'

  return (
    <div className="space-y-4">
      <div className="bg-tv-card border border-tv-border rounded-xl px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-tv-muted">
          Rekap {DAYS} hari bursa{week ? ` · ${week[1].date.slice(5)} s/d ${week[DAYS].date.slice(5)}` : ''}
        </div>
        <p className="text-sm mt-1 leading-relaxed">{summary}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={<Term k="ihsg">IHSG</Term>}>
          {week ? (
            <>
              <div className={`text-xl font-bold tabular-nums ${colorOf(ihsgPct)}`}>{fmt.pct(ihsgPct)}</div>
              <div className="text-[11px] text-tv-muted tabular-nums">
                {fmt.price(Math.round(week[DAYS].close))} · rentang {fmt.price(Math.round(lo))}–{fmt.price(Math.round(hi))}
              </div>
            </>
          ) : <div className="text-sm text-tv-muted">{hist ? 'data kurang' : '…'}</div>}
        </Stat>
        <Stat label="Naik vs turun">
          <div className="text-xl font-bold tabular-nums">
            <span className="text-tv-green">{up}</span> <span className="text-tv-muted text-sm">vs</span> <span className="text-tv-red">{down}</span>
          </div>
          <div className="text-[11px] text-tv-muted">dari {items.length} saham dipantau</div>
        </Stat>
        <Stat label="Sektor terkuat / terlemah">
          {best && (
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between gap-2"><span className="font-semibold truncate">{best.sector}</span><span className={`tabular-nums ${colorOf(best.pct)}`}>{fmt.pct(best.pct)}</span></div>
              <div className="flex justify-between gap-2"><span className="font-semibold truncate">{worst.sector}</span><span className={`tabular-nums ${colorOf(worst.pct)}`}>{fmt.pct(worst.pct)}</span></div>
            </div>
          )}
        </Stat>
        <Stat label={<Term k="sinyal">Sinyal sekarang</Term>}>
          <div className="text-xl font-bold tabular-nums">
            <span className="text-tv-green">{nBuy}</span> <span className="text-tv-muted text-sm">BUY ·</span> <span className="text-tv-red">{nSell}</span> <span className="text-tv-muted text-sm">SELL</span>
          </div>
          <div className="text-[11px] text-tv-muted">sisanya {items.length - nBuy - nSell} tunggu</div>
        </Stat>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <MoverList title={`Naik terbanyak ${DAYS}H`} rows={gainers} onSelectStock={onSelectStock} />
        <MoverList title={`Turun terdalam ${DAYS}H`} rows={losers} onSelectStock={onSelectStock} />
      </div>

      <div className="bg-tv-card border border-tv-border rounded-xl p-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted mb-2 px-1">Semua sektor ({DAYS}H, rata-rata)</h3>
        <div className="space-y-1">
          {sectors.map(s => {
            const w = Math.min(Math.abs(s.pct) * 8, 50) // 6,25% = setengah lebar
            return (
              <div key={s.sector} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate">{s.sector} <span className="text-tv-muted">({s.n})</span></span>
                <div className="flex-1 relative h-3">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-tv-border" />
                  <div className={`absolute inset-y-0 rounded-sm ${s.pct >= 0 ? 'bg-tv-green/70 left-1/2' : 'bg-tv-red/70 right-1/2'}`}
                    style={{ width: `${w}%` }} />
                </div>
                <span className={`w-16 text-right tabular-nums ${colorOf(s.pct)}`}>{fmt.pct(s.pct)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
