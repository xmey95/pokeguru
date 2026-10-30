import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { evidenceOccurrenceIdentity, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import { normalizedEvidenceText, type EvidenceEventRow } from '../src/main/ai-evidence-engine'
import { runAiEvidenceQueries, extendAiEvidenceForText, threadEvidenceWithQueries, AI_DECISION_PLAN_SCHEMA } from '../src/main/ai-evidence-queries'
import { draftNeedsEvidenceReview, prepareEvidenceDelivery } from '../src/main/ai-evidence-delivery'
import { firstThreadAnswer, restoreFirstThreadAnswer, runThreadDecision, type ThreadModelResult } from '../src/main/ai-thread-decision'
import { runStructuredCodex } from '../src/main/codex-evidence-plan'
import { CodexControl } from '../src/main/codex-control'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { deckThreadPrompt, DECK_THREAD_SCHEMA, readDeckThreadTurn, validateDeckProposal } from '../src/main/deck-ai'
import { buildDeckCards } from '../src/shared/reconciliation'
import type { CatalogView } from '../src/shared/catalog'
import type { AiRunConfig } from '../src/shared/ai'
import type { DeckConstraint } from '../src/shared/constraints'

const cases = [
  { id: 'budew-1', group: 'budew', question: 'Budew: Itchy Pollen richiede Energie? Durante il blocco posso usare Judge e Unfair Stamp? Spiega i limiti esatti senza proporre modifiche al mazzo.' },
  { id: 'protection-1', group: 'protection', question: 'Battle Cage protegge il Pokémon Attivo? Blocca i danni o i segnalini di attacchi e Abilità? Confronta precisamente Mist Energy, senza modificare la lista.' },
  { id: 'budew-2', group: 'budew', question: 'Budew: Itchy Pollen richiede Energie? Durante il blocco posso usare Judge e Unfair Stamp? Spiega i limiti esatti senza proporre modifiche al mazzo.' },
  { id: 'history', group: 'history', question: 'E per il Pokémon Attivo e le Abilità? Correggi l’ipotesi precedente senza modificare la lista.' },
  { id: 'protection-2', group: 'protection', question: 'Battle Cage protegge il Pokémon Attivo? Blocca i danni o i segnalini di attacchi e Abilità? Confronta precisamente Mist Energy, senza modificare la lista.' },
  { id: 'budew-3', group: 'budew', question: 'Budew: Itchy Pollen richiede Energie? Durante il blocco posso usare Judge e Unfair Stamp? Spiega i limiti esatti senza proporre modifiche al mazzo.' },
  { id: 'research', group: 'research', question: 'Nel campione locale disponibile quante partecipazioni sono associate a Toucannon e quante a Dragapult? Recupera i conteggi e distinguili dalle prestazioni; non proporre una lista.' },
  { id: 'candidate', group: 'candidate', question: 'Nella mia lista Toucannon sostituisci una copia di Hassel TWM 205 con Judge POR 76. Mantieni esattamente 4 Toucannon PBL 94 e Legacy Energy come unica ACE SPEC. Valuta il compromesso e restituisci la lista completa di 60 carte.' },
  { id: 'general', group: 'general', question: 'Migliora questa lista Toucannon per trovare un equilibrio tra consistenza e matchup osservati. Mantieni esattamente 4 Toucannon PBL 94. Valuta alternative motivate usando le evidenze locali e proponi una lista completa di 60 carte; esplicita le lacune del campione senza inventare winrate.' }
] as const
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

it.skipIf(!['preflight', 'live'].includes(process.env.POKEGURU_FOCUSED_EVAL ?? ''))(
  'compares v4 and v5 on frozen sources, repeated questions, history, research and a constrained candidate', async () => {
  const live = process.env.POKEGURU_FOCUSED_EVAL === 'live'
  const fixtureText = readFileSync(resolve('.verify/decision-fixture.json'), 'utf8'), fixtureHash = hash(fixtureText)
  const fixture = JSON.parse(fixtureText) as { referenceDate: string; catalog: CatalogView; rows: EvidenceEventRow[];
    window: { from: string; to: string }; baseRawText: string; config: AiRunConfig }
  const config: AiRunConfig = { ...fixture.config, model: 'gpt-6.1-sol', reasoningEffort: null }
  const root = resolve('.verify/focused-evaluation')
  mkdirSync(root, { recursive: true })
  const ledgerFile = join(root, 'calls.json')
  const ledger: { case: string; variant: string; kind: string; startedAt: string; status: string;
    elapsedMs?: number; inputBytes: number; usage?: unknown }[] = existsSync(ledgerFile)
    ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : []
  const selected = cases.filter(c => !process.env.POKEGURU_FOCUSED_CASE || c.id === process.env.POKEGURU_FOCUSED_CASE)
  for (const task of selected) {
    const caseIndex = cases.indexOf(task)
    const variants = caseIndex % 2 ? ['v5', 'v4'] as const : ['v4', 'v5'] as const
    for (const variant of variants) {
      const output = join(root, task.id + '-' + variant + '.json')
      if (live && existsSync(output)) {
        expect(JSON.parse(readFileSync(output, 'utf8')).fixtureHash).toBe(fixtureHash)
        continue
      }
      const folder = join(root, task.id + '-' + variant + (live ? '' : '-preflight'))
      mkdirSync(folder, { recursive: true })
      const projects = new ProjectStore(join(folder, 'data.sqlite')), jobs = new AiJobStore(join(folder, 'data.sqlite'))
      const project = projects.create({ name: 'Focused evaluation', format: 'STANDARD' })
      projects.importDeck({ projectId: project.id, rawText: fixture.baseRawText, source: 'paste' })
      let thread = projects.createDeckThread({ projectId: project.id, title: 'Regole e lista Toucannon' })
      if (task.group === 'history') {
        thread = projects.addDeckThreadMessage(project.id, thread.id,
          'Ipotesi da verificare: Battle Cage protegge anche il Pokémon Attivo e ferma tutti i danni.')
      }
      const base = projects.listDeckVersions(project.id)[0], baseline = projects.getBaseline(project.id)!
      const identity = buildDeckCards(baseline, fixture.catalog).find(card => card.name === 'Toucannon')!.identityId!
      const constraints: DeckConstraint[] = [{ id: 'locked-toucannon', projectId: project.id, identityId: identity,
        identityName: 'Toucannon', printId: 'me05-094', kind: 'exact', quantity: 4,
        createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z' }]
      const job = jobs.start('thread-ask', project.id, thread.id), control = new CodexControl()
      const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal,
        { schemaVersion: variant === 'v4' ? 4 : 5, kind: 'thread-ask', args: [project.id, thread.id, task.question] })
      let session: string | null = null
      const calls: typeof ledger = []
      const started = performance.now()
      const invoke = async (kind: string, prompt: string, schema: Record<string, unknown>, persistent: boolean): Promise<ThreadModelResult> => {
        if (!live) throw new Error('Preflight attempted inference')
        if (ledger.length >= 40 || calls.length >= 8) throw new Error('Focused evaluation call budget reached')
        const call = { case: task.id, variant, kind, startedAt: new Date().toISOString(),
          status: 'running', inputBytes: Buffer.byteLength(prompt) } as typeof ledger[number]
        ledger.push(call); calls.push(call)
        writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2))
        const start = performance.now()
        try {
          const result = persistent ? await control.jsonTurn(session, folder, prompt, config, schema, {
            jobId: job.id, jobDirectory: work.directory, signal: work.signal, onSessionStarted: id => { session = id } })
            : await runStructuredCodex(prompt, config, schema, work.signal).then(value => ({
              sessionId: '', turnId: '', value, usage: (value as { __usage?: any }).__usage ?? null }))
          call.status = 'succeeded'; call.usage = result.usage
          return result
        } catch (error) { call.status = 'failed'; throw error }
        finally { call.elapsedMs = Math.round(performance.now() - start); writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2)) }
      }
      try {
        work.archive.captureSources({ catalog: fixture.catalog, window: fixture.window }, fixture.rows.map(value => ({
          key: evidenceOccurrenceIdentity(value), deckKey: exactDeckIdentity(value.cards), date: value.date,
          placing: value.placing, deckName: value.deck, deckText: normalizedEvidenceText(value.deck),
          cardsText: value.cards.map(normalizedEvidenceText).join('\n'), value })))
        const { engine } = createArchivedEvidenceEngine(work.archive, () => { throw new Error('Sources must be frozen') })
        const initial = buildThreadEvidence(thread, base, task.question, constraints, fixture.catalog, [], [])
        const probe = (rawText: string, sourceIds = ['base']) => () => validateDeckProposal({
          outcome: 'candidate', rawText, rationale: 'Negative probe', sourceIds }, project.id, fixture.catalog,
          constraints, initial.sources, fixture.referenceDate)
        expect(probe(base.rawText)).not.toThrow()
        expect(probe(base.rawText.replace('4 Toucannon PBL 94', '5 Toucannon PBL 94'))).toThrow('60 carte')
        expect(probe(base.rawText.replace('4 Toucannon PBL 94', '3 Toucannon PBL 94') + '\n1 Judge POR 76')).toThrow('vincoli')
        expect(probe(base.rawText.replace('4 Hassel TWM 205', '3 Hassel TWM 205') + '\n1 Unfair Stamp TWM 165')).toThrow('costruzione')
        expect(probe(base.rawText.replace('1 Patrat CRI 70', '1 Invented XXX 999'))).toThrow('Stampa non verificabile')
        expect(probe(base.rawText, ['invented-source'])).toThrow('fonte non presente')
        if (!live) continue
        const contextTexts = [thread.title, base.rawText, ...thread.messages.slice(-12).map(message => message.text)]
        const trace = await runAiEvidenceQueries(task.question, initial, engine, async (prompt, trace) => {
          if (variant === 'v5' && trace.planningRounds === 0) {
            prepareEvidenceDelivery(trace, engine, [task.question, ...contextTexts])
            const packet = threadEvidenceWithQueries(initial, trace)
            return runThreadDecision(work, config, deckThreadPrompt(thread, base, task.question, constraints,
              fixture.catalog, packet, fixture.referenceDate), packet, trace, (prompt, schema) => invoke('decision', prompt, schema, true))
          }
          return work.run('planning', prompt, config, async () => {
            const result = await invoke('planning', prompt, AI_DECISION_PLAN_SCHEMA, false)
            return result.value
          })
        }, { archive: work.archive, contextTexts, signal: work.signal })
        await analyzeLargeEvidence(trace, task.question, config, work)
        prepareEvidenceDelivery(trace, engine, [task.question, ...contextTexts])
        let result: ThreadModelResult | undefined, checked: ReturnType<typeof readDeckThreadTurn> | undefined, revisions = 0
        const direct = firstThreadAnswer(work)
        let usedPrompt = ''
        for (let attempt = 0; attempt < 4; attempt++) {
          const packet = threadEvidenceWithQueries(initial, trace)
          let context = deckThreadPrompt(thread, base, task.question, constraints, fixture.catalog, packet, fixture.referenceDate)
          if (attempt === 0 && direct) {
            result = direct.result
            context = { prompt: direct.prompt, sources: direct.sources }; packet.sources = direct.evidenceSources
            restoreFirstThreadAnswer(trace, direct)
          } else result = await work.run('analysis', context.prompt, config,
            () => invoke('answer', context.prompt, DECK_THREAD_SCHEMA, true))
          usedPrompt = context.prompt
          const draft = result.value as { reply: string; rawText: string }
          const text = [draft.reply, draft.rawText].join('\n')
          const added = extendAiEvidenceForText(trace, engine, text), review = draftNeedsEvidenceReview(trace, engine, text)
          if (!added && !review) {
            checked = readDeckThreadTurn(result.value, project.id, base, fixture.catalog, constraints,
              packet, context.sources, fixture.referenceDate)
            break
          }
          if (attempt === 3) throw new Error('Original verification requires further review')
          revisions++; await analyzeLargeEvidence(trace, task.question, config, work)
        }
        expect(checked).toBeDefined()
        expect(!!checked!.proposal).toBe(task.group === 'candidate' || task.group === 'general')
        if (task.group === 'research' || task.group === 'general')
          expect([...work.archive.pages()].some(page => (page.query as { operation: string }).operation.startsWith('events.'))).toBe(true)
        const resultRecord = { fixtureHash, variant, case: task.id, group: task.group, question: task.question,
          config, elapsedMs: Math.round(performance.now() - started), calls, revisions, directAnswer: !!direct,
          planningRounds: trace.planningRounds, queries: [...work.archive.pages()].map(page => page.query),
          answer: result!.value, checked, promptHash: hash(usedPrompt),
          negativeCandidatesRejected: ['61 cards', 'violated exact constraint', 'two ACE SPEC', 'unknown print', 'unknown source'],
          limitation: 'Frozen 32-participation fixture, alternating paired order, production CLI sessions for decisions/final answers and ephemeral v4 planners; synthetic pending historical note. Small repeated sample, not statistical quality equivalence or full-corpus end-to-end latency.' }
        writeFileSync(output, JSON.stringify(resultRecord, null, 2))
        console.log(JSON.stringify({ case: task.id, variant, elapsedMs: resultRecord.elapsedMs, calls: calls.length, revisions }))
      } finally { await control.stop(); work.close(); jobs.close(); projects.close() }
    }
  }
}, 7_200_000)
