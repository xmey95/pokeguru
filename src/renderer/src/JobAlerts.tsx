import { useEffect, useRef, useState } from 'react'
import { useNavigation } from './Navigation'
import type { CatalogSyncStatus } from '../../shared/catalog'
import type { TournamentSyncProgress } from '../../shared/tournament'
import type { MainTournamentSyncProgress } from '../../shared/main-tournament'
import type { AiJobSummary } from '../../shared/ai-job'
import { aiObservations, catalogObservation, emptyAlertLedger, observeJobs,
  tournamentObservation, type AlertLedger, type AlertSource, type ObservedJob } from './job-alerts'

const storageKey = 'pokeguru.job-alerts.v1'
function readLedger(): AlertLedger {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as AlertLedger | null
    if (value?.sources && value.jobs) return value
  } catch { /* Storage may be unavailable in a restricted renderer. */ }
  return emptyAlertLedger()
}

export function JobAlerts() {
  const nav = useNavigation()
  const ledger = useRef<AlertLedger>(readLedger()).current
  const [alerts, setAlerts] = useState<ObservedJob[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let active = true
    let timer: number | undefined
    async function poll(): Promise<void> {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => window.projectsApi.getCatalogSyncStatus()),
        Promise.resolve().then(() => window.projectsApi.getTournamentSync()),
        Promise.resolve().then(() => window.projectsApi.getMainTournamentSync()),
        Promise.resolve().then(() => window.projectsApi.listRecentAiJobs())
      ])
      if (!active) return
      const sources: AlertSource[] = ['catalog', 'play', 'main', 'ai']
      const additions: ObservedJob[] = []
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled' || !result.value.ok) return
        const source = sources[index]
        const value = result.value.value
        const jobs = source === 'catalog' ? catalogObservation(value as CatalogSyncStatus)
          : source === 'play' || source === 'main' ? tournamentObservation(source, value as TournamentSyncProgress | MainTournamentSyncProgress)
            : aiObservations(value as AiJobSummary[])
        additions.push(...observeJobs(ledger, source, jobs))
      })
      try { localStorage.setItem(storageKey, JSON.stringify(ledger)) } catch { /* Session dedupe still works. */ }
      if (additions.length) setAlerts((current) => [...current, ...additions])
      timer = window.setTimeout(() => void poll(), 5000)
    }
    void poll()
    return () => { active = false; window.clearTimeout(timer) }
  }, [ledger])

  function open(job: ObservedJob): void {
    if (job.source === 'catalog') nav.go({ view: 'catalog' })
    else if (job.source === 'play' || job.source === 'main')
      nav.go({ view: 'tournament' }, { 'events.source': job.source }, job.source === 'play' ? 'Eventi · Play' : 'Eventi · Regional')
    else if (job.projectId && job.aiKind?.startsWith('thread'))
      nav.go({ view: 'project', tab: 'threads', projectId: job.projectId }, { 'thread.selected': job.resourceId }, 'Thread')
    else if (job.projectId) nav.go({ view: 'project', tab: 'matchups', projectId: job.projectId })
    dismiss(job.key)
  }
  function dismiss(key: string): void { setAlerts((current) => current.filter((item) => item.key !== key)) }
  if (!alerts.length) return null
  const hidden = Math.max(0, alerts.length - 3)
  const shown = expanded ? alerts : alerts.slice(-3)
  return <aside className="job-alerts" aria-label="Avvisi attività" aria-live="polite" aria-relevant="additions">
    {hidden > 0 && <button type="button" className="secondary-button job-alert-more"
      aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      {expanded ? 'Mostra solo i più recenti' : `Mostra altri ${hidden} avvisi`}
    </button>}
    {shown.map((job) => <section className="job-alert" data-state={job.state} role="status" key={job.key}>
      <strong>{job.title}</strong><p>{job.detail}</p>
      <div className="job-alert-actions">
        <button type="button" className="text-button" onClick={() => open(job)}>
          Apri {job.source === 'catalog' ? 'Catalogo' : job.source === 'ai' ? job.aiKind?.startsWith('thread') ? 'Thread' : 'Matchup' : 'Eventi'}
        </button>
        <button type="button" className="text-button" aria-label={`Chiudi avviso: ${job.title}`} onClick={() => dismiss(job.key)}>Chiudi</button>
      </div>
    </section>)}
  </aside>
}
