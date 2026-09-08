// Line icons for the 60px rail — no emoji. stroke inherits currentColor.
const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconToday(props) {
  return (
    <svg {...S} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4M16 2v4" />
      <path d="M8 14h3M13 14h3M8 17h8" />
    </svg>
  )
}

export function IconWatchlist(props) {
  return (
    <svg {...S} {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

export function IconMarket(props) {
  return (
    <svg {...S} {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </svg>
  )
}

export function IconSession(props) {
  return (
    <svg {...S} {...props}>
      <path d="M4 18l4-8 3 4 4-7 5 11" />
      <path d="M4 20h16" />
    </svg>
  )
}

export function IconScreener(props) {
  return (
    <svg {...S} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M8 11h6M11 8v6" />
    </svg>
  )
}

export function IconPortfolio(props) {
  return (
    <svg {...S} {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  )
}

export function IconPractice(props) {
  return (
    <svg {...S} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6M9 12h6M9 15h3" />
    </svg>
  )
}

export function IconAlerts(props) {
  return (
    <svg {...S} {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function IconPlus(props) {
  return (
    <svg {...S} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconChevronLeft(props) {
  return (
    <svg {...S} width={16} height={16} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconChevronRight(props) {
  return (
    <svg {...S} width={16} height={16} {...props}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function IconSharia(props) {
  return (
    <svg {...S} width={14} height={14} {...props}>
      <path d="M12 3v18" />
      <path d="M7 8c2.5-2 7.5-2 10 0" />
      <path d="M7 12c2.5-2 7.5-2 10 0" />
      <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
