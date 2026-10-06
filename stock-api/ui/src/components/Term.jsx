import { useEffect, useRef, useState } from 'react'
import { GLOSSARY } from '../glossary'

// Istilah bergaris titik-titik; klik/tap → penjelasan singkat dari glossary.js.
// Jangan dipakai di dalam <button> (interaktif bersarang) — di sana pakai title={tip(k)}.
export default function Term({ k, children }) {
  const g = GLOSSARY[k]
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (!g) return children ?? null

  const toggle = (e) => {
    e.stopPropagation() // mis. di header tabel yang bisa di-sort
    // popover 256px: balik ke kanan kalau mepet tepi layar
    setAlignRight(ref.current.getBoundingClientRect().left + 264 > window.innerWidth)
    setOpen(o => !o)
  }

  return (
    <span ref={ref} className="relative inline-block normal-case tracking-normal">
      <span role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(e))}
        className="underline decoration-dotted decoration-tv-muted underline-offset-2 cursor-help">
        {children ?? g.istilah}
      </span>
      {open && (
        <span role="tooltip"
          className={`absolute z-50 top-full mt-1.5 w-64 p-3 rounded-lg border border-tv-border bg-tv-bg shadow-xl
            text-left text-[11px] font-normal leading-relaxed text-tv-text pop-in ${alignRight ? 'right-0' : 'left-0'}`}>
          <b className="block text-xs mb-0.5">{g.istilah}</b>
          {g.arti}
        </span>
      )}
    </span>
  )
}
