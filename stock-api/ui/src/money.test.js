import { describe, expect, test } from 'vitest'
import { positionSize, averagePrice, plPct, positionPnL, portfolioTotals } from './money'
import { formatId, parseId } from './components/MoneyInput'

describe('positionSize', () => {
  test('lots round down so risk stays within budget', () => {
    // Rp10jt × 2% = Rp200rb; stop 50 below → 200000 / (50×100) = 40 lot
    const p = positionSize({ modal: 10_000_000, riskPct: 2, entry: 1000, atr: 50, atrMult: 1 })
    expect(p).toMatchObject({ riskRp: 200_000, sl: 950, lots: 40, shares: 4000, actualRisk: 200_000 })
    expect(p.targets.map(t => t.price)).toEqual([1050, 1100, 1150])

    const p2 = positionSize({ modal: 10_000_000, riskPct: 2, entry: 1000, atr: 30, atrMult: 2 })
    expect(p2.lots).toBe(33) // 200000 / 6000 = 33.3
    expect(p2.actualRisk).toBeLessThanOrEqual(p2.riskRp)
  })
  test('no ATR → no position', () => {
    expect(positionSize({ modal: 1e7, riskPct: 2, entry: 1000, atr: 0, atrMult: 1 }).lots).toBe(0)
  })
})

test('averagePrice weights by lot and skips empty rows', () => {
  const r = averagePrice([{ lot: 10, price: 1000 }, { lot: 30, price: 800 }, { lot: 0, price: 500 }, { lot: 5, price: 0 }])
  expect(r).toEqual({ totLot: 40, totModal: 3_400_000, avg: 850 })
  expect(averagePrice([]).avg).toBe(0)
})

test('plPct', () => {
  expect(plPct(800, 1000)).toBe(25)
  expect(plPct(0, 1000)).toBeNull()
})

test('positionPnL flags the −7% stop and totals add up', () => {
  const a = positionPnL({ qty: 1000, buyPrice: 615.02 }, 571) // −7.16%
  expect(a.lots).toBe(10)
  expect(a.pnl).toBeCloseTo(-44_020)
  expect(a.stopHit).toBe(true)
  const b = positionPnL({ qty: 500, buyPrice: 1000 }, 1100)
  expect(b.stopHit).toBe(false)
  const t = portfolioTotals([a, b])
  expect(t.invest).toBeCloseTo(1_115_020)
  expect(t.pnl).toBeCloseTo(-44_020 + 50_000)
  expect(portfolioTotals([]).pct).toBe(0)
})

test('MoneyInput Indonesian separators round-trip', () => {
  expect(formatId('10000000')).toBe('10.000.000')
  expect(formatId('615.02')).toBe('615,02')
  expect(parseId('1.487,17', true)).toBe('1487.17')
  expect(parseId('1.487,17', false)).toBe('1487')
  expect(parseId('615,029', true)).toBe('615.02')
  expect(parseId('Rp 2.500', false)).toBe('2500')
})
