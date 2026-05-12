// FundamentalAnalysis.jsx — displays pre-analysed fundamental data for a stock

function fmtB(val) {
  if (val == null) return '—'
  const b = val / 1000
  return (b >= 0 ? '+' : '') + b.toFixed(1) + 'B'
}

function fmtBPlain(val) {
  if (val == null) return '—'
  return (val / 1000).toFixed(1) + 'B'
}

function yoy(curr, prev) {
  if (prev == null || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

function YoYBadge({ curr, prev, invert = false }) {
  const pct = yoy(curr, prev)
  if (pct == null) return null
  const positive = invert ? pct < 0 : pct > 0
  const color = positive ? 'text-tv-green' : 'text-tv-red'
  const arrow = pct > 0 ? '↑' : '↓'
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {arrow}{Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MetricRow({ label, curr, prev, invert = false, unit = 'B' }) {
  const fmt = (v) => {
    if (v == null) return '—'
    if (unit === '%') return v.toFixed(1) + '%'
    return fmtBPlain(v)
  }
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-tv-border/40 last:border-0">
      <span className="text-[11px] text-tv-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-tv-text">{fmt(curr)}</span>
        {prev != null && (
          <span className="text-[11px] text-tv-muted/60">{fmt(prev)}</span>
        )}
        <YoYBadge curr={curr} prev={prev} invert={invert} />
      </div>
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-tv-bg rounded-lg border border-tv-border p-4">
      <h4 className="text-[11px] font-semibold text-tv-muted uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  )
}

export default function FundamentalAnalysis({ data }) {
  if (!data) return null

  const { income_statement: is, balance_sheet: bs, cash_flow: cf, analysis } = data

  const topMetrics = [
    {
      label: 'Revenue',
      value: is?.revenue,
      prev: is?.revenue_prev,
    },
    {
      label: 'Laba Bruto',
      value: is?.gross_profit,
      prev: is?.gross_profit_prev,
    },
    {
      label: 'EPS',
      value: is?.eps != null ? is.eps : null,
      prev: is?.eps_prev != null ? is.eps_prev : null,
      isEps: true,
    },
  ]

  return (
    <div className="space-y-4 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-tv-text">{data.company_name ?? data.symbol}</h3>
          <p className="text-[11px] text-tv-muted mt-0.5">
            {data.period} · Laporan per {data.report_date} · Diperbarui {data.updated_at}
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-tv-blue/10 text-tv-blue border border-tv-blue/20 font-semibold uppercase tracking-wide">
          Fundamental
        </span>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-3 gap-3">
        {topMetrics.map((m) => {
          if (m.isEps) {
            const positive = m.value != null && m.value >= 0
            const prevPositive = m.prev != null && m.prev >= 0
            return (
              <div key={m.label} className="bg-tv-bg rounded-lg border border-tv-border p-3">
                <p className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{m.label}</p>
                <p className={`text-lg font-bold ${positive ? 'text-tv-green' : 'text-tv-red'}`}>
                  {m.value != null ? (m.value >= 0 ? '+' : '') + m.value.toFixed(2) : '—'}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[11px] ${prevPositive ? 'text-tv-green/60' : 'text-tv-red/60'}`}>
                    vs {m.prev != null ? (m.prev >= 0 ? '+' : '') + m.prev.toFixed(2) : '—'}
                  </span>
                </div>
              </div>
            )
          }
          const pct = yoy(m.value, m.prev)
          const positive = pct != null && pct >= 0
          return (
            <div key={m.label} className="bg-tv-bg rounded-lg border border-tv-border p-3">
              <p className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{m.label}</p>
              <p className="text-lg font-bold text-tv-text">{fmtBPlain(m.value)}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[11px] text-tv-muted/60">{fmtBPlain(m.prev)}</span>
                {pct != null && (
                  <span className={`text-[11px] font-medium ${positive ? 'text-tv-green' : 'text-tv-red'}`}>
                    {pct > 0 ? '↑' : '↓'}{Math.abs(pct).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {is && (
          <SectionCard title="Laba Rugi">
            <MetricRow label="Revenue"          curr={is.revenue}          prev={is.revenue_prev} />
            <MetricRow label="Laba Bruto"       curr={is.gross_profit}     prev={is.gross_profit_prev} />
            <MetricRow label="Margin Bruto"      curr={is.gross_margin}      prev={is.gross_margin_prev}      unit="%" />
            <MetricRow label="Laba Operasi"     curr={is.operating_profit} prev={is.operating_profit_prev} />
            <MetricRow label="Beban Keuangan"   curr={is.finance_charges}  prev={is.finance_charges_prev} invert />
            <MetricRow label="Laba Bersih"      curr={is.net_profit}       prev={is.net_profit_prev} />
            <MetricRow label="Laba ke Induk"    curr={is.net_profit_parent} prev={is.net_profit_parent_prev} />
          </SectionCard>
        )}

        {bs && (
          <SectionCard title="Neraca">
            <MetricRow label="Kas"              curr={bs.cash}            prev={bs.cash_prev} />
            <MetricRow label="Total Aset"       curr={bs.total_assets}    prev={bs.total_assets_prev} />
            <MetricRow label="Total Liabilitas" curr={bs.total_liabilities} prev={bs.total_liabilities_prev} invert />
            <MetricRow label="Utang Jk. Panjang" curr={bs.long_term_debt}  prev={bs.long_term_debt_prev} invert />
            <MetricRow label="Total Ekuitas"    curr={bs.total_equity}    prev={bs.total_equity_prev} />
            <MetricRow label="Defisit"          curr={bs.deficit}         prev={bs.deficit_prev} invert />
          </SectionCard>
        )}

        {cf && (
          <SectionCard title="Arus Kas">
            <MetricRow label="Kas Operasi"      curr={cf.operating_cf}    prev={cf.operating_cf_prev} />
          </SectionCard>
        )}
      </div>

      {/* Positives & Risks */}
      {analysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.positives?.length > 0 && (
            <div className="bg-tv-green/5 border border-tv-green/20 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-tv-green uppercase tracking-wider mb-2">Positif</h4>
              <ul className="space-y-1.5">
                {analysis.positives.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-tv-text">
                    <span className="flex-shrink-0 mt-0.5">✅</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.risks?.length > 0 && (
            <div className="bg-tv-red/5 border border-tv-red/20 rounded-lg p-4">
              <h4 className="text-[11px] font-semibold text-tv-red uppercase tracking-wider mb-2">Risiko</h4>
              <ul className="space-y-1.5">
                {analysis.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-tv-text">
                    <span className="flex-shrink-0 mt-0.5">⚠️</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {analysis?.summary && (
        <div className="flex gap-3 p-4 rounded-lg bg-tv-yellow/5 border border-tv-yellow/20">
          <span className="flex-shrink-0 mt-0.5">📝</span>
          <p className="text-[12px] text-tv-text leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      <div className="border-t border-tv-border/40" />
    </div>
  )
}
