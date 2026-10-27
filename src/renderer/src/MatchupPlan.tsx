import type { ReactNode } from 'react'
import { hasStrategyPhases, type MatchupReport } from '../../shared/meta-matchups'
import { useViewState } from './Navigation'
import { matchupPlanNarrative } from './matchup-plan-format'

const phases = [['opening', 'Apertura'], ['development', 'Sviluppo'], ['closing', 'Chiusura']] as const

export function MatchupPlan({ report, renderText, scope = 'current' }: {
  report: MatchupReport
  renderText(text: string): ReactNode
  scope?: string
}) {
  const context = `${scope}:${report.projectId}:${report.opponentId}:${report.metaId}:${report.deckVersionId ?? report.deckHash}:${report.generatedAt}`
  const id = `matchup-plan-${encodeURIComponent(context)}`
  const [selected, setSelected] = useViewState<number>(`matchup.phase:${context}`, 0)
  const active = selected >= 0 && selected < phases.length ? selected : 0
  const planText = (value: string) => renderText(matchupPlanNarrative(value))
  if (!hasStrategyPhases(report.strategyPhases)) return <div className="matchup-plan legacy-plan">
    {planText(report.strategy)}
  </div>
  return <div className="matchup-plan">
    <div className="matchup-phase-tabs" role="tablist" aria-label="Fasi del piano di gioco">
      {phases.map(([phase, label], index) => <button key={phase} type="button" role="tab"
        id={`${id}-${phase}`} aria-selected={active === index} aria-controls={`${id}-panel-${phase}`}
        tabIndex={active === index ? 0 : -1} onClick={() => setSelected(index)}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
          const next = event.key === 'ArrowRight' ? (index + 1) % phases.length
            : event.key === 'ArrowLeft' ? (index + phases.length - 1) % phases.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? phases.length - 1 : null
          if (next === null) return
          event.preventDefault()
          setSelected(next)
          document.getElementById(`${id}-${phases[next][0]}`)?.focus({ preventScroll: true })
        }}>{label}</button>)}
    </div>
    {phases.map(([phase], index) => <div key={phase} id={`${id}-panel-${phase}`}
      role="tabpanel" aria-labelledby={`${id}-${phase}`} tabIndex={0} hidden={active !== index}>
      {planText(report.strategyPhases![phase])}
    </div>)}
  </div>
}
