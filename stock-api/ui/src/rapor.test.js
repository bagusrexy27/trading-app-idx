import { describe, it, expect } from 'vitest'
import { isGood, fmtMetric, filterRows, pctView } from './rapor'

describe('isGood', () => {
  it('signals: beating the market is good', () => {
    expect(isGood({ kind: 'signal' }, 1.2)).toBe(true)
    expect(isGood({ kind: 'signal' }, -0.4)).toBe(false)
  })
  it('value indicators follow their direction', () => {
    expect(isGood({ kind: 'value', direction: 'rendah' }, -0.06)).toBe(true)
    expect(isGood({ kind: 'value', direction: 'tinggi' }, -0.06)).toBe(false)
  })
  it('timing: "buruk" means negative is the expected side', () => {
    expect(isGood({ kind: 'timing', direction: 'buruk' }, -1)).toBe(true)
  })
  it('nothing to say for missing or zero', () => {
    expect(isGood({ kind: 'signal' }, 0)).toBe(null)
    expect(isGood({ kind: 'signal' }, undefined)).toBe(null)
  })
})

describe('fmtMetric', () => {
  it('IC for values, % for the rest', () => {
    expect(fmtMetric({ kind: 'value' }, 0.0456)).toBe('0.046')
    expect(fmtMetric({ kind: 'signal' }, 1.5)).toBe('+1.50%')
    expect(fmtMetric({ kind: 'timing' }, -2)).toBe('-2.00%')
  })
})

describe('filterRows', () => {
  const rows = [
    { name: 'MACD cross naik', explain: 'garis MACD', grade: 'D', kind: 'signal', category: 'momentum', in_app: true },
    { name: 'Altman Z-score', explain: 'risiko bangkrut', grade: 'A', kind: 'value', category: 'fundamental', in_app: false },
  ]
  it('combines filters', () => {
    expect(filterRows(rows, { grade: 'A' }).map(r => r.name)).toEqual(['Altman Z-score'])
    expect(filterRows(rows, { appOnly: true }).map(r => r.name)).toEqual(['MACD cross naik'])
    expect(filterRows(rows, { q: 'bangkrut' }).length).toBe(1)
    expect(filterRows(rows).length).toBe(2)
  })
})

describe('pctView', () => {
  it('value-indicator cells are direction-adjusted %: positive is good even for "rendah" (PBV)', () => {
    const pbv = { kind: 'value', direction: 'rendah' }
    expect(fmtMetric(pctView(pbv), 1.2)).toBe('+1.20%')
    expect(isGood(pctView(pbv), 1.2)).toBe(true)
  })
  it('timing cells keep their own direction', () => {
    const t = { kind: 'timing', direction: 'buruk' }
    expect(pctView(t)).toBe(t)
  })
})
