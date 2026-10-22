import { expect, test } from 'vitest'
import { resample, sma, rsi, macd } from './bars'

const bar = (date, open, high, low, close, volume = 100) => ({ date, open, high, low, close, volume })

test('resample W groups Mon–Fri, M groups by month', () => {
  const daily = [
    bar('2026-10-01', 10, 12, 9, 11), // Thu
    bar('2026-10-02', 11, 15, 10, 14), // Fri
    bar('2026-10-05', 14, 14, 8, 9),   // Mon — new week
    bar('2026-11-02', 9, 10, 7, 8),    // new month
  ]
  expect(resample(daily, 'W')).toEqual([
    bar('2026-10-01', 10, 15, 9, 14, 200),
    bar('2026-10-05', 14, 14, 8, 9),
    bar('2026-11-02', 9, 10, 7, 8),
  ])
  expect(resample(daily, 'M').map(b => [b.date, b.open, b.high, b.low, b.close, b.volume])).toEqual([
    ['2026-10-01', 10, 15, 8, 9, 300],
    ['2026-11-02', 9, 10, 7, 8, 100],
  ])
  expect(resample(daily, 'D')).toBe(daily)
})

const closes = (cs) => cs.map((c, i) => bar(`d${String(i).padStart(3, '0')}`, c, c, c, c))

test('sma', () => {
  expect(sma(closes([1, 2, 3, 4]), 3).map(p => p.value)).toEqual([2, 3])
})

test('rsi: all gains = 100, flat-then-down < 50', () => {
  expect(rsi(closes(Array.from({ length: 20 }, (_, i) => i + 1))).at(-1).value).toBe(100)
  const down = rsi(closes([...Array(15).fill(10).map((v, i) => v + (i % 2)), 9, 8, 7]))
  expect(down.at(-1).value).toBeLessThan(50)
})

test('macd turns positive on an uptrend and signal lags it', () => {
  const m = macd(closes(Array.from({ length: 60 }, (_, i) => 100 + i)))
  expect(m.macd.length).toBe(60 - 25)
  expect(m.signal.length).toBe(m.macd.length - 8)
  expect(m.macd.at(-1).value).toBeGreaterThan(0)
  expect(m.hist.at(-1).value).toBeCloseTo(m.macd.at(-1).value - m.signal.at(-1).value)
})
