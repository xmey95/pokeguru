import {runStructuredCodex} from '../src/main/codex-evidence-plan'
import {AiFailure,aiFailureCode} from '../src/main/ai-failure'
import {readAiTokenUsage} from '../src/shared/ai-evidence'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { addGuideLists, buildGuidePacket, extendGuidePacket, guideHash } from '../src/main/matchup-guide-packet'
import { deepGuideReport, generateDeepGuide, GUIDE_MAX_ATTEMPTS } from '../src/main/matchup-guide-generation'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../src/shared/western-rule-package'
import { parseDeck } from '../src/shared/deck-import'
import type { CatalogView } from '../src/shared/catalog'
import type { MatchupReport, MatchupTournamentEvidence } from '../src/shared/meta-matchups'
import type { GuideAttempt, GuideContent, GuideReview } from '../src/shared/matchup-guide'
import type { AiRunConfig } from '../src/shared/ai'
import type { TournamentSnapshot } from '../src/shared/tournament'
import type { MainTournamentSnapshot } from '../src/shared/main-tournament'

const cases = [
  { id: 'toucannon-dragapult', opponent: 'Dragapult', baseline: 'baseline-284.json' },
  { id: 'toucannon-festival', opponent: 'Festival Lead', baseline: 'baseline-336.json' },
  { id: 'dragapult-hydrapple', opponent: 'Hydrapple', baseline: null }
] as const
const config: AiRunConfig = { provider: 'codex', source: 'global', model: 'gpt-6.1-sol', reasoningEffort: null }
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
const read = <T = any>(path: string): T => JSON.parse(readFileSync(path, 'utf8'))
const save = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2))

// Three new jobs, no previous guide, editorial patch, custom runner or budget override.
// An unsuccessful case is terminal for this campaign; rerunning cannot create a fresh job.
it.skipIf(process.env.POKEGURU_GUIDE_AUTONOMY !== '1')('evaluates three autonomous generations with unchanged gates and sixteen calls each', async () => {
  const workspace = resolve('.'), output = resolve(process.env.POKEGURU_GUIDE_AUTONOMY_OUTPUT!),
    source = resolve('.verify/matchup-guide-pilot-20261030'), snapshot = resolve('.verify/first-analysis-job-audit/snapshot2/pokeguru.sqlite')
  const outputRelative = relative(resolve('.verify'), output)
  if (!outputRelative || outputRelative.startsWith(`..${sep}`) || resolve(output) === resolve(source)) throw new Error('Use a new verification directory.')
  mkdirSync(output, { recursive: true })
  expect(GUIDE_MAX_ATTEMPTS).toBe(16)
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    prints: read(join(source, 'catalog.json')), sets: read(join(source, 'sets.json')),
    scope: { setIds: [], names: [] }, syncedAt: '2026-10-30', rulePackage: BUNDLED_WESTERN_RULE_PACKAGE }
  catalog.scope = { setIds: catalog.sets.map(s => s.id), names: [...new Set(catalog.prints.map(p => p.name))] }
  const codeFiles = ['src/main/guide-native-repair.ts', 'src/main/guide-wire-dense.ts', 'src/main/codex-usage-capture.ts', 'src/shared/guide-turn-facts.ts', 'tests/guide-native-repair.test.ts', 'tests/codex-usage-capture.test.ts', 'tests/matchup-guide-autonomy-live.test.ts', 'tests/codex-structured-timeout.test.ts', 'tests/matchup-guide.test.ts', 'tests/guide-request-budget.test.ts', 'package-lock.json', 'package.json', 'src/shared/guide-scenario-output.ts', 'src/main/guide-scenario-output-schema.ts', 'src/main/guide-decision-context.ts', 'src/main/guide-wire-data.ts', 'src/shared/guide-native-decisions.ts', 'src/shared/ai-limits.ts', 'src/main/guide-request-budget.ts', 'src/shared/guide-tactical-frontier.ts',
    'src/renderer/src/DeepMatchupGuide.tsx', 'src/renderer/src/AiLimits.tsx',
    'src/shared/guide-ledger-projection.ts',
    'src/shared/guide-response-construction.ts', 'src/shared/guide-turn-legality.ts', 'src/shared/guide-causal-description.ts', 'src/main/guide-causal-contract.ts', 'src/shared/guide-combat-normalization.ts', 'src/shared/guide-reply-coverage.ts', 'src/shared/guide-physical-resources.ts', 'src/shared/guide-turn-blocks.ts', 'src/shared/guide-opportunities.ts', 'src/shared/guide-reply-costs.ts',
    'src/main/guide-schema-encoding.ts', 'src/shared/guide-deck-observations.ts', 'src/main/codex-failure.ts', 'src/main/ai-failure.ts', 'src/shared/ai-diagnostics.ts', 'src/main/guide-bound-schema.ts',
    'src/main/matchup-guide-generation.ts', 'src/main/matchup-guide-packet.ts', 'src/main/matchup-guide-schema.ts',
    'src/shared/matchup-guide.ts', 'src/shared/guide-setup-ledger.ts', 'src/shared/guide-tactical-checks.ts', 'src/shared/western-rule-package.ts', 'src/main/backend.ts',
    'src/main/ai-analysis-work.ts', 'src/main/ai-call-retry.ts', 'src/main/ai-job-store.ts', 'src/main/project-store.ts',
    'src/main/ai-evidence-engine.ts', 'src/main/ai-evidence-archive.ts', 'src/main/ai-evidence-snapshot.ts',
    'src/main/codex-evidence-plan.ts', 'src/main/codex-isolation.ts', 'src/main/codex-setup.ts']
  const sourceFiles = ['catalog.json', 'sets.json', 'baseline-284.json', 'baseline-336.json', 'hydrapple-lists.json',
    ...cases.map(c => `packet-${c.id}.json`)].map(file => join(source, file))
  const prepareOnly = process.env.POKEGURU_GUIDE_AUTONOMY_PREPARE === '1'
  if (!prepareOnly) sourceFiles.push(...cases.map(c => join(output, c.id, 'packet.json')))
  if(process.env.POKEGURU_GUIDE_SCHEMA_DIAGNOSIS==='1')sourceFiles.push(...['toucannon-festival','dragapult-hydrapple'].map(id=>join(output,`diagnostic-${id}.json`)))
  const fingerprints = () => Object.fromEntries([...codeFiles.map(f => resolve(f)), ...sourceFiles].map(f => [relative(workspace, f), digest(f)]))
  const sealed = { config, maximumPerGuide: 16, maximumTotal: 48, manualContentEdits: false, cases,
    files: fingerprints() }
  const sealPath = join(output, 'seal.json')
  if (!prepareOnly) {
    if (existsSync(sealPath)) expect(read(sealPath)).toEqual(sealed)
    else save(sealPath, sealed)
  }
  const assertSealed = () => { if (!prepareOnly) expect(fingerprints()).toEqual(sealed.files) }

  async function runCase(definition: typeof cases[number]) {
    const folder = join(output, definition.id), outcomePath = join(folder, 'outcome.json')
    mkdirSync(folder, { recursive: true })
    if (existsSync(outcomePath)) return read(outcomePath)
    const pilot = read(join(source, `packet-${definition.id}.json`))
    const historical = definition.baseline ? read<MatchupReport>(join(source, definition.baseline)) : null
    const rawText = pilot.ourDeck.cards.map((c: any) => `${c.count} ${c.name} ${c.set} ${c.number}`).join('\n')
    const path = join(folder, 'data.sqlite'), projects = new ProjectStore(path), jobs = new AiJobStore(path)
    const casePath = join(folder, 'case.json'), savedCase = existsSync(casePath) ? read(casePath) : null
    const project = savedCase ? projects.list().find(p => p.id === savedCase.projectId)! : projects.create({ name: `APP-217 ${pilot.title}`, format: 'STANDARD' })
    if (!projects.getBaseline(project.id)) projects.importDeck({ projectId: project.id, rawText, source: 'paste' })
    const baseline = projects.getBaseline(project.id)!, context = projects.getCurrentDeckContext(project.id)!
    expect(baseline.rawText).toBe(rawText)
    const job = savedCase ? jobs.get(savedCase.jobId)! : jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    if (!savedCase) save(casePath, { id: definition.id, projectId: project.id, jobId: job.id, ownListHash: guideHash(rawText) })
    const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal,
      { kind: 'matchup-generate', args: [], guideVersion: 1 })
    const startedAt = new Date().toISOString()
    let targetMetaId: string | undefined
    const reviews = () => [...work.archive.values<GuideAttempt>('guide-attempt-start')].map(a => a.value)
      .filter(a => a.stage.startsWith('review')).sort((a, b) => a.sequence - b.sequence).flatMap(a => {
        const key = String(a.sequence).padStart(3, '0')
        const status = work.archive.value<GuideAttempt>('guide-attempt-end', key)?.status ?? 'running'
        const prompt = work.archive.value<{ prompt: string }>('guide-prompt', a.inputHash)?.prompt
        if (!prompt) return []
        const data = (work.archive.value<any>('guide-call-data',a.inputHash)?.data ?? JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1].split('\n\nLa risposta precedente non rispetta il contratto:')[0])) as { draft: GuideContent; localChecks: unknown }
        const review = work.archive.value<any>('guide-review-stage',a.stage)?.review ?? [...work.archive.values<GuideReview>('guide-review')].find(r => r.key === guideHash([data.draft, r.value]))?.value
        return [{ sequence: a.sequence, stage: a.stage, status, localChecks: data.localChecks,
          review: status === 'succeeded' ? review ?? null : null,
          failure: work.archive.value('guide-attempt-failure', key) ?? null }]
      })
    try {
      expect(jobs.recent().filter(j => j.projectId === project.id)).toHaveLength(1)
      const window = { from: pilot.opponent.window.from.slice(0, 10), to: pilot.opponent.window.to.slice(0, 10) }
      const { engine, catalog: frozenCatalog } = createArchivedEvidenceEngine(work.archive, () => {
        const db = new DatabaseSync(snapshot, { readOnly: true }); db.exec('PRAGMA query_only=ON')
        // Only this archived matchup is exposed; source rows retain original event metadata.
        const play: TournamentSnapshot[] = [], main: MainTournamentSnapshot[] = []
        try {
          for (const table of ['tournament_snapshots', 'main_tournament_snapshots']) {
            const seen = new Set<string>()
            for (const row of db.prepare(`SELECT payload FROM ${table}`).iterate() as Iterable<{ payload: string }>) {
              const event = JSON.parse(row.payload)
              if (event.date < window.from || event.date > window.to || seen.has(event.eventId)) continue
              seen.add(event.eventId)
              if (table === 'tournament_snapshots') {
                const participations = event.participations.filter((p: any) => (p.deck?.name ?? '').toLowerCase().includes(definition.opponent.toLowerCase()))
                if (participations.length) play.push({ ...event, participations })
              } else {
                const participants = event.participants.filter((p: any) => (p.deckName ?? '').toLowerCase().includes(definition.opponent.toLowerCase()))
                if (participants.length) main.push({ ...event, participants })
              }
            }
          }
        } finally { db.close() }
        return { catalog, window, play, main }
      })
      const evidence: MatchupTournamentEvidence = historical?.tournamentEvidence ?? {
        status: 'matched', detail: pilot.opponent.coverage, eventId: null, eventName: null, eventDate: null, eventUrl: null,
        eventLists: null, eventParticipants: null, matchedDeckId: null, matchedCompleteLists: pilot.opponent.denominator,
        observedCards: pilot.opponent.observedCards.map((c: any) => ({ ...c, catalogIdentityId: null, catalogStatus: 'ambiguous' })),
        sampleLists: pilot.opponent.sampleLists.map((l: any) => ({ url: l.url, placing: l.placing, eventName: l.event,
          cards: l.cards.map((c: any) => `${c.count} ${c.name} ${c.set} ${c.number}`) })) }
      const metaId = guideHash({ campaign: 'APP-191', case: definition.id, evidence }), opponentId = historical?.opponentId ?? 'hydrapple'
      targetMetaId = metaId
      projects.saveMetaSnapshot({ id: metaId, fetchedAt: '2026-10-30T00:00:00.000Z',
        sourceUrl: pilot.opponent.sourceUrl ?? evidence.sampleLists[0].url, circuit: 'WESTERN', format: 'STANDARD',
        period: 'Indice tecnico di prova; aggregati originali nel pacchetto', cached: true,
        decks: [{ id: opponentId, name: definition.opponent, url: pilot.opponent.sourceUrl ?? evidence.sampleLists[0].url,
          share: 0, points: 0 }] })
      const packet = work.snapshot('guide-packet', [], () => {
        const p = buildGuidePacket({ basis: { projectId: project.id, deckHash: projects.getCurrentDeckHash(project.id)!,
          deckVersionId: context.versionId, deckResolutionId: context.resolutionId, metaId, opponentId, asOf: '2026-10-30' },
        baseline: { ...baseline, ...parseDeck(rawText) }, reconciliation: projects.getReconciliation(project.id), catalog: frozenCatalog,
        evidence, sample: { url: historical?.sampleDeckUrl ?? null, cards: historical?.sampleDeckCards ?? [] },
        matchup: definition.opponent, deckContext: rawText })
        if (pilot.ourDeck.resolution) p.gaps.push(pilot.ourDeck.resolution)
        if (definition.id === 'dragapult-hydrapple') p.gaps.push(pilot.opponent.coverage)
        return p
      })
      save(join(folder, 'packet.json'), packet)
      if (prepareOnly) return { id: definition.id, prepared: true, opponentLists: packet.opponentLists.length,
        sources: packet.sources.length, bytes: Buffer.byteLength(JSON.stringify(packet)), gaps: packet.gaps }
      assertSealed()
      if(process.env.POKEGURU_GUIDE_SCHEMA_DIAGNOSIS==='1'&&definition.id!=='toucannon-dragapult'&&!work.archive.value('guide-attempt-start','001')){
        const probe=read(join(output,`diagnostic-${definition.id}.json`)),stage='diagnose-archived-schema',attemptKey='001'
        const attempt:GuideAttempt={sequence:1,stage,startedAt:new Date().toISOString(),endedAt:null,status:'running',inputHash:guideHash(probe.prompt),inputBytes:Buffer.byteLength(probe.prompt),durationMs:0,usage:null}
        work.archive.saveValue('guide-attempt-start',attemptKey,attempt)
        work.archive.saveValue('guide-prompt',attempt.inputHash,{stage,prompt:probe.prompt,config})
        work.archive.saveValue('guide-diagnostic-schema',attemptKey,{schema:probe.schema,basis:probe.basis})
        const started=performance.now()
        try{
          const raw=await runStructuredCodex(probe.prompt,config,probe.schema,work.signal)
          attempt.usage=readAiTokenUsage((raw as any)?.__usage);attempt.status='succeeded'
          work.archive.saveValue('guide-diagnostic-response',attemptKey,{raw,usedInGuide:false})
        }catch(error){
          attempt.status='failed'
          work.archive.saveValue('guide-attempt-failure',attemptKey,{stage,code:aiFailureCode(error),message:error instanceof Error?error.message:String(error),...error instanceof AiFailure&&error.providerDetails?{providerDetails:error.providerDetails}: {}})
        }finally{
          attempt.endedAt=new Date().toISOString();attempt.durationMs=Math.round(performance.now()-started)
          work.archive.saveValue('guide-attempt-end',attemptKey,attempt);assertSealed()
        }
      }
      const guide = await generateDeepGuide({ packet, config, work, request: `Crea la guida della nostra lista contro ${definition.opponent}.`,
        ensureEvidence: (packet, text) => {
          const targets = engine.cardTargets(text).filter(target => !packet.sources.some(s => s.kind === 'card' && s.label === target.name))
          const ids = [...new Set(targets.flatMap(t => t.printIds))]
          const expanded = ids.length <= 12 ? extendGuidePacket(packet, frozenCatalog, ids) : packet
          return { packet: expanded, missing: targets.filter(t => !expanded.sources.some(s => s.kind === 'card' && s.label === t.name)).map(t => t.name) }
        },
        retrieve: (packet, ids, requests) => {
          let expanded = extendGuidePacket(packet, frozenCatalog, ids)
          for (const [index, request] of requests.entries()) {
            const result = engine.execute({ operation: 'events.search', deckName: definition.opponent,
              ...(request.cardName ? { cardName: request.cardName } : {}), offset: request.offset, limit: 2 })
            work.archive.saveValue('guide-query', String(index), result)
            const lists = (result.data as { lists?: { deck: string; name: string; listUrl: string; cards: string[] }[] })?.lists ?? []
            if (result.status !== 'ok' || !lists.length) expanded.gaps.push(`Nessuna lista aggiuntiva risolta per ${request.cardName ?? definition.opponent}.`)
            expanded = addGuideLists(expanded, frozenCatalog, lists.map(l => ({ label: `${l.deck} · ${l.name}`, url: l.listUrl, cards: l.cards })))
          }
          return expanded
        }, onStage: stage => { assertSealed(); console.log(`${definition.id}: ${stage}`) } })
      const report = deepGuideReport({ jobId: job.id, projectId: project.id, deckHash: packet.basis.deckHash,
        deckVersionId: context.versionId, deckResolutionId: context.resolutionId, metaId, opponentId,
        generatedAt: new Date().toISOString(), sampleDeckUrl: packet.opponentLists[0].url, tournamentEvidence: evidence }, guide)
      projects.saveMatchupReport(report); jobs.ready(job.id, { report }); jobs.transition(job.id, 'applied')
      save(join(folder, 'generated.json'), report)
    } catch (error) {
      if (prepareOnly) throw error
      jobs.suspend(job.id, error instanceof Error ? error.message : String(error), 'failure')
    } finally {
      if (!prepareOnly) {
        const attempts = [...work.archive.values<GuideAttempt>('guide-attempt-start')].map(({ key, value }) =>
          work.archive.value<GuideAttempt>('guide-attempt-end', key) ?? value).sort((a, b) => a.sequence - b.sequence)
        const corrections = [...work.archive.values<{ origin: string }>('guide-text-correction')].map(v => v.value.origin)
        const result = { id: definition.id, title: pilot.title, jobId: job.id, startedAt, endedAt: new Date().toISOString(),
          passed: jobs.get(job.id)!.status === 'applied', error: jobs.get(job.id)!.error,
          attempts, tokenPlans:[...work.archive.values('guide-token-plan')].map(v=>v.value), unitPlans:[...work.archive.values('guide-unit-plan')].map(v=>v.value), reviews: reviews(), correctionOrigins: corrections,
          scenarioGates: [...work.archive.values('guide-scenarios-validated')].map(v => v.key),
          derivedTactics: [...work.archive.values<{ origin: string }>('guide-derived-tactics')].map(v => ({ hash: v.key, origin: v.value.origin })),
          projectedStates: [...work.archive.values('guide-state-projection')].map(v => v.key),
          invalidResponses: [...work.archive.values('guide-invalid-response')].map(v => ({ sequence: Number(v.key), ...v.value as object })),
          savedReports: targetMetaId ? projects.listMatchupReports(project.id, targetMetaId).length : 0 }
        save(outcomePath, result)
        expect(attempts.length).toBeLessThanOrEqual(16)
        expect(corrections.every(origin => origin === 'critic')).toBe(true)
        expect(result.derivedTactics.every(change => change.origin === 'compiler-v3')).toBe(true)
        expect(result.savedReports).toBe(result.passed ? 1 : 0)
        if (attempts.some(a => a.stage.startsWith('prose'))) {
          expect(result.scenarioGates).toHaveLength(1)
          const firstProse = attempts.find(a => a.stage.startsWith('prose'))!.sequence
          expect(result.reviews.some(r => r.stage.startsWith('review-scenarios') && r.sequence < firstProse &&
            r.review?.verdict === 'pass' && !r.review.findings.length && !(r.localChecks as { errors: string[] }).errors.length)).toBe(true)
        }
        assertSealed()
      }
      work.close(); jobs.close(); projects.close()
    }
    return read(outcomePath)
  }
  const outcomes = prepareOnly ? await (async () => { const rows = []; for (const c of cases) rows.push(await runCase(c)); return rows })()
    : await Promise.all(cases.map(runCase))
  save(join(output, prepareOnly ? 'preparation.json' : 'results.json'), outcomes)
  if (!prepareOnly) {
    expect(outcomes.reduce((n, o) => n + o.attempts.length, 0)).toBeLessThanOrEqual(48)
    expect(outcomes.filter(o => !o.passed).map(o => `${o.id}: ${o.error}`)).toEqual([])
  }
}, 10_800_000)
