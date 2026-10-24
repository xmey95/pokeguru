import { useEffect, useId, useState, type ReactNode } from 'react'

export function Spinner() {
  return <span className="loading-spinner" aria-hidden="true" />
}

export function InlineLoading({ children }: { children: string }) {
  return <span className="inline-loading" role="status"><Spinner />{children}</span>
}

/** The placeholders describe structure only; they never imply acquired data. */
export function LoadingSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return <div className="loading-skeleton">
    <InlineLoading>{label}</InlineLoading>
    <div className="skeleton-rows" aria-hidden="true">{Array.from({ length: rows }, (_, index) =>
      <div className="skeleton-row" key={index}><span className="skeleton-thumb" /><span className="skeleton-lines"><i /><i /></span></div>)}</div>
  </div>
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  return <span className="activity-elapsed" aria-label="Tempo trascorso" aria-live="off">
    {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
  </span>
}

export function ActivityStatus({ title, detail, state = 'working', startedAt, progress, children, className = '' }: {
  title: string
  detail?: string
  state?: 'working' | 'paused' | 'complete'
  startedAt?: number | null
  progress?: { value: number; total: number; label: string }
  children?: ReactNode
  className?: string
}) {
  const id = useId()
  const measured = progress && progress.total > 0
  return <div className={`activity-status ${className}`} data-state={state}>
    <div className="activity-heading">
      {state === 'working' ? <Spinner /> : <span className="activity-symbol" aria-hidden="true">{state === 'complete' ? '✓' : 'Ⅱ'}</span>}
      <strong id={id} role="status" aria-describedby={detail ? `${id}-detail` : undefined}>{title}</strong>
      {state === 'working' && startedAt && <Elapsed startedAt={startedAt} />}
    </div>
    {detail && <p id={`${id}-detail`} className="activity-detail">{detail}</p>}
    {measured && <div className="activity-progress">
      <progress aria-label={progress.label} value={Math.max(0, Math.min(progress.value, progress.total))} max={progress.total} />
      <span>{progress.value.toLocaleString('it-IT')} / {progress.total.toLocaleString('it-IT')} · {progress.label}</span>
    </div>}
    {children}
  </div>
}
