// Skor Latihan: akurasi, streak benar, streak harian (target ronde/hari), badge.
// Badge hanya untuk disiplin belajar — sengaja tidak ada yang terkait trading.

export const DAILY_GOAL = 5

export const DEFAULT_SCORE = {
  total: 0, correct: 0, streak: 0, best: 0,
  day: '', dayRounds: 0,
  dayStreak: 0, bestDayStreak: 0, lastGoalDay: '',
  followed: 0,
  totalR: 0,
  badges: [],
}

export const BADGES = [
  { id: 'pemula',     emoji: '🐣', nama: 'Pemula',          syarat: 'Main 10 ronde',                          ok: s => s.total >= 10 },
  { id: 'rajin',      emoji: '📅', nama: 'Rajin',           syarat: `Capai target ${DAILY_GOAL} ronde/hari 7 hari beruntun`, ok: s => s.bestDayStreak >= 7 },
  { id: 'konsisten',  emoji: '🎯', nama: 'Konsisten',       syarat: 'Minimal 30 trade dengan total R positif', ok: s => s.total >= 30 && s.totalR > 0 },
  { id: 'konfluensi', emoji: '🧭', nama: 'Baca Konfluensi', syarat: '10× entry saat mayoritas sinyal bilang naik', ok: s => s.followed >= 10 },
]

// Simulasi trade beli (long) di bar-bar masa depan.
// Entry = order limit: di bawah close terakhir terisi kalau low menyentuhnya,
// di atas close terakhir (beli breakout) terisi kalau high menyentuhnya.
// Gap melewati level → terisi/keluar di harga open (realistis, bukan di level).
// TP & SL kena di candle yang sama → dianggap SL (konservatif, sama seperti calibration.go).
// Candle tempat order beli-turun terisi: high-nya bisa terjadi SEBELUM harga turun ke entry,
// jadi TP baru aktif mulai candle berikutnya (kecuali terisi di open — urutannya pasti).
// Beli breakout yang gap di atas TP: keluar di harga fill, bukan di TP (tidak bisa jual di bawah beli).
// Hasil: { result: 'tp'|'sl'|'timeout'|'unfilled', fillIdx, fillPrice, exitIdx, exitPrice, r }
export function simulateTrade(lastClose, bars, { entry, tp, sl }) {
  const dip = entry <= lastClose
  let fillIdx = -1, fillPrice = 0
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (fillIdx < 0) {
      if (dip && b.low <= entry) fillPrice = Math.min(b.open, entry)
      else if (!dip && b.high >= entry) fillPrice = Math.max(b.open, entry)
      else continue
      fillIdx = i
    }
    const risk = fillPrice - sl   // ≤0 kalau open gap tembus SL saat terisi → langsung kena SL, r 0
    const out = (result, exitPrice) => ({ result, fillIdx, fillPrice, exitIdx: i, exitPrice, r: risk > 0 ? (exitPrice - fillPrice) / risk : 0 })
    if (b.low <= sl) return out('sl', Math.min(b.open, sl))
    const tpLive = i !== fillIdx || !dip || fillPrice === b.open
    if (tpLive && b.high >= tp) return out('tp', i === fillIdx ? Math.max(tp, fillPrice) : Math.max(b.open, tp))
  }
  if (fillIdx < 0) return { result: 'unfilled', r: 0 }
  const last = bars[bars.length - 1]
  return { result: 'timeout', fillIdx, fillPrice, exitIdx: bars.length - 1, exitPrice: last.close, r: (last.close - fillPrice) / (fillPrice - sl) }
}

// Tanggal lokal YYYY-MM-DD (locale 'sv' kebetulan memakai format ISO).
export const dayStr = (d = new Date()) => d.toLocaleDateString('sv')
export const prevDay = (day) => {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return dayStr(d)
}

// Streak harian yang ditampilkan: putus kalau target terakhir tercapai sebelum kemarin.
export const liveDayStreak = (s, today = dayStr()) =>
  s.lastGoalDay && s.lastGoalDay >= prevDay(today) ? s.dayStreak : 0

export function nextScore(prev, { correct, followed, r = 0, today }) {
  const streak = correct ? prev.streak + 1 : 0
  const dayRounds = (prev.day === today ? prev.dayRounds : 0) + 1
  let { dayStreak, lastGoalDay } = prev
  if (dayRounds === DAILY_GOAL) {
    dayStreak = lastGoalDay === prevDay(today) ? dayStreak + 1 : 1
    lastGoalDay = today
  }
  const s = {
    ...prev,
    total: prev.total + 1,
    correct: prev.correct + (correct ? 1 : 0),
    streak,
    best: Math.max(prev.best, streak),
    day: today,
    dayRounds,
    dayStreak,
    bestDayStreak: Math.max(prev.bestDayStreak, dayStreak),
    lastGoalDay,
    followed: prev.followed + (followed ? 1 : 0),
    totalR: prev.totalR + r,
  }
  const earned = BADGES.filter(b => !prev.badges.includes(b.id) && b.ok(s)).map(b => b.id)
  return { score: { ...s, badges: [...prev.badges, ...earned] }, earned }
}
