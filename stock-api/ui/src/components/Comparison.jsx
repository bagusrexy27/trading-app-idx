import { useState, useEffect } from 'react'
import ReactApexChart from 'react-apexcharts'
import { api } from '../api'
import { fmt, colorOf, APEX_DARK } from '../utils'

const RANGE_DAYS = { '1M': 22, '3M': 66, '6M': 130, '1Y': 252 }
const COLORS = ['#2196f3', '#26a69a', '#ef5350', '#ff9800', '#ab47bc']

export default function Comparison({ stocks: stockList, showToast }) {
  const [selected, setSelected] = useState([])
  const [range, setRange]       = useState('3M')
  const [data, setData]         = useState({})
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (selected.length === 0) { setData({}); return }
    setLoading(true)
    const days = RANGE_DAYS[range]
    Promise.all(
      selected.map(sym => api.stocks.get(sym, days).then(r => ({ sym, prices: r?.prices || [] })))
    )
      .then(results => {
        const map = {}
        results.forEach(({ sym, prices }) => { map[sym] = prices })
        setData(map)
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [selected, range])

  const toggleSymbol = (sym) => {
    setSelected(prev =>
      prev.includes(sym)
        ? prev.filter(s => s !== sym)
        : prev.length < 5 ? [...prev, sym] : prev
    )
  }

  // Build normalized chart series (base = 100 at first point of range)
  const series = selected.map((sym, idx) => {
    const prices = data[sym] || []
    if (prices.length === 0) return { name: sym, data: [] }
    const base = prices[0].close
    return {
      name: sym,
      color: COLORS[idx],
      data: prices.map(p => ({ x: p.date, y: base > 0 ? +((p.close / base * 100).toFixed(2)) : 100 })),
    }
  })

  // Compute return metrics
  const metrics = selected.map((sym, idx) => {
    const prices = data[sym] || []
    if (prices.length < 2) return { sym, color: COLORS[idx], ret: null }
    const base = prices[0].close
    const last = prices[prices.length - 1].close
    return { sym, color: COLORS[idx], ret: base > 0 ? (last - base) / base * 100 : 0, last }
  })

  const chartOptions = {
    ...APEX_DARK,
    chart: {
      ...APEX_DARK.chart,
      type: 'line',
      height: 380,
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    stroke: { width: 2.5, curve: 'smooth' },
    xaxis: { type: 'category', labels: { rotate: 0, style: { fontSize: '9px', colors: '#64748b' }, formatter: v => v?.slice(5) }, tickAmount: 8, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: '#64748b', fontSize: '10px' }, formatter: v => v?.toFixed(0) + '%' } },
    tooltip: { shared: true, y: { formatter: v => v?.toFixed(2) + '%' }, theme: 'dark' },
    legend: { show: false },
    grid: { borderColor: '#1e222d', strokeDashArray: 3 },
    annotations: {
      yaxis: [{ y: 100, borderColor: '#334155', strokeDashArray: 4, label: { text: 'Base 100', style: { color: '#64748b', background: '#1e222d', fontSize: '9px' } } }],
    },
  }

  return (
    <div className="p-5 space-y-4 animate-fade-in">
      <div>
        <h2 className="text-base font-bold">Multi-Stock Comparison</h2>
        <p className="text-xs text-tv-muted mt-0.5">Bandingkan pergerakan hingga 5 saham (dinormalisasi ke 100)</p>
      </div>

      {/* Symbol picker */}
      <div className="bg-tv-card border border-tv-border rounded-xl p-4">
        <div className="text-[10px] font-bold uppercase text-tv-muted mb-2.5">Pilih Saham (max 5)</div>
        <div className="flex flex-wrap gap-2">
          {(stockList || []).map((s, i) => {
            const idx = selected.indexOf(s.symbol)
            const active = idx !== -1
            return (
              <button
                key={s.symbol}
                onClick={() => toggleSymbol(s.symbol)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all
                  ${active
                    ? 'text-white border-transparent'
                    : 'border-tv-border text-tv-muted hover:text-tv-text hover:border-tv-blue/40'}`}
                style={active ? { backgroundColor: COLORS[idx], borderColor: COLORS[idx] } : {}}
              >
                {s.symbol}
              </button>
            )
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <>
          {/* Range selector */}
          <div className="flex items-center gap-1">
            {Object.keys(RANGE_DAYS).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all
                  ${range === r ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue' : 'border-tv-border text-tv-muted hover:text-tv-text'}`}>
                {r}
              </button>
            ))}
            {loading && <div className="ml-2 w-4 h-4 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin" />}
          </div>

          {/* Legend + metrics */}
          <div className="flex flex-wrap gap-3">
            {metrics.map(m => (
              <div key={m.sym} className="flex items-center gap-2 bg-tv-card border border-tv-border rounded-lg px-3 py-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                <span className="text-xs font-bold">{m.sym}</span>
                {m.ret != null && (
                  <span className={`text-xs font-semibold tabular-nums ${colorOf(m.ret)}`}>
                    {m.ret >= 0 ? '+' : ''}{m.ret.toFixed(2)}%
                  </span>
                )}
                {m.last != null && <span className="text-[10px] text-tv-muted tabular-nums">{fmt.price(m.last)}</span>}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-tv-card border border-tv-border rounded-xl p-4">
            {series.some(s => s.data.length > 0) ? (
              <ReactApexChart
                type="line"
                series={series}
                options={chartOptions}
                height={380}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-tv-muted text-sm">
                <div className="w-5 h-5 border-2 border-tv-border border-t-tv-blue rounded-full animate-spin mr-2" />
                Memuat data...
              </div>
            )}
          </div>
        </>
      )}

      {selected.length === 0 && (
        <div className="text-center py-20 text-tv-muted">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-sm">Pilih saham di atas untuk membandingkan</p>
        </div>
      )}
    </div>
  )
}
