import { useState } from 'react'
import { fmt, REGIME_LABEL } from '../utils'

// Proyeksi terukur dari kalibrasi: dari semua kasus historis dengan skor &
// kondisi IHSG serupa, berapa persen yang h hari bursa kemudian naik / datar /
// turun melewati gerak wajar saham itu. Skenario, bukan ramalan.

export const HORIZONS = [5, 10, 20]

export const pickProj = (calib, h) => calib?.projection?.find(p => p.horizon === h)

// Satu angka untuk mengurutkan "proyeksi terbaik": Bullish% − Bearish%.
// Tanpa proyeksi → -999 (bukan -Infinity: -Inf − -Inf = NaN merusak sort).
export const projEdge = (p) => (p ? p.bullish - p.bearish : -999)

const regimeText = (r) => REGIME_LABEL[r] ?? 'semua kondisi IHSG'

export function HorizonToggle({ value, onChange }) {
  return (
    <div className="flex rounded-lg border border-tv-border overflow-hidden" title="Jangka waktu proyeksi (hari bursa)">
      {HORIZONS.map(h => (
        <button key={h} onClick={(e) => { e.stopPropagation(); onChange(h) }}
          className={`px-2 py-1 text-[11px] font-semibold transition-colors ${value === h ? 'bg-tv-blue/15 text-tv-blue' : 'text-tv-muted hover:text-tv-text'}`}>
          {h} hari
        </button>
      ))}
    </div>
  )
}

export function ScenarioBar({ p, compact = false }) {
  if (!p) return null
  return (
    <div>
      <div className={`flex ${compact ? 'h-1.5' : 'h-2.5'} rounded-full overflow-hidden bg-tv-bg`}>
        <div className="bg-tv-green" style={{ width: `${p.bullish}%` }} />
        <div className="bg-tv-yellow" style={{ width: `${p.sideways}%` }} />
        <div className="bg-tv-red" style={{ width: `${p.bearish}%` }} />
      </div>
      <div className={`flex justify-between ${compact ? 'text-[10px]' : 'text-[11px]'} mt-1 tabular-nums`}>
        <span className="text-tv-green">Bullish {Math.round(p.bullish)}%</span>
        <span className="text-tv-yellow">Sideways {Math.round(p.sideways)}%</span>
        <span className="text-tv-red">Bearish {Math.round(p.bearish)}%</span>
      </div>
    </div>
  )
}

const priceAt = (close, pct) => Math.round(close * (1 + pct / 100))

export function ProjectionCard({ calibration, close }) {
  const [h, setH] = useState(20)
  const p = pickProj(calibration, h)
  if (!calibration?.projection?.length) return null

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold text-tv-muted uppercase">Proyeksi skenario</div>
        <HorizonToggle value={h} onChange={setH} />
      </div>
      {!p ? (
        <p className="text-xs text-tv-muted">Belum ada data untuk {h} hari.</p>
      ) : (
        <>
          <p className="text-xs text-tv-muted mb-2.5 leading-relaxed">
            Dari <b className="text-tv-text">{p.samples.toLocaleString('id-ID')}</b> kasus dengan skor {calibration.score_lo}–{calibration.score_hi} saat {regimeText(p.regime)},
            {' '}{h} hari bursa kemudian harganya:
          </p>
          <ScenarioBar p={p} />
          <p className="text-[10px] text-tv-muted mt-1.5">
            Bullish = naik lebih dari {p.threshold_pct.toFixed(1)}% · Bearish = turun lebih dari {p.threshold_pct.toFixed(1)}%.
            Ambang ini menyesuaikan gerak wajar saham ini (ATR), jadi saham kalem & liar dinilai adil.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2">
              <div className="text-[10px] text-tv-muted uppercase">8 dari 10 kasus</div>
              <div className="font-bold tabular-nums">{fmt.pct(p.band_pct[0])} s/d {fmt.pct(p.band_pct[4])}</div>
              <div className="text-[11px] text-tv-muted tabular-nums">≈ {fmt.price(priceAt(close, p.band_pct[0]))} – {fmt.price(priceAt(close, p.band_pct[4]))}</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2">
              <div className="text-[10px] text-tv-muted uppercase">Separuh kasus</div>
              <div className="font-bold tabular-nums">{fmt.pct(p.band_pct[1])} s/d {fmt.pct(p.band_pct[3])}</div>
              <div className="text-[11px] text-tv-muted tabular-nums">≈ {fmt.price(priceAt(close, p.band_pct[1]))} – {fmt.price(priceAt(close, p.band_pct[3]))}</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg px-3 py-2">
              <div className="text-[10px] text-tv-muted uppercase">Nilai tengah</div>
              <div className={`font-bold tabular-nums ${p.band_pct[2] >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{fmt.pct(p.band_pct[2])}</div>
              <div className="text-[11px] text-tv-muted tabular-nums">≈ {fmt.price(priceAt(close, p.band_pct[2]))}</div>
            </div>
          </div>

          {!p.reliable && <p className="text-xs text-tv-yellow mt-2">Sampel sedikit (&lt;30) — angka ini belum bisa dipercaya.</p>}
          <p className="text-[10px] text-tv-muted mt-2">
            Diukur dari data sejak 2020 semua saham yang dilacak, tanpa mengintip masa depan. Hari berurutan saling tumpang-tindih,
            jadi jumlah kasus terlihat lebih besar dari aslinya. Hanya saham yang <i>sekarang</i> dilacak yang ikut dihitung — saham yang dulu
            jatuh lalu tak dilacak tidak masuk, jadi angkanya bisa sedikit terlalu optimis. Skenario, bukan ramalan.
          </p>
        </>
      )}
    </div>
  )
}
