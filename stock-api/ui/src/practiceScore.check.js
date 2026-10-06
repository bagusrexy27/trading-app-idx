// Self-check: node src/practiceScore.check.js
import assert from 'node:assert/strict'
import { DEFAULT_SCORE, DAILY_GOAL, nextScore, liveDayStreak } from './practiceScore.js'

const play = (s, n, day, correct = true, followed = false) => {
  let earned = []
  for (let i = 0; i < n; i++) ({ score: s, earned } = nextScore(s, { correct, followed, today: day }))
  return [s, earned]
}

let [s] = play(DEFAULT_SCORE, DAILY_GOAL - 1, '2026-10-05')
assert.equal(s.dayStreak, 0)
;[s] = play(s, 1, '2026-10-05')
assert.equal(s.dayStreak, 1)
;[s] = play(s, DAILY_GOAL, '2026-10-06')               // hari berikutnya → lanjut
assert.equal(s.dayStreak, 2)
assert.equal(liveDayStreak(s, '2026-10-07'), 2)        // kemarin capai target → masih hidup
assert.equal(liveDayStreak(s, '2026-10-08'), 0)        // bolong sehari → putus
;[s] = play(s, DAILY_GOAL, '2026-10-08')               // mulai lagi dari 1
assert.equal(s.dayStreak, 1)
assert.equal(s.bestDayStreak, 2)
assert.ok(s.badges.includes('pemula'))                 // 15 ronde
assert.equal(s.dayRounds, DAILY_GOAL)

// migrasi skor lama (tanpa field baru) tetap jalan
const old = { ...DEFAULT_SCORE, ...{ total: 9, correct: 5, streak: 0, best: 3 } }
const r = nextScore(old, { correct: false, followed: true, today: '2026-10-05' })
assert.deepEqual(r.earned, ['pemula'])
assert.equal(r.score.followed, 1)
assert.equal(r.score.best, 3)

// tahun baru melintas dengan benar
;[s] = play(DEFAULT_SCORE, DAILY_GOAL, '2026-12-31')
;[s] = play(s, DAILY_GOAL, '2027-01-01')
assert.equal(s.dayStreak, 2)

console.log('practiceScore OK')
