import { fmt, colorOf, bgOf } from '../utils'

export default function Overview({ data }) {
  const { summary } = data
  const { changes, price, volume, moving_averages: ma, indicators, ['52_week']: wk52 } = summary

  return (
    <div className="p-5 space-y-5">
      {/* Price changes row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '1 Hari',   v: changes['1d'] },
          { label: '5 Hari',   v: changes['5d'] },
          { label: '1 Bulan',  v: changes['1m'] },
          { label: '3 Bulan',  v: changes['3m'] },
        ].map(({ label, v }, i) => (
          <div key={label}
            className="bg-tv-card border border-tv-border rounded-xl p-4 text-center animate-slide-up"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="text-[10px] text-tv-muted font-semibold uppercase mb-2">{label}</div>
            <div className={`text-lg font-bold tabular-nums ${colorOf(v.pct)}`}>
              {fmt.pct(v.pct)}
            </div>
            <div className={`text-xs font-medium tabular-nums mt-0.5 ${colorOf(v.change)}`}>
              {fmt.chg(v.change)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 52-week range */}
        <Card title="52-Week Range">
          <div className="flex justify-between text-xs text-tv-muted mb-2">
            <span>Low: <b className="text-tv-red">{fmt.price(wk52.low)}</b></span>
            <span>High: <b className="text-tv-green">{fmt.price(wk52.high)}</b></span>
          </div>
          <div className="relative h-3 bg-tv-bg rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-tv-red via-tv-yellow to-tv-green rounded-full"
              style={{ width: '100%', opacity: 0.25 }}
            />
            {(() => {
              const pct = wk52.high === wk52.low ? 50
                : ((price.close - wk52.low) / (wk52.high - wk52.low)) * 100
              return (
                <div
                  className="absolute top-0 w-3 h-3 bg-white rounded-full border-2 border-tv-blue shadow"
                  style={{ left: `calc(${Math.min(Math.max(pct, 0), 100)}% - 6px)` }}
                />
              )
            })()}
          </div>
          <div className="flex justify-between text-[10px] text-tv-muted mt-1">
            <span>dari high: <span className="text-tv-red">{fmt.pct(wk52.pct_from_high)}</span></span>
            <span>dari low: <span className="text-tv-green">{fmt.pct(wk52.pct_from_low)}</span></span>
          </div>
        </Card>

        {/* Volume */}
        <Card title="Volume">
          <Metric label="Volume Hari Ini"     value={fmt.vol(volume.current)} />
          <Metric label="Rata-rata 20 Hari"   value={fmt.vol(volume.avg_20d)} />
          <Metric label="Rasio vs Rata-rata"
            value={
              <span className={volume.ratio_vs_avg > 1.5 ? 'text-tv-green font-bold' :
                               volume.ratio_vs_avg < 0.5 ? 'text-tv-red' : 'text-tv-text'}>
                {fmt.num(volume.ratio_vs_avg)}x
              </span>
            }
          />
          <div className="mt-3 h-2 bg-tv-bg rounded-full overflow-hidden">
            <div
              className="h-full bg-tv-blue rounded-full transition-all"
              style={{ width: `${Math.min(volume.ratio_vs_avg * 50, 100)}%` }}
            />
          </div>
        </Card>

        {/* Moving Averages */}
        <Card title="Moving Averages">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border
              ${ma.trend === 'bullish' ? 'bg-tv-green/10 text-tv-green border-tv-green/30'
              : ma.trend === 'bearish' ? 'bg-tv-red/10 text-tv-red border-tv-red/30'
              : 'bg-tv-muted/10 text-tv-muted border-tv-muted/20'}`}>
              {ma.trend?.toUpperCase()}
            </span>
            <span className="text-[10px] text-tv-muted">
              {ma.trend === 'bullish' ? 'SMA20 > SMA50' : ma.trend === 'bearish' ? 'SMA20 < SMA50' : 'Mixed'}
            </span>
          </div>
          <Metric label="SMA 20"  value={fmt.price(ma.sma_20)} accent="text-tv-yellow" />
          <Metric label="SMA 50"  value={fmt.price(ma.sma_50)} accent="text-tv-purple" />
          <Metric label="SMA 200" value={fmt.price(ma.sma_200)} />
        </Card>

        {/* Key Indicators */}
        <Card title="Indikator Utama">
          <RSIBar rsi={indicators.rsi_14} />
          <div className="mt-3 pt-3 border-t border-tv-border">
            <MACDRow macd={indicators.macd} />
          </div>
          <div className="mt-3 pt-3 border-t border-tv-border">
            <BollingerRow boll={indicators.bollinger} />
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ── sub-components ──────────────────────────────────────────── */

function Card({ title, children }) {
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-4">
      <div className="text-[10px] font-bold uppercase text-tv-muted tracking-wider mb-3">{title}</div>
      {children}
    </div>
  )
}

function Metric({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-tv-border last:border-0">
      <span className="text-xs text-tv-muted">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${accent || 'text-tv-text'}`}>{value}</span>
    </div>
  )
}

function RSIBar({ rsi }) {
  const pct = Math.min(Math.max(rsi, 0), 100)
  const label = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const color = rsi >= 70 ? 'bg-tv-red' : rsi <= 30 ? 'bg-tv-green' : 'bg-tv-blue'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-tv-muted">RSI(14)</span>
        <span className={`font-bold ${rsi >= 70 ? 'text-tv-red' : rsi <= 30 ? 'text-tv-green' : 'text-tv-blue'}`}>
          {fmt.num(rsi)} <span className="text-tv-muted font-normal">· {label}</span>
        </span>
      </div>
      <div className="h-2 bg-tv-bg rounded-full overflow-hidden relative">
        <div className="absolute left-[30%] w-px h-full bg-tv-border" />
        <div className="absolute left-[70%] w-px h-full bg-tv-border" />
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-tv-muted mt-0.5">
        <span>0</span><span>30</span><span>70</span><span>100</span>
      </div>
    </div>
  )
}

function MACDRow({ macd }) {
  if (!macd) return null
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-tv-muted">MACD(12,26,9)</span>
      <div className="flex gap-3 tabular-nums">
        <span className="text-tv-muted">M:<b className="text-tv-text ml-1">{fmt.num(macd.macd)}</b></span>
        <span className="text-tv-muted">S:<b className="text-tv-text ml-1">{fmt.num(macd.signal)}</b></span>
        <span className={`font-bold ${colorOf(macd.histogram)}`}>
          H:{macd.histogram > 0 ? '+' : ''}{fmt.num(macd.histogram)}
        </span>
      </div>
    </div>
  )
}

function BollingerRow({ boll }) {
  if (!boll) return null
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-tv-muted">Bollinger(20,2)</span>
      <div className="flex gap-2 text-tv-muted tabular-nums">
        <span>%B: <b className="text-tv-text">{fmt.num(boll.percent_b)}%</b></span>
        <span>BW: <b className="text-tv-text">{fmt.num(boll.bandwidth)}%</b></span>
      </div>
    </div>
  )
}
