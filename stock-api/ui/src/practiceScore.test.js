// npm test
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { DEFAULT_SCORE, DAILY_GOAL, nextScore, liveDayStreak, simulateTrade } from './practiceScore.js'

const play = (s, n, day, correct = true, followed = false) => {
  let earned = []
  for (let i = 0; i < n; i++) ({ score: s, earned } = nextScore(s, { correct, followed, today: day }))
  return [s, earned]
}

test('daily streak, badges, score migration', () => {
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

})

test('simulateTrade', () => {
// ── simulateTrade ──
const bar = (open, high, low, close) => ({ open, high, low, close })
const plan = { entry: 1000, tp: 1100, sl: 950 }
let t = simulateTrade(1000, [bar(1000, 1050, 980, 1040), bar(1040, 1120, 1030, 1100)], plan)
assert.equal(t.result, 'tp'); assert.equal(t.exitIdx, 1); assert.equal(t.r, 2)
t = simulateTrade(1000, [bar(1000, 1150, 940, 1000)], plan)                 // TP & SL satu candle → SL
assert.equal(t.result, 'sl'); assert.equal(t.r, -1)
t = simulateTrade(1000, [bar(1000, 1010, 960, 1000), bar(900, 920, 880, 900)], plan) // gap tembus SL → keluar di open
assert.equal(t.result, 'sl'); assert.equal(t.exitPrice, 900); assert.equal(t.r, -2)
t = simulateTrade(1100, [bar(1100, 1120, 1050, 1060)], plan)                // entry di bawah, tak tersentuh
assert.equal(t.result, 'unfilled')
t = simulateTrade(1100, [bar(1100, 1120, 1050, 1060), bar(1050, 1060, 990, 1020)], plan) // turun ke entry
assert.equal(t.fillIdx, 1); assert.equal(t.result, 'timeout'); assert.equal(t.r, 0.4)
t = simulateTrade(900, [bar(1020, 1030, 1010, 1025)], plan)                 // beli breakout, gap atas → isi di open
assert.equal(t.fillPrice, 1020)
t = simulateTrade(900, [bar(1150, 1160, 1140, 1150)], plan)                // breakout gap di atas TP → keluar di fill, bukan rugi
assert.equal(t.result, 'tp'); assert.equal(t.exitPrice, 1150); assert.equal(t.r, 0)
t = simulateTrade(1050, [bar(1060, 1120, 995, 1000)], plan)                // beli-turun terisi + high ≥ TP di candle sama → TP belum aktif
assert.equal(t.result, 'timeout'); assert.equal(t.r, 0)
t = simulateTrade(1050, [bar(1060, 1080, 995, 1000), bar(1000, 1110, 990, 1100)], plan) // TP kena candle berikutnya
assert.equal(t.result, 'tp'); assert.equal(t.exitIdx, 1)
assert.equal(nextScore(DEFAULT_SCORE, { correct: true, r: 2, today: '2026-10-05' }).score.totalR, 2)

})
