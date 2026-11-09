import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { ProjectStore } from '../src/main/project-store'
import { buildGuidePacket, extendGuidePacket, guideHash } from '../src/main/matchup-guide-packet'
import { deepGuideReport, generateDeepGuide } from '../src/main/matchup-guide-generation'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../src/shared/western-rule-package'
import type { CatalogView } from '../src/shared/catalog'
import type { MatchupReport } from '../src/shared/meta-matchups'
import { parseDeck } from '../src/shared/deck-import'
import type { AiRunConfig } from '../src/shared/ai'
import { checkGuide, type GuideAttempt, type GuideContent, type GuideReview, type MatchupGuide } from '../src/shared/matchup-guide'

// Opt-in only. Uses supplied frozen pilot data, a separate SQLite DB and the real isolated CLI.
it.skipIf(!process.env.POKEGURU_GUIDE_LIVE)('runs the real guide pipeline and persists only reviewed output', async () => {
  const source = resolve(process.env.POKEGURU_GUIDE_SOURCE!), output = resolve(process.env.POKEGURU_GUIDE_OUTPUT!)
  mkdirSync(output, { recursive: true })
  const read = (name: string) => JSON.parse(readFileSync(join(source, name), 'utf8'))
  const pilot = read('packet-toucannon-dragapult.json')
  const old = read('baseline-284.json') as MatchupReport
  const catalog = { prints: read('catalog.json'), sets: read('sets.json'), rulePackage: BUNDLED_WESTERN_RULE_PACKAGE } as CatalogView
  const rawText = pilot.ourDeck.cards.map((c: { count: number; name: string; set: string; number: string }) => `${c.count} ${c.name} ${c.set} ${c.number}`).join('\n')
  const path = join(output, 'data.sqlite'), projects = new ProjectStore(path), jobs = new AiJobStore(path)
  const config: AiRunConfig = { provider: 'codex', source: 'global', model: 'gpt-6.1-sol', reasoningEffort: null }
  let work: AiAnalysisWork | undefined
  try {
    const project = projects.list()[0] ?? projects.create({ name: 'APP-190 live isolato', format: 'STANDARD' })
    if (!projects.getBaseline(project.id)) projects.importDeck({ projectId: project.id, rawText, source: 'paste' })
    const baseline = projects.getBaseline(project.id)!, context = projects.getCurrentDeckContext(project.id)!
    const meta = { id: old.metaId, fetchedAt: old.metaFetchedAt!, sourceUrl: old.metaSourceUrl!, circuit: 'WESTERN', format: 'STANDARD', period: old.metaPeriod!,
      decks: [{ id: old.opponentId, name: 'Dragapult', url: old.opponentSourceUrl!, share: 1, count: 1 }] }
    projects.saveMetaSnapshot(meta as never)
    const packet: ReturnType<typeof buildGuidePacket> = existsSync(join(output, 'packet.json'))
      ? JSON.parse(readFileSync(join(output, 'packet.json'), 'utf8')) : buildGuidePacket({ basis: { projectId: project.id, deckHash: projects.getCurrentDeckHash(project.id)!, deckVersionId: context.versionId,
      deckResolutionId: context.resolutionId, metaId: old.metaId, opponentId: old.opponentId, asOf: '2026-10-30' },
    baseline: { ...baseline, ...parseDeck(rawText) }, catalog, reconciliation: projects.getReconciliation(project.id),
    evidence: old.tournamentEvidence!, sample: { url: old.sampleDeckUrl, cards: old.sampleDeckCards ?? [] }, matchup: 'Toucannon contro Dragapult', deckContext: rawText })
    writeFileSync(join(output, 'packet.json'), JSON.stringify(packet, null, 2))
    if (process.env.POKEGURU_GUIDE_VALIDATE_ONLY === '1') {
      console.log('PACKET_VALID', JSON.stringify({ lists: packet.opponentLists.length, sources: packet.sources.length,
        bytes: Buffer.byteLength(JSON.stringify(packet)), gaps: packet.gaps }))
      return
    }
    const start = (kind: 'matchup-generate' | 'matchup-revise') => {
      const active = jobs.active(project.id, `matchup:${project.id}`) ?? jobs.recent()
        .find(j => j.projectId === project.id && j.kind === kind && j.status === 'interrupted')
      if (active?.status === 'running' && process.env.POKEGURU_GUIDE_REVISION_CALLS === '9') {
        // Clear the transient blocked call after explicit additional consent.
        // The immutable invocation ledger still enforces the new shared ceiling.
        jobs.suspend(active.id, 'Un solo riesame aggiuntivo autorizzato.', 'failure')
        active.status = 'interrupted'
      }
      if (active?.status === 'interrupted') { jobs.retryAfterIntervention(active.id); jobs.resume(active.id) }
      const job = active ? jobs.get(active.id)! : jobs.start(kind, project.id, `matchup:${project.id}`)
      work = new AiAnalysisWork(join(output, job.id), jobs, job.id, new AbortController().signal, { kind, args: [], guideVersion: 1 })
      return job
    }
    const revisionLimit = (currentId: string) => {
      // Default consent is eight calls across revision jobs. A ninth is reserved
      // for the separately approved final-review experiment; never enabled by default.
      const authorized = Number(process.env.POKEGURU_GUIDE_REVISION_CALLS ?? 8)
      if (!Number.isSafeInteger(authorized) || authorized < 1 || authorized > 9) throw new Error('Budget di prova non valido.')
      let usedByOtherJobs = 0
      for (const other of jobs.recent().filter(j => j.projectId === project.id && j.kind === 'matchup-revise' && j.id !== currentId)) {
        const archive = new AiEvidenceArchive(path, jobs.get(other.id)!, true)
        try { usedByOtherJobs += [...archive.values('guide-attempt-start')].length } finally { archive.close() }
      }
      return authorized - usedByOtherJobs
    }
    let report = projects.listMatchupReports(project.id, old.metaId)[0]
    if (!report?.guide && process.env.POKEGURU_GUIDE_REVISE_DRAFT === '1') {
      const previousJob = process.env.POKEGURU_GUIDE_DRAFT_JOB ? jobs.get(process.env.POKEGURU_GUIDE_DRAFT_JOB)!
        : jobs.recent().find(j => j.projectId === project.id && j.kind === 'matchup-generate')!
      expect(previousJob.projectId).toBe(project.id)
      const archive = new AiEvidenceArchive(path, jobs.get(previousJob.id)!, true)
      let previousGuide: MatchupGuide
      try {
        const last = [...archive.values<GuideAttempt>('guide-attempt-end')].map(a => a.value)
          .filter(a => a.stage.startsWith('review') && a.status === 'succeeded').sort((a, b) => a.sequence - b.sequence).at(-1)!
        const prompt = archive.value<{ prompt: string }>('guide-prompt', last.inputHash)!.prompt
        const { packet: frozen, draft: corrected } = JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]) as { packet: typeof packet; draft: GuideContent }
        const review = [...archive.values<GuideReview>('guide-review')].find(r => r.key === guideHash([corrected, r.value]))!.value
        previousGuide = { ...corrected, formatVersion: 1, basis: frozen.basis, ourList: frozen.ourList, opponentLists: frozen.opponentLists,
          sources: frozen.sources, review, localChecks: checkGuide(corrected, frozen).checks, generation: { config, attempts: [], parentDependencyHash: null } }
      } finally { archive.close() }
      if (previousJob.status === 'running') jobs.transition(previousJob.id, 'cancelled', 'Prova respinta; bozza e budget consumato conservati per la revisione autorizzata.')
      const job = start('matchup-revise')
      const base = { ...old, jobId: job.id, projectId: project.id, deckHash: packet.basis.deckHash,
        deckVersionId: context.versionId, deckResolutionId: context.resolutionId, generatedAt: new Date().toISOString() }
      const guide = await generateDeepGuide({ packet, config, work: work!, revision: true, attemptLimit: revisionLimit(job.id),
        editorialCorrections: existsSync(join(output, 'revision-editorial-corrections.json')) ? JSON.parse(readFileSync(join(output, 'revision-editorial-corrections.json'), 'utf8')) : undefined,
        previous: deepGuideReport(base, previousGuide), request: 'Correggi la bozza NON pubblicata secondo questi rilievi del critico, preservando i controlli sugli scenari e le altre parti coerenti: ' + JSON.stringify(previousGuide.review.findings) +
          (process.env.POKEGURU_GUIDE_FEEDBACK_IN_REPAIR === '1' ? '\nApprofondisci quando conservare Legacy Energy contro Dragapult e come cambia il piano se è nei Premi. Controlla anche la risposta avversaria; mantieni gli altri capitoli coerenti.' : ''),
        onStage: stage => console.log('DRAFT_REVISION_STAGE', stage) })
      report = deepGuideReport(base, guide)
      projects.saveMatchupReport(report); jobs.ready(job.id, { report }); jobs.transition(job.id, 'applied')
      work!.close(); work = undefined
      writeFileSync(join(output, 'generated.json'), JSON.stringify(report, null, 2))
    }
    if (!report?.guide) {
      const job = start('matchup-generate')
      const guide = await generateDeepGuide({ packet, config, work: work!, request: 'Crea la guida della nostra lista contro Dragapult.',
        editorialCorrections: existsSync(join(output, 'editorial-corrections.json')) ? JSON.parse(readFileSync(join(output, 'editorial-corrections.json'), 'utf8')) : undefined,
        retrieve: (p, ids) => extendGuidePacket(p, catalog, ids), onStage: stage => console.log('GUIDE_STAGE', stage) })
      report = deepGuideReport({ ...old, jobId: job.id, projectId: project.id, deckHash: packet.basis.deckHash,
        deckVersionId: context.versionId, deckResolutionId: context.resolutionId, generatedAt: new Date().toISOString() }, guide)
      projects.saveMatchupReport(report); jobs.ready(job.id, { report }); jobs.transition(job.id, 'applied')
      work!.close(); work = undefined
      writeFileSync(join(output, 'generated.json'), JSON.stringify(report, null, 2))
    }
    expect(report.guide!.review.verdict).toBe('pass')
    expect(report.guide!.chapters.length).toBeGreaterThanOrEqual(8)
    // A bounded draft-repair experiment may have insufficient budget for another
    // two-call feedback cycle. This mode does not claim two saved valid versions.
    if (process.env.POKEGURU_GUIDE_DRAFT_ONLY === '1') return
    const discussion = projects.listMatchupDiscussions(project.id, old.opponentId)[0]
    const pending = discussion.turns.at(-1)?.report === null ? discussion : projects.addMatchupFeedback(discussion.id,
      'Approfondisci quando conservare Legacy Energy contro Dragapult e come cambia il piano se è nei Premi. Controlla anche la risposta avversaria; mantieni gli altri capitoli coerenti.')
    const target = pending.turns.at(-1)!, job = start('matchup-revise')
    const guide = await generateDeepGuide({ packet, config, work: work!, request: target.feedback!, previous: report, revision: true,
      attemptLimit: revisionLimit(job.id),
      retrieve: (p, ids) => extendGuidePacket(p, catalog, ids), onStage: stage => console.log('REVISION_STAGE', stage) })
    const revised = deepGuideReport({ ...report, jobId: job.id, generatedAt: new Date().toISOString() }, guide)
    projects.completeMatchupFeedback(discussion.id, target.id, revised, guide.changeSummary)
    jobs.ready(job.id, { report: revised, changeSummary: guide.changeSummary }); jobs.transition(job.id, 'applied')
    writeFileSync(join(output, 'revised.json'), JSON.stringify(revised, null, 2))
    expect(projects.getMatchupDiscussion(discussion.id)!.turns.filter(t => t.report)).toHaveLength(2)
  } finally { work?.close(); jobs.close(); projects.close() }
}, 4_800_000)
