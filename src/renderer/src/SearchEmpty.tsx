import type { ReactNode } from 'react'

export function SearchEmpty({ children, onReset, focusId }: { children: ReactNode; onReset?: () => void; focusId: string }) {
  return <div className="search-empty">
    <p role="status">{children}</p>
    {onReset && <button type="button" className="text-button" onClick={() => {
      onReset()
      document.getElementById(focusId)?.focus()
    }}>Azzera filtri</button>}
  </div>
}
