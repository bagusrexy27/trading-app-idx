import { fmt } from '../utils'

// Pita PBV 3 tahun (teknik laporan Astronacci "5 Undervalued Stock"):
// PBV hari ini dibanding rata-ratanya sendiri ±1/±2 standar deviasi.
// "Undervalue" = di bawah rata-rata DAN lolos 4 saringan kualitas.

const x2 = v => v?.toFixed(2)

export function valuationTitle(v) {
  return [
    `PBV ${x2(v.pbv)}x · rata-rata 3 tahun ${x2(v.mean)}x (${v.z > 0 ? '+' : ''}${v.z.toFixed(1)} SD, ${v.zone})`,
    ...v.checks.map(c => `${c.pass ? '✓' : '✗'} ${c.name}: ${c.note}`),
  ].join('\n')
}

// Chip untuk kartu screener.
export function ValuationChip({ v }) {
  if (!v) return null
  const tone = v.undervalue ? 'text-tv-green border-tv-green/40 bg-tv-green/10' : 'text-tv-muted border-tv-border bg-tv-bg'
  return (
    <span title={valuationTitle(v)} className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${tone}`}>
      {v.undervalue ? '💎 Undervalue' : 'PBV'} {x2(v.pbv)}x · {v.zone}
    </span>
  )
}

export default function ValuationCard({ v }) {
  if (!v) return null
  // sumbu: −3 SD … +3 SD, posisi PBV hari ini dijepit ke tepi
  const pos = z => `${Math.min(100, Math.max(0, (z + 3) / 6 * 100))}%`
  const zones = [
    [-3, -2, 'bg-tv-green/40'], [-2, -1, 'bg-tv-green/25'], [-1, 0, 'bg-tv-green/10'],
    [0, 1, 'bg-tv-red/10'], [1, 2, 'bg-tv-red/25'], [2, 3, 'bg-tv-red/40'],
  ]
  return (
    <div className={`bg-tv-card border rounded-xl p-4 ${v.undervalue ? 'border-tv-green/40' : 'border-tv-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-tv-muted uppercase">Valuasi · pita PBV 3 tahun</div>
        {v.undervalue && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-tv-green/40 bg-tv-green/10 text-tv-green">💎 UNDERVALUE</span>}
      </div>

      <p className="text-sm leading-relaxed">
        PBV (harga ÷ nilai buku per saham) sekarang <b>{x2(v.pbv)}x</b>, rata-rata 3 tahunnya <b>{x2(v.mean)}x</b> —
        posisi <b className={v.z < 0 ? 'text-tv-green' : 'text-tv-red'}>{v.z > 0 ? '+' : ''}{v.z.toFixed(1)} standar deviasi ({v.zone})</b>.
      </p>

      <div className="relative mt-4 mb-9">
        <div className="h-3 rounded-full overflow-hidden flex">
          {zones.map(([a, b, cls]) => <div key={a} className={`${cls} h-full`} style={{ width: `${(b - a) / 6 * 100}%` }} />)}
        </div>
        {[-2, -1, 0, 1, 2].map((k, i) => (
          <div key={k} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: pos(k) }}>
            <div className="w-px h-3 bg-tv-muted/60" />
            <div className="text-[9px] text-tv-muted tabular-nums mt-1 whitespace-nowrap">{k === 0 ? 'rata²' : `${k > 0 ? '+' : ''}${k}SD`} {x2(v.lines[i])}</div>
          </div>
        ))}
        <div className="absolute -top-1 -translate-x-1/2 w-3 h-5 rounded-sm bg-tv-blue border-2 border-tv-card" style={{ left: pos(v.z) }} title={`Sekarang ${x2(v.pbv)}x`} />
      </div>

      <div className="text-[10px] font-bold text-tv-muted uppercase mb-1.5">Saringan kualitas (wajib lolos semua)</div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {v.checks.map(c => (
          <div key={c.name} className="flex items-start gap-2 text-[12px]">
            <span className={c.pass ? 'text-tv-green' : 'text-tv-red'}>{c.pass ? '✓' : '✗'}</span>
            <span><span className="font-semibold">{c.name}</span> <span className="text-tv-muted">— {c.note}</span></span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-tv-muted mt-3 leading-relaxed">
        {v.quality
          ? <>Lolos semua saringan, jadi valuasi ikut dihitung di skor (bobot 10%). Murah ≠ pasti naik — harga bisa tetap murah lama.</>
          : <>Tidak lolos semua saringan, jadi valuasi tidak ikut skor: PBV rendah di saham seperti ini bisa jadi memang layak murah (value trap).</>}
        {' '}Nilai buku per saham {fmt.price(Math.round(v.bvps))} · data laporan Yahoo ({v.roe_years} tahun), diperbarui mingguan.
      </p>
    </div>
  )
}
