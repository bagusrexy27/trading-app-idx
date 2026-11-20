// Pure helpers for the Rapor (indicator report card) view — tested in rapor.test.js.

export const GRADES = {
  A: { label: 'Valid',            cls: 'bg-tv-green/20 text-tv-green border-tv-green/40',
       desc: 'Signifikan setelah koreksi (q < 0,05), untung setelah biaya di ketiga periode, mengalahkan 95% beli acak, ≥ 5/7 tahun, stabil di parameter tetangga.' },
  B: { label: 'Kondisional',      cls: 'bg-tv-blue/20 text-tv-blue border-tv-blue/40',
       desc: 'Signifikan dan untung setelah biaya, tapi belum memenuhi semua syarat A (mis. hanya di periode/rezim tertentu).' },
  C: { label: 'Habis dimakan biaya', cls: 'bg-tv-yellow/15 text-tv-yellow border-tv-yellow/40',
       desc: 'Ada daya prediksi yang signifikan, tapi edge-nya habis oleh biaya transaksi ±0,4%.' },
  D: { label: 'Tidak beda dari acak', cls: 'bg-tv-hover text-tv-muted border-tv-border',
       desc: 'Tidak signifikan setelah koreksi uji berganda. Kandidat hapus.' },
  E: { label: 'Konsisten salah',  cls: 'bg-tv-red/15 text-tv-red border-tv-red/40',
       desc: 'Sinyal beli yang signifikan lebih jelek dari pasar. Hapus.' },
  F: { label: 'Overfit / salah hitung', cls: 'bg-tv-purple/15 text-tv-purple border-tv-purple/40',
       desc: 'Signifikan di 2020–Nov 2025 tapi turun > 50% di Des 2025+ (indikasi overfit), atau hitungannya salah (gagal uji L1).' },
}

export const KIND_LABEL = { signal: 'Sinyal beli', value: 'Nilai (peringkat)', timing: 'Waktu pasar' }

export const MOODS = ['panik', 'takut', 'tenang', 'optimis', 'euforia']

export const PERIODS = [['TRAIN', '2020–23'], ['VALID', '2024–Nov 25'], ['TEST', 'Des 25+']]

// isGood: does this number point the helpful way for this indicator?
// signal → beating the market (> 0); value/timing → in its chosen direction.
// null when there is nothing to say (missing or exactly 0).
export function isGood(r, v) {
  if (v == null || v === 0 || Number.isNaN(v)) return null
  if (r.kind === 'signal') return v > 0
  const up = r.direction === 'tinggi' || r.direction === 'baik'
  return up ? v > 0 : v < 0
}

// value indicators are rank correlations (IC); signals & timing are % returns.
export function fmtMetric(r, v) {
  if (v == null || Number.isNaN(v)) return '–'
  if (r.kind === 'value') return v.toFixed(3)
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function directionText(r) {
  if (r.kind === 'value') return r.direction === 'tinggi' ? '↑ makin tinggi makin bagus' : '↓ makin rendah makin bagus'
  if (r.kind === 'timing') return r.direction === 'baik' ? 'waktu beli lebih baik' : 'waktu beli lebih buruk'
  return ''
}

export function filterRows(rows, { q = '', grade = '', kind = '', cat = '', appOnly = false } = {}) {
  const needle = q.trim().toLowerCase()
  return rows.filter(r =>
    (!needle || r.name.toLowerCase().includes(needle) || (r.explain || '').toLowerCase().includes(needle)) &&
    (!grade || r.grade === grade) &&
    (!kind || r.kind === kind) &&
    (!cat || r.category === cat) &&
    (!appOnly || r.in_app))
}
