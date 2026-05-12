const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'Terjadi kesalahan pada server')
  return json.data
}

export const api = {
  analysis: {
    summary:    (s)    => req(`/analysis/${s}/summary`),
    signals:    (s)    => req(`/analysis/${s}/signals`),
    rsi:        (s, n) => req(`/analysis/${s}/rsi?limit=${n ?? 300}`),
    macd:       (s, n) => req(`/analysis/${s}/macd?limit=${n ?? 300}`),
    bollinger:  (s, n) => req(`/analysis/${s}/bollinger?limit=${n ?? 300}`),
    stochastic: (s, n) => req(`/analysis/${s}/stochastic?limit=${n ?? 300}`),
    sma:        (s, p, n) => req(`/analysis/${s}/sma?period=${p}&limit=${n ?? 300}`),
    atr:        (s, n)    => req(`/analysis/${s}/atr?limit=${n ?? 300}`),
    obv:        (s, n)    => req(`/analysis/${s}/obv?limit=${n ?? 300}`),
    ai:         (s)       => req(`/analysis/${s}/ai`),
    adx:        (s, n)    => req(`/analysis/${s}/adx?limit=${n ?? 300}`),
    vwap:       (s, n)    => req(`/analysis/${s}/vwap?limit=${n ?? 300}`),
    sar:        (s, n)    => req(`/analysis/${s}/sar?limit=${n ?? 300}`),
    ichimoku:   (s, n)    => req(`/analysis/${s}/ichimoku?limit=${n ?? 300}`),
    fibonacci:  (s)       => req(`/analysis/${s}/fibonacci`),
    pivots:     (s)       => req(`/analysis/${s}/pivots`),
    amd:        (s, accum, lookback) => req(`/analysis/${s}/amd?accum=${accum ?? 10}&lookback=${lookback ?? 200}`),
    backtest:   (s)       => req(`/analysis/${s}/backtest`),
  },
  stocks: {
    list:      ()             => req('/stocks'),
    add:       (symbol, from) => req('/stocks', { method: 'POST', body: JSON.stringify({ symbol, from: from || '' }) }),
    get:       (symbol, n)    => req(`/stocks/${symbol}?limit=${n ?? 300}`),
    update:    (symbol)       => req(`/stocks/${symbol}/update`, { method: 'POST' }),
    updateAll: ()             => req('/stocks/update-all', { method: 'POST' }),
    delete:    (symbol)       => req(`/stocks/${symbol}`, { method: 'DELETE' }),
    exportUrl:     (symbol)     => `/api/stocks/${symbol}/export.csv`,
    listReports:   (symbol)     => req(`/stocks/${symbol}/reports`),
    deleteReport:  (symbol, id) => req(`/stocks/${symbol}/reports/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    fundamental:        (symbol) => req(`/stocks/${symbol}/fundamental`),
    uploadReport:  (symbol, file) => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/stocks/${symbol}/reports`, { method: 'POST', body: form })
        .then(r => r.json())
        .then(j => { if (!j.success) throw new Error(j.message || 'Upload gagal'); return j.data })
    },
  },
  overview: () => req('/overview'),
  session:  () => req('/session'),
}
