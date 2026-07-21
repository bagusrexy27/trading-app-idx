// Fibonacci discount/premium shading — lightweight-charts v5 ISeriesPrimitive.
// Mengarsir dua area besar sepanjang lebar pane: di bawah level 50% =
// discount (area beli), di atas = premium (area jual). Golden pocket
// (61.8%–78.6%) diarsir lebih pekat karena itu bagian yang paling dilihat.
//
// Pola mengikuti FVGZonesPrimitive — lihat file itu untuk bentuk dasarnya.

// Alpha dinaikkan dari 0.07 — pada 0.07 dua area besar ini praktis tak terlihat
// di sebelah golden pocket, jadi yang tampak cuma pita kuningnya saja.
const ZONE = {
  premium:  { fill: 'rgba(239,83,80,0.16)',  text: 'rgba(239,83,80,0.9)',  label: 'PREMIUM · area jual' },
  discount: { fill: 'rgba(38,166,154,0.16)', text: 'rgba(38,166,154,0.9)', label: 'DISCOUNT · area beli' },
  golden:   { fill: 'rgba(245,185,80,0.26)', text: 'rgba(245,185,80,1)',   label: 'Golden pocket 61.8–78.6%' },
}

// Dua area besar digambar dulu, golden pocket menimpa di atasnya.
const DRAW_ORDER = ['premium', 'discount', 'golden']

class FibPaneRenderer {
  constructor() { this._bands = [] }
  update(bands) { this._bands = bands }
  draw(target) {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      for (const b of this._bands) {
        const yTop = Math.round(b.yTop * vr)
        const yBot = Math.round(b.yBot * vr)
        const h = Math.max(yBot - yTop, 1)
        ctx.fillStyle = b.c.fill
        ctx.fillRect(0, yTop, bitmapSize.width, h)
        // Label hanya kalau pitanya cukup tinggi, biar tidak tumpang tindih.
        if (h > 16 * vr) {
          ctx.fillStyle = b.c.text
          ctx.font = `${Math.round(9 * vr)}px Inter, sans-serif`
          ctx.textBaseline = 'top'
          ctx.fillText(b.c.label, Math.round(6 * hr), yTop + Math.round(4 * vr))
        }
      }
    })
  }
}

class FibPaneView {
  constructor(source) {
    this._source = source
    this._renderer = new FibPaneRenderer()
  }
  update() {
    const { _series: series, _zones: zones } = this._source
    const bands = []
    if (series && zones) {
      for (const kind of DRAW_ORDER) {
        const z = zones[kind]
        if (!z) continue
        const yA = series.priceToCoordinate(z.top)
        const yB = series.priceToCoordinate(z.bottom)
        if (yA == null || yB == null) continue
        bands.push({ yTop: Math.min(yA, yB), yBot: Math.max(yA, yB), c: ZONE[kind] })
      }
    }
    this._renderer.update(bands)
  }
  renderer() { return this._renderer }
  zOrder() { return 'bottom' } // di belakang candle
}

export class FibZonesPrimitive {
  constructor() {
    this._zones = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new FibPaneView(this)
  }
  attached({ series, requestUpdate }) {
    this._series = series
    this._requestUpdate = requestUpdate
  }
  detached() {
    this._series = null
    this._requestUpdate = null
  }
  // fib = respons /api/analysis/{symbol}/fibonacci (l0…l1000).
  // Batas diambil dari nilai aktual, bukan dari asumsi l0 = high, supaya arah
  // retracement (dari atas atau dari bawah) tidak membalik arti zonanya.
  updateFib(fib) {
    if (!fib) {
      this._zones = null
    } else {
      const lo = Math.min(fib.l0, fib.l1000)
      const hi = Math.max(fib.l0, fib.l1000)
      const mid = fib.l500
      this._zones = {
        premium:  { top: hi,  bottom: mid },
        discount: { top: mid, bottom: lo },
        golden:   { top: Math.max(fib.l618, fib.l786), bottom: Math.min(fib.l618, fib.l786) },
      }
    }
    this._requestUpdate?.()
  }
  updateAllViews() { this._paneView.update() }
  paneViews() { return [this._paneView] }
}
