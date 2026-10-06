// Skor Latihan: akurasi, streak benar, streak harian (target ronde/hari), badge.
// Badge hanya untuk disiplin belajar — sengaja tidak ada yang terkait trading.

export const DAILY_GOAL = 5

export const DEFAULT_SCORE = {
  total: 0, correct: 0, streak: 0, best: 0,
  day: '', dayRounds: 0,
  dayStreak: 0, bestDayStreak: 0, lastGoalDay: '',
  followed: 0,
  badges: [],
}

export const BADGES = [
  { id: 'pemula',     emoji: '🐣', nama: 'Pemula',          syarat: 'Main 10 ronde',                          ok: s => s.total >= 10 },
  { id: 'rajin',      emoji: '📅', nama: 'Rajin',           syarat: `Capai target ${DAILY_GOAL} ronde/hari 7 hari beruntun`, ok: s => s.bestDayStreak >= 7 },
  { id: 'konsisten',  emoji: '🎯', nama: 'Konsisten',       syarat: 'Minimal 30 ronde dengan akurasi ≥55%',  ok: s => s.total >= 30 && s.correct / s.total >= 0.55 },
  { id: 'konfluensi', emoji: '🧭', nama: 'Baca Konfluensi', syarat: '10× menebak searah mayoritas sinyal',    ok: s => s.followed >= 10 },
]

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

export function nextScore(prev, { correct, followed, today }) {
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
  }
  const earned = BADGES.filter(b => !prev.badges.includes(b.id) && b.ok(s)).map(b => b.id)
  return { score: { ...s, badges: [...prev.badges, ...earned] }, earned }
}
