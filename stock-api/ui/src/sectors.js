// Sektor per saham — dipakai heatmap & rekap mingguan.
// Hardcode, sama seperti handlers/syariah.go: EDIT manual saat menambah saham.
// Saham yang tidak terdaftar di sini masuk "Lainnya".
const SECTORS = {
  'Bank':                  ['BBCA', 'BMRI', 'BRIS'],
  'Batu Bara':             ['AADI', 'ADRO', 'ADMR', 'PTBA', 'HRUM', 'BUMI', 'BYAN', 'DEWA', 'TOBA', 'DSSA'],
  'Logam & Mineral':       ['ANTM', 'INCO', 'MBMA', 'MDKA', 'NICL', 'TINS', 'BRMS'],
  'Energi & Migas':        ['MEDC', 'ENRG', 'PGAS', 'RAJA', 'RATU', 'AKRA', 'ESSA'],
  'Konsumer & Ritel':      ['ICBP', 'INDF', 'MYOR', 'UNVR', 'AISA', 'FORE', 'BELL', 'MAPI', 'ACES'],
  'Kesehatan':             ['KLBF', 'SIDO'],
  'Agri':                  ['AALI', 'SIMP', 'CPIN'],
  'Telko & Tekno':         ['TLKM', 'EXCL', 'ISAT', 'INET'],
  'Properti':              ['CTRA', 'BSDE', 'BKSL', 'KOTA', 'BUVA', 'SSIA'],
  'Industri Dasar':        ['SMGR', 'TPIA', 'BRPT'],
  'Otomotif & Alat Berat': ['ASII', 'AUTO', 'GJTL', 'VKTR', 'UNTR'],
  'Transportasi':          ['SMDR', 'SOCI', 'TCPI', 'GTSI', 'BULL', 'HUMI', 'JAYA'],
}

const BY_SYMBOL = Object.fromEntries(
  Object.entries(SECTORS).flatMap(([sector, syms]) => syms.map(s => [s, sector]))
)

export const sectorOf = (symbol) => BY_SYMBOL[symbol] || 'Lainnya'

// Kelompokkan item {symbol, ...} per sektor → [{ sector, items }]
export function groupBySector(items) {
  const m = new Map()
  for (const it of items) {
    const s = sectorOf(it.symbol)
    if (!m.has(s)) m.set(s, [])
    m.get(s).push(it)
  }
  return [...m].map(([sector, items]) => ({ sector, items }))
}

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
