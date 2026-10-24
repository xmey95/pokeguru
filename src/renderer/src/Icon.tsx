import type { ReactNode } from 'react'

const paths: Record<IconName, ReactNode> = {
  deck: <><rect x="6" y="3" width="14" height="17" rx="2" /><path d="M3 7v13a2 2 0 0 0 2 2h11M10 8h6M10 12h6M10 16h3" /></>,
  thread: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z" /><path d="M7 8h10M7 12h7" /></>,
  matchup: <><path d="m4 3 7 7-3 3-7-7m19-3-7 7 3 3 7-7M4 20l6-6m4 0 6 6M2 17l5 5m10 0 5-5" /></>,
  catalog: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  event: <><path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-5 3h10m-8-3h6v3H9Z" /></>,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="9" cy="18" r="2" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  brand: <><path d="M5 20V4h8a5 5 0 0 1 0 10H5" /><path d="m14 20 3 2 4-5" /></>
}
export type IconName = 'deck' | 'thread' | 'matchup' | 'catalog' | 'event' | 'settings' | 'plus' | 'chevron' | 'brand'
export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}
