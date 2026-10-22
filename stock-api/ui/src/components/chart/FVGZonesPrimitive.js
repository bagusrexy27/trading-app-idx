// FVG/iFVG zone overlay — lightweight-charts v5 ISeriesPrimitive.
// Kotak translusen dari candle asal gap (iFVG: dari candle yang menembusnya,
// saat perannya berbalik) memanjang sampai tepi kanan pane, termasuk area
// kosong di kanan candle terakhir ("extend right" ala TradingView).

const COLORS = {
  bull:     { fill: 'rgba(38,166,154,0.12)', border: 'rgba(38,166,154,0.5)', text: 'rgba(38,166,154,0.9)' },
  bear:     { fill: 'rgba(239,83,80,0.12)',  border: 'rgba(239,83,80,0.5)',  text: 'rgba(239,83,80,0.9)' },
  inverted: { fill: 'rgba(245,185,80,0.14)', border: 'rgba(245,185,80,0.6)', text: 'rgba(245,185,80,0.95)' },
}

// Time bisa 'YYYY-MM-DD' atau BusinessDay {year,month,day}
const timeToStr = t => typeof t === 'string'
  ? t
  : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`

class FVGPaneRenderer {
  constructor() { this._rects = [] }
  update(rects) { this._rects = rects }
  draw(target) {
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      const labels = [] // y-center label yang sudah digambar, untuk cegah tumpuk
      const fs = Math.round(9 * vr)
      ctx.font = `${fs}px Inter, sans-serif`
      ctx.textBaseline = 'middle'
      for (const r of this._rects) {
        const x    = Math.round(r.x * hr)
        const w    = bitmapSize.width - x            // zona memanjang sampai "sekarang"
        const yTop = Math.round(r.yTop * vr)
        const yBot = Math.round(r.yBot * vr)
        const h    = Math.max(yBot - yTop, 1)
        if (w <= 0) continue
        ctx.fillStyle = r.c.fill
        ctx.fillRect(x, yTop, w, h)
        const bw = Math.max(1, Math.round(hr))       // border 1px media
        ctx.fillStyle = r.c.border
        ctx.fillRect(x, yTop, w, bw)
        ctx.fillRect(x, yBot - bw, w, bw)
        // label di tepi kanan zona; lewati kalau berdempetan dengan label lain
        const yMid = (yTop + yBot) / 2
        if (labels.some(y => Math.abs(y - yMid) < fs * 1.3)) continue
        const tw = ctx.measureText(r.label).width
        const tx = bitmapSize.width - tw - Math.round(6 * hr)
        if (tx < x) continue
        labels.push(yMid)
        ctx.fillStyle = r.c.text
        ctx.fillText(r.label, tx, yMid)
      }
    })
  }
}

class FVGPaneView {
  constructor(source) {
    this._source = source
    this._renderer = new FVGPaneRenderer()
  }
  update() {
    const { _chart: chart, _series: series, _zones: zones } = this._source
    const rects = []
    if (chart && series && zones.length) {
      const ts = chart.timeScale()
      const vis = ts.getVisibleRange()
      for (const z of zones) {
        const yA = series.priceToCoordinate(z.top)
        const yB = series.priceToCoordinate(z.bottom)
        if (yA == null || yB == null) continue
        const start = z.status === 'inverted' && z.inverted_date ? z.inverted_date : z.date
        let x = ts.timeToCoordinate(start)
        if (x == null) {
          // Candle awal zona di luar viewport: clamp ke kiri kalau lebih tua
          // dari range terlihat (zona tetap membentang ke kanan), selain itu skip.
          if (vis && start < timeToStr(vis.from)) x = 0
          else continue
        }
        const c = z.status === 'inverted' ? COLORS.inverted : (COLORS[z.type] ?? COLORS.bull)
        rects.push({
          x,
          yTop: Math.min(yA, yB),
          yBot: Math.max(yA, yB),
          c,
          label: z.status === 'inverted' ? 'iFVG' : 'FVG',
        })
      }
    }
    this._renderer.update(rects)
  }
  renderer() { return this._renderer }
  zOrder() { return 'bottom' } // di belakang candle
}

export class FVGZonesPrimitive {
  constructor() {
    this._zones = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new FVGPaneView(this)
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
  updateZones(zones) {
    this._zones = zones ?? []
    this._requestUpdate?.()
  }
  updateAllViews() { this._paneView.update() }
  paneViews() { return [this._paneView] }
}
