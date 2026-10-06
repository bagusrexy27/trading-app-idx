import { useState } from 'react'
import { GLOSSARY, CATEGORIES } from '../glossary'

export default function Glossary() {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const entries = Object.entries(GLOSSARY).filter(([, g]) =>
    !needle || g.istilah.toLowerCase().includes(needle) || g.arti.toLowerCase().includes(needle))

  return (
    <div className="p-5 sm:p-7 max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold tracking-tight">Kamus</h1>
      <p className="text-xs text-tv-muted mt-1 mb-4">
        Istilah yang dipakai di aplikasi ini. Kata bergaris titik-titik di halaman lain bisa diklik untuk penjelasan singkat.
      </p>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Cari istilah… (mis. RSI, stop)"
        className="w-full bg-tv-input border border-tv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-tv-blue mb-6" />

      {entries.length === 0 && <p className="text-sm text-tv-muted">Tidak ada istilah yang cocok.</p>}

      {CATEGORIES.map(cat => {
        const rows = entries.filter(([, g]) => g.kategori === cat)
          .sort(([, a], [, b]) => a.istilah.localeCompare(b.istilah))
        if (!rows.length) return null
        return (
          <section key={cat} className="mb-6">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-tv-muted mb-2">{cat}</h2>
            <dl className="bg-tv-card border border-tv-border rounded-xl divide-y divide-tv-border/60">
              {rows.map(([k, g]) => (
                <div key={k} id={`kamus-${k}`} className="px-4 py-3">
                  <dt className="text-sm font-bold">{g.istilah}</dt>
                  <dd className="text-xs text-tv-text/85 leading-relaxed mt-0.5">{g.arti}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
