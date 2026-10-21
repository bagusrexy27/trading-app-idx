// Pure money math for RiskCalc + Portfolio, kept out of the components so it
// can be tested (money.test.js). 1 lot = 100 shares.

export const LOT = 100

// Position sizing: risk `riskPct`% of `modal` with the stop `atrMult` ATRs
// below entry. Lots round down so the real risk never exceeds the budget.
export function positionSize({ modal, riskPct, entry, atr, atrMult }) {
  const riskRp = modal * riskPct / 100
  const slDist = atr * atrMult
  const lots = slDist > 0 ? Math.floor(riskRp / (slDist * LOT)) : 0
  return {
    riskRp,
    sl: entry - slDist,
    lots,
    shares: lots * LOT,
    actualRisk: slDist * lots * LOT,
    targets: [1, 2, 3].map(r => ({ r, price: entry + r * slDist })),
  }
}

// Weighted average buy price over rows of { lot, price }; rows with a
// non-positive lot or price are ignored.
export function averagePrice(rows) {
  const ok = rows.filter(r => r.lot > 0 && r.price > 0)
  const totLot = ok.reduce((a, r) => a + r.lot, 0)
  const totModal = ok.reduce((a, r) => a + r.lot * LOT * r.price, 0)
  return { totLot, totModal, avg: totLot > 0 ? totModal / (totLot * LOT) : 0 }
}

// % gain of `price` over `cost`; null when either is missing.
export const plPct = (cost, price) => cost > 0 && price > 0 ? (price - cost) / cost * 100 : null

export const STOP_PCT = -7 // discipline rule: flag a holding at −7%

// One holding { qty (shares), buyPrice } valued at `cur`.
export function positionPnL(pos, cur) {
  const invest = pos.buyPrice * pos.qty
  const curVal = cur * pos.qty
  const pnl = curVal - invest
  const pnlPct = invest > 0 ? pnl / invest * 100 : 0
  return { cur, lots: pos.qty / LOT, invest, curVal, pnl, pnlPct, stopHit: pnlPct <= STOP_PCT }
}

export function portfolioTotals(enriched) {
  const invest = enriched.reduce((s, p) => s + p.invest, 0)
  const cur = enriched.reduce((s, p) => s + p.curVal, 0)
  const pnl = cur - invest
  return { invest, cur, pnl, pct: invest > 0 ? pnl / invest * 100 : 0 }
}
