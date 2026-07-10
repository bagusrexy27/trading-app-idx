import { useEffect, useRef, useState } from 'react'

const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js'

function loadTVScript() {
  if (window.TradingView) return Promise.resolve()
  if (window.__tvScriptPromise) return window.__tvScriptPromise
  window.__tvScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = TV_SCRIPT_SRC
    s.async = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Gagal memuat script TradingView'))
    document.head.appendChild(s)
  })
  return window.__tvScriptPromise
}

export default function TradingView({ symbol }) {
  const tvSymbol = symbol ? `IDX:${symbol}` : ''
  const containerRef = useRef(null)
  const [interval, setInterval] = useState('D')
  const [studies, setStudies] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!symbol) return
    let cancelled = false

    loadTVScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const containerId = `tv_chart_${symbol}_${Date.now()}`
        containerRef.current.id = containerId

        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval,
          timezone: 'Asia/Jakarta',
          theme: 'dark',
          style: '1',
          locale: 'id',
          toolbar_bg: '#1e222d',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_side_toolbar: false,
          withdateranges: true,
          container_id: containerId,
          studies: studies
            ? ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'Volume@tv-basicstudies']
            : [],
        })
      })
      .catch(err => !cancelled && setError(err.message))

    return () => { cancelled = true }
  }, [symbol, tvSymbol, interval, studies])

  if (!symbol) {
    return (
      <div className="flex items-center justify-center h-full text-tv-muted text-sm">
        Pilih saham dulu
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-tv-border bg-tv-card">
        <span className="text-xs text-tv-muted">Symbol:</span>
        <span className="text-xs font-mono text-tv-text bg-tv-bg border border-tv-border px-2 py-0.5 rounded">
          {tvSymbol}
        </span>

        <div className="flex items-center gap-1 ml-3">
          <span className="text-xs text-tv-muted mr-1">Interval:</span>
          {['1', '5', '15', '60', 'D', 'W'].map(iv => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-2 py-1 text-[11px] rounded border transition-colors
                ${interval === iv
                  ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue'
                  : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
            >
              {iv === 'D' ? '1D' : iv === 'W' ? '1W' : `${iv}m`}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 ml-3 text-xs text-tv-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={studies}
            onChange={e => setStudies(e.target.checked)}
            className="accent-tv-blue"
          />
          MA + RSI + Volume
        </label>

        <span className="ml-auto text-[10px] text-tv-muted">
          Data delay ~15 menit (gratis). Login TradingView untuk realtime.
        </span>
      </div>

      <div className="flex-1 relative bg-tv-bg">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-tv-red text-sm">
            ⚠️ {error}
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}
