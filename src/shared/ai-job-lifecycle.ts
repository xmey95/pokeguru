import type { AiJobSummary } from './ai-job'

export function canResumeAiJob(job: AiJobSummary): boolean {
  const diagnostics = job.progress?.diagnostics
  if (job.status !== 'interrupted' || !diagnostics?.resumable || diagnostics.suspensionReason === 'legacy') return false
  if (diagnostics.suspensionReason === 'user' || diagnostics.suspensionReason === 'shutdown') return true
  return !['context-limit', 'batch-too-large', 'no-progress', 'invalid-plan', 'invalid-response',
    'evidence-incomplete', 'draft-limit','token-budget','call-budget','request-limit','output-limit'].includes(diagnostics.failureCode ?? '')
}

export function hasRepairBudgetBlock(job:AiJobSummary|null):boolean{
  const d=job?.progress?.diagnostics,b=d?.budget,g=d?.guide
  return !!b?.reasons.includes('repair-calls')||d?.failureCode==='call-budget'&&!b?.repairs&&b?.reasons.length===0&&b.remainingCalls>0&&!!g?.delivery&&g.delivery.repairsUsed===g.delivery.repairLimit
}

export function aiJobInterruptionText(job: AiJobSummary): string {
  const reason = job.progress?.diagnostics?.suspensionReason
  if (reason === 'user') return 'Analisi in pausa su tua richiesta. Il lavoro completato è salvato.'
  if (reason === 'shutdown') return 'Analisi salvata. La ripresa automatica è in attesa del suo turno.'
  if (reason === 'legacy') return 'Analisi precedente senza tutti gli input salvati. Annullala e avvia una nuova analisi sui dati attuali.'
  if (hasRepairBudgetBlock(job)) return 'La riserva per le correzioni è insufficiente. Serve una nuova autorizzazione per riprendere il lavoro salvato.'
  if (!canResumeAiJob(job) && job.progress?.diagnostics?.resumable)
    return 'L’analisi richiede una nuova richiesta: ripetere gli stessi input non risolve il problema. Il lavoro completato resta conservato.'
  return 'Analisi interrotta. Dopo aver risolto il problema, riprendi dal lavoro salvato.'
}

export function aiJobWaitingText(job: AiJobSummary): string | null {
  const diagnostics = job.progress?.diagnostics
  if (job.status !== 'running' || !diagnostics?.automaticWait) return null
  const deadline = diagnostics.nextRetryAt ? new Date(diagnostics.nextRetryAt).toLocaleTimeString('it-IT') : null
  return `Attesa automatica${deadline ? `: nuovo tentativo alle ${deadline}` : ''}. Il lavoro completato è salvato.`
}
