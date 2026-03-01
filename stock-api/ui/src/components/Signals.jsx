import { fmt, signalStyle } from '../utils'

export default function Signals({ data }) {
  const { signals, atr, prices } = data
  if (!signals) return <div className="p-8 text-tv-muted text-center text-sm">Tidak ada data sinyal</div>

  const { signal, score, max_score, strength, close, date, breakdown } = signals
  const pct = (score / max_score) * 100
  const isPos = score >= 0

  return (
    <div className="p-5 space-y-5">
      {/* Main signal */}
      <div className="bg-tv-card border border-tv-border rounded-2xl p-8 text-center">
        <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-4">Sinyal Trading Komposit</div>

        <div className={`inline-block px-8 py-4 rounded-xl border-2 text-3xl font-black tracking-tight mb-4 animate-slide-up
          ${signalStyle(signal)}
          ${signal?.includes('BUY')  ? 'animate-glow-green' : ''}
          ${signal?.includes('SELL') ? 'animate-glow-red'   : ''}`}
        >
          {signal}
        </div>

        <div className="text-sm text-tv-muted mb-1">
          Skor: <b className="text-tv-text">{score}</b> / {max_score}
          <span className="mx-2">·</span>
          Kekuatan: <b className="text-tv-text">{(Math.abs(parseFloat(strength)) * 100).toFixed(0)}%</b>
        </div>

        {/* Strength bar */}
        <div className="relative h-2.5 bg-tv-bg rounded-full overflow-hidden w-64 mx-auto mt-3">
          <div className="absolute inset-y-0 left-1/2 w-px bg-tv-border z-10" />
          <div
            className={`absolute top-0 h-full rounded-full transition-all duration-700
              ${isPos ? 'bg-tv-green left-1/2' : 'bg-tv-red right-1/2'}`}
            style={{ width: `${Math.abs(parseFloat(strength)) * 50}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-tv-muted mt-1 w-64 mx-auto">
          <span>Strong Sell</span>
          <span>Neutral</span>
          <span>Strong Buy</span>
        </div>

        <div className="mt-5 text-xs text-tv-muted">
          Harga: <b className="text-tv-text">{fmt.price(close)}</b>
          <span className="mx-1.5">·</span>
          {date}
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-tv-border">
          <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">Breakdown Indikator</span>
        </div>
        <div className="divide-y divide-tv-border">
          {(breakdown || []).map((b, i) => (
            <div key={i}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-tv-hover transition-colors animate-slide-up"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              {/* Score icon */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                ${b.score > 0 ? 'bg-tv-green/15 text-tv-green' : b.score < 0 ? 'bg-tv-red/15 text-tv-red' : 'bg-tv-muted/10 text-tv-muted'}`}>
                {b.score > 0 ? '▲' : b.score < 0 ? '▼' : '●'}
              </div>

              {/* Indicator name */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-tv-text">{b.indicator}</div>
                <div className="text-[10px] text-tv-muted truncate mt-0.5">{b.reason}</div>
              </div>

              {/* Value */}
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-bold tabular-nums text-tv-text">{fmt.num(b.value)}</div>
              </div>

              {/* Signal badge */}
              <div className="flex-shrink-0">
                <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap
                  ${b.signal === 'BUY'  ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
                  : b.signal === 'SELL' ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
                  : 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'}`}>
                  {b.signal}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ATR Stop-Loss card */}
      {atr && atr.length > 0 && (() => {
        const atrVal  = atr[atr.length - 1]?.value ?? 0
        const close   = prices?.[prices.length - 1]?.close ?? 0
        const stop1x  = close - atrVal
        const stop2x  = close - 2 * atrVal
        const tgt1x   = close + atrVal
        const tgt2x   = close + 2 * atrVal
        return (
          <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-tv-border flex items-center justify-between">
              <span className="text-[10px] font-bold text-tv-muted uppercase tracking-wider">ATR (14) — Level Stop & Target</span>
              <span className="text-xs font-bold tabular-nums text-tv-yellow">{fmt.num(atrVal)}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-tv-border">
              <div className="px-5 py-4 space-y-2">
                <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Stop-Loss</div>
                <div className="flex justify-between text-xs">
                  <span className="text-tv-muted">1× ATR</span>
                  <span className="font-bold tabular-nums text-tv-red">{fmt.price(stop1x)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-tv-muted">2× ATR</span>
                  <span className="font-bold tabular-nums text-tv-red">{fmt.price(stop2x)}</span>
                </div>
              </div>
              <div className="px-5 py-4 space-y-2">
                <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Target Profit</div>
                <div className="flex justify-between text-xs">
                  <span className="text-tv-muted">1× ATR</span>
                  <span className="font-bold tabular-nums text-tv-green">{fmt.price(tgt1x)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-tv-muted">2× ATR</span>
                  <span className="font-bold tabular-nums text-tv-green">{fmt.price(tgt2x)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Disclaimer */}
      <p className="text-[10px] text-tv-muted text-center px-4 leading-relaxed">
        ⚠️ Sinyal ini dihasilkan dari analisis teknikal otomatis dan bukan saran investasi.
        Selalu lakukan riset mandiri sebelum mengambil keputusan trading.
      </p>
    </div>
  )
}
