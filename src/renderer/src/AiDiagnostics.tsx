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
  return trace?.exhausted ? <p className="content-note">La ricerca nei dati locali ha raggiunto il limite disponibile. La risposta potrebbe non includere tutti i dati pertinenti.</p> : null
}
