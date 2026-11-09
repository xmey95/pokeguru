import { checkResponseAttackReview } from './guide-response-construction'
import {checkTacticalAudit,validTacticalAudit,type GuideTacticalAudit} from './guide-tactical-frontier'
import type { AiRunConfig } from './ai'
import type { AiTokenUsage } from './ai-evidence'
import { checkGuideSetupLedger, isGuideSetupLedger, type GuideSetupLedger } from './guide-setup-ledger'
import { checkGuideTactics, validBenchEntries, validRetreatCosts, validReplyComparison, type GuideRetreatCost, type GuideReplyComparison } from './guide-tactical-checks'
import { projectGuideLedger } from './guide-ledger-projection'
import { compileGuideTactics } from './guide-tactical-checks'
import { checkReplyCoverage } from './guide-reply-coverage'
import {checkBoardExitStep,validBoardExits,type GuideBoardExit} from './guide-board-exits'
import {GUIDE_REPLY_OTHER_LIMIT} from './guide-construction-limits'
import {GUIDE_FINITE_ANALYSIS_CONTRACT,checkGuideAnalysisScope,validGuideAnalysisScope,type GuideAnalysisScope} from './guide-analysis-scope'

export const GUIDE_FORMAT_VERSION = 1 as const
export const GUIDE_PROMPT_VERSION = 'matchup-guide-27' as const
export const guideChapterKinds = ['summary', 'preparation', 'opening', 'development', 'closing',
  'decisions', 'resources', 'variants'] as const
export type GuideChapterKind = typeof guideChapterKinds[number]
export interface GuideCard { printId: string; name: string; count: number }
export interface GuideList { id: string; label: string; url: string | null; cards: GuideCard[] }
export interface GuideSource {
  id: string; kind: 'card' | 'list' | 'aggregate' | 'rules' | 'our-list'
  label: string; url: string | null; content: string; hash: string
}
export interface GuideBasis {
  deliveryContract?:'bounded-delivery-1'
  analysisContract?:typeof GUIDE_FINITE_ANALYSIS_CONTRACT
  projectId: string; deckHash: string; deckVersionId: string | null; deckResolutionId: string | null
  metaId: string; opponentId: string; asOf: string; ruleVersion: string | null
  dependencyHash: string; promptVersion: 'matchup-guide-1' | 'matchup-guide-2' | 'matchup-guide-3' | 'matchup-guide-4' | 'matchup-guide-5' | 'matchup-guide-6' | 'matchup-guide-7' | 'matchup-guide-8' | 'matchup-guide-9' | 'matchup-guide-10' | 'matchup-guide-11' | 'matchup-guide-12' | 'matchup-guide-13' | 'matchup-guide-14' | 'matchup-guide-15' | 'matchup-guide-16' | 'matchup-guide-17' | 'matchup-guide-18' | 'matchup-guide-19' | 'matchup-guide-20' | 'matchup-guide-21' | 'matchup-guide-22' | 'matchup-guide-23' | 'matchup-guide-24' | 'matchup-guide-25' | 'matchup-guide-26' | 'matchup-guide-28' | typeof GUIDE_PROMPT_VERSION
}
export interface GuideChapter {
  id: string; kind: GuideChapterKind; title: string; body: string
  sourceIds: string[]; dependsOn: string[]
}
export interface GuideClaim { id: string; text: string; sourceIds: string[]; assumption: boolean }
export interface GuidePosition { ourBench: number; opponentBench: number; ourPrizes: number; opponentPrizes: number }
export interface GuideStep {
  action: 'gust' | 'active-ko' | 'bench-ko' | 'promote' | 'bench' | 'other' | 'board-exit'
  /** Side whose board changes. On KO the OTHER side takes prizes. */
  side: 'ours' | 'opponent'; description: string; prizesTaken: number
  before: GuidePosition; after: GuidePosition
  benchEntries?: { printId: string; description: string }[] | null
  groupDescription?: string | null
  boardExits?: GuideBoardExit[]
}
export interface GuideScenario {
  analysisScope?:GuideAnalysisScope
  id: string; title: string; opponentListId: string; state: string; assumptions: string[]
  inventory: { side: 'ours' | 'opponent'; printId: string; count: number;
    zone: 'active' | 'bench' | 'evolution' | 'attached' | 'hand' | 'discard' | 'prizes' | 'deck' | 'stadium' | 'lost' }[]
  setupDraws: { ours: number; opponent: number }
  returnedToDeck: { ours: number; opponent: number }
  setupHistory: string
  /** Required by prompt v2; absent in historical v1 reports. */
  setupLedger?: GuideSetupLedger | null
  /** Distinct physical copies in this constructed line, including evolution stacks and attachments.
   * Reusing a recovered card does not create another copy. Alternative branches are separate cases. */
  resources: { side: 'ours' | 'opponent'; printId: string; count: number }[]
  benchLimit: { ours: number; opponent: number }
  steps: GuideStep[]
  calculations: { label: string; terms: number[]; multiplier: number; minimum: number | null; expected: number; retreatCostId?: string; purpose?: 'damage'|'other'; attack?:{printId:string;attackName:string}|null }[]
  retreatCosts?: GuideRetreatCost[] | null
  replyComparison?: GuideReplyComparison | null
  turnAudit?: { turn: number; side: 'ours' | 'opponent'; availableAttack: string; choice: string; reason: string }[]
  tacticalAudit?:GuideTacticalAudit[]
  development?: { turn: number; side: 'ours' | 'opponent'; stepIndexes: number[]; resources: { printId: string; count: number }[]; access: string; nextAttack: string; pivot: string }[]
  explanation: string; opponentResponse: string; pivot: string; sourceIds: string[]
}
export interface GuideExercise { id: string; question: string; solution: string; sourceIds: string[]; scenarioIds: string[] }
export interface GuideContent {
  chapters: GuideChapter[]; claims: GuideClaim[]; scenarios: GuideScenario[]; exercises: GuideExercise[]
  limitations: string[]; changeSummary: string
}
export interface GuideFinding { severity: 'blocking' | 'major' | 'minor'; targetId: string; message: string; correction: string; sourceIds: string[] }
export interface GuideTextCorrection { targetId: string; before: string; after: string }
export interface GuideReview { verdict: 'pass' | 'revise' | 'incomplete'; findings: GuideFinding[]; checks: string[];
  revalidatedIds?: string[]; textCorrections?: GuideTextCorrection[] }
export interface GuideAttempt {
  sequence: number; stage: string; startedAt: string; endedAt: string | null
  status: 'running' | 'succeeded' | 'failed'; inputHash: string; inputBytes: number
  durationMs: number; usage: AiTokenUsage | null
  unitResults?: {total:number;accepted:number;rejected:number}
}
export interface MatchupGuide extends GuideContent {
  formatVersion: 1; basis: GuideBasis; ourList: GuideList; opponentLists: GuideList[]; sources: GuideSource[]
  review: GuideReview; localChecks: { scenarios: number; quantities: number; calculations: number; transitions: number }
  generation: { config: AiRunConfig; attempts: GuideAttempt[]; parentDependencyHash: string | null;
    scenarioOriginals?: {formatVersion:1;scopeHash:string;cases:{id:string;baseHash:string;scopeHash:string;native:Record<string,unknown>}[]};
    finiteOriginals?: {formatVersion:1;scopeHash:string;sourceScope:{projectId:string;jobId:string;dependencyHash:string;configHash:string};
      nativePacket:{basis:GuideBasis;ourList:GuideList;opponentLists:GuideList[];sources:GuideSource[];matchup:string;deckContext:string;gaps:string[]};
      evidenceAnchor?:{basis:GuideBasis;ourList:GuideList;opponentLists:GuideList[];sources:GuideSource[];matchup:string;deckContext:string;gaps:string[]};plans:unknown[];planningMains:unknown[]};
    segmentOriginals?: {formatVersion:1;scopeHash:string;cases:{id:string;nativeHash:string;sourceMainHash:string;claims:GuideClaim[];limitations:string[];changeSummary:string;
      seeds:{id:string;role:'direct'|'access'|'defend'|'other';intent:'attack'|'defend';goal:string;sourceIds:string[];forkAtTurn?:0}[];
      branchNotes:{id:string;ours?:{reason:string;pivot:string};opponent:{reason:string;pivot:string}|null;next:{reason:string;pivot:string}|null}[]}[]} }
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown, max = 30_000): value is string => typeof value === 'string' && value.length <= max
const text = (value: unknown, max = 30_000): value is string => string(value, max) && !!value.trim()
const id = (value: unknown): value is string => text(value, 160) && /^[a-zA-Z0-9:._-]+$/.test(value)
const array = <T>(value: unknown, check: (item: unknown) => item is T, max = 100): value is T[] =>
  Array.isArray(value) && value.length <= max && value.every(check)
const strings = (value: unknown): value is string[] => array(value, (v): v is string => text(v), 100)
const ids = (value: unknown): value is string[] => array(value, id, 200)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 60
const position = (v: unknown): v is GuidePosition => record(v) && count(v.ourBench) && count(v.opponentBench) &&
  count(v.ourPrizes) && count(v.opponentPrizes)

export function readGuideContent(raw: unknown,promptVersion:string=GUIDE_PROMPT_VERSION,analysisContract?:GuideBasis['analysisContract']): GuideContent {
  if(analysisContract!==undefined&&(analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT||promptVersion!=='matchup-guide-28'))throw new Error('Contratto di analisi della guida non supportato.')
  if (!record(raw) || !array(raw.chapters, (v): v is GuideChapter => record(v) && id(v.id) &&
    guideChapterKinds.includes(v.kind as GuideChapterKind) && text(v.title, 250) && text(v.body) && ids(v.sourceIds) && ids(v.dependsOn), 40) ||
    !array(raw.claims, (v): v is GuideClaim => record(v) && id(v.id) && text(v.text, 3000) && ids(v.sourceIds) && typeof v.assumption === 'boolean') ||
    !array(raw.scenarios, (v): v is GuideScenario => record(v) && id(v.id) && text(v.title, 250) && id(v.opponentListId) &&
      (analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT?validGuideAnalysisScope(v.analysisScope):v.analysisScope===undefined)&&
      text(v.state, 8000) && strings(v.assumptions) && record(v.benchLimit) && count(v.benchLimit.ours) && count(v.benchLimit.opponent) &&
      array(v.inventory, (r): r is GuideScenario['inventory'][number] => record(r) && ['ours', 'opponent'].includes(String(r.side)) &&
        id(r.printId) && count(r.count) && ['active', 'bench', 'evolution', 'attached', 'hand', 'discard', 'prizes', 'deck', 'stadium', 'lost'].includes(String(r.zone)), 240) &&
      record(v.setupDraws) && count(v.setupDraws.ours) && count(v.setupDraws.opponent) &&
      record(v.returnedToDeck) && count(v.returnedToDeck.ours) && count(v.returnedToDeck.opponent) && text(v.setupHistory, 8000) &&
      (v.setupLedger == null || isGuideSetupLedger(v.setupLedger)) &&
      (v.retreatCosts == null || validRetreatCosts(v.retreatCosts)) && (v.replyComparison == null || validReplyComparison(v.replyComparison,promptVersion==='matchup-guide-28'?GUIDE_REPLY_OTHER_LIMIT+3:8)) &&
      (v.turnAudit === undefined || array(v.turnAudit, (t): t is NonNullable<GuideScenario['turnAudit']>[number] => record(t) && count(t.turn) && ['ours', 'opponent'].includes(String(t.side)) && text(t.availableAttack, 4000) && text(t.choice, 4000) && text(t.reason, 4000), 60)) &&
      (v.tacticalAudit===undefined||validTacticalAudit(v.tacticalAudit)) &&
      (v.development === undefined || array(v.development, (t): t is NonNullable<GuideScenario['development']>[number] => record(t) && count(t.turn) && ['ours', 'opponent'].includes(String(t.side)) && array(t.stepIndexes, count, 40) && array(t.resources, (r): r is { printId: string; count: number } => record(r) && id(r.printId) && count(r.count), 60) && text(t.access, 4000) && text(t.nextAttack, 4000) && text(t.pivot, 4000), 20)) &&
      array(v.resources, (r): r is GuideScenario['resources'][number] => record(r) && ['ours', 'opponent'].includes(String(r.side)) && id(r.printId) && count(r.count), 120) &&
      array(v.steps, (s): s is GuideStep => record(s) && ['gust', 'active-ko', 'bench-ko', 'promote', 'bench', 'other', 'board-exit'].includes(String(s.action)) &&
        ['ours', 'opponent'].includes(String(s.side)) && text(s.description, 4000) && count(s.prizesTaken) && position(s.before) && position(s.after) &&
        validBenchEntries(s.benchEntries) && (s.groupDescription == null || text(s.groupDescription, 4000)), 40) &&
      array(v.calculations, (c): c is GuideScenario['calculations'][number] => record(c) && text(c.label, 500) && array(c.terms, finite, 30) &&
        finite(c.multiplier) && (c.minimum === null || finite(c.minimum)) && finite(c.expected) && (c.retreatCostId === undefined || id(c.retreatCostId)), 40) &&
      text(v.explanation, 8000) && text(v.opponentResponse, 5000) && text(v.pivot, 3000) && ids(v.sourceIds), 12) ||
    !array(raw.exercises, (e): e is GuideExercise => record(e) && id(e.id) && text(e.question, 5000) && text(e.solution, 5000) &&
      ids(e.sourceIds) && ids(e.scenarioIds), 8) || !strings(raw.limitations) || !string(raw.changeSummary, 5000))
    throw new Error('Formato dei capitoli o degli scenari della guida non valido.')
  return { chapters: raw.chapters, claims: raw.claims, scenarios: raw.scenarios, exercises: raw.exercises,
    limitations: raw.limitations, changeSummary: raw.changeSummary }
}

export function readGuideReview(raw: unknown): GuideReview {
  const fail = (path: string): never => { throw new Error(`Revisione critica della guida non valida: ${path}.`) }
  if (!record(raw)) return fail('$ (oggetto richiesto)')
  if (!['pass', 'revise', 'incomplete'].includes(String(raw.verdict))) fail('verdict')
  if (!strings(raw.checks)) fail('checks (massimo 100 testi non vuoti)')
  if (!Array.isArray(raw.findings) || raw.findings.length > 50) return fail('findings (massimo 50)')
  for (const [i, f] of raw.findings.entries()) {
    if (!record(f)) fail(`findings[${i}]`)
    for (const [field, valid] of Object.entries({ severity: ['blocking', 'major', 'minor'].includes(String(f.severity)),
      targetId: id(f.targetId), message: text(f.message, 4000), correction: text(f.correction, 4000), sourceIds: ids(f.sourceIds) }))
      if (!valid) fail(`findings[${i}].${field}`)
  }
  if (raw.textCorrections !== undefined && !array(raw.textCorrections, (p): p is GuideTextCorrection => record(p) &&
    id(p.targetId) && text(p.before, 8000) && text(p.after, 8000), 12)) fail('textCorrections')
  if (raw.revalidatedIds !== undefined && !ids(raw.revalidatedIds)) fail('revalidatedIds')
  return { verdict: raw.verdict as GuideReview['verdict'], findings: raw.findings as GuideFinding[], checks: raw.checks as string[],
    ...(raw.revalidatedIds !== undefined ? { revalidatedIds: raw.revalidatedIds as string[] } : {}),
    ...(raw.textCorrections !== undefined ? { textCorrections: raw.textCorrections as GuideTextCorrection[] } : {}) }
}

/** Arithmetic and declared transitions only; this is deliberately not a complete game engine. */
export function checkGuide(content: GuideContent, basis: { ourList: GuideList; opponentLists: GuideList[]; sources: GuideSource[]; basis?: {promptVersion:string;analysisContract?:GuideBasis['analysisContract']}; typedCalculations?:boolean }, complete = true, boardExitChecks=false) {
  return checkGuideContent(content,basis,complete,boardExitChecks,false)
}
/** Applicable mechanical gates only. Incomplete prefixes cannot pass checkGuide. */
export function checkGuidePrefix(content:GuideContent,basis:Parameters<typeof checkGuide>[1]){
  return checkGuideContent(content,basis,false,true,true)
}
function checkGuideContent(content:GuideContent,basis:Parameters<typeof checkGuide>[1],complete:boolean,boardExitChecks:boolean,constructionPrefix:boolean,nestedFiniteComparison=false){
  const errors: string[] = []; const checks = { scenarios: content.scenarios.length, quantities: 0, calculations: 0, transitions: 0 }
  const finite=basis.basis?.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT&&basis.basis.promptVersion==='matchup-guide-28'
  if(basis.basis?.analysisContract!==undefined&&!finite)errors.push('Contratto di analisi della guida non supportato.')
  const all = [...content.chapters, ...content.claims, ...content.scenarios, ...content.exercises]
  const allIds = new Set(all.map(v => v.id)); const sources = new Set(basis.sources.map(s => s.id))
  if (allIds.size !== all.length) errors.push('Identificativi di contenuto duplicati.')
  for (const item of all) for (const source of item.sourceIds) if (!sources.has(source)) errors.push(`${item.id}: fonte assente ${source}.`)
  for (const c of content.chapters) for (const dep of c.dependsOn) if (!allIds.has(dep) || dep === c.id) errors.push(`${c.id}: dipendenza non valida ${dep}.`)
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (node: string): void => {
    if (visiting.has(node)) { errors.push(`${node}: dipendenze circolari.`); return }
    if (visited.has(node)) return
    visiting.add(node)
    for (const dep of content.chapters.find(c => c.id === node)?.dependsOn ?? []) visit(dep)
    visiting.delete(node); visited.add(node)
  }
  for (const c of content.chapters) visit(c.id)
  for (const c of content.claims) if (!c.assumption && !c.sourceIds.length) errors.push(`${c.id}: affermazione senza prova.`)
  for (const e of content.exercises) if (e.scenarioIds.some(id => !content.scenarios.some(s => s.id === id))) errors.push(`${e.id}: scenario assente.`)
  if (complete) {
    if(finite&&content.scenarios.length!==2)errors.push('Il contratto finito richiede esattamente due scenari completi.')
    for (const kind of guideChapterKinds) if (!content.chapters.some(c => c.kind === kind)) errors.push(`Capitolo mancante: ${kind}.`)
    if (content.scenarios.length < 2 || content.exercises.length < 2) errors.push('Servono almeno due scenari e due esercizi.')
    if (basis.basis?.promptVersion && basis.basis.promptVersion !== 'matchup-guide-1') {
      const reachesScenario = (node: string, seen = new Set<string>()): boolean => {
        if (content.scenarios.some(s => s.id === node)) return true
        if (seen.has(node)) return false
        seen.add(node)
        return (content.chapters.find(c => c.id === node)?.dependsOn ?? []).some(dep => reachesScenario(dep, seen))
      }
      for (const c of content.chapters.filter(c => ['development', 'closing', 'decisions'].includes(c.kind)))
        if (!reachesScenario(c.id)) errors.push(`${c.id}: collegamento agli scenari verificati mancante.`)
    }
  }
  for (const s of content.scenarios) {
    if(!constructionPrefix&&!nestedFiniteComparison)errors.push(...checkGuideAnalysisScope(s,basis.sources,finite))
    if (s.inventory.filter(r => r.zone === 'stadium').reduce((n, r) => n + r.count, 0) > 1) errors.push(`${s.id}: più di uno Stadium in gioco.`)
    if (!s.steps.length || (!constructionPrefix&&!s.calculations.length) || !s.sourceIds.length ||
      !s.resources.some(r => r.side === 'ours') || !s.resources.some(r => r.side === 'opponent'))
      errors.push(`${s.id}: scenario privo di passaggi, conti, fonti o risorse di uno dei lati.`)
    const opponent = basis.opponentLists.find(l => l.id === s.opponentListId)
    if (!opponent) errors.push(`${s.id}: lista avversaria esatta non disponibile.`)
    if (basis.basis?.promptVersion && basis.basis.promptVersion !== 'matchup-guide-1' && !s.setupLedger) errors.push(`${s.id}: registro della preparazione mancante.`)
    errors.push(...checkGuideSetupLedger(s, basis.ourList, opponent))
    if(['matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''))errors.push(...checkTacticalAudit(s,basis.sources))
    errors.push(...checkGuideTactics(s, basis.ourList, opponent, basis.sources, ['matchup-guide-3', 'matchup-guide-4', 'matchup-guide-5', 'matchup-guide-6', 'matchup-guide-7', 'matchup-guide-8', 'matchup-guide-9', 'matchup-guide-10', 'matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion ?? ''),basis.typedCalculations===true||['matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''),constructionPrefix,finite||nestedFiniteComparison?'declared-lines':'historical'))
    if(!constructionPrefix&&!finite&&['matchup-guide-10','matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''))errors.push(...checkReplyCoverage(s,basis.sources))
    if(!constructionPrefix&&['matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''))errors.push(...checkResponseAttackReview(s,basis.sources))
    if (!constructionPrefix&&!finite&&['matchup-guide-6','matchup-guide-7', 'matchup-guide-8', 'matchup-guide-9', 'matchup-guide-10', 'matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??'') && (!s.replyComparison?.options.some(o=>o.intent==='defend') || !s.replyComparison.options.some(o=>o.intent==='attack'))) errors.push(`${s.id}: confronto offensivo e difensivo incompleto.`)
    if (['matchup-guide-4', 'matchup-guide-5', 'matchup-guide-6', 'matchup-guide-7', 'matchup-guide-8', 'matchup-guide-9', 'matchup-guide-10', 'matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion ?? '')) {
      for (const event of s.setupLedger?.events ?? []) if (event.turn > 0 && !s.turnAudit?.some(t => t.turn === event.turn && t.side === event.side)) errors.push(`${s.id}: turno ${event.turn} ${event.side} senza verifica della scelta di attacco.`)
      const development = s.development ?? []
      if (!constructionPrefix&&(new Set(development.filter(t => t.side === 'ours').map(t => t.turn)).size < 2 || !development.some(t => t.side === 'opponent'))) errors.push(`${s.id}: sviluppo da dimostrare su almeno due nostri turni con replica intermedia.`)
      let turn = -1
      for (const d of development) {
        if (d.turn < turn || !d.stepIndexes.length || d.stepIndexes.some(i => i >= s.steps.length)) errors.push(`${s.id}: riferimenti/ordine del piano di sviluppo non validi.`)
        turn = d.turn
        const list = d.side === 'ours' ? basis.ourList : opponent
        for (const r of d.resources) if (!r.count || !list?.cards.some(c => c.printId === r.printId && c.count >= r.count)) errors.push(`${s.id}: risorsa del piano non disponibile ${r.printId}.`)
      }
      for (const o of s.replyComparison?.options ?? []) {
        if (!o.steps?.length) { errors.push(`${s.id}: replica ${o.id} senza transizioni verificabili.`); continue }
        const branch = { ...s, id: `${s.id}:${o.id}`, steps: o.steps }
        // Each branch starts at the declared initial state; all old transition/resource gates apply.
        errors.push(...checkGuideContent({ chapters: [], claims: [], scenarios: [branch], exercises: [], limitations: [], changeSummary: '' }, { ...basis, typedCalculations:basis.typedCalculations===true||['matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''), basis: { ...basis.basis!, analysisContract:undefined, promptVersion: 'matchup-guide-3' } }, false,boardExitChecks||['matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''),false,finite||nestedFiniteComparison).errors)
        for (const draw of o.specificDraws) if (!o.requiredCards.some(c => c.printId === draw)) errors.push(`${s.id}: pescata specifica ${draw} omessa dalle risorse della replica.`)
      }
    }
    checks.calculations += s.replyComparison?.options.length ?? 0
    for (const side of ['ours', 'opponent'] as const) {
      const list = side === 'ours' ? basis.ourList : opponent
      const quantities = new Map<string, number>()
      for (const card of list?.cards ?? []) quantities.set(card.printId, (quantities.get(card.printId) ?? 0) + card.count)
      const inventory = s.inventory.filter(r => r.side === side)
      const accounted = new Map<string, number>()
      for (const card of inventory) accounted.set(card.printId, (accounted.get(card.printId) ?? 0) + card.count)
      for (const id of new Set([...quantities.keys(), ...accounted.keys()])) if (accounted.get(id) !== quantities.get(id))
        errors.push(`${s.id}: ${side}, inventario iniziale incompleto o eccedente per ${id}.`)
      const zone = (name: GuideScenario['inventory'][number]['zone']) => inventory.filter(r => r.zone === name).reduce((n, r) => n + r.count, 0)
      const first = s.steps[0]?.before
      if (zone('active') !== 1 || (first && (zone('bench') !== (side === 'ours' ? first.ourBench : first.opponentBench) ||
        zone('prizes') !== (side === 'ours' ? first.ourPrizes : first.opponentPrizes)))) errors.push(`${s.id}: ${side}, zone iniziali incoerenti con il campo/Premi.`)
      if (60 - zone('deck') - zone('prizes') < 7 + s.setupDraws[side] - s.returnedToDeck[side])
        errors.push(`${s.id}: ${side}, carte iniziali/pescate non contabilizzate; spiegare eventuali carte rimesse nel mazzo.`)
      const used = new Map<string, number>()
      for (const card of s.resources.filter(r => r.side === side)) used.set(card.printId, (used.get(card.printId) ?? 0) + card.count)
      for (const [print, count] of used) {
        checks.quantities++
        if (!quantities.has(print) || count <= 0 || count > quantities.get(print)!) errors.push(`${s.id}: ${side}, quantità non disponibile ${print} ×${count}.`)
      }
      if (![5, 8].includes(s.benchLimit[side])) errors.push(`${s.id}: limite Panchina non supportato.`)
    }
    let previous: GuidePosition | null = null
    for (const step of s.steps) {
      checks.transitions++
      const before = step.before; const after = step.after
      if (previous && Object.keys(before).some(k => before[k as keyof GuidePosition] !== previous![k as keyof GuidePosition])) errors.push(`${s.id}: passaggi non contigui.`)
      if (before.ourPrizes === 0 || before.opponentPrizes === 0) errors.push(`${s.id}: azione dopo la fine della partita.`)
      for (const state of [before, after]) if (state.ourBench > s.benchLimit.ours || state.opponentBench > s.benchLimit.opponent ||
        state.ourPrizes > 6 || state.opponentPrizes > 6) errors.push(`${s.id}: posizione fuori dai limiti.`)
      const bench = step.side === 'ours' ? 'ourBench' : 'opponentBench'
      const otherBench = step.side === 'ours' ? 'opponentBench' : 'ourBench'
      const recipient = step.side === 'ours' ? 'opponentPrizes' : 'ourPrizes'
      const otherPrizes = step.side === 'ours' ? 'ourPrizes' : 'opponentPrizes'
      if(step.action==='board-exit'){
        if(!(boardExitChecks||['matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(basis.basis?.promptVersion??''))||!validBoardExits(step.boardExits))errors.push(`${s.id}: uscita senza KO non verificata nel contratto.`)
        else {
          errors.push(...checkBoardExitStep(step).map(e=>`${s.id}: ${e}`))
          for(const exit of step.boardExits!){const list=exit.side==='ours'?basis.ourList:opponent;if(!list?.cards.some(c=>c.printId===exit.printId)||exit.sourceIds.some(id=>!sources.has(id))||[...exit.stack,...exit.attached].some(c=>!list?.cards.some(p=>p.printId===c.printId)))errors.push(`${s.id}: prove di uscita senza KO estranee alle liste/fonti.`)}
        }
      } else if (step.action !== 'other') {
        const delta = ['bench-ko', 'promote'].includes(step.action) ? -1 : step.action === 'bench' ? 1 : 0
        if (after[bench] !== before[bench] + delta || after[otherBench] !== before[otherBench]) errors.push(`${s.id}: Panchina incoerente dopo ${step.action}.`)
        const ko = step.action === 'active-ko' || step.action === 'bench-ko'
        if ((!ko && step.prizesTaken !== 0) || after[recipient] !== Math.max(0, before[recipient] - (ko ? step.prizesTaken : 0)) ||
          after[otherPrizes] !== before[otherPrizes]) errors.push(`${s.id}: conteggio Premi incoerente.`)
      } else if (step.prizesTaken || before.ourPrizes !== after.ourPrizes || before.opponentPrizes !== after.opponentPrizes ||
        before.ourBench !== after.ourBench || before.opponentBench !== after.opponentBench)
        errors.push(`${s.id}: un cambio di Panchina/Premi richiede un evento esplicito, non other.`)
      previous = after
    }
    for (const calc of s.calculations) {
      checks.calculations++
      let result = calc.terms.reduce((sum, n) => sum + n, 0) * calc.multiplier
      if (calc.minimum !== null) result = Math.max(calc.minimum, result)
      if (Math.abs(result - calc.expected) > 0.000001 || calc.expected < 0) errors.push(`${s.id}: calcolo non valido «${calc.label}».`)
    }
  }
  return { errors: [...new Set(errors)], checks }
}

/** Persistence/recovery gate: legacy reports have no guide and keep their original contract. */
export function assertGuideReport(report: { projectId: string; deckHash: string; metaId: string; opponentId: string;
  deckVersionId?: string | null; deckResolutionId?: string | null; guide?: MatchupGuide }): void {
  const g = report.guide
  if (!g) return
  if (g.formatVersion !== 1 || !g.basis || !['matchup-guide-1', 'matchup-guide-2', 'matchup-guide-3', 'matchup-guide-4', 'matchup-guide-5', 'matchup-guide-6', 'matchup-guide-7', 'matchup-guide-8', 'matchup-guide-9', 'matchup-guide-10', 'matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(g.basis.promptVersion) || !Array.isArray(g.sources) || !g.ourList || !Array.isArray(g.opponentLists) ||
    g.basis.projectId !== report.projectId || g.basis.deckHash !== report.deckHash || g.basis.metaId !== report.metaId ||
    g.basis.opponentId !== report.opponentId || g.basis.deckVersionId !== (report.deckVersionId ?? null) ||
    g.basis.deckResolutionId !== (report.deckResolutionId ?? null)) throw new Error('La guida non corrisponde alla lista e al matchup salvati.')
  const lists = [g.ourList, ...g.opponentLists]
  if (!g.opponentLists.length || new Set(lists.map(l => l.id)).size !== lists.length || lists.some(l =>
    !id(l.id) || !Array.isArray(l.cards) || l.cards.some(c => !id(c.printId) || !text(c.name) || !count(c.count) || c.count === 0) ||
    new Set(l.cards.map(c => c.printId)).size !== l.cards.length || l.cards.reduce((n, c) => n + c.count, 0) !== 60) ||
    new Set(g.sources.map(s => s.id)).size !== g.sources.length || g.sources.some(s => !id(s.id) || !text(s.content, 2_000_000) || !/^[a-f0-9]{64}$/.test(s.hash)))
    throw new Error('Liste o fonti della guida non valide.')
  const content = readGuideContent(g,g.basis.promptVersion,g.basis.analysisContract); const review = readGuideReview(g.review)
  if (['matchup-guide-5','matchup-guide-6','matchup-guide-7', 'matchup-guide-8', 'matchup-guide-9', 'matchup-guide-10', 'matchup-guide-11','matchup-guide-12','matchup-guide-13','matchup-guide-14','matchup-guide-15','matchup-guide-16','matchup-guide-17','matchup-guide-18','matchup-guide-19','matchup-guide-20','matchup-guide-21','matchup-guide-22','matchup-guide-23','matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(g.basis.promptVersion) && JSON.stringify(compileGuideTactics(projectGuideLedger(g, g))) !== JSON.stringify(content))
    throw new Error('Lo stato salvato non corrisponde al registro unico.')
  const checked = checkGuide(content, g)
  if (checked.errors.length || review.verdict !== 'pass' || review.findings.length)
    throw new Error('Guida non pubblicabile: completare i controlli e la revisione critica.')
}
