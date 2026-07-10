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

export default function IHSGChart() {
  const containerRef = useRef(null)
  const [interval, setInterval] = useState('D')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    loadTVScript()
      .then(() => {
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        const id = `tv_ihsg_${Date.now()}`
        containerRef.current.id = id

        new window.TradingView.widget({
          autosize: true,
          symbol: 'IDX:COMPOSITE',
          interval,
          timezone: 'Asia/Jakarta',
          theme: 'dark',
          style: '1',
          locale: 'id',
          toolbar_bg: '#1e222d',
          enable_publishing: false,
          allow_symbol_change: false,
          hide_side_toolbar: true,
          withdateranges: true,
          container_id: id,
          studies: ['MASimple@tv-basicstudies', 'Volume@tv-basicstudies'],
        })
      })
      .catch(err => !cancelled && setError(err.message))

    return () => { cancelled = true }
  }, [interval])

  return (
    <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-2 border-b border-tv-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">📈 IHSG (Jakarta Composite)</span>
          <span className="text-[10px] text-tv-muted bg-tv-bg border border-tv-border px-2 py-0.5 rounded-full">
            TradingView · ~15m delay
          </span>
        </div>
        <div className="flex items-center gap-1">
          {['15', '60', 'D', 'W', 'M'].map(iv => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={`px-2 py-1 text-[11px] rounded border transition-colors
                ${interval === iv
                  ? 'bg-tv-blue/10 border-tv-blue/40 text-tv-blue'
                  : 'bg-tv-bg border-tv-border text-tv-muted hover:text-tv-text'}`}
            >
              {iv === 'D' ? '1D' : iv === 'W' ? '1W' : iv === 'M' ? '1M' : `${iv}m`}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[420px] bg-tv-bg">
        {error ? (
          <div className="h-full flex items-center justify-center text-tv-red text-sm">⚠️ {error}</div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}
