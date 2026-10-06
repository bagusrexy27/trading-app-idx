import { useState } from 'react'
import { fmt, colorOf, signalLabel } from '../utils'
import { groupBySector, avg } from '../sectors'
import Term from './Term'

const PERIODS = [
  { key: 'pct_1d', label: '1H', cap: 3 },
  { key: 'pct_5d', label: '5H', cap: 8 },
  { key: 'pct_1m', label: '1B', cap: 15 },
]

// Hijau/merah makin pekat makin besar geraknya; ±cap% = warna penuh.
function tileBg(pct, cap) {
  if (!pct) return 'rgba(120,123,134,0.18)'
  const t = Math.min(Math.abs(pct) / cap, 1)
  const rgb = pct > 0 ? '46,189,133' : '246,70,93'
  return `rgba(${rgb},${(0.15 + 0.7 * t).toFixed(2)})`
}

// Lebar kotak ∝ √nilai transaksi supaya saham kecil tetap terbaca.
const tileW = (turnover, maxT) => 56 + 104 * Math.sqrt((turnover || 0) / (maxT || 1))

export default function MarketHeatmap({ items, onSelectStock }) {
  const [period, setPeriod] = useState(PERIODS[0])
  const k = period.key
  const maxT = Math.max(...items.map(i => i.turnover_bn || 0))

  const groups = groupBySector(items)
    .map(g => ({
      ...g,
      items: [...g.items].sort((a, b) => (b.turnover_bn || 0) - (a.turnover_bn || 0)),
      total: g.items.reduce((s, i) => s + (i.turnover_bn || 0), 0),
      avgPct: avg(g.items.map(i => i[k] || 0)),
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[11px] text-tv-muted">
          Warna = naik/turun harga · ukuran kotak = <Term k="turnover">nilai transaksi</Term> rata-rata 20 hari
        </p>
        <div className="flex rounded-lg border border-tv-border overflow-hidden">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-semibold transition-colors
                ${p.key === k ? 'bg-tv-blue text-white' : 'text-tv-muted hover:text-tv-text'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {groups.map(g => (
          <section key={g.sector} className="bg-tv-card border border-tv-border rounded-xl p-2"
            style={{ flex: `${Math.max(g.items.length, 2)} 1 220px` }}>
            <div className="flex items-baseline justify-between gap-2 px-1 mb-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted">{g.sector}</h3>
              <span className={`text-[11px] font-semibold tabular-nums ${colorOf(g.avgPct)}`}>{fmt.pct(g.avgPct)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.items.map(it => {
                const w = tileW(it.turnover_bn, maxT)
                return (
                  <button key={it.symbol} onClick={() => onSelectStock(it.symbol)}
                    title={`${it.symbol} · ${fmt.price(it.close)} · ${signalLabel(it.signal)} · transaksi ±${fmt.num(it.turnover_bn, 1)} miliar/hari`}
                    className="rounded-md px-1.5 py-1 text-left hover:ring-2 hover:ring-tv-text/40 transition-shadow"
                    style={{ flex: `1 1 ${w}px`, minHeight: w * 0.55, background: tileBg(it[k], period.cap) }}>
                    <div className="text-xs font-extrabold leading-tight">{it.symbol}</div>
                    <div className="text-[10px] font-semibold tabular-nums opacity-90">{fmt.pct(it[k])}</div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
