import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../api'
import { fmt, colorOf } from '../utils'

const REFRESH_MS = 60_000 // 1 menit (cache backend juga 60s)

export default function IHSGBadge() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastTick, setLastTick] = useState(null)
  const [pulse, setPulse]     = useState(false)
  const prevLastRef = useRef(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const d = await api.ihsg()
      if (prevLastRef.current != null && d.last !== prevLastRef.current) {
        setPulse(true)
        setTimeout(() => setPulse(false), 900)
      }
      prevLastRef.current = d.last
      setData(d)
      setError(null)
      setLastTick(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-tv-red/10 border border-tv-red/30 text-tv-red text-xs">
        <span>⚠️ IHSG: {error}</span>
        <button onClick={load} className="underline hover:no-underline">retry</button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-tv-card border border-tv-border text-tv-muted text-xs">
        <div className="w-3 h-3 border border-tv-border border-t-tv-blue rounded-full animate-spin" />
        <span>IHSG memuat...</span>
      </div>
    )
  }

  const up    = data.change_pct >= 0
  const color = colorOf(data.change_pct)
  const bg    = up ? 'bg-tv-green/5 border-tv-green/30' : 'bg-tv-red/5 border-tv-red/30'

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border ${bg} transition-colors ${pulse ? 'ihsg-pulse' : ''}`}
      title={`Open ${fmt.price(data.open)} • High ${fmt.price(data.high)} • Low ${fmt.price(data.low)} • Update: ${lastTick?.toLocaleTimeString('id-ID')}`}
    >
      <span className="text-[10px] font-bold text-tv-muted tracking-wider">IHSG</span>

      <span className="text-sm font-bold tabular-nums text-tv-text">
        {data.last.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      <span className={`text-xs font-semibold tabular-nums ${color}`}>
        {up ? '▲' : '▼'} {Math.abs(data.change).toFixed(2)}
      </span>

      <span className={`text-xs font-semibold tabular-nums ${color}`}>
        ({fmt.pct(data.change_pct)})
      </span>

      {data.delayed && (
        <span className="text-[9px] text-tv-muted border border-tv-border px-1.5 py-0.5 rounded-full">
          ~15m delay
        </span>
      )}

      <button
        onClick={load}
        disabled={refreshing}
        className="text-tv-muted hover:text-tv-text transition-colors text-[11px] ml-1 disabled:opacity-40"
        title="Refresh IHSG"
      >
        <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
      </button>
    </div>
  )
}
