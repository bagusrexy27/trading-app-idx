// Garis & zona support/resistance otomatis — lightweight-charts v5 ISeriesPrimitive.
// Garisnya sendiri dibuat ChartTab lewat createPriceLine (supaya label harga
// muncul di sumbu kanan); primitive ini menambahkan:
//   • arsiran zona (konsolidasi, gap, basis) dari tanggal asalnya ke kanan
//   • teks keterangan di kiri garis, ala garis horizontal TradingView
//
// Pola mengikuti FibZonesPrimitive / FVGZonesPrimitive.

// Warna per level: trigger oranye, low 52 minggu biru, sisanya merah/hijau
// sesuai sisi (resistance / support).
export function levelColor(l) {
  if (l.kind === 'trigger') return '#ff9800'
  if (l.kind === 'low52') return '#2962ff'
  return l.side === 'resistance' ? '#ef5350' : '#26a69a'
}

// Teks harga gaya Indonesia: 1510 → "1.510"
export const idPrice = v => Math.round(v).toLocaleString('id-ID')

export function levelText(l) {
  const price = l.top !== l.bottom ? `${idPrice(l.bottom)}–${idPrice(l.top)}` : idPrice(l.price)
  return `${l.name} ${price} · ${l.label}`
}

const LABEL_H = 13 // tinggi satu baris label (px CSS)

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

class KLRenderer {
  constructor() { this._items = [] }
  update(items) { this._items = items }
  draw(target) {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      ctx.font = `${Math.round(10 * vr)}px Inter, sans-serif`
      ctx.textBaseline = 'bottom'
      for (const it of this._items) {
        const x0 = Math.round(it.x * hr)
        if (it.yBot != null) {
          const yTop = Math.round(it.yTop * vr)
          const h = Math.max(Math.round(it.yBot * vr) - yTop, 1)
          ctx.fillStyle = hexA(it.color, 0.12)
          ctx.fillRect(x0, yTop, bitmapSize.width - x0, h)
        }
        // Label di kiri, di atas garis utamanya (digeser kalau bertabrakan).
        const y = Math.round(it.yLabel * vr)
        const pad = Math.round(6 * hr)
        const w = ctx.measureText(it.text).width
        ctx.fillStyle = 'rgba(19,23,34,0.75)' // tv-bg, biar teks terbaca di atas candle
        ctx.fillRect(pad - 2 * hr, y - 12 * vr, w + 4 * hr, 12 * vr)
        ctx.fillStyle = it.color
        ctx.fillText(it.text, pad, y)
      }
    })
  }
}

class KLPaneView {
  constructor(source) {
    this._source = source
    this._renderer = new KLRenderer()
  }
  update() {
    const { _series: series, _chart: chart, _levels: levels } = this._source
    const items = []
    if (series && chart && levels) {
      const ts = chart.timeScale()
      for (const l of levels) {
        const yLine = series.priceToCoordinate(l.price)
        if (yLine == null) continue
        const color = levelColor(l)
        const it = { yLine, yLabel: yLine - 2, color, text: levelText(l), x: 0, yTop: null, yBot: null }
        if (l.top !== l.bottom) {
          const yA = series.priceToCoordinate(l.top)
          const yB = series.priceToCoordinate(l.bottom)
          if (yA != null && yB != null) {
            it.yTop = Math.min(yA, yB)
            it.yBot = Math.max(yA, yB)
            // Zona dimulai dari tanggal asalnya; kalau di luar layar → tepi kiri.
            const x = l.date ? ts.timeToCoordinate(l.date) : null
            it.x = x != null && x > 0 ? x : 0
          }
        }
        items.push(it)
      }
    }
    // Level yang berdekatan di layar → teksnya ditumpuk ke bawah, jarak 13px.
    const byY = [...items].sort((a, b) => a.yLine - b.yLine)
    for (let i = 1; i < byY.length; i++) {
      byY[i].yLabel = Math.max(byY[i].yLabel, byY[i - 1].yLabel + LABEL_H)
    }
    this._renderer.update(items)
  }
  renderer() { return this._renderer }
  zOrder() { return 'bottom' }
}

export class KeyLevelsPrimitive {
  constructor() {
    this._levels = null
    this._series = null
    this._chart = null
    this._requestUpdate = null
    this._paneView = new KLPaneView(this)
  }
  attached({ chart, series, requestUpdate }) {
    this._chart = chart
    this._series = series
    this._requestUpdate = requestUpdate
  }
  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }
  // levels = respons /api/analysis/{symbol}/levels → .levels (null = kosongkan)
  updateLevels(levels) {
    this._levels = levels && levels.length ? levels : null
    this._requestUpdate?.()
  }
  updateAllViews() { this._paneView.update() }
  paneViews() { return [this._paneView] }
}
