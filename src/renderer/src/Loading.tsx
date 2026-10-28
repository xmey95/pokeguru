import { useEffect, useId, useState, type ReactNode } from 'react'
import type { AiJobPhase, AiJobSummary } from '../../shared/ai-job'

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
    {detail && <p id={`${id}-detail`} className="activity-detail" aria-live="polite">{detail}</p>}
    {measured && <div className="activity-progress">
      <progress aria-label={progress.label} value={Math.max(0, Math.min(progress.value, progress.total))} max={progress.total} />
      <span>{progress.value.toLocaleString('it-IT')} / {progress.total.toLocaleString('it-IT')} · {progress.label}</span>
    </div>}
    {children}
  </div>
}

const aiStages: { label: string; phases: AiJobPhase[] }[] = [
  { label: 'Raccolta dati', phases: ['preparing', 'catalog', 'events'] },
  { label: 'Ricerche', phases: ['planning'] },
  { label: 'Analisi Codex', phases: ['analysis'] },
  { label: 'Verifica e salvataggio', phases: ['verification', 'saving'] }
]

export function AiJobActivity({ job, title, startedAt, className = '' }: {
  job: AiJobSummary | null
  title: string
  startedAt?: number | null
  className?: string
}) {
  const phase = job?.progress?.phase ?? 'preparing'
  const activeIndex = aiStages.findIndex((stage) => stage.phases.includes(phase))
  return <ActivityStatus title={title} detail={job?.progress?.detail ?? 'Preparazione del lavoro Codex…'}
    startedAt={startedAt ?? (job ? Date.parse(job.createdAt) : null)} className={`ai-job-activity ${className}`}>
    <ol className="ai-job-stages" aria-label="Fasi dell’elaborazione">
      {aiStages.map((stage, index) => <li key={stage.label} data-state={index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'waiting'}>
        <span aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span>{stage.label}
      </li>)}
    </ol>
    {job?.progress?.summary && <div className="ai-job-summary">
      <strong>Sintesi fornita da Codex</strong><p>{job.progress.summary}</p>
    </div>}
    {!!job?.progress?.steps.length && <details className="ai-job-trace"><summary>Attività svolte</summary>
      <ol>{job.progress.steps.map((step, index) => <li key={`${step.at}-${index}`}>
        <time dateTime={step.at}>{new Date(step.at).toLocaleTimeString('it-IT')}</time> · {step.detail}
      </li>)}</ol>
    </details>}
  </ActivityStatus>
}
