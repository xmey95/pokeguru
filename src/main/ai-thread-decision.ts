import type { AiRunConfig } from '../shared/ai'
import type { AiEvidenceQueryTrace, AiTokenUsage } from '../shared/ai-evidence'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'
import type { AiAnalysisWork, AiWorkflowInput } from './ai-analysis-work'
import { AI_DECISION_PLAN_SCHEMA } from './ai-evidence-queries'
import { DECK_THREAD_SCHEMA, type DeckThreadContext } from './deck-ai'
import { AiFailure } from './ai-failure'

export const THREAD_DECISION_SCHEMA = {
  ...AI_DECISION_PLAN_SCHEMA,
  required: [...AI_DECISION_PLAN_SCHEMA.required, 'action', 'answer'],
  properties: { ...AI_DECISION_PLAN_SCHEMA.properties,
    action: { type: 'string', enum: ['answer', 'research'] },
    answer: { anyOf: [DECK_THREAD_SCHEMA, { type: 'null' }] } }
} as const

export interface ThreadModelResult {
  sessionId: string; turnId: string; value: unknown; usage: AiTokenUsage | null
}
export interface FirstThreadAnswer {
  result: ThreadModelResult
  prompt: string
  sources: DeckThreadContext['sources']
  evidenceSources: ThreadEvidencePacket['sources']
  deliveredCards: NonNullable<AiEvidenceQueryTrace['deliveredCards']>
  durationMs: number
}

export function usesThreadDecision(work: AiAnalysisWork): boolean {
  const workflow = work.archive.value<AiWorkflowInput>('workflow', 'input')
  return workflow?.schemaVersion === 5 && workflow.kind === 'thread-ask'
}

export function threadDecisionPrompt(context: DeckThreadContext): string {
  return [context.prompt,
    'Questo è il primo turno unificato risposta/ricerca. Restituisci lo schema esterno con action, answer, queries, continueAfterResults e uncertainty.',
    'Se gli originali consegnati bastano per tutta la richiesta, action=answer: inserisci in answer il JSON kind/reply/rawText/sourceIds descritto sopra, queries=[], continueAfterResults=false, uncertainty="". Una domanda puntuale su regole non richiede Eventi. Una modifica esplicita verificabile richiede la candidata completa, anche se è piccola.',
    'Se mancano prove decisive, action=research e answer=null: richiedi fino a quattro query locali e indica in uncertainty il dubbio concreto in massimo due frasi. Non anticipare una risposta basata sulla memoria. Se bastano questi risultati per rispondere, continueAfterResults=false; true solo se servirà una nuova scelta di ricerca.',
    'Per domande dipendenti da frequenze, risultati, alternative o matchup recupera le relative prove Evento prima di concludere. Per carte/testi mancanti o ambigui recupera gli originali o segnala la lacuna; non confondere una stampa con una carta dal nome simile. Considera anche cronologia e note in sospeso: una domanda breve può richiedere approfondimenti.',
    'catalog.search: termini inglesi per nome/effetto (massimo 8), printIds/identityIds (massimo 20), mode any/all e pagine di 20 schede. events.overview: copertura locale nel periodo; events.search: deckName/cardName, from/to, offset e limit massimo 4, con distribuzioni complete del filtro e una pagina di liste. events.details: deckKey già acquisito, eventId facoltativo, offset e limit massimo 20 per originali e abbinamenti.',
    'Le query leggono solo la pagina richiesta: remaining indica altre pagine. Frequenze non equivalgono a efficacia, record contro il campo non sono winrate del matchup; non sommare filtri sovrapposti. Usa null per i campi non necessari. Nessun accesso a strumenti o rete.',
    'Una risposta diretta è solo una bozza: l’app verifica ancora nuove carte, fonti e lista prima di salvarla. Non evitare la ricerca dichiarando un dato assente quando può essere recuperato dal motore.'
  ].join('\n\n')
}

export function readThreadDecision(value: unknown): {
  queries: unknown[]; continueAfterResults: boolean; uncertainty: string; answer: unknown | null
} {
  const data = value as Record<string, unknown> | null
  const invalid = () => new AiFailure('invalid-plan', 'Decisione risposta/ricerca Codex non valida.')
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
    !Array.isArray(data.queries) || data.queries.length > 4 ||
    typeof data.continueAfterResults !== 'boolean' || typeof data.uncertainty !== 'string' ||
    data.uncertainty.length > 2000) throw invalid()
  if (data.action === 'answer') {
    if (data.queries.length || data.continueAfterResults || data.uncertainty !== '' ||
      !data.answer || typeof data.answer !== 'object' || Array.isArray(data.answer)) throw invalid()
  } else if (data.action !== 'research' || data.answer !== null ||
    !data.queries.length || !data.uncertainty.trim()) throw invalid()
  return { queries: data.queries, continueAfterResults: data.continueAfterResults,
    uncertainty: data.uncertainty, answer: data.answer }
}

/** The first call and its exact delivery are durable. A resumed direct draft must
 * not inherit the delivery of originals collected later while checking that draft. */
export async function runThreadDecision(work: AiAnalysisWork, config: AiRunConfig,
  context: DeckThreadContext, evidence: ThreadEvidencePacket, trace: AiEvidenceQueryTrace,
  invoke: (prompt: string, schema: typeof THREAD_DECISION_SCHEMA,
    onUsage: (usage: unknown) => void) => Promise<ThreadModelResult>): Promise<unknown> {
  // A crash may happen after this checkpoint and before the planner commits round 0.
  // Reuse the immutable original, including its delivery and measured duration.
  const saved = firstThreadAnswer(work)
  if (saved) return { queries: [], continueAfterResults: false, uncertainty: '', __usage: saved.result.usage }
  const prompt = threadDecisionPrompt(context)
  const deliveredCards = structuredClone(trace.deliveredCards ?? [])
  const started = performance.now()
  const result = await work.run('planning', prompt, config, reportUsage => invoke(prompt, THREAD_DECISION_SCHEMA, reportUsage))
  const decision = readThreadDecision(result.value)
  if (decision.answer) {
    const saved: FirstThreadAnswer = { result: { ...result, value: decision.answer }, prompt,
      sources: context.sources, evidenceSources: evidence.sources, deliveredCards,
      durationMs: Math.round(performance.now() - started) }
    work.archive.saveValue('thread-decision', 'answer', saved)
  }
  return { queries: decision.queries, continueAfterResults: decision.continueAfterResults,
    uncertainty: decision.uncertainty, __usage: result.usage }
}

export function firstThreadAnswer(work: AiAnalysisWork): FirstThreadAnswer | undefined {
  return usesThreadDecision(work) ? work.archive.value<FirstThreadAnswer>('thread-decision', 'answer') : undefined
}

export function restoreFirstThreadAnswer(trace: AiEvidenceQueryTrace, answer: FirstThreadAnswer): void {
  trace.deliveredCards = structuredClone(answer.deliveredCards)
}
