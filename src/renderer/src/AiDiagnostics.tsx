import type { ReactNode } from 'react'
import type { AiEvidenceQueryTrace, AiPromptAudit } from '../../shared/ai-evidence'
import { AiQueryTraceView } from './AiQueryTraceView'
import { AiPromptAuditView } from './AiPromptAuditView'

export function AiDiagnostics({ trace, audit, children }: {
  trace?: AiEvidenceQueryTrace
  audit?: AiPromptAudit
  children?: ReactNode
}) {
  if (!trace && !audit && !children) return null
  return <details className="ai-diagnostics"><summary>Diagnostica AI</summary>
    {children}
    {trace && <AiQueryTraceView trace={trace} />}
    {audit && <AiPromptAuditView audit={audit} />}
  </details>
}

export function AiEvidenceLimit({ trace }: { trace?: AiEvidenceQueryTrace }) {
  if (!trace) return null
  const incomplete = trace.cardTargets?.filter((item) => item.status !== 'supplied') ?? []
  const rejected = trace.requests.some((item) => item.status === 'rejected')
  if (!trace.exhausted && !incomplete.length && !rejected) return null
  return <p className="content-note">{trace.exhausted
    ? 'La ricerca locale ha raggiunto un limite tecnico; controlla la diagnostica prima di usare la risposta. '
    : ''}{rejected ? 'Una query locale è stata rifiutata; i suoi risultati non sono inclusi. ' : ''}{incomplete.length
    ? `Schede nominate senza testo confrontabile: ${incomplete.map((item) => item.name).join(', ')}.`
    : ''}</p>
}
