import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AiJobActivityStep, AiJobPhase, AiJobSummary } from '../../shared/ai-job'

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

function AiJobTrace({ job }: { job: AiJobSummary }) {
  const [history, setHistory] = useState<{ jobId: string; steps: AiJobActivityStep[];
    hasMore: boolean }>({ jobId: job.id, steps: [], hasMore: false })
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLOListElement>(null)
  const followLatest = useRef(true)
  const restoreScroll = useRef<{ top: number; height: number } | null>(null)
  const olderPending = useRef(false)
  const activeSteps = history.jobId === job.id ? history.steps : []
  const hasMore = history.jobId === job.id && history.hasMore
  const newestKnown = useRef<{ jobId: string; id: number | null }>({ jobId: job.id, id: null })
  newestKnown.current = { jobId: job.id, id: activeSteps.at(-1)?.id ?? null }

  useEffect(() => {
    setHistory({ jobId: job.id, steps: [], hasMore: false })
    followLatest.current = true
    restoreScroll.current = null
    setError(null)
  }, [job.id])

  useEffect(() => {
    let active = true
    const element = scroller.current
    followLatest.current = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 40
    const refresh = async () => {
      const lastKnown = newestKnown.current.jobId === job.id ? newestKnown.current.id : null
      let result = await window.projectsApi.getAiJobActivity(job.projectId, job.resourceId, job.id)
      if (!active) return
      if (!result.ok) { setError(result.error); return }
      const steps = [...result.value.steps]
      const hasOlder = result.value.hasMore
      while (lastKnown !== null && steps.length && steps[0].id > lastKnown && result.value.hasMore) {
        result = await window.projectsApi.getAiJobActivity(job.projectId, job.resourceId, job.id, steps[0].id)
        if (!active) return
        if (!result.ok) { setError(result.error); return }
        steps.unshift(...result.value.steps)
      }
      setHistory((current) => {
        const entries = current.jobId === job.id ? current.steps : []
        const merged = new Map([...entries, ...steps].map((step) => [step.id, step]))
        return { jobId: job.id, steps: [...merged.values()].sort((a, b) => a.id - b.id),
          hasMore: entries.length ? current.hasMore : hasOlder }
      })
    }
    void refresh()
    return () => { active = false }
  }, [job.id, job.progress?.updatedAt, job.progress?.sequence])

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    if (restoreScroll.current) {
      element.scrollTop = restoreScroll.current.top + element.scrollHeight - restoreScroll.current.height
      restoreScroll.current = null
    } else if (followLatest.current) element.scrollTop = element.scrollHeight
  }, [activeSteps.length])

  async function loadOlder(): Promise<void> {
    if (!activeSteps.length || !hasMore || olderPending.current) return
    olderPending.current = true
    setLoadingOlder(true)
    const element = scroller.current
    if (element) restoreScroll.current = { top: element.scrollTop, height: element.scrollHeight }
    try {
      const result = await window.projectsApi.getAiJobActivity(job.projectId, job.resourceId,
        job.id, activeSteps[0].id)
      if (!result.ok) throw new Error(result.error)
      setHistory((current) => {
        if (current.jobId !== job.id) return current
        const merged = new Map([...result.value.steps, ...current.steps].map((step) => [step.id, step]))
        return { jobId: job.id, steps: [...merged.values()].sort((a, b) => a.id - b.id),
          hasMore: result.value.hasMore }
      })
      setError(null)
    } catch (cause) {
      restoreScroll.current = null
      setError(cause instanceof Error ? cause.message : 'Cronologia non disponibile.')
    } finally { olderPending.current = false; setLoadingOlder(false) }
  }

  return <section className="ai-job-trace" aria-label="Attività svolte">
    <strong>Attività svolte{activeSteps.length ? ` · ${activeSteps.length} caricate` : ''}</strong>
    {hasMore && <button type="button" className="text-button" disabled={loadingOlder}
      onClick={() => void loadOlder()}>{loadingOlder ? 'Caricamento…' : 'Carica attività precedenti'}</button>}
    {error && <p className="diagnostics" role="status">{error}</p>}
    <ol ref={scroller} className="ai-job-trace-scroll" aria-label="Cronologia attività Codex"
      onScroll={(event) => {
        const element = event.currentTarget
        followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40
        if (element.scrollHeight > element.clientHeight && element.scrollTop < 32 && hasMore)
          void loadOlder()
      }}>
      {activeSteps.map((step) => <li key={step.id}>
        <time dateTime={step.at}>{new Date(step.at).toLocaleTimeString('it-IT')}</time> · {step.detail}
        {step.summary && <p>{step.summary}</p>}
      </li>)}
    </ol>
  </section>
}

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
    {job && <AiJobTrace job={job} />}
  </ActivityStatus>
}
