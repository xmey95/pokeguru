import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import type { EvidenceEventRow } from '../src/main/ai-evidence-engine'
import type { CatalogView } from '../src/shared/catalog'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { normalizedEvidenceText } from '../src/main/ai-evidence-engine'
import { evidenceOccurrenceIdentity, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import { runAiEvidenceQueries, extendAiEvidenceForText, threadEvidenceWithQueries } from '../src/main/ai-evidence-queries'
import { prepareEvidenceDelivery, draftNeedsEvidenceReview } from '../src/main/ai-evidence-delivery'
import { runStructuredCodex } from '../src/main/codex-evidence-plan'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { deckThreadPrompt, DECK_THREAD_SCHEMA, readDeckThreadTurn, validateDeckProposal } from '../src/main/deck-ai'
import { matchupGenerationPrompt, matchupRevisionPrompt } from '../src/main/codex-matchup'
import { matchupFields, readMatchupAnalysis } from '../src/main/matchup-analysis'
import { buildDeckCards, matchupDeckContext } from '../src/shared/reconciliation'
import { evaluateStandardDeck } from '../src/shared/standard-deck'
import { gameplaySummary } from '../src/shared/card-gameplay'
import { decisionEventSearch } from '../src/main/ai-decision-events'
import type { AiRunConfig } from '../src/shared/ai'
import type { DeckConstraint } from '../src/shared/constraints'
import type { MatchupDiscussion, MatchupTournamentEvidence, MetaSnapshot } from '../src/shared/meta-matchups'

/** Private real-source fixture. The sampled comparison and the full-snapshot
 * scalability replay are separate, and neither is a competitive-strength proof. */
it.skipIf(process.env.POKEGURU_DECISION_EVAL !== 'prepare')('freezes the five-case comparison input from the read-only audit snapshot', () => {
  const path = process.env.POKEGURU_DECISION_SNAPSHOT!
  if (!path) throw new Error('Explicit read-only snapshot path required')
  const db = new DatabaseSync(path, { readOnly: true })
  const row = db.prepare("SELECT id, project_id, resource_id FROM ai_jobs WHERE kind = 'thread-ask' AND id = ?")
    .get(process.env.POKEGURU_DECISION_JOB ?? '') as { id: string; project_id: string; resource_id: string }
  if (!row) { db.close(); throw new Error('Explicit source job required') }
  const archive = new AiEvidenceArchive(path, { id: row.id, projectId: row.project_id, resourceId: row.resource_id }, true)
  try {
    const inputs = [...archive.values<unknown>('input')]
    const snapshot = archive.value<{ catalog: CatalogView; window: { from: string; to: string } }>('snapshot', 'sources')!
    const base = archive.value<{ rawText: string }>('input', 'base')!
    if (!snapshot || !base?.rawText) throw new Error('Snapshot or baseline missing')
    const rows: EvidenceEventRow[] = []
    const counts = { toucannon: 0, dragapult: 0, total: 0 }
    for (const event of archive.eventRows<EvidenceEventRow>()) {
      counts.total++
      const key = /toucannon/i.test(event.deck) ? 'toucannon' : /dragapult/i.test(event.deck) ? 'dragapult' : null
      if (key && counts[key]++ < 16) rows.push(event)
    }
    expect(rows.filter(row => /toucannon/i.test(row.deck)).length).toBe(16)
    expect(rows.filter(row => /dragapult/i.test(row.deck)).length).toBe(16)
    const fixture = { schemaVersion: 1, referenceDate: '2026-10-29', catalog: snapshot.catalog, window: snapshot.window,
      baseRawText: base.rawText, rows, fullSnapshotCounts: counts,
      selection: 'First 16 Toucannon and 16 Dragapult source rows in stable snapshot-key order; other complete lists omitted in this bounded live fixture. Full-snapshot scaling measured separately.',
      config: archive.value('input', 'config') ?? { provider: 'codex', model: 'gpt-6.1-sol', reasoningEffort: null, source: 'global' } }
    mkdirSync(resolve('.verify'), { recursive: true })
    writeFileSync(resolve('.verify/decision-fixture.json'), JSON.stringify(fixture))
    console.log(JSON.stringify({ inputKeys: inputs.map(x => x.key), baseline: base.rawText,
      catalogPrints: snapshot.catalog.prints.length, selectedRows: rows.length, counts,
      config: fixture.config, hash: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),
      budew: snapshot.catalog.prints.filter(c => /^(Budew|Judge|Iono|Unfair Stamp|Toucannon)$/i.test(c.name))
        .map(c => ({ id: c.id, name: c.name, mark: c.regulationMark, gameplay: c.gameplay })).slice(0, 12) }))
  } finally { archive.close(); db.close() }
})

const cases = [
  { id: 'card', question: 'Budew: Itchy Pollen richiede Energie? Durante il blocco posso usare Judge e Unfair Stamp? Spiega i limiti esatti senza proporre modifiche al mazzo.' },
  { id: 'replacement', question: 'Nella mia lista Toucannon sostituisci una copia di Hassel TWM 205 con Judge POR 76. Mantieni esattamente 4 Toucannon PBL 94 e Legacy Energy come unica ACE SPEC. Valuta il compromesso e restituisci la lista completa di 60 carte.' },
  { id: 'general', question: 'Migliora questa lista Toucannon per trovare un equilibrio tra consistenza e matchup osservati. Mantieni esattamente 4 Toucannon PBL 94. Valuta alternative motivate usando le evidenze locali e proponi una lista completa di 60 carte; esplicita le lacune del campione senza inventare winrate.' },
  { id: 'matchup', question: 'Prepara una guida concreta per Toucannon contro Dragapult: avvio, sviluppo e chiusura. Considera Battle Cage, Mist Energy, premi, limiti dei dati e differenze fra danni e segnalini.' },
  { id: 'revision', question: 'Credo che Battle Cage protegga anche il Pokémon Attivo e che impedisca i normali danni dell’attacco. Confermi? Rivedi la guida distinguendo posizione, danni, segnalini, attacchi e Abilità, e confronta la protezione di Mist Energy.' }
] as const

it.skipIf(!['preflight', 'live'].includes(process.env.POKEGURU_DECISION_EVAL ?? ''))('compares five real-source tasks with unchanged model and production validation', async () => {
  const live = process.env.POKEGURU_DECISION_EVAL === 'live'
  const fixtureText = readFileSync(resolve('.verify/decision-fixture.json'), 'utf8')
  const fixture = JSON.parse(fixtureText) as { referenceDate: string; catalog: CatalogView; rows: EvidenceEventRow[];
    window: { from: string; to: string }; baseRawText: string; config: AiRunConfig; selection: string }
  const fixtureHash = createHash('sha256').update(fixtureText).digest('hex')
  const config: AiRunConfig = { ...fixture.config, model: 'gpt-6.1-sol' }
  const selectedCases = cases.filter(c => !process.env.POKEGURU_DECISION_CASE || c.id === process.env.POKEGURU_DECISION_CASE)
  let invocations = 0
  for (const [caseIndex, task] of selectedCases.entries()) {
    const variants = process.env.POKEGURU_DECISION_VARIANT ? [process.env.POKEGURU_DECISION_VARIANT]
      : caseIndex % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
    for (const variant of variants) {
      if (!['baseline', 'candidate'].includes(variant)) throw new Error('Unknown comparison variant')
      const output = resolve(`.verify/decision-${task.id}-${variant}.json`)
      if (live && existsSync(output)) {
        const saved = JSON.parse(readFileSync(output, 'utf8'))
        if (saved.fixtureHash !== fixtureHash) throw new Error('Output belongs to another frozen fixture')
        continue
      }
      const folder = resolve(`.verify/evaluation-${task.id}-${variant}-${live ? 'live' : 'preflight'}`)
      mkdirSync(folder, { recursive: true })
      const projects = new ProjectStore(resolve(folder, 'data.sqlite')), jobs = new AiJobStore(resolve(folder, 'data.sqlite'))
      const project = projects.create({ name: 'Isolated five-case evaluation', format: 'STANDARD' })
      projects.importDeck({ projectId: project.id, rawText: fixture.baseRawText, source: 'paste' })
      const thread = projects.createDeckThread({ projectId: project.id, title: task.id })
      const base = projects.listDeckVersions(project.id)[0], baseline = projects.getBaseline(project.id)!
      const original = buildDeckCards(baseline, fixture.catalog).find(c => c.name === 'Toucannon')!
      if (!original.identityId) throw new Error('Toucannon identity unavailable for constraint evaluation')
      const constraints: DeckConstraint[] = [{ id: 'locked-toucannon', projectId: project.id, identityId: original.identityId,
        identityName: 'Toucannon', printId: 'me05-094', kind: 'exact', quantity: 4,
        createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z' }]
      const job = jobs.start('thread-ask', project.id, thread.id)
      const work = new AiAnalysisWork(resolve(folder, job.id), jobs, job.id, new AbortController().signal,
        { schemaVersion: variant === 'baseline' ? 3 : 4, kind: 'thread-ask', args: [project.id, thread.id, task.question] })
      const calls: { kind: string; elapsedMs: number; inputBytes: number; usage: unknown; promptHash: string }[] = []
      const started = performance.now()
      const invoke = async (kind: string, prompt: string, schema: unknown) => {
        if (!live) throw new Error('Preflight must not invoke the model')
        if (++invocations > 120 || calls.length >= 24) throw new Error('Evaluation invocation budget reached; inspect persisted outputs before continuing')
        const callStarted = performance.now()
        writeFileSync(resolve('.verify/decision-live-status.json'), JSON.stringify({ case: task.id, variant, kind,
          startedAt: new Date().toISOString(), completedCalls: calls.length, totalInvocations: invocations }))
        const value = await runStructuredCodex(prompt, config, schema, work.signal)
        calls.push({ kind, elapsedMs: Math.round(performance.now() - callStarted), inputBytes: Buffer.byteLength(prompt),
          usage: (value as { __usage?: unknown }).__usage ?? null,
          promptHash: createHash('sha256').update(prompt).digest('hex') })
        writeFileSync(resolve(folder, 'calls.json'), JSON.stringify(calls, null, 2))
        return value
      }
      try {
        work.snapshot('base', [], () => base); work.snapshot('constraints', [], () => constraints)
        work.snapshot('reference-date', [], () => fixture.referenceDate)
        work.archive.captureSources({ catalog: fixture.catalog, window: fixture.window }, fixture.rows.map(value => ({
          key: evidenceOccurrenceIdentity(value), deckKey: exactDeckIdentity(value.cards), date: value.date, placing: value.placing,
          deckName: value.deck, deckText: normalizedEvidenceText(value.deck), cardsText: value.cards.map(normalizedEvidenceText).join('\n'), value })))
        const { engine } = createArchivedEvidenceEngine(work.archive, () => { throw new Error('Frozen sources required') })
        const initial = buildThreadEvidence(thread, base, task.question, constraints, fixture.catalog, [], [])
        const validBase = validateDeckProposal({ outcome: 'candidate', rawText: base.rawText, rationale: 'Preflight baseline', sourceIds: ['base'] },
          project.id, fixture.catalog, constraints, initial.sources, fixture.referenceDate)
        const opponentRow = fixture.rows.find(r => /dragapult/i.test(r.deck))!
        const sample = { url: opponentRow.listUrl, cards: opponentRow.cards,
          mechanics: engine.cardTargets(opponentRow.cards.join('\n')).flatMap(t => t.printIds).map(id => fixture.catalog.prints.find(p => p.id === id)!)
            .filter(p => p?.gameplay).map(p => ({ name: `${p.name} (${p.id})`, text: gameplaySummary(p.gameplay!, p), sourceUrl: p.sourceUrl })) }
        const deckContext = matchupDeckContext(baseline, { projectId: project.id, mappings: [] } as any, fixture.catalog,
          evaluateStandardDeck(baseline, fixture.catalog, fixture.referenceDate))
        work.snapshot('deck-context', [], () => deckContext)
        const opponent = { id: 'evaluation-dragapult', name: 'Dragapult', points: 0, share: 50, url: opponentRow.url }
        const meta: MetaSnapshot = { id: 'evaluation-meta', fetchedAt: '2026-10-29T00:00:00.000Z', sourceUrl: opponentRow.url,
          period: 'Campione di valutazione: 16 liste Toucannon e 16 Dragapult selezionate, quota del campione non del metagame',
          circuit: 'WESTERN', format: 'STANDARD', decks: [opponent], cached: true }
        const evidence: MatchupTournamentEvidence = { status: 'unavailable', detail: fixture.selection,
          eventId: null, eventName: null, eventDate: null, eventUrl: null, eventLists: null, eventParticipants: null,
          matchedDeckId: null, matchedCompleteLists: 0, observedCards: [], sampleLists: [] }
        const previous = { projectId: project.id, metaId: meta.id, opponentId: opponent.id, deckHash: 'evaluation-base',
          strengths: 'Battle Cage e Mist Energy possono proteggere da alcuni effetti: verificare posizione e fonte.',
          weaknesses: 'La linea evolutiva richiede preparazione.', ourKeyCards: 'Toucannon, Battle Cage, Mist Energy',
          theirKeyCards: 'Dragapult', strategy: 'Preparare Toucannon e valutare la protezione della Panchina.',
          strategyPhases: { opening: 'Preparare la linea evolutiva.', development: 'Valutare le protezioni disponibili.', closing: 'Pianificare i Premi.' },
          limitations: 'Guida sintetica di test, da rivedere sulle schede originali.' } as any
        const discussion: MatchupDiscussion = { id: 'evaluation-discussion', projectId: project.id, metaId: meta.id,
          opponentId: opponent.id, deckHash: 'evaluation-base', parentId: null, current: true,
          createdAt: '2026-10-29T00:00:00.000Z', contextSummary: '', summarizedThrough: -1,
          turns: [{ id: 'previous', turnNo: 0, feedback: null, createdAt: '2026-10-29T00:00:00.000Z', report: previous, changeSummary: null }] }
        if (!live) {
          const probe = (rawText: string, sourceIds = ['base']) => () => validateDeckProposal({ outcome: 'candidate',
            rawText, rationale: 'Independent negative probe', sourceIds }, project.id, fixture.catalog, constraints,
            initial.sources, fixture.referenceDate)
          expect(probe(base.rawText.replace('4 Toucannon PBL 94', '5 Toucannon PBL 94'))).toThrow('60 carte')
          expect(probe(`${base.rawText.replace('4 Toucannon PBL 94', '3 Toucannon PBL 94')}\n1 Judge POR 76`)).toThrow('vincoli')
          expect(probe(`${base.rawText.replace('4 Hassel TWM 205', '3 Hassel TWM 205')}\n1 Unfair Stamp TWM 165`)).toThrow('costruzione')
          expect(probe(base.rawText.replace('1 Patrat CRI 70', '1 Invented Pokemon XXX 999'))).toThrow('Stampa non verificabile')
          expect(probe(base.rawText, ['invented-source'])).toThrow('fonte non presente')
          writeFileSync(resolve('.verify/decision-preflight.json'), JSON.stringify({ fixtureHash, baseAccepted: !!validBase,
            sourceRows: fixture.rows.length, constraint: constraints[0].identityId, case: task.id,
            baseCardLines: baseline.lines.filter(l => l.kind === 'card').length, opponentCards: sample.cards.length,
            rejected: ['61 cards', '60 cards violating exact constraint', '60 cards with two ACE SPEC', 'unknown print', 'unknown source'] }))
          continue
        }
        const guide = task.id === 'matchup' || task.id === 'revision'
        const contextTexts = [base.rawText, ...(guide ? [sample.cards.join('\n')] : [])]
        const trace = await runAiEvidenceQueries(task.question, guide ? { deckContext, sample, evidence,
          ...(task.id === 'revision' ? { previousGuide: previous, feedback: task.question } : {}) } : initial, engine,
          prompt => work.run('planning', prompt, config, async reportUsage => {
            // Production planner schema and identical CLI transport, with complete call timing.
            const { AI_QUERY_PLAN_SCHEMA, AI_DECISION_PLAN_SCHEMA } = await import('../src/main/ai-evidence-queries')
            const value = await invoke('planning', prompt, variant === 'candidate' ? AI_DECISION_PLAN_SCHEMA : AI_QUERY_PLAN_SCHEMA)
            reportUsage((value as any).__usage); return value
          }), { archive: work.archive, contextTexts, signal: work.signal,
            summarize: trace => analyzeLargeEvidence(trace, task.question, config, work, async (prompt, reportUsage) => {
              const value = await invoke('batch-or-synthesis', prompt, { type: 'object', additionalProperties: false,
                required: ['summary', 'limitations', 'sourceIds'], properties: { summary: { type: 'string', maxLength: 2400 },
                  limitations: { type: 'string', maxLength: 1200 }, sourceIds: { type: 'array', maxItems: 64, items: { type: 'string' } } } })
              reportUsage?.((value as any).__usage); return value
            }) })
        const summarize = async () => analyzeLargeEvidence(trace, task.question, config, work, async (prompt, reportUsage) => {
          const value = await invoke('batch-or-synthesis', prompt, { type: 'object', additionalProperties: false,
            required: ['summary', 'limitations', 'sourceIds'], properties: { summary: { type: 'string', maxLength: 2400 },
              limitations: { type: 'string', maxLength: 1200 }, sourceIds: { type: 'array', maxItems: 64, items: { type: 'string' } } } })
          reportUsage?.((value as any).__usage); return value
        })
        await summarize()
        prepareEvidenceDelivery(trace, engine, [task.question, ...contextTexts])
        let answer: any, checked: any, revisions = 0
        for (let attempt = 0; attempt < 4; attempt++) {
          const packet = threadEvidenceWithQueries(initial, trace)
          const context = deckThreadPrompt(thread, base, task.question, constraints, fixture.catalog, packet, fixture.referenceDate)
          const prompt = guide ? task.id === 'revision'
            ? matchupRevisionPrompt(discussion, task.question, deckContext, meta, opponent, sample, evidence, trace)
            : matchupGenerationPrompt(deckContext, meta, opponent, sample, evidence, undefined, trace) : context.prompt
          const fields = [...matchupFields, ...(task.id === 'revision' ? ['changeSummary'] : [])]
          const schema = guide ? { type: 'object', additionalProperties: false, required: fields,
            properties: Object.fromEntries(fields.map(f => [f, { type: 'string' }])) } : DECK_THREAD_SCHEMA
          answer = await work.run('analysis', prompt, config, async reportUsage => {
            const value = await invoke('answer', prompt, schema); reportUsage((value as any).__usage); return value
          })
          const text = guide ? fields.map(f => answer[f]).join('\n') : [answer.reply, answer.rawText].join('\n')
          const added = extendAiEvidenceForText(trace, engine, text)
          const missing = draftNeedsEvidenceReview(trace, engine, text)
          prepareEvidenceDelivery(trace, engine, [text, ...contextTexts])
          if (!added && !missing) {
            checked = guide ? readMatchupAnalysis(answer, 2) : readDeckThreadTurn(answer, project.id, base, fixture.catalog,
              constraints, packet, context.sources, fixture.referenceDate)
            break
          }
          if (attempt === 3) throw new Error('Final card verification still requires new originals')
          revisions++; await summarize()
        }
        if (!checked) throw new Error('No validated final answer')
        expect(!!checked.proposal).toBe(task.id === 'replacement' || task.id === 'general')
        const negatives = ['61 Toucannon PBL 94', base.rawText.replace('4 Toucannon PBL 94', '3 Toucannon PBL 94')]
          .map(rawText => { try { validateDeckProposal({ outcome: 'candidate', rawText, rationale: 'Negative probe', sourceIds: ['base'] },
            project.id, fixture.catalog, constraints, initial.sources, fixture.referenceDate); return false } catch { return true } })
        expect(negatives.every(Boolean)).toBe(true)
        const result = { schemaVersion: 1, fixtureHash, variant, case: task.id, question: task.question, config,
          elapsedMs: Math.round(performance.now() - started), calls, revisions, queryRounds: trace.planningRounds,
          evidenceBytes: trace.responseBytes, candidateAccepted: !!checked.proposal, negativeCandidatesRejected: negatives,
          answer, checked, diagnostics: jobs.diagnostics(job.id), selection: fixture.selection,
          limitation: 'One live paired observation on a bounded real-source fixture; synthetic previous guide/meta labels. Production prompts, collection and validators, ephemeral CLI final turns. Not full-corpus latency or statistical non-inferiority.' }
        writeFileSync(output, JSON.stringify(result, null, 2))
        writeFileSync(resolve('.verify/decision-live-status.json'), JSON.stringify({ case: task.id, variant, completed: true,
          calls: calls.length, elapsedMs: result.elapsedMs }))
      } finally { work.close(); jobs.close(); projects.close() }
    }
  }
}, 7_200_000)

it.skipIf(process.env.POKEGURU_DECISION_EVAL !== 'scale')('reconciles complete query distributions on the full read-only audit snapshot', () => {
  const path = process.env.POKEGURU_DECISION_SNAPSHOT!, id = process.env.POKEGURU_DECISION_JOB!
  if (!path || !id) throw new Error('Explicit snapshot/job required')
  const db = new DatabaseSync(path, { readOnly: true })
  const owner = db.prepare('SELECT project_id, resource_id FROM ai_jobs WHERE id = ?').get(id) as { project_id: string; resource_id: string }
  const source = new AiEvidenceArchive(path, { id, projectId: owner.project_id, resourceId: owner.resource_id }, true)
  // Writes are held in memory; the audited SQLite/WAL remain read-only.
  const saved = new Map<string, unknown>()
  const view = { value: (role: string, key: string) => saved.get(`${role}:${key}`),
    saveValue: (role: string, key: string, value: unknown) => { saved.set(`${role}:${key}`, value) },
    eventRows: source.eventRows.bind(source), eventRow: source.eventRow.bind(source) } as unknown as AiEvidenceArchive
  try {
    const window = source.value<{ window: { from: string; to: string } }>('snapshot', 'sources')!.window
    const results = []
    for (const filter of [{ deckName: 'Toucannon' }, { cardName: 'Dragapult ex' }, { cardName: 'Raging Bolt ex' }, { cardName: 'Gardevoir ex' }]) {
      const start = performance.now()
      const data = decisionEventSearch(view, { operation: 'events.search', ...filter, ...window, offset: 0, limit: 4 }) as any
      const elapsedMs = Math.round(performance.now() - start)
      let matches = 0
      const decks = new Set<string>(), frequencies = new Map<string, Map<number, number>>()
      for (const row of source.eventRows<EvidenceEventRow>()) {
        if (row.date < window.from || row.date > window.to || filter.deckName && !normalizedEvidenceText(row.deck).includes(normalizedEvidenceText(filter.deckName)) ||
          filter.cardName && !row.cards.some(c => normalizedEvidenceText(c).includes(normalizedEvidenceText(filter.cardName)))) continue
        matches++; decks.add(exactDeckIdentity(row.cards))
        const quantities = new Map<string, number>()
        for (const line of row.cards) {
          const parsed = /^(\d+)\s+(.+)$/.exec(line.trim())!
          quantities.set(parsed[2], (quantities.get(parsed[2]) ?? 0) + Number(parsed[1]))
        }
        for (const [card, count] of quantities) {
          const counts = frequencies.get(card) ?? new Map<number, number>()
          counts.set(count, (counts.get(count) ?? 0) + 1); frequencies.set(card, counts)
        }
      }
      expect(data.scope.matchingParticipations).toBe(matches)
      expect(data.scope.distinctDecks).toBe(decks.size)
      expect(data.cards).toHaveLength(frequencies.size)
      for (const [card, containing, , quantities] of data.cards) {
        expect(quantities).toEqual([...frequencies.get(card)!].sort(([a], [b]) => a - b))
        expect(containing).toBe(quantities.reduce((sum: number, value: number[]) => sum + value[1], 0))
      }
      expect(data.lists).toHaveLength(Math.min(4, decks.size))
      results.push({ filter, elapsedMs, profileBytes: Buffer.byteLength(JSON.stringify(data)),
        matchingParticipations: matches, distinctDecks: decks.size, distinctPrintLines: frequencies.size,
        selectedLists: data.lists.length, distributionsReconciled: true, coverage: data.coverage })
    }
    writeFileSync(resolve('.verify/decision-scale.json'), JSON.stringify({ schemaVersion: 1, results,
      limit: 'Offline complete-snapshot representation; zero AI calls. Timing excludes source snapshot capture and model generation.' }, null, 2))
  } finally { source.close(); db.close() }
}, 600_000)
