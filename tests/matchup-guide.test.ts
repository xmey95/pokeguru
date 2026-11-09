import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeepMatchupGuide } from '../src/renderer/src/DeepMatchupGuide'
import { checkGuide, guideChapterKinds, assertGuideReport, readGuideReview, type GuideContent, type MatchupGuide } from '../src/shared/matchup-guide'
import { generateDeepGuide, deepGuideReport, invalidatedGuideIds, applyGuideTextCorrections, assertGuideIntegrity } from '../src/main/matchup-guide-generation'
import { guideSource, guideHash, packetHash, resolveGuideList, type GuidePacket } from '../src/main/matchup-guide-packet'
import { parseDeck } from '../src/shared/deck-import'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { recoverMatchupJob } from '../src/main/ai-job-recovery'
import type { AiRunConfig } from '../src/shared/ai'
import type { GuideSetupLedger } from '../src/shared/guide-setup-ledger'
import { compileGuideTactics } from '../src/shared/guide-tactical-checks'

// These end-to-end fixtures replay complete journals and multiple independent
// reviews locally. Their wall-clock allowance is separate from provider timeouts,
// call ceilings and every assertion on persisted budgets and validation gates.
vi.setConfig({testTimeout:20_000})
import { projectGuideLedger,projectGuideSetup } from '../src/shared/guide-ledger-projection'
import { guideOpportunities } from '../src/shared/guide-opportunities'
import { replyCost } from '../src/shared/guide-reply-costs'
import { guideScenarioSchemaV8 } from '../src/main/matchup-guide-schema'
import { guideScenarioSchemaV9 } from '../src/main/matchup-guide-schema'
import { physicalResources } from '../src/shared/guide-physical-resources'
import { guideScenarioSchemaV10 } from '../src/main/matchup-guide-schema'
import { normalizeCombatEvents } from '../src/shared/guide-combat-normalization'
import { validateTurnLegality } from '../src/shared/guide-turn-legality'
import { expandTurnBlocks } from '../src/shared/guide-turn-blocks'
import { deriveOmissionWitnesses, responseAttackCandidates, validateConstructedRetreats } from '../src/shared/guide-response-construction'
import { singleScenarioSchemaV12 } from '../src/main/matchup-guide-schema'
import { singleScenarioSchemaV13 } from '../src/main/matchup-guide-schema'
import {compactGuideSchema,assertGuideSchemaBudget} from '../src/main/guide-schema-encoding'
import { scopedConstructionPacket,causalInstructions } from '../src/main/guide-causal-contract'
import { singleScenarioSchemaV11 } from '../src/main/matchup-guide-schema'
import {boundGuideSchema,guideScenarioSchemaV7} from '../src/main/guide-bound-schema'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {AiFailure} from '../src/main/ai-failure'
import {tacticalFrontier} from '../src/shared/guide-tactical-frontier'
import {prepareNativeDecisions} from '../src/shared/guide-native-decisions'
import {singleScenarioSchemaV16} from '../src/main/matchup-guide-schema'
import {singleScenarioSchemaV19} from '../src/main/matchup-guide-schema'
import {singleScenarioSchemaV21,guidePlanSchemaV21,guideSetupKeys} from '../src/main/matchup-guide-schema'
import {readOpeningAllocations,withAllocatedOpening,guideReviewFacts} from '../src/main/guide-decision-context'
import {packScenarioOutput,expandScenarioOutput,assertConstructedScenarios} from '../src/shared/guide-scenario-output'
import {scenarioOutputSchema,assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
it('preserves exact printing quantities and refuses ambiguous, incomplete or missing card data', () => {
  // Quantity/identity fixture only; this is not a legal playable deck.
  const printing = (localId: string, identityId = 'iono'): CatalogPrint => ({ id: `sv02-${localId}`, setId: 'sv02', localId,
    name: 'Iono', setName: 'Paldea Evolved', category: 'Trainer', rarity: 'Uncommon', variants: null, identityId,
    identityBasis: 'trainer-text', imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/sv02-${localId}`, detailAt: '2026-10-30', error: null,
    gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [], effect: 'Fixture effect',
      trainerType: 'Supporter', weaknesses: [], resistances: [], retreat: null } })
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: ['sv02'], names: ['Iono'] }, syncedAt: '2026-10-30', sets: [], prints: [printing('185'), printing('254')] }
  const baseline = (rawText: string) => ({ ...parseDeck(rawText), rawText, projectId: 'p', source: 'paste' as const,
    importedAt: '2026-10-30', fileName: null })
  const exact = baseline('4 Iono PAL 185\n56 Iono PAL 254')
  expect(resolveGuideList(exact, catalog)).toEqual([{ printId: 'sv02-185', name: 'Iono', count: 4 },
    { printId: 'sv02-254', name: 'Iono', count: 56 }])
  expect(() => resolveGuideList(baseline('4 Iono PAL 185'), catalog)).toThrow('60 carte')
  expect(() => resolveGuideList(exact, { ...catalog, prints: [{ ...printing('185'), gameplay: null }, printing('254')] })).toThrow('non risolta')
  expect(() => resolveGuideList(baseline('60 Iono'), { ...catalog, prints: [...catalog.prints, printing('999', 'different-effect')] })).toThrow('non risolta')
})
function packet(): GuidePacket {
  const result: GuidePacket = { basis: { projectId: 'p', deckHash: 'h', deckVersionId: 'v', deckResolutionId: null,
    metaId: 'm', opponentId: '284', asOf: '2026-10-30', ruleVersion: null, dependencyHash: '', promptVersion: 'matchup-guide-1' },
  ourList: { id: 'ours', label: 'Nostra', url: null, cards: [{ printId: 'a', name: 'A', count: 4 }, { printId: 'e', name: 'Energy', count: 56 }] },
  opponentLists: [{ id: 'opponent-1', label: 'Avversaria', url: null, cards: [{ printId: 'b', name: 'B', count: 2 }, { printId: 'e', name: 'Energy', count: 58 }] }],
  sources: [guideSource('card:a', 'card', 'A', null, 'Testo A'), guideSource('card:b', 'card', 'B', null, 'Testo B')],
  matchup: 'A vs B', deckContext: '60 carte', gaps: [] }
  result.basis.dependencyHash = packetHash(result)
  return result
}
function content(): GuideContent {
  const before = { ourBench: 3, opponentBench: 4, ourPrizes: 4, opponentPrizes: 5 }
  return { chapters: guideChapterKinds.map(kind => ({ id: kind, kind, title: kind, body: `Contenuto di ${kind}`,
    sourceIds: ['card:a'], dependsOn: kind === 'closing' ? ['development'] : [] })),
  claims: [{ id: 'claim', text: 'Condizione esplicita', sourceIds: ['card:a'], assumption: false }],
  scenarios: ['s1', 's2'].map(id => ({ id, title: id, opponentListId: 'opponent-1', state: 'Stato esplicito', assumptions: [],
    inventory: [
      { side: 'ours', printId: 'a', count: 1, zone: 'active' }, { side: 'ours', printId: 'a', count: 3, zone: 'bench' },
      { side: 'ours', printId: 'e', count: 7, zone: 'hand' }, { side: 'ours', printId: 'e', count: 4, zone: 'prizes' }, { side: 'ours', printId: 'e', count: 45, zone: 'deck' },
      { side: 'opponent', printId: 'b', count: 1, zone: 'active' }, { side: 'opponent', printId: 'b', count: 1, zone: 'bench' },
      { side: 'opponent', printId: 'e', count: 3, zone: 'bench' }, { side: 'opponent', printId: 'e', count: 6, zone: 'hand' },
      { side: 'opponent', printId: 'e', count: 5, zone: 'prizes' }, { side: 'opponent', printId: 'e', count: 44, zone: 'deck' }],
    setupDraws: { ours: 4, opponent: 3 }, returnedToDeck: { ours: 0, opponent: 0 }, setupHistory: 'Stato di prova per i controlli contabili, non dimostrazione tattica.',
    resources: [{ side: 'ours', printId: 'a', count: 2 }, { side: 'opponent', printId: 'b', count: 2 }], benchLimit: { ours: 5, opponent: 5 },
    steps: [{ action: 'gust', side: 'opponent', description: 'Gust', prizesTaken: 0, before, after: before },
      { action: 'active-ko', side: 'opponent', description: 'KO attivo', prizesTaken: 2, before, after: { ...before, ourPrizes: 2 } },
      { action: 'promote', side: 'opponent', description: 'Promozione', prizesTaken: 0, before: { ...before, ourPrizes: 2 }, after: { ...before, ourPrizes: 2, opponentBench: 3 } }],
    calculations: [{ label: '20 base × debolezza', terms: [20], multiplier: 2, minimum: null, expected: 40 },
      { label: 'Ritirata 1 meno 2', terms: [1, -2], multiplier: 1, minimum: 0, expected: 0 }],
    explanation: 'Spiegazione', opponentResponse: 'Replica che rompe il piano', pivot: 'Cambiare piano', sourceIds: ['card:a', 'card:b'] })),
  exercises: ['e1', 'e2'].map(id => ({ id, question: 'Domanda', solution: 'Risposta', sourceIds: ['card:a'], scenarioIds: ['s1'] })),
  limitations: ['Nessun test in partita'], changeSummary: 'Aggiornamento' }
}
const reviewed = { verdict: 'pass', findings: [], checks: ['Quantità di entrambe le liste', 'Risposta avversaria'] }
const plan = { thesis: 'Tesi', sections: [], additionalPrintIds: [], additionalLists: [], gaps: [] }
const part = (kinds: string[]) => ({ ...content(), chapters: content().chapters.filter(c => kinds.includes(c.kind)),
  scenarios: kinds.includes('variants') ? content().scenarios : [], exercises: kinds.includes('variants') ? content().exercises : [],
  claims: kinds.includes('summary') ? content().claims : [] })
const response = (stage: string) => stage === 'plan' ? plan : stage === 'gameplan' ? part(['summary', 'preparation', 'opening', 'development', 'closing'])
  : stage === 'decisions' ? part(['decisions', 'resources']) : stage === 'scenarios' ? part(['variants']) : reviewed
const stageOf = (prompt: string) => /FASE: ([^\n]+)/.exec(prompt)![1]
function packetV2(): GuidePacket {
  const p = packet(); p.basis.promptVersion = 'matchup-guide-2'; p.basis.dependencyHash = packetHash(p); return p
}
function contentV2(): GuideContent {
  const c = content()
  for (const chapter of c.chapters) if (['development', 'closing', 'decisions'].includes(chapter.kind)) chapter.dependsOn = ['s1']
  for (const s of c.scenarios) {
    s.inventory = []
    const ledger: GuideSetupLedger = { openingHands: [], openingPrizes: [], events: [] }
    for (const side of ['ours', 'opponent'] as const) {
      const print = side === 'ours' ? 'a' : 'b'
      ledger.openingHands.push({ side, printId: print, count: 2 }, { side, printId: 'e', count: 5 })
      ledger.openingPrizes.push({ side, printId: 'e', count: 6 })
      s.inventory.push({ side, printId: print, count: 1, zone: 'active' }, { side, printId: print, count: 1, zone: 'bench' },
        { side, printId: 'e', count: 6, zone: 'hand' }, { side, printId: 'e', count: 6, zone: 'prizes' },
        { side, printId: 'e', count: side === 'ours' ? 44 : 46, zone: 'deck' })
      if (side === 'ours') s.inventory.push({ side, printId: print, count: 2, zone: 'deck' })
      ledger.events.push({ side, turn: 0, kind: 'setup', description: 'Colloca i due Base sintetici',
        moves: [{ side, printId: print, count: 1, from: 'hand', to: 'active' }, { side, printId: print, count: 1, from: 'hand', to: 'bench' }],
        handAfter: { ours: 5, opponent: side === 'ours' ? 7 : 5 } })
    }
    for (const side of ['ours', 'opponent'] as const) ledger.events.push({ side, turn: side === 'ours' ? 1 : 2,
      kind: 'turn-draw', description: 'Pescata di turno sintetica', moves: [{ side, printId: 'e', count: 1, from: 'deck', to: 'hand' }],
      handAfter: { ours: 6, opponent: side === 'ours' ? 5 : 6 } })
    s.setupLedger = ledger; s.setupDraws = { ours: 1, opponent: 1 }
    const before = { ourBench: 1, opponentBench: 1, ourPrizes: 6, opponentPrizes: 6 }
    s.steps = [{ action: 'other', side: 'ours', description: 'Decisione sintetica, non partita reale', before, after: before, prizesTaken: 0 }]
  }
  return c
}
function responseV2(stage: string): unknown {
  const c = contentV2()
  if (stage === 'plan') return plan
  if (stage === 'scenarios' || stage === 'repair-scenarios') return { ...c, chapters: [], exercises: [] }
  if (stage === 'prose') return { ...c, scenarios: [], claims: [] }
  if (stage === 'repair') return { ...c, removeIds: [] }
  return reviewed
}
function packetV3(): GuidePacket {
  const p = packetV2(); p.basis.promptVersion = 'matchup-guide-3'
  p.sources[0] = guideSource('card:a', 'card', 'A', null, JSON.stringify({ gameplay: { retreat: 1 } }))
  p.sources.push(guideSource('card:tool', 'card', 'Tool sintetico', null, 'Riduzione sintetica del costo di ritirata: 2.'))
  p.basis.dependencyHash = packetHash(p); return p
}
function contentV3(): GuideContent {
  const c = contentV2()
  for (const s of c.scenarios) {
    s.calculations = s.calculations.slice(0, 1)
    s.retreatCosts = [{ id: 'retreat-a', context: 'A con riduzione sintetica', side: 'ours', printId: 'a', printedCost: 1,
      adjustments: [{ sourceId: 'card:tool', amount: -2, reason: 'Effetto di prova' }] }]
    s.replyComparison = { objective: 'Soglia sintetica, non partita reale', threshold: 90, minimumReplyId: 'direct', preferredReplyId: 'extended',
      options: [{ id: 'direct', sequence: ['Azione di prova'], requiredCards: [{ printId: 'b', count: 1, access: 'In mano' }],
        specificDraws: [], attachments: 1, terms: [100], multiplier: 1, damage: 100, reachesThreshold: true, remainingHp: 10,
        outcome: 'Soglia raggiunta', sourceIds: ['card:b'] },
      { id: 'extended', sequence: ['Azione alternativa'], requiredCards: [{ printId: 'b', count: 2, access: 'In mano' }],
        specificDraws: [], attachments: 2, terms: [120], multiplier: 1, damage: 120, reachesThreshold: true, remainingHp: 40,
        outcome: 'Più PS rimasti ma più risorse', sourceIds: ['card:b'] }],
      omissionTests: [{ printId: 'b', remainingDamage: 50, reason: 'La soglia non è più raggiunta nel caso sintetico' }],
      conclusion: 'Il pericolo inizia con una sola risorsa, la cura richiede di più.' }
  }
  return c
}
function responseV3(stage: string): unknown {
  const c = contentV3()
  if (stage === 'plan') return plan
  if (stage === 'scenarios' || stage === 'repair-scenarios') return { ...c, chapters: [], exercises: [] }
  if (stage === 'prose') return { ...c, scenarios: [], claims: [] }
  if (stage === 'repair') return { ...c, removeIds: [] }
  return reviewed
}
function contentV4(): GuideContent {
  const c = contentV3()
  for (const s of c.scenarios) {
    s.turnAudit = s.setupLedger!.events.filter(e => e.turn > 0).map(e => ({ turn: e.turn, side: e.side,
      availableAttack: 'Caso contabile sintetico', choice: 'Scelta di prova', reason: 'Nessuna dimostrazione competitiva' }))
    s.development = [1, 2, 3].map(turn => ({ turn, side: turn === 2 ? 'opponent' : 'ours', stepIndexes: [0],
      resources: [], access: 'Accesso sintetico', nextAttack: 'Attacco di prova', pivot: 'Cambio di piano di prova' }))
    for (const o of s.replyComparison!.options) o.steps = structuredClone(s.steps)
  }
  return c
}
function packetV4(): GuidePacket { const p = packetV3(); p.basis.promptVersion = 'matchup-guide-4'; p.basis.dependencyHash = packetHash(p); return p }
function rawV5(): any {
  const c = contentV4() as any
  for (const s of c.scenarios) {
    s.positionNotes = 'Caso contabile sintetico, PS e danni dichiarati nelle ipotesi.'
    s.developmentEvents = s.development.map((d: any, i: number) => ({ ...d, turn: i + 3, stepIndexes: [i] }))
    s.lineEvents = s.developmentEvents.map((d: any) => ({ turn: d.turn, side: d.side, kind: 'effect', action: 'other', affectedSide: d.side, description: 'Azione sintetica', moves: [] }))
    for (const o of s.replyComparison.options) { o.lineEvents = structuredClone(s.lineEvents); delete o.steps }
    for (const e of s.setupLedger.events) delete e.handAfter
    for (const key of ['inventory','state','setupHistory','setupDraws','returnedToDeck','steps','development']) delete s[key]
  }
  return c
}
function packetV5(): GuidePacket { const p = packetV4(); p.basis.promptVersion = 'matchup-guide-5'; p.basis.dependencyHash = packetHash(p); return p }
function packetV6(): GuidePacket { const p=packetV5();p.basis.promptVersion='matchup-guide-6';p.basis.dependencyHash=packetHash(p);return p }
function rawV6(): any {
  const c=rawV5()
  for(const s of c.scenarios) for(const [i,o] of s.replyComparison.options.entries()) {
    o.intent=i===0?'attack':'defend';o.forkAtEvent=s.lineEvents.length;o.lineEvents=[]
  }
  return c
}
function packetV7():GuidePacket{
  const p=packetV6();p.basis.promptVersion='matchup-guide-7'
  for(const printId of ['a','b']){
    const index=p.sources.findIndex(s=>s.id===`card:${printId}`)
    p.sources[index]=guideSource(`card:${printId}`,'card',printId.toUpperCase(),null,JSON.stringify({printId,name:printId.toUpperCase(),category:'Pokemon',stage:'Basic',gameplay:{retreat:1,attacks:[{name:'Practice',cost:['Colorless'],damage:'100'}]}}))
  }
  p.basis.dependencyHash=packetHash(p);return p
}
function rawV7():any{
  const c=rawV6()
  for(const s of c.scenarios){
    s.opening={ours:{active:'a',hand:['a','e','e','e','e','e'],prizes:Array(6).fill('e')},opponent:{active:'b',hand:['b','e','e','e','e','e'],prizes:Array(6).fill('e')}}
    s.setupEvents=s.setupLedger.events.slice(0,2).map((e:any)=>({...e,moves:e.moves.filter((m:any)=>m.to==='bench'),attackName:null}))
    s.setupEvents.push(...s.setupLedger.events.slice(2).map((e:any)=>({...e,attackName:null})))
    s.developmentEvents=s.developmentEvents.map((d:any)=>({eventIndex:d.stepIndexes[0],resources:d.resources,access:d.access,nextAttack:d.nextAttack,pivot:d.pivot}))
    for(const e of s.lineEvents)e.attackName='Practice'
    delete s.setupLedger
  }
  return c
}

// Ledger/budget fixtures only. The mocked critic is not evidence of real tactical quality.
function packetV8():GuidePacket{
  const p=packetV7();p.basis.promptVersion='matchup-guide-8'
  p.sources.push(guideSource('card:e','card','Energy',null,JSON.stringify({printId:'e',category:'Energy',name:'Energy'})))
  p.basis.dependencyHash=packetHash(p);return p
}
function rawV8():any{
  const c=rawV7()
  for(const s of c.scenarios){
    s.lineEvents[1].moves=[{side:'opponent',printId:'e',count:1,from:'hand',to:'attached'}]
    s.replyComparison.preferredReplyId='direct'
    for(const o of s.replyComparison.options){
      delete o.requiredCards;delete o.attachments;o.replyTurn=4;o.promotionRationale='Nessun KO o promozione in questo registro sintetico.'
    }
    s.replyComparison.omissionTests=[{printId:'e',remainingDamage:0,terms:[0],multiplier:1,witnessReplyId:null,reason:'Budget sintetico zero; altre copie fisiche restano disponibili ma impiegarle costa una carta.'}]
  }
  return c
}
function packetV9():GuidePacket{
  const p=packetV8();p.sources.push(guideSource('rules','rules','Regole sintetiche',null,'Regole solo per fixture contabili.'));p.basis.promptVersion='matchup-guide-9';p.basis.dependencyHash=packetHash(p);return p
}
function rawV9():any{
  const c=rawV8()
  const event=(e:any)=>{
    const r=structuredClone(e);delete r.turn;delete r.side;delete r.handAfter
    r.energyRoutes=r.moves.filter((m:any)=>m.printId==='e').map((m:any)=>({side:m.side,printId:m.printId,count:m.count,path:[m.from,m.to],hostPrintId:m.to==='attached'?(m.side==='ours'?'a':'b'):null,sourceIds:['card:e']}))
    r.moves=r.moves.filter((m:any)=>m.printId!=='e');return r
  }
  for(const s of c.scenarios){
    s.opening.ours.bench=['a'];s.opening.opponent.bench=['b'];s.firstOpponentTurn=null
    s.setupRounds=[{ours:{draw:'e',events:[],decision:s.turnAudit[0]},opponent:{draw:'e',events:[],decision:s.turnAudit[1]}}]
    s.turns={ours:{draw:'e',events:[event(s.lineEvents[0])]},opponent:{draw:'e',events:[event(s.lineEvents[1])]},next:{draw:'e',beforeAttack:[],attack:event(s.lineEvents[2]),afterAttack:[]}}
    s.developmentPlan=Object.fromEntries(['ours','opponent','next'].map((phase,i)=>[phase,{access:s.developmentEvents[i].access,nextAttack:s.developmentEvents[i].nextAttack,pivot:s.developmentEvents[i].pivot}]))
    for(const o of s.replyComparison.options){o.turns={ours:{draw:null,events:[]},opponent:{draw:null,events:[]},next:{draw:null,events:[]}};o.forkAtEvent=6;delete o.replyTurn;delete o.lineEvents}
    for(const key of ['resources','setupEvents','lineEvents','developmentEvents','turnAudit'])delete s[key]
  }
  return c
}
function packetV10():GuidePacket{
  const p=packetV9();p.basis.promptVersion='matchup-guide-10'
  const index=p.sources.findIndex(s=>s.id==='card:b'),card=JSON.parse(p.sources[index].content)
  card.gameplay.attacks.push({name:'B only',cost:['Colorless'],damage:'100'})
  card.gameplay.abilities=[{name:'Practice Draw',effect:'Synthetic ledger fixture: draw one card; not a real Pokémon.'}]
  p.sources[index]=guideSource('card:b','card','B',null,JSON.stringify(card));p.basis.dependencyHash=packetHash(p);return p
}
function rawV10():any{
  const c=rawV9(),convert=(e:any,printId:string)=>{
    e.attack=e.attackName==null?null:{printId,attackName:e.attackName};delete e.attackName;return e
  }
  for(const s of c.scenarios){
    for(const e of s.turns.ours.events)convert(e,'a')
    for(const e of s.turns.opponent.events)convert(e,'b')
    convert(s.turns.next.attack,'a')
    for(const o of s.replyComparison.options){
      o.forkAtEvent=2;o.accessProof=null
      o.turns={ours:{draw:null,events:[]},opponent:structuredClone(s.turns.opponent),next:structuredClone(s.turns.next)}
    }
    const access=structuredClone(s.replyComparison.options[0]);access.id='access'
    access.accessProof={sourceIds:['card:b'],reason:'Synthetic source-backed draw before attack; not competitive evidence.'}
    access.turns.opponent.events.unshift({kind:'effect',description:'Synthetic extra draw.',attack:null,action:'other',affectedSide:'opponent',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['deck','hand'],hostPrintId:null,sourceIds:['card:b']}]})
    s.replyComparison.options.push(access);s.replyComparison.coverage={direct:'direct',access:'access',defend:'extended'}
  }
  return c
}
function packetV11():GuidePacket{
  const p=packetV10();p.basis.promptVersion='matchup-guide-11'
  for(const id of ['a','b']){
    const i=p.sources.findIndex(s=>s.id===`card:${id}`),c=JSON.parse(p.sources[i].content);c.gameplay.hp=160
    p.sources[i]=guideSource(`card:${id}`,'card',id.toUpperCase(),null,JSON.stringify(c))
  }
  p.basis.dependencyHash=packetHash(p);return p
}
function rawV11(caseId?:string):any{
  const c=rawV10()
  const event=(e:any)=>{e.trainer=null;for(const r of e.energyRoutes)r.attachment=r.path.slice(1).includes('attached')?'manual':null}
  for(const s of c.scenarios){
    s.decision='Decisione sintetica sul seguito';s.positionAnnotations=['ours','opponent'].flatMap(side=>['active','bench'].map(zone=>({side,printId:side==='ours'?'a':'b',zone,copy:1,damage:0,condition:null})))
    for(const side of ['ours','opponent'])for(const e of s.setupRounds[0][side].events)event(e)
    for(const e of [...s.turns.ours.events,...s.turns.opponent.events,...s.turns.next.beforeAttack,s.turns.next.attack,...s.turns.next.afterAttack])event(e)
    s.developmentPlan=Object.fromEntries(Object.entries(s.developmentPlan).map(([k,n]:any)=>[k,{reason:n.access,pivot:n.pivot}]))
    for(const o of s.replyComparison.options){
      o.continuation='if-game-continues';delete o.sequence
      for(const e of [...o.turns.ours.events,...o.turns.opponent.events,...o.turns.next.beforeAttack,o.turns.next.attack,...o.turns.next.afterAttack])event(e)
    }
    for(const key of ['title','positionNotes','explanation','opponentResponse','pivot'])delete s[key]
  }
  if(caseId){const s=c.scenarios[caseId.endsWith('2')?1:0];s.id=caseId;c.scenarios=[s];c.chapters=[];c.exercises=[]}
  return c
}

function packetV12():GuidePacket{const p=packetV11();p.basis.promptVersion='matchup-guide-12';p.basis.dependencyHash=packetHash(p);return p}
function rawV12(caseId?:string):any{
  const raw=rawV11(caseId)
  for(const s of raw.scenarios){
    s.replyComparison.attackReview=[{printId:'b',attackName:'Practice',replyId:'direct',reason:'Executed synthetic fixture.'},{printId:'b',attackName:'B only',replyId:null,reason:'Alternative excluded only for this synthetic ledger; mocked criticism is not competitive evidence.'}]
    for(const t of s.replyComparison.omissionTests)for(const k of ['remainingDamage','terms','multiplier'])delete t[k]
    for(const r of s.retreatCosts)delete r.printedCost
  }
  return raw
}

function packetV13():GuidePacket{const p=packetV12();p.basis.promptVersion='matchup-guide-13';p.basis.dependencyHash=packetHash(p);return p}
function rawV13(caseId?:string):any{
  const raw=rawV12(caseId)
  const visit=(v:any)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v.moves)&&Array.isArray(v.energyRoutes))v.deckObservations=[];for(const x of Object.values(v))if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')visit(x)}
  visit(raw);return raw
}

function packetV14():GuidePacket{const p=packetV13();p.basis.promptVersion='matchup-guide-14';p.basis.dependencyHash=packetHash(p);return p}
function rawV14(caseId?:string):any{
  const raw=rawV13(caseId)
  for(const s of raw.scenarios)for(const c of s.calculations){c.purpose='other';c.attack=null}
  return raw
}
function packetV15():GuidePacket{const p=packetV14();p.basis.promptVersion='matchup-guide-15';p.basis.dependencyHash=packetHash(p);return p}
function rawV15(caseId?:string):any{
  const raw=rawV14(caseId),p=packetV15()
  for(const s of raw.scenarios)for(const r of s.positionAnnotations)r.hpAdjustment={amount:0,sourceIds:[]}
  const projected=compileGuideTactics(projectGuideLedger(structuredClone(raw),p))
  for(const s of raw.scenarios){const found=projected.scenarios.find(v=>v.id===s.id)!
    s.tacticalAudit=tacticalFrontier(found,p.sources).map(g=>({lineIds:[g.lineId],turn:g.turn,side:g.side,attacks:g.attacks,cards:[...new Set([...g.cards.map(c=>c.printId),...g.promotions.flatMap(p=>p.printIds)])],comparison:'Synthetic coverage fixture; not a competitive assessment.'}))
  }
  return raw
}

function packetV16():GuidePacket{const p=packetV15();p.basis.promptVersion='matchup-guide-16';p.basis.dependencyHash=packetHash(p);return p}
function rawV16(caseId?:string):any{
  const raw=rawV15(caseId)
  for(const s of raw.scenarios){
    const body=(lineId:string,turn:number,side:string)=>{
      const row=s.tacticalAudit.find((r:any)=>r.lineIds.includes(lineId)&&r.turn===turn&&r.side===side)
      return structuredClone({attacks:row.attacks,cards:row.cards,comparison:row.comparison})
    }
    let t=0
    if(s.firstOpponentTurn)s.firstOpponentTurn.tactical=body('setup',++t,'opponent')
    for(const round of s.setupRounds)for(const side of ['ours','opponent'])round[side].tactical=body('setup',++t,side)
    for(const [i,phase]of ['ours','opponent','next'].entries())s.turns[phase].tactical=body('main',t+i+1,i===1?'opponent':'ours')
    for(const o of s.replyComparison.options){
      for(const [i,phase]of ['ours','opponent','next'].entries())o.turns[phase].tactical=i===0?null:body(o.id,t+i+1,i===1?'opponent':'ours')
      if(o.accessProof)o.accessProof.eventIndex=0
    }
    const visit=(v:any)=>{if(!v||typeof v!=='object')return;if(v.moves&&v.energyRoutes){v.retreat=null;delete v.retreatCostId}for(const x of Object.values(v))if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')visit(x)}
    visit(s);delete s.tacticalAudit;delete s.retreatCosts
  }
  return raw
}

function packetV17():GuidePacket{const p=packetV16();p.basis.promptVersion='matchup-guide-17';p.basis.dependencyHash=packetHash(p);return p}
function nativeV17(caseId?:string):any{
  const raw=rawV16(caseId)
  for(const s of raw.scenarios)for(const t of [s.firstOpponentTurn,...s.setupRounds.flatMap((r:any)=>[r.ours,r.opponent])].filter(Boolean))for(const k of ['turn','side'])delete t.decision[k]
  return raw
}
function packetV18():GuidePacket{const p=packetV17();p.basis.promptVersion='matchup-guide-18';p.basis.dependencyHash=packetHash(p);return p}
function packetV19():GuidePacket{const p=packetV18();p.basis.promptVersion='matchup-guide-19';p.basis.dependencyHash=packetHash(p);return p}
function nativeV19(caseId?:string):any{
  const raw=nativeV17(caseId),p=packetV18(),projected=compileGuideTactics(projectGuideLedger(raw,p))
  for(const s of raw.scenarios){
    const groups=tacticalFrontier(projected.scenarios.find(v=>v.id===s.id)!,p.sources)
    const add=(t:any,line:string,turn:number,side:string)=>{if(t?.tactical){const g=groups.find(g=>g.lineId===line&&g.turn===turn&&g.side===side);t.tactical.promotions=g?.promotions.flatMap(p=>p.printIds.map(printId=>({side:p.side,printId,reason:'Synthetic explicit coverage fixture, not competitive evidence.'})))??[]}}
    let turn=0;if(s.firstOpponentTurn)add(s.firstOpponentTurn,'setup',++turn,'opponent')
    for(const round of s.setupRounds)for(const side of ['ours','opponent'])add(round[side],'setup',++turn,side)
    for(const [i,phase]of ['ours','opponent','next'].entries())add(s.turns[phase],'main',turn+i+1,i===1?'opponent':'ours')
    for(const o of s.replyComparison.options)for(const [i,phase]of ['ours','opponent','next'].entries())add(o.turns[phase],o.id,turn+i+1,i===1?'opponent':'ours')
  }return raw
}

function packetV21():GuidePacket{const p=packetV19();p.basis.promptVersion='matchup-guide-21';p.basis.dependencyHash=packetHash(p);return p}
function packetV22():GuidePacket{const p=packetV21();p.basis.promptVersion='matchup-guide-22';p.basis.dependencyHash=packetHash(p);return p}
function packetV23():GuidePacket{const p=packetV22();p.basis.promptVersion='matchup-guide-23';p.basis.dependencyHash=packetHash(p);return p}
function packetV24():GuidePacket{const p=packetV23();p.basis.promptVersion='matchup-guide-24';p.basis.dependencyHash=packetHash(p);return p}
function nativeV21(caseId?:string):any{
  const raw=nativeV19(caseId)
  for(const s of raw.scenarios){
    for(const e of s.turns.opponent.events)e.accessReceipt=null
    for(const o of s.replyComparison.options){
      for(const e of o.turns.opponent.events)e.accessReceipt=null
      if(o.id===s.replyComparison.coverage.access){const {eventIndex,...proof}=o.accessProof;o.turns.opponent.events[eventIndex].accessReceipt=proof}
      delete o.accessProof
    }
  }return raw
}

it('allocates opening stock before events and never duplicates hands, bench or prizes',()=>{
  const p=packetV21(),raw=nativeV21(),initial=raw.scenarios.map((s:any,i:number)=>({id:'scenario-'+(i+1),opening:s.opening})),before=JSON.stringify(initial)
  const allocations=readOpeningAllocations(initial,p,'opponent-1')
  expect(allocations).toHaveLength(2)
  for(const a of allocations)for(const side of ['ours','opponent'] as const)expect(a.remainingDeck[side].reduce((n,c)=>n+c.count,0)).toBe(47)
  expect(JSON.stringify(initial)).toBe(before)
  const bad=structuredClone(initial);bad[0].opening.ours.prizes=Array(6).fill('a')
  expect(()=>readOpeningAllocations(bad,p,'opponent-1')).toThrow('eccede la lista')
  const duplicate=structuredClone(initial);duplicate[1].id='scenario-1';expect(()=>readOpeningAllocations(duplicate,p,'opponent-1')).toThrow('distinte')
  const native=nativeV21('scenario-1');delete native.scenarios[0].opening
  const withOpening=withAllocatedOpening(native,allocations[0]);expect(withOpening.scenarios[0].opening).toEqual(initial[0].opening);expect(native.scenarios[0]).not.toHaveProperty('opening')
  expect(()=>withAllocatedOpening(withOpening,allocations[0])).toThrow('duplicare')
})

it('roundtrips v22 inline events and audits without pools, indices or loss of native constraints',()=>{
  const raw=nativeV21('scenario-1'),before=JSON.stringify(raw),packed=packScenarioOutput(raw,true,true,true),s=packed.scenarios[0]
  expect(packed.scenarioEncoding).toBe('pg-scenario-inline-4')
  for(const key of ['ourSetupEvents','opponentLineEvents','auditTable','moveTable','energyTable'])expect(s).not.toHaveProperty(key)
  expect(typeof s.turns.opponent.events[0]).toBe('object');expect(typeof s.turns.ours.tactical).toBe('object')
  expect(JSON.stringify(expandScenarioOutput(packed,true,'pg-scenario-inline-4'))).toBe(before);expect(JSON.stringify(raw)).toBe(before)
  const native=boundGuideSchema(singleScenarioSchemaV21('scenario-1'),packetV22(),'opponent-1'),schema=scenarioOutputSchema(native,true,true,true)
  assertGuideSchemaBudget(compactGuideSchema(schema));assertNativeScenarioSchema(packed,schema);assertNativeScenarioSchema(expandScenarioOutput(packed,true),native)
  const pool=structuredClone(packed);pool.scenarios[0].opponentLineEvents=[];expect(()=>expandScenarioOutput(pool,true)).toThrow('pool')
  const index=structuredClone(packed);index.scenarios[0].turns.ours.events=[999];expect(()=>expandScenarioOutput(index,true)).toThrow('non un indice')
  const stale=structuredClone(packed);stale.scenarios[0].turns.ours.events.push({k:'effect',d:'Evento sostituito dalla nuova sequenza.',m:[],e:[],a:null,t:null,x:'other',y:'ours',o:[],r:null})
  expect(()=>assertConstructedScenarios(stale)).toThrow('COSTRUZIONE NON COMPLETATA')
  const prompt=causalInstructions('scenarios-1',true,true,true,true,true,true,true,true,true,true,true)
  expect(prompt).toContain("scenarioEncoding='pg-scenario-inline-4'");expect(prompt).toContain('tactical inline');expect(prompt).not.toContain('PROMOZIONI v19')
})

it('reports the precise v22 event, Energy route and actual board without substituting a host',()=>{
  const raw=nativeV21('scenario-1'),p=packetV22()
  raw.scenarios[0].turns.ours.events.push({kind:'effect',description:'Synthetic invalid host.',moves:[],energyRoutes:[{side:'ours',printId:'e',count:1,path:['hand','attached'],hostPrintId:'b',sourceIds:['rules'],attachment:'manual'}],attack:null,trainer:null,action:'other',affectedSide:'ours',deckObservations:[],retreat:null})
  const before=JSON.stringify(raw);let message=''
  try{projectGuideLedger(raw,p)}catch(e){message=String(e)}
  expect(message).toContain('destinatario dell’Energia non presente');expect(message).toContain('main[');expect(message).toContain('"hostPrintId":"b"');expect(message).toContain('Campo effettivo')
  expect(JSON.stringify(raw)).toBe(before)
})

it('reports v22 availability with the pre-event state and verified prefix while keeping a reserved card unavailable',()=>{
  const p=packetV22(),raw=nativeV21('scenario-1');p.ourList.cards.find(c=>c.printId==='e')!.count--
  p.ourList.cards.push({printId:'reserved',name:'Reserved',count:1});p.sources.push(guideSource('card:reserved','card','Reserved',null,JSON.stringify({printId:'reserved',category:'Trainer',gameplay:{effect:'Synthetic card.'}})))
  raw.scenarios[0].opening.ours.prizes[0]='reserved';raw.scenarios[0].turns.ours.draw='reserved'
  const before=JSON.stringify(raw);let message=''
  try{projectGuideLedger(raw,p)}catch(e){message=String(e)}
  expect(message).toContain('PESCA/RICERCA IMPOSSIBILE');expect(message).toContain('Stato prima');expect(message).toContain('"verifiedPrefix"');expect(message).toContain('"failedMove"');expect(JSON.stringify(raw)).toBe(before)
})

const planV22=()=>({...plan,opponentListId:'opponent-1',initialOpenings:nativeV21().scenarios.map((s:any,i:number)=>({id:'scenario-'+(i+1),opening:s.opening}))})
const incompleteV22=(caseId:string,allocated=true)=>{const raw=nativeV21(caseId);if(allocated)delete raw.scenarios[0].opening;raw.scenarios[0].assumptions.push('Non ho completato il registro richiesto.');return packScenarioOutput(raw,true,true,true)}

const initialV24=(stage:string)=>{const raw=nativeV21(stage==='scenarios-1'?'scenario-1':'scenario-2');delete raw.scenarios[0].opening;return packScenarioOutput(raw,true,true,true)}
const packetV27=()=>{const p=packetV24();p.basis.promptVersion='matchup-guide-27';for(const s of p.sources){if(s.kind!=='card')continue;let c:any;try{c=JSON.parse(s.content)}catch{continue}if(c.category==='Energy')c.name='Basic Grass Energy';for(const a of c.gameplay?.attacks??[])a.cost=[];s.content=JSON.stringify(c);s.hash=guideHash(s.content)}p.basis.dependencyHash=packetHash(p);return p}
const nativeV27=(id:string)=>{const raw=nativeV21(id),visit=(v:any,side='ours')=>{if(!v||typeof v!=='object')return;if(v.moves&&v.energyRoutes){v.boardExitProofs=[];v.attachmentTargets=v.energyRoutes.filter((r:any)=>r.path.includes('attached')).map((r:any)=>({side:r.side,printId:r.printId,hostPrintId:r.hostPrintId,copy:1}));v.attackPayment=v.attack?{energy:[],costAdjustments:[]}:null;v.decisionProof={cards:[side==='ours'?'a':'b','e'],reason:'Synthetic pre-action coverage, not a competitive assessment.'}}for(const [k,x]of Object.entries(v)){const actor=k==='opponent'||k==='firstOpponentTurn'?'opponent':k==='ours'||k==='next'?'ours':side;if(Array.isArray(x))x.forEach(v=>visit(v,actor));else if(x&&typeof x==='object')visit(x,actor)}};visit(raw);return raw}
const stagedV27=(stage:string)=>{const id=/(?:setup|scenarios)-1/.test(stage)?'scenario-1':'scenario-2',raw=nativeV27(id),s=raw.scenarios[0];delete s.opening
 if(stage.startsWith('setup-'))return {caseSetup:Object.fromEntries(['id','opponentListId',...guideSetupKeys].map(k=>[k,s[k]])),changeSummary:'Explicit synthetic setup.'}
 for(const k of guideSetupKeys.filter(k=>!['assumptions','sourceIds'].includes(k)))delete s[k];return packScenarioOutput(raw,true,true,true)
}
it('checks a setup before generating its continuation and retains all v27 publication and original-input gates',async()=>{
 const s=setup(),p=packetV27(),seen:string[]=[]
 try{const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Independent staged fixture.',runner:async prompt=>{
  const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
  if(stage==='plan')return planV22();if(stage.startsWith('setup-'))return stagedV27(stage)
  if(stage.startsWith('scenarios-')){expect(data.setupReceipt.inventory.reduce((n:number,r:any)=>n+r.count,0)).toBe(120);expect(data.setupReceipt.nextTurn).toBe(3);expect(data).toHaveProperty('frozenSetup');return stagedV27(stage)}
  return stage.startsWith('prose')?proseV14():reviewed
 }})
 expect(seen.slice(0,5)).toEqual(['plan','setup-1','scenarios-1','setup-2','scenarios-2']);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16);assertGuideReport({...p.basis,guide});assertGuideIntegrity(guide)
 expect((guide.scenarios[0] as any).lineEvents.some((e:any)=>e.choiceBefore&&e.attackPaymentResult)).toBe(true);expect([...s.work.archive.values('guide-setup-construction')]).toHaveLength(2)
 }finally{s.close()}
},20000)
it('rejects impossible setup draws before ever requesting a line and does not mutate the input ledger',()=>{
 const raw=nativeV27('scenario-1'),p=packetV27(),s=raw.scenarios[0],before=JSON.stringify(raw);s.setupRounds[0].ours.draw='b';const invalid=JSON.stringify(raw)
 expect(()=>projectGuideSetup(raw,p)).toThrow('non disponibile');expect(JSON.stringify(raw)).toBe(invalid);expect(invalid).not.toBe(before)
})
it('never requests continuation or prose after a setup tries to draw a card reserved in prizes',async()=>{
 const s=setup(),p=packetV27(),seen:string[]=[]
 try{await expect(generateDeepGuide({packet:p,config,work:s.work,request:'Invalid setup fixture.',runner:async prompt=>{
  const stage=stageOf(prompt);seen.push(stage)
  if(stage==='plan'){const plan=planV22();plan.initialOpenings[0].opening.ours.prizes=['a','a','e','e','e','e'];return plan}
  if(stage==='setup-1'){const raw=stagedV27(stage);raw.caseSetup.setupRounds[0].ours.draw='a';return raw}
  throw new Error('A later phase must never be invoked')
 }})).rejects.toThrow('Budget insufficiente')
 expect(seen.every(stage=>stage==='plan'||stage==='setup-1')).toBe(true);expect([...s.work.archive.values('guide-setup-construction')]).toHaveLength(0)
 expect([...s.work.archive.values<any>('guide-invalid-response')].some(v=>v.value.message.includes('Premi'))).toBe(true)
 }finally{s.close()}
},20000)
it('checks alternatives against the hand before consuming Energy and rejects missing pre-action coverage',()=>{
 const p=packetV27(),raw=nativeV27('scenario-1'),projected=projectGuideLedger(raw,p),e=(projected.scenarios[0] as any).lineEvents.find((e:any)=>e.energyRoutes?.some((r:any)=>r.path[0]==='hand'&&r.path[1]==='attached'))
 expect(e.choiceBefore.hand.reduce((n:number,r:any)=>n+r.count,0)).toBe(e.handAfter[e.side]+1)
 const bad=nativeV27('scenario-1');bad.scenarios[0].turns.next.attack.decisionProof.cards=[]
 expect(()=>projectGuideLedger(bad,p)).toThrow('PRIMA dell’azione omesse')
})
it('does not buy an unfinishable v27 plan below the setup/line review reserve',async()=>{
 const s=setup();try{await expect(generateDeepGuide({packet:packetV27(),config,work:s.work,attemptLimit:8,request:'Bounded fixture.',runner:async()=>{throw new Error('No model invocation expected')}})).rejects.toThrow('Budget insufficiente');expect([...s.work.archive.values('guide-attempt-start')]).toHaveLength(0)}finally{s.close()}
})
it('rebuilds only the line after an output limit while retaining its verified setup and cumulative budget',async()=>{
 const s=setup(),seen:string[]=[];let limited=false
 try{const guide=await generateDeepGuide({packet:packetV27(),config,work:s.work,request:'Output limit fixture.',runner:async prompt=>{
  const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
  if(stage==='plan')return planV22();if(stage.startsWith('setup-'))return stagedV27(stage)
  if(stage==='scenarios-1'&&!limited){limited=true;throw new AiFailure('output-limit','Synthetic bounded output limit.')}
  if(stage.startsWith('scenarios-')){if(stage.includes('rebuild'))expect(data.previousOutputLimit).toBe(true);return stagedV27(stage)}
  return stage.startsWith('prose')?proseV14():reviewed
 }})
 expect(seen.filter(s=>s==='setup-1')).toHaveLength(1);expect(seen).toContain('scenarios-1-rebuild');expect(guide.generation.attempts.filter(a=>a.status==='failed')).toHaveLength(1);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16);assertGuideIntegrity(guide)
 }finally{s.close()}
},20000)
const initialV26=(stage:string)=>{
 const raw=nativeV21(stage==='scenarios-1'?'scenario-1':'scenario-2');delete raw.scenarios[0].opening
 const visit=(v:any)=>{if(!v||typeof v!=='object')return;if(v.moves&&v.energyRoutes){v.boardExitProofs=[];v.attachmentTargets=[]}for(const x of Object.values(v))if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')visit(x)};visit(raw);return packScenarioOutput(raw,true,true,true)
}
it('runs the v26 schema and native repair through all gates, persistence validation and rendering on independent fixtures',async()=>{
 const s=setup(),p=packetV24(),seen:string[]=[];p.basis.promptVersion='matchup-guide-26';p.basis.dependencyHash=packetHash(p)
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Independent v26 fixture.',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   expect(prompt.split('\n\nDATI CONGELATI:\n')[0]).toContain('boardExitProofs')
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV26(stage)
   if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-2',message:'Synthetic condition.',correction:'Clarify condition.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-final-delta')return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Independent v26 correction."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Synthetic correction.'}
   if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(seen.at(-1)).toBe('review-2');expect(guide.generation.scenarioOriginals?.cases).toHaveLength(2);expect(guide.basis.promptVersion).toBe('matchup-guide-26')
  assertGuideReport({...p.basis,guide});assertGuideIntegrity(guide)
  expect(renderToStaticMarkup(createElement(DeepMatchupGuide,{guide,renderText:text=>text}))).toContain('Scenari commentati')
 }finally{s.close()}
},20000)
it('runs v25 on independent synthetic cards through native repair and all publication gates with generic instructions',async()=>{
 const s=setup(),p=packetV24(),seen:string[]=[];p.basis.promptVersion='matchup-guide-25';p.basis.dependencyHash=packetHash(p)
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Synthetic guide for independent fixture cards.',runner:async prompt=>{
   const stage=stageOf(prompt),instructions=prompt.split('\n\nDATI CONGELATI:\n')[0],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   expect(instructions,stage).not.toMatch(/Toucannon|Dragapult|Hydrapple|Festival|Dreepy|Meganium|Ogerpon|Moltres|Legacy Energy|Briar/)
   expect(instructions).toContain('SCELTA DELLE COPIE');expect(instructions).toContain('TUTTI i filtri del testo')
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-2',message:'Synthetic condition needs clarification.',correction:'Clarify then review every dependency.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-final-delta')return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Independent corrected condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Synthetic native correction.'}
   if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(seen.at(-1)).toBe('review-2');expect(seen).toContain('repair-final-delta');expect(guide.basis.promptVersion).toBe('matchup-guide-25')
  expect(guide.generation.scenarioOriginals?.cases).toHaveLength(2);expect(guide.scenarios[1].assumptions).toContain('Independent corrected condition.')
  assertGuideReport({...p.basis,guide});assertGuideIntegrity(guide)
  const html=renderToStaticMarkup(createElement(DeepMatchupGuide,{guide,renderText:text=>text}));expect(html).toContain('Copie viste o impiegate e fonti');expect(html).toContain('Scenari commentati')
  const noAudit=structuredClone(guide);delete noAudit.scenarios[0].tacticalAudit;expect(checkGuide(noAudit,p).errors.join('\n')).toContain('tacticalAudit')
  const forged=structuredClone(guide);forged.scenarios[0].state='Not derived from the ledger';expect(()=>assertGuideIntegrity(forged)).toThrow()
 }finally{s.close()}
},20000)
it.each([1,3])('repairs two native v24 cases atomically for %i rounds and repeats all gates under the selected ceiling',async(rounds)=>{
 const s=setup(),p=packetV24(),seen:string[]=[]
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,...rounds===1?{attemptLimit:8}:{},request:'Guida',runner:async(prompt,_config,_schema,_signal,_summary,execution)=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage);expect(execution?.measureRequests).toBe(true)
   if(stage==='plan')return planV22()
   if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage.startsWith('review-scenarios-')&&Number(stage.split('-').at(-1))<=rounds)return {...reviewed,verdict:'revise',findings:data.draft.scenarios.map((v:any)=>({severity:'major',targetId:v.id,message:'Synthetic correction of a stated condition.',correction:'Update assumption.',sourceIds:[],proposedActions:[]}))}
   if(stage==='repair-scenarios-delta'){
    expect(data.nativeCases).toHaveLength(2)
    return {cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic corrected condition; not competitive evidence."'}]})),claims:[],changeSummary:'Two declared conditions corrected.'}
   }
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(seen).toHaveLength(6+2*rounds);expect(seen).toContain('review-scenarios-'+(rounds+1));expect(seen.at(-1)).toBe('review-1')
  expect([...s.work.archive.values('guide-native-repair')]).toHaveLength(rounds);expect(guide.scenarios.every(s=>s.assumptions.includes('Synthetic corrected condition; not competitive evidence.'))).toBe(true)
  expect([...s.work.archive.values<any>('guide-schedule')][0].value.maximum).toBe(rounds===1?8:16)
  assertGuideReport({...p.basis,guide})
 }finally{s.close()}
})
it.each([24,26] as const)('retries an invalid v%i first-turn critic without manually overriding its finding',async(version)=>{
 const s=setup(),p=packetV24();p.basis.promptVersion=`matchup-guide-${version}`;p.basis.dependencyHash=packetHash(p);let reviews=0
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return version===26?initialV26(stage):initialV24(stage)
   if(stage==='review-scenarios-1'&&reviews++===0){const fact=data.turnFacts[0];return {...reviewed,verdict:'revise',findings:[{severity:'blocking',targetId:fact.scenarioId,message:'Synthetic forbidden early evolution.',correction:'Evolve in first turn.',sourceIds:[],proposedActions:[{scenarioId:fact.scenarioId,side:'ours',turn:fact.firstTurns.ours,action:'ordinary-evolution',reason:'Base in setup.'}]}]}}
   if(stage==='review-scenarios-1')expect(data.previousInvalid.message).toContain('PRIMO TURNO')
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(guide.generation.attempts).toHaveLength(7);expect(guide.generation.attempts.filter(a=>a.status==='failed')).toHaveLength(1)
  expect([...s.work.archive.values('guide-invalid-response')]).toHaveLength(1);expect([...s.work.archive.values('guide-text-correction')]).toHaveLength(0)
 }finally{s.close()}
})
it('rejects a v24 native edit that breaks a card constraint before saving any repaired candidate',async()=>{
 const s=setup(),p=packetV24()
 try{
  await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:8,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage==='review-scenarios-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic defect.',correction:'Repair.',sourceIds:[],proposedActions:[]}]}
   return {cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'replace',path:'/turns/ours/draw',valueJson:'"not-in-the-exact-list"'}]})),claims:[],changeSummary:'Invalid fixture.'}
  }})).rejects.toThrow('Budget insufficiente')
  expect([...s.work.archive.values('guide-native-repair')]).toHaveLength(0);expect(s.work.archive.value('guide','validated')).toBeUndefined()
  expect([...s.work.archive.values<any>('guide-invalid-response')][0].value.message).toContain('fuori enum')
 }finally{s.close()}
})

it('automatically changes output format after a delta output limit while preserving the original opening and every review',async()=>{
 const s=setup(),p=packetV24(),seen:string[]=[]
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage==='review-scenarios-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic correction.',correction:'Repair.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-scenarios-delta')throw new AiFailure('output-limit','Synthetic provider output limit')
   if(stage.startsWith('repair-scenarios-rebuild-')){const raw=nativeV21(data.caseId);delete raw.scenarios[0].opening;raw.scenarios[0].assumptions.push('Synthetic rebuilt condition.');expect(data.openingAllocation.opening).toEqual(data.nativeCases[0].native.opening);return packScenarioOutput(raw,true,true,true)}
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(seen).toHaveLength(9);expect(seen.filter(s=>s==='review-scenarios-1')).toHaveLength(1);expect(seen).toContain('repair-scenarios-rebuild-scenario-1');expect([...s.work.archive.values('guide-scenario-rebuild-repair')]).toHaveLength(1);expect(guide.review.verdict).toBe('pass')
 }finally{s.close()}
},20000)

it('replays a paid output-limit rebuild with one and then two calls left without duplicating earlier construction or reviews',async()=>{
 const s=setup(),p=packetV24(),seen:string[]=[]
 const runner=async(prompt:string)=>{
  const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
  if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
  if(stage==='review-scenarios-1'||stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic condition to repair.',correction:'Repair and rereview.',sourceIds:[],proposedActions:[]}]}
  if(stage==='repair-scenarios-delta')throw new AiFailure('output-limit','Synthetic output limit')
  if(stage==='repair-scenarios-rebuild-scenario-1'){const raw=nativeV21(data.caseId);delete raw.scenarios[0].opening;raw.scenarios[0].assumptions.push('Synthetic rebuilt condition.');return packScenarioOutput(raw,true,true,true)}
  if(stage==='repair-final-delta')return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic final condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Final correction.'}
  if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
  return stage.startsWith('prose')?proseV14():reviewed
 }
 try{
  await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:9,request:'Guida',runner})).rejects.toThrow('Budget insufficiente');expect(seen).toHaveLength(9)
  s.reopen();await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:10,request:'Guida',runner})).rejects.toThrow('Budget insufficiente');expect(seen).toHaveLength(9)
  const guide=await generateDeepGuide({packet:p,config,work:s.work,attemptLimit:11,request:'Guida',runner});expect(seen).toHaveLength(11)
  expect(seen.filter(s=>s==='repair-scenarios-rebuild-scenario-1')).toHaveLength(1);expect(seen.filter(s=>s==='review-scenarios-1')).toHaveLength(1);expect(seen.filter(s=>s==='review-1')).toHaveLength(1)
  expect(guide.review.verdict).toBe('pass');expect(guide.generation.attempts).toHaveLength(11)
 }finally{s.close()}
},20000)

it('gives a final native repair the exact failing-field constraint and whole rejected response without weakening the length bound',async()=>{
 const s=setup(),p=packetV24();let repairs=0
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,attemptLimit:9,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic condition.',correction:'Repair and rereview.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-final-delta'){
    const invalid=repairs++===0
    if(!invalid){expect(data.nativeSchemaFeedback.caseId).toBe('scenario-1');expect(data.nativeSchemaFeedback.path).toContain('tactical.comparison');expect(data.nativeSchemaFeedback.constraints).toContainEqual(expect.objectContaining({maxLength:1600}));expect(data.previousNativeRepairFailure.raw.draftHash).toBe(data.draftHash);expect(data.previousInvalid.message).toContain('1601')}
    return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:invalid?[{op:'replace',path:'/turns/opponent/tactical/comparison',valueJson:JSON.stringify('x'.repeat(1601))}]:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic repaired condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Synthetic bounded repair.'}
   }
   if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(repairs).toBe(2);expect(guide.generation.attempts).toHaveLength(9);expect(guide.generation.attempts.filter(a=>a.status==='failed')).toHaveLength(1);expect(guide.review.verdict).toBe('pass')
  expect([...s.work.archive.values<any>('guide-invalid-response')][0].value.message).toContain('massimo 1600')
 }finally{s.close()}
},20000)

it.each(['scenario','chapter','exercise'])('repairs native state for a final finding on a %s before the complete final rereview within the last two calls',async(target)=>{
 const s=setup(),p=packetV24(),seen:string[]=[]
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,attemptLimit:8,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
   if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:target==='chapter'?'decisions':target==='exercise'?data.draft.exercises[0].id:'scenario-1',message:'Synthetic final defect.',correction:'Repair state and dependencies.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-final-delta'){expect(data.nativeCases.map((c:any)=>c.id)).toEqual(['scenario-1']);return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic final corrected condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Native condition and dependencies reviewed.'}}
   if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
   if(stage.startsWith('prose')){const prose=proseV14();prose.chapters.find((c:any)=>c.id==='decisions').dependsOn=['scenario-1'];return prose}return reviewed
  }})
  expect(seen).toHaveLength(8);expect(seen.slice(-2)).toEqual(['repair-final-delta','review-2']);expect([...s.work.archive.values('guide-final-native-repair')]).toHaveLength(1);expect(guide.scenarios[0].assumptions).toContain('Synthetic final corrected condition.');expect(guide.review.findings).toEqual([])
 }finally{s.close()}
})

it('revalidates a paid final transaction after reopen and preserves the later negative review without spending or publishing',async()=>{
 const s=setup(),p=packetV24();let invoked=0
 const runner=async(prompt:string)=>{
  invoked++;const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
  if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
  if(stage==='review-1'||stage==='review-2')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:stage==='review-1'?'Synthetic first defect.':'Synthetic remaining defect.',correction:'Repair and rereview.',sourceIds:[],proposedActions:[]}]}
  if(stage==='repair-final-delta')return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic paid correction."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Paid correction, still subject to independent review.'}
  return stage.startsWith('prose')?proseV14():reviewed
 }
 try{
  await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:8,request:'Guida',runner})).rejects.toThrow('Budget insufficiente')
  expect(invoked).toBe(8);s.reopen()
  await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:8,request:'Guida',runner})).rejects.toThrow('Budget insufficiente')
  expect(invoked).toBe(8);expect([...s.work.archive.values('guide-final-repair-cache-reuse')]).toHaveLength(1)
  expect([...s.work.archive.values<any>('guide-review')].some(v=>v.value.findings.some((f:any)=>f.message==='Synthetic remaining defect.'))).toBe(true)
  expect(s.work.archive.value('guide','validated')).toBeUndefined()
 }finally{s.close()}
})

it.each([24,25,26] as const)('repairs an unchanged v%i scenario from a persisted parent guide in a separate revision job',async(version)=>{
 const s=setup(),p=packetV24();p.basis.promptVersion=`matchup-guide-${version}`;p.basis.dependencyHash=packetHash(p);let child:AiAnalysisWork|undefined
 try{
  s.projects.importDeck({projectId:s.project.id,rawText:'4 A\n56 Energy',source:'paste'})
  const metaId='b'.repeat(64),date='2026-10-30T12:00:00.000Z'
  s.projects.saveMetaSnapshot({id:metaId,fetchedAt:date,sourceUrl:'https://limitlesstcg.com/decks',circuit:'WESTERN',format:'STANDARD',period:'Test',decks:[{id:'284',name:'B',url:'https://limitlesstcg.com/decks/284',share:1,count:1}]} as never)
  const ctx=s.projects.getCurrentDeckContext(s.project.id)!
  p.basis={...p.basis,projectId:s.project.id,metaId,deckHash:s.projects.getCurrentDeckHash(s.project.id)!,deckVersionId:ctx.versionId,deckResolutionId:ctx.resolutionId};p.basis.dependencyHash=packetHash(p)
  const parent=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt);if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return version===26?initialV26(stage):initialV24(stage)
   if(stage.startsWith('prose')){const c=proseV14();c.chapters.find((c:any)=>c.id==='decisions').dependsOn=['scenario-2'];return c}return reviewed
  }})
  const report=deepGuideReport({...p.basis,jobId:s.job.id,generatedAt:date,sampleDeckUrl:null},parent)
  s.projects.saveMatchupReport(report);s.jobs.ready(s.job.id,{report});s.jobs.transition(s.job.id,'applied');s.work.close()
  const reopened=new ProjectStore(s.path);let previous:typeof report
  try{previous=reopened.listMatchupReports(s.project.id,metaId)[0]}finally{reopened.close()}
  expect(previous.guide!.generation.scenarioOriginals?.cases).toHaveLength(2)
  const historical=structuredClone(previous.guide!);delete historical.generation.scenarioOriginals;assertGuideIntegrity(historical)
  for(const kind of ['scope','hash','duplicate','forged-native'] as const){
   const altered=structuredClone(previous.guide!),originals=altered.generation.scenarioOriginals!
   if(kind==='scope')originals.scopeHash='changed'
   if(kind==='hash')originals.cases[0].baseHash='changed'
   if(kind==='duplicate')originals.cases[1]=structuredClone(originals.cases[0])
   if(kind==='forged-native'){const c=originals.cases[0];(c.native.assumptions as string[]).push('Forged native condition.');c.baseHash=guideHash({scopeHash:c.scopeHash,native:c.native})}
   expect(()=>assertGuideIntegrity(altered)).toThrow()
  }
  const job=s.jobs.start('matchup-revise',s.project.id,`matchup:${s.project.id}`)
  child=new AiAnalysisWork(join(s.folder,'revision-job'),s.jobs,job.id,new AbortController().signal,{kind:job.kind,args:[],guideVersion:1})
  expect([...child.archive.values('guide-state-projection')]).toHaveLength(0)
  for(const field of ['projectId','opponentId'] as const){const foreign=structuredClone(p);foreign.basis[field]='unrelated';foreign.basis.dependencyHash=packetHash(foreign)
   await expect(generateDeepGuide({packet:foreign,config,work:child,previous,revision:true,request:'Rivedi',runner:async()=>{throw new Error('Must not invoke model')}})).rejects.toThrow('altro progetto o matchup')}
  expect([...child.archive.values('guide-attempt-start')]).toHaveLength(0)
  const nextPacket=structuredClone(p);nextPacket.basis.asOf='2026-10-31';nextPacket.basis.dependencyHash=packetHash(nextPacket)
  const seen:string[]=[]
  const revised=await generateDeepGuide({packet:nextPacket,config,work:child,previous,revision:true,request:'Rivedi il piano',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   if(stage==='revision')return packScenarioOutput({chapters:[],claims:[],scenarios:[],exercises:[],limitations:[],changeSummary:'Synthetic revision retaining both scenarios.',removeIds:[]},true,true,true)
   if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'decisions',message:'Synthetic parent scenario defect.',correction:'Update condition and dependent prose.',sourceIds:[],proposedActions:[]}]}
   if(stage==='repair-final-delta'){expect(data.nativeCases.map((c:any)=>c.id)).toEqual(['scenario-2']);return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic revised parent condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Parent native retained and corrected.'}}
   if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
   throw new Error('Unexpected stage '+stage)
  }})
  expect(seen).toEqual(['revision','review-1','repair-final-delta','review-2']);expect(revised.scenarios[1].assumptions).toContain('Synthetic revised parent condition.')
  expect(revised.scenarios[0]).toEqual(parent.scenarios[0]);expect(previous.guide).toEqual(parent);assertGuideIntegrity(revised)
  expect(revised.generation.scenarioOriginals?.scopeHash).toBe(guideHash(nextPacket.basis));expect(revised.generation.scenarioOriginals?.scopeHash).not.toBe(parent.generation.scenarioOriginals?.scopeHash)
  expect([...child.archive.values('guide-parent-native-use')]).toHaveLength(2)
  // Published reports that predate native originals cannot be patched by
  // guessing declarations backwards from compiled states. Rebuild via AI.
  child.close();s.jobs.transition(job.id,'cancelled')
  const historicalPrevious=structuredClone(previous);delete historicalPrevious.guide!.generation.scenarioOriginals
  const historicalJob=s.jobs.start('matchup-revise',s.project.id,'historical-without-originals')
  child=new AiAnalysisWork(join(s.folder,'historical-no-originals'),s.jobs,historicalJob.id,new AbortController().signal,{kind:historicalJob.kind,args:[],guideVersion:1})
  const rebuiltStages:string[]=[]
  const rebuilt=await generateDeepGuide({packet:nextPacket,config,work:child,previous:historicalPrevious,revision:true,request:'Ricontrolla la guida storica senza originali.',runner:async prompt=>{
   const stage=stageOf(prompt);rebuiltStages.push(stage)
   if(stage==='plan')return planV22()
   if(stage.startsWith('scenarios-'))return version===26?initialV26(stage):initialV24(stage)
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(rebuiltStages[0]).toBe('plan');expect(rebuiltStages).not.toContain('revision');assertGuideIntegrity(rebuilt)
  expect(rebuilt.generation.scenarioOriginals?.cases).toHaveLength(2)
  expect(historicalPrevious.guide!.generation.scenarioOriginals).toBeUndefined()
 }finally{child?.close();s.close()}
},20000)

it('recovers three invalid native repairs with schema feedback and consumes the same sixteen-call ledger across reopen',async()=>{
 const s=setup(),p=packetV24();let patches=0
 const runner=async(prompt:string)=>{
  const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
  if(stage==='plan')return planV22();if(stage.startsWith('scenarios-'))return initialV24(stage)
  if(stage==='review-scenarios-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic correction.',correction:'Repair condition.',sourceIds:[],proposedActions:[]}]}
  if(stage.startsWith('repair-scenarios-delta')){
   expect(data).toHaveProperty('nativeSchemaFeedback');if(patches)expect(data.previousNativeRepairFailure.raw.cases).toHaveLength(1)
   const bad=patches++<3
   const value={cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:bad?'replace':'add',path:bad?'/missing':'/assumptions/-',valueJson:'"Synthetic repaired condition."'}]})),claims:[],changeSummary:'Synthetic condition repaired.'}
   return value
  }
  return stage.startsWith('prose')?proseV14():reviewed
 }
 try{
  // Emulate the former two-failure policy with the same global sixteen-call ceiling.
  const run=s.work.run.bind(s.work)
  s.work.run=((kind:any,prompt:any,config:any,execute:any,cache:any)=>run(kind,prompt,config,execute,cache,{maximumStructuralFailures:2})) as typeof s.work.run
  await expect(generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner})).rejects.toThrow('assente')
  const count=[...s.work.archive.values('guide-attempt-start')].length
  s.work.close();s.jobs.suspend(s.job.id,'Old structural ceiling','failure');s.jobs.resume(s.job.id)
  const resumed=new AiAnalysisWork(join(s.folder,'job'),s.jobs,s.job.id,new AbortController().signal,{kind:s.job.kind,args:[],guideVersion:1})
  let guide:MatchupGuide
  try{guide=await generateDeepGuide({packet:p,config,work:resumed,request:'Guida',runner})}finally{resumed.close()}
  expect(guide.generation.attempts.length).toBeGreaterThan(count);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16)
  expect(guide.generation.attempts.filter(a=>a.stage==='plan')).toHaveLength(1)
  expect(guide.generation.attempts.filter(a=>a.stage==='review-scenarios-1')).toHaveLength(1)
  expect(patches).toBe(4);expect(guide.review.verdict).toBe('pass')
 }finally{s.close()}
},20000)

it('recovers a cached structural rebuild with only the final two calls left without buying another constructor or critic',async()=>{
 const s=setup(),p=packetV24(),seen:string[]=[]
 const runner=async(prompt:string)=>{
  const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
  if(stage==='plan')return planV22();if(stage==='scenarios-2')return incompleteV22('scenario-2')
  if(stage==='scenarios-2-rebuild')return packScenarioOutput(nativeV21('scenario-2'),true,true,true)
  if(stage.startsWith('scenarios-'))return initialV24(stage)
  if(stage==='review-1')return {...reviewed,verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic final defect.',correction:'Repair.',sourceIds:[],proposedActions:[]}]}
  if(stage==='repair-final-delta')return {draftHash:data.draftHash,cases:data.nativeCases.map((c:any)=>({id:c.id,baseHash:c.baseHash,operations:[{op:'add',path:'/assumptions/-',valueJson:'"Synthetic final repaired condition."'}]})),claims:[],chapterPatches:[],exercisePatches:[],limitations:data.draft.limitations,changeSummary:'Repaired.'}
  if(stage==='review-2')return {...reviewed,revalidatedIds:[...data.draft.chapters,...data.draft.scenarios,...data.draft.exercises].map((v:any)=>v.id)}
  return stage.startsWith('prose')?proseV14():reviewed
 }
 try{
  const run=s.work.run.bind(s.work)
  s.work.run=((kind:any,prompt:string,config:any,execute:any,cache:any,retry:any)=>prompt.includes('FASE: repair-final-delta\n')?Promise.reject(new AiFailure('token-budget','Synthetic old local planning stop')):run(kind,prompt,config,execute,cache,retry)) as typeof s.work.run
  await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:9,request:'Guida',runner})).rejects.toThrow('Synthetic old local planning stop')
  expect([...s.work.archive.values('guide-attempt-start')]).toHaveLength(7)
  s.work.close();s.jobs.suspend(s.job.id,'Old planning stop','failure');s.jobs.resume(s.job.id)
  const resumed=new AiAnalysisWork(join(s.folder,'job'),s.jobs,s.job.id,new AbortController().signal,{kind:s.job.kind,args:[],guideVersion:1})
  try{
   await expect(generateDeepGuide({packet:p,config,work:resumed,attemptLimit:8,request:'Guida',runner})).rejects.toThrow('Budget insufficiente')
   expect([...resumed.archive.values('guide-attempt-start')]).toHaveLength(7)
   const guide=await generateDeepGuide({packet:p,config,work:resumed,attemptLimit:9,request:'Guida',runner});expect(guide.generation.attempts).toHaveLength(9);expect(guide.review.verdict).toBe('pass')
  }finally{resumed.close()}
  expect(seen.filter(v=>v==='scenarios-2-rebuild')).toHaveLength(1);expect(seen.filter(v=>v==='review-1')).toHaveLength(1)
 }finally{s.close()}
},20000)

it('reserves split scenario reviews before retries and completes v23 gates after one diagnosed timeout',async()=>{
 const s=setup(),p=packetV23(),seen:string[]=[]
 const details={timeoutMs:960000,elapsedMs:960001,stdoutBytes:250,lastEventType:'turn.started',lastEventAt:'2026-10-31T00:00:00.000Z',completedTurns:0,completedItems:0,resultFilePresent:false}
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,_schema,_signal,_summary,execution)=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   expect(execution?.timeoutMs).toBeGreaterThanOrEqual(600000);expect(execution?.timeoutMs).toBeLessThanOrEqual(1200000)
   if(stage==='plan')return planV22()
   if(stage==='scenarios-1'&&seen.filter(v=>v===stage).length===1)throw new AiFailure('timeout','Synthetic local deadline.',undefined,undefined,undefined,details)
   if(stage.startsWith('scenarios-')){
    if(stage==='scenarios-1')expect(data.previousTimeouts).toEqual([{sequence:2,message:'Synthetic local deadline.',executionDetails:details}])
    const raw=nativeV21(stage==='scenarios-1'?'scenario-1':'scenario-2');delete raw.scenarios[0].opening;return packScenarioOutput(raw,true,true,true)
   }
   if(stage.startsWith('prose'))return proseV14()
   return reviewed
  }})
  expect(guide.generation.attempts).toHaveLength(7);assertGuideReport({...p.basis,guide})
  expect(s.work.archive.value<any>('guide-schedule','initial')).toMatchObject({minimum:7,scenarioReviewsAtLeast:2})
  const budgets=[...s.work.archive.values<any>('guide-execution-budget')].map(v=>v.value)
  expect(budgets.map(v=>v.reservedCalls).slice(0,4)).toEqual([6,5,5,4])
  expect(s.work.archive.value<any>('guide-attempt-failure','002').executionDetails).toEqual(details)
  expect(s.work.archive.value<any>('guide-execution-budget','003').timeoutHistory).toHaveLength(1)
 }finally{s.close()}
})

it('stops a second v23 construction retry before spending the split-review reserve',async()=>{
 const s=setup(),p=packetV23(),seen:string[]=[]
 try{
  await expect(generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt);seen.push(stage);if(stage==='plan')return planV22()
   throw new AiFailure('timeout','Synthetic timeout.')
  }})).rejects.toThrow('restano 5 chiamate, ma ne servono almeno 6')
  expect(seen).toEqual(['plan','scenarios-1','scenarios-1']);expect(s.work.archive.value('guide','validated')).toBeUndefined()
 }finally{s.close()}
})

it('rebuilds a v23 case after its first structural failure while preserving the split-review reserve',async()=>{
 const s=setup(),p=packetV23(),seen:string[]=[]
 try{
  const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
   const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
   if(stage==='plan')return planV22()
   if(stage==='scenarios-1')return incompleteV22('scenario-1')
   if(stage==='scenarios-1-rebuild'){expect(data.failureHistory).toHaveLength(1);expect(data.previousFailedResponse).toEqual(incompleteV22('scenario-1'));return packScenarioOutput(nativeV21('scenario-1'),true,true,true)}
   if(stage==='scenarios-2'){const raw=nativeV21('scenario-2');delete raw.scenarios[0].opening;return packScenarioOutput(raw,true,true,true)}
   return stage.startsWith('prose')?proseV14():reviewed
  }})
  expect(seen).toHaveLength(7);expect(seen.filter(v=>v==='scenarios-1')).toHaveLength(1)
  expect(s.work.archive.value<any>('guide-case-rebuild','scenario-1')).toMatchObject({origin:'automatic-after-first-structural-failure',remainingCalls:6,reservedCalls:5,maximumCalls:1})
  assertGuideReport({...p.basis,guide})
 }finally{s.close()}
})

it('rejects incomplete v23 removal coverage including Energy without manufacturing witnesses',()=>{
 const s=compileGuideTactics(projectGuideLedger(nativeV21('scenario-1'),packetV23())).scenarios[0]
 const minimum=s.replyComparison!.options[0];s.replyComparison!.minimumReplyId=minimum.id
 minimum.requiredCards=[{printId:'e',count:1,access:'An effect attaches this additional Energy.'},{printId:'b',count:1,access:'Played from hand.'}]
 s.replyComparison!.omissionTests=[];const before=JSON.stringify(s)
 expect(()=>deriveOmissionWitnesses(s,true)).toThrow('prove mancanti=["e","b"]')
 expect(JSON.stringify(s)).toBe(before)
 s.replyComparison!.omissionTests=[{printId:'e',witnessReplyId:'absent',reason:'Incomplete witness.',remainingDamage:0},{printId:'b',witnessReplyId:null,reason:'Synthetic zero exclusion.',remainingDamage:0}]
 expect(()=>deriveOmissionWitnesses(s,true)).toThrow('ramo testimone absent assente')
 const prompt=causalInstructions('scenarios-1',true,true,true,true,true,true,true,true,true,true,true,true)
 expect(prompt).toContain('CHECKLIST DI RIMOZIONE v23');expect(prompt).toContain('anche se il tipo è Energy')
})

it('rebuilds one failed v22 case automatically and completes all gates within eight calls',async()=>{
  const s=setup(),p=packetV22(),seen:string[]=[]
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));seen.push(stage)
      if(stage==='plan')return planV22()
      if(stage==='scenarios-1')return incompleteV22('scenario-1')
      if(stage==='scenarios-1-rebuild'){
        expect(data.failureHistory).toHaveLength(2);expect(data.previousFailedResponse).toEqual(incompleteV22('scenario-1'));expect(data).not.toHaveProperty('openingAllocation')
        return packScenarioOutput(nativeV21('scenario-1'),true,true,true)
      }
      if(stage==='scenarios-2'){const raw=nativeV21('scenario-2');delete raw.scenarios[0].opening;return packScenarioOutput(raw,true,true,true)}
      if(stage.startsWith('prose'))return proseV14()
      return reviewed
    }})
    expect(seen).toHaveLength(8);expect(seen.filter(v=>v.endsWith('rebuild'))).toHaveLength(1)
    expect(guide.generation.attempts.filter(a=>a.stage.startsWith('review'))).toHaveLength(2)
    expect(s.work.archive.value<any>('guide-rebuilt-opening','scenario-1').origin).toBe('explicit-ai-rebuild')
    assertGuideReport({...p.basis,guide})
  }finally{s.close()}
})

it('never retries the single v22 rebuild and skips it when future gates would not fit',async()=>{
  for(const limit of [7,8]){
    const s=setup(),p=packetV22(),seen:string[]=[]
    try{
      await expect(generateDeepGuide({packet:p,config,work:s.work,attemptLimit:limit,request:'Guida',runner:async prompt=>{
        const stage=stageOf(prompt);seen.push(stage)
        if(stage==='plan')return planV22()
        return incompleteV22('scenario-1',!stage.endsWith('rebuild'))
      }})).rejects.toThrow('COSTRUZIONE NON COMPLETATA')
      expect(seen.filter(v=>v.endsWith('rebuild'))).toHaveLength(limit===8?1:0)
      expect(seen).toHaveLength(limit===8?4:3)
      if(limit===7)expect(s.work.archive.value<any>('guide-case-rebuild-skip','scenario-1').requiredCalls).toBe(5)
    }finally{s.close()}
  }
})

it('derives v21 proof indices only from an explicit receipt on an actual access event',()=>{
  const p=packetV21(),raw=nativeV21('scenario-1'),s=raw.scenarios[0],access=s.replyComparison.options.find((o:any)=>o.id===s.replyComparison.coverage.access),before=JSON.stringify(raw)
  const c=compileGuideTactics(projectGuideLedger(raw,p)),projected=c.scenarios[0].replyComparison!.options.find(o=>o.id===access.id)!
  expect((projected.accessProof as any).eventIndex).toBe(0);expect(checkGuide(c,p,false).errors).toEqual([]);expect(JSON.stringify(raw)).toBe(before)
  const instructions=causalInstructions('scenarios-1',true,true,true,true,true,true,true,true,true,true)
  expect(instructions).not.toContain('access ha accessProof NON nullo');expect(instructions).not.toContain('con accessProof={sourceIds,reason}')
  const absent=structuredClone(raw);for(const e of absent.scenarios[0].replyComparison.options.find((o:any)=>o.id===access.id).turns.opponent.events)e.accessReceipt=null
  expect(()=>projectGuideLedger(absent,p)).toThrow('esattamente una accessReceipt')
  const fake=structuredClone(raw),e=fake.scenarios[0].replyComparison.options.find((o:any)=>o.id===access.id).turns.opponent.events[0]
  e.moves=[];e.energyRoutes=[];expect(()=>projectGuideLedger(fake,p)).toThrow('accesso aggiuntivo')
  const duplicate=structuredClone(raw),events=duplicate.scenarios[0].replyComparison.options.find((o:any)=>o.id===access.id).turns.opponent.events
  events.push(structuredClone(events[0]));expect(()=>projectGuideLedger(duplicate,p)).toThrow('esattamente una accessReceipt')
})

it('rejects drawing a uniquely reserved prize without moving it or replacing the declared card',()=>{
  const p=packetV21(),raw=nativeV21('scenario-1');p.ourList.cards.find(c=>c.printId==='e')!.count--
  p.ourList.cards.push({printId:'reserved-trainer',name:'Reserved Trainer',count:1})
  p.sources.push(guideSource('card:reserved-trainer','card','Reserved Trainer',null,JSON.stringify({printId:'reserved-trainer',name:'Reserved Trainer',category:'Trainer',gameplay:{effect:'Synthetic supporting card, not a card rule.'}})))
  raw.scenarios[0].opening.ours.prizes[0]='reserved-trainer';raw.scenarios[0].turns.ours.draw='reserved-trainer'
  const before=JSON.stringify(raw)
  expect(()=>projectGuideLedger(raw,p)).toThrow('PESCA/RICERCA IMPOSSIBILE')
  expect(()=>projectGuideLedger(raw,p)).toThrow('nei Premi, non nel mazzo')
  expect(JSON.stringify(raw)).toBe(before)
})

it('keeps v21 native receipts, allocated openings and review provenance through both critics and report validation',async()=>{
  const s=setup(),p=packetV21()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt),data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
      if(stage==='plan')return {...plan,opponentListId:'opponent-1',initialOpenings:nativeV21().scenarios.map((s:any,i:number)=>({id:'scenario-'+(i+1),opening:s.opening}))}
      if(stage.startsWith('scenarios-')){const raw=nativeV21(stage.replace('scenarios-','scenario-'));expect(data.openingAllocation.remainingDeck.ours.reduce((n:number,c:any)=>n+c.count,0)).toBe(47);delete raw.scenarios[0].opening;return packScenarioOutput(raw,true,true)}
      if(stage.startsWith('prose'))return proseV14()
      expect(prompt).toContain('CONTRATTO DEL CRITICO');expect(prompt).not.toContain('ACCESSO v16');expect(prompt).not.toContain('FORMATO v20')
      expect(data.reviewFacts).toHaveLength(2);expect(data.reviewFacts.every((f:any)=>f.nativeEnergyMoves===0&&f.projectedEnergyMoves>0)).toBe(true)
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6);assertGuideReport({...p.basis,guide})
    const access=guide.scenarios[0].replyComparison!.options.find(o=>o.id===guide.scenarios[0].replyComparison!.coverage!.access)!
    ;(access.accessProof as any).eventIndex=20;expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
    const schema=scenarioOutputSchema(boundGuideSchema(singleScenarioSchemaV21('scenario-1',true),p,'opponent-1'),true,true)
    expect(schema.properties.scenarios.items.properties).not.toHaveProperty('opening')
    expect(schema.properties.scenarios.items.properties.replyComparison.properties.replies.properties.access.properties).not.toHaveProperty('accessProof')
    assertGuideSchemaBudget(compactGuideSchema(boundGuideSchema(guidePlanSchemaV21,p)))
  }finally{s.close()}
})

it('rejects all unused table rows together with indices and contents without deleting or executing them',()=>{
  const raw=packScenarioOutput(nativeV19('scenario-1'),true)
  raw.scenarios[0].ourLineEvents.push(structuredClone(raw.scenarios[0].ourLineEvents[0]))
  raw.scenarios[0].energyTable.push({s:'ours',p:'e',n:1,l:['prizes','hand'],h:null,i:['rules'],u:null})
  const before=JSON.stringify(raw);let message=''
  try{expandScenarioOutput(raw,true)}catch(e){message=String(e)}
  expect(message).toContain('ourLineEvents');expect(message).toContain('energyTable');expect(message).toContain('"index":')
  expect(message).toContain('"path":["prizes","hand"]');expect(message).toContain('requiredUse')
  expect(JSON.stringify(raw)).toBe(before)
})

it('roundtrips v20 inline moves and energy without extra reference tables or weaker native constraints',()=>{
  const raw=nativeV19('scenario-1')
  // Codec-only fixture: retain every declared atom, independently of legality.
  raw.scenarios[0].turns.next.attack.moves.push({side:'ours',printId:'a',count:1,from:'hand',to:'bench'})
  const packed=packScenarioOutput(raw,true,true)
  expect(packed.scenarioEncoding).toBe('pg-scenario-tables-3')
  expect(packed.scenarios[0]).not.toHaveProperty('moveTable');expect(packed.scenarios[0]).not.toHaveProperty('energyTable')
  const event=['ourSetupEvents','opponentSetupEvents','ourLineEvents','opponentLineEvents','ourFinalAttacks'].flatMap(k=>packed.scenarios[0][k]).find((e:any)=>e.m.length)
  expect(typeof event.m[0]).toBe('object')
  expect(JSON.stringify(expandScenarioOutput(packed,true,'pg-scenario-tables-3'))).toBe(JSON.stringify(raw))
  const native=boundGuideSchema(singleScenarioSchemaV19('scenario-1'),packetV19(),'opponent-1'),schema=scenarioOutputSchema(native,true,true)
  expect(schema.properties.scenarios.items.required).not.toContain('moveTable');assertGuideSchemaBudget(compactGuideSchema(schema))
  assertNativeScenarioSchema(packed,schema)
  assertNativeScenarioSchema(expandScenarioOutput(packed,true),native)
  event.m=[999]
  expect(()=>assertNativeScenarioSchema(packed,schema)).toThrow()
  const instructions=causalInstructions('scenarios-1',true,true,true,true,true,true,true,true,true)
  expect(instructions).toContain('pg-scenario-tables-3');expect(instructions).not.toContain('m=[indici moveTable]')
})

it('reports every dangling reference and unused declaration before expansion without changing the output',()=>{
  const raw=packScenarioOutput(nativeV19('scenario-1'),true),s=raw.scenarios[0]
  s.turns.ours.events.push(999);s.turns.opponent.events.push(998)
  s.energyTable.push({s:'ours',p:'e',n:1,l:['prizes','hand'],h:null,i:['rules'],u:null})
  const before=JSON.stringify(raw);let error=''
  try{expandScenarioOutput(raw,true)}catch(e){error=String(e)}
  expect(error).toContain('ourLineEvents[999]');expect(error).toContain('opponentLineEvents[998]')
  expect(error).toContain('energyTable');expect(error).toContain('prizes');expect(error).toContain('turns.ours.events')
  expect(JSON.stringify(raw)).toBe(before)
})

it('validates complete v20 audits before publishing them and persists both independent reviews',async()=>{
  const s=setup(),p=packetV19();p.basis.promptVersion='matchup-guide-20';p.basis.dependencyHash=packetHash(p)
  try{
    const bad=nativeV19('scenario-1');bad.scenarios[0].turns.ours.tactical.cards=[];bad.scenarios[0].turns.next.tactical.cards=[]
    const original=JSON.stringify(bad);let error=''
    try{projectGuideLedger(bad,p)}catch(e){error=String(e)}
    expect(error).toContain('FRONTIERA COMPLETA');expect(error).toContain('main|');expect(JSON.stringify(bad)).toBe(original)
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'||stage==='scenarios-2')return packScenarioOutput(nativeV19(stage.replace('scenarios-','scenario-')),true,true)
      if(stage.startsWith('prose'))return proseV14()
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6);expect(guide.generation.attempts.filter(a=>a.stage.startsWith('review'))).toHaveLength(2)
    assertGuideReport({...p.basis,guide});(guide.scenarios[0] as any).turns.ours.tactical.cards=[]
    expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})

it('keeps v19 promotion reasons in compact review data, both criticisms and persistent report validation',async()=>{
  const s=setup(),p=packetV19()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'||stage==='scenarios-2')return packScenarioOutput(nativeV19(stage.replace('scenarios-','scenario-')),true)
      if(stage.startsWith('prose'))return proseV14()
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
      expect(data.draft.scenarios.every((s:any)=>s.tacticalAudit.every((r:any)=>Array.isArray(r.promotions)))).toBe(true)
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6);assertGuideReport({...p.basis,guide})
    const native=nativeV19('scenario-1'),bad=structuredClone(native);delete bad.scenarios[0].turns.ours.tactical.promotions
    expect(()=>projectGuideLedger(bad,p)).toThrow('promotions obbligatorio')
    const schema=scenarioOutputSchema(boundGuideSchema(singleScenarioSchemaV19('scenario-1'),p,'opponent-1'),true)
    expect(schema.properties.scenarios.items.properties.auditTable.items.required).toContain('promotions')
    guide.scenarios[0].tacticalAudit!.pop();expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})

it('keeps v18 setup, line and final-attack tables separate and preserves the complete native output',()=>{
  const raw=nativeV17('scenario-1'),packed=packScenarioOutput(raw,true),s=packed.scenarios[0]
  expect(packed.scenarioEncoding).toBe('pg-scenario-tables-2')
  expect(s).not.toHaveProperty('eventTable')
  expect(JSON.stringify(expandScenarioOutput(packed,true,'pg-scenario-tables-2'))).toBe(JSON.stringify(raw))
  const native=boundGuideSchema(singleScenarioSchemaV16('scenario-1'),packetV18(),'opponent-1')
  assertNativeScenarioSchema(expandScenarioOutput(packed,true),native)
  const schema=scenarioOutputSchema(native,true),props=schema.properties.scenarios.items.properties
  for(const name of ['ourSetupEvents','opponentSetupEvents'])for(const v of props[name].items.anyOf??[props[name].items]){expect(v.properties).not.toHaveProperty('x');expect(v.properties).not.toHaveProperty('y')}
  for(const name of ['ourLineEvents','opponentLineEvents','ourFinalAttacks'])for(const v of props[name].items.anyOf??[props[name].items]){expect(v.required).toContain('x');expect(v.required).toContain('y')}
  expect(props.ourFinalAttacks.items.properties.a.anyOf.every((v:any)=>v.type!=='null')).toBe(true)
  assertGuideSchemaBudget(compactGuideSchema(schema))
  const badSetup=structuredClone(packed);badSetup.scenarios[0].ourSetupEvents.push({...badSetup.scenarios[0].ourLineEvents[0],x:'other'});badSetup.scenarios[0].setupRounds[0].ours.events=[0]
  expect(()=>expandScenarioOutput(badSetup,true)).toThrow('incompatibili con il contesto')
  const badLine=structuredClone(packed);delete badLine.scenarios[0].ourLineEvents[0].x
  expect(()=>expandScenarioOutput(badLine,true)).toThrow('incompatibili con il contesto')
  const badFinal=structuredClone(packed);badFinal.scenarios[0].ourFinalAttacks[0].a=null
  expect(()=>expandScenarioOutput(badFinal,true)).toThrow('attacco finale')
  expect(()=>expandScenarioOutput(packed,true,'pg-scenario-tables-1')).toThrow('codifica richiesta')
})

it('recognizes incomplete registers and valid-ID placeholders without rejecting legitimate defensive play or source limitations',()=>{
  for(const text of ['Non ho completato il registro e i rami richiesti.','Non ho completato lo scenario richiesto.','Il caso consegnato è incompleto.','Il registro presentato richiede correzione prima della validazione.','Il registro non supera la verifica strategica.']){
    const raw=nativeV17('scenario-1');raw.limitations=[text]
    expect(()=>assertConstructedScenarios(raw)).toThrow('COSTRUZIONE NON COMPLETATA')
  }
  const bad=nativeV17('scenario-1');bad.scenarios[0].replyComparison.options[0].outcome='Non costruito.'
  expect(()=>assertConstructedScenarios(bad)).toThrow('Dichiarazione originale: Non costruito.')
  const empty=nativeV17('scenario-1');empty.scenarios[0].replyComparison.options.find((o:any)=>o.id==='access').turns.opponent.events=[]
  expect(()=>assertConstructedScenarios(empty)).toThrow('COSTRUZIONE NON COMPLETATA')
  const legal=nativeV17('scenario-1');legal.limitations=['Il caso non stima la frequenza delle pescate.','Non sono disponibili dati di winrate del matchup.','Il caso non è certificato competitivo.']
  legal.scenarios[0].replyComparison.options[0].outcome='Non attacca: conserva il motore e prepara il successore. Nessun KO raggiungibile nel turno.'
  expect(()=>assertConstructedScenarios(legal)).not.toThrow()
})

it('persists v18 only after a real-format placeholder retry, every native gate and both independent reviews',async()=>{
  const s=setup(),p=packetV18();let invalid=true
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'&&invalid){invalid=false;const raw=nativeV17('scenario-1');raw.limitations=['Non ho completato il registro e i rami richiesti.'];return packScenarioOutput(raw,true)}
      if(stage==='scenarios-1'||stage==='scenarios-2'){
        if(stage==='scenarios-1'){const d=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(d.previousInvalid.message).toContain('COSTRUZIONE NON COMPLETATA');expect(d.previousInvalid.raw.scenarioEncoding).toBe('pg-scenario-tables-2')}
        return packScenarioOutput(nativeV17(stage.replace('scenarios-','scenario-')),true)
      }
      if(stage.startsWith('prose'))return proseV14()
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(data.draft.scenarios).toHaveLength(2);return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(7);assertGuideReport({...p.basis,guide})
    expect(guide.scenarios[0]).not.toHaveProperty('ourSetupEvents')
    guide.scenarios[0].tacticalAudit!.pop();expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})
it('roundtrips v17 scenario tables exactly, without sharing mutable branch data or relaxing native schema constraints',()=>{
  const raw=nativeV17('scenario-1'),packed=packScenarioOutput(raw),p=packetV17()
  expect(JSON.stringify(expandScenarioOutput(packed,true))).toBe(JSON.stringify(raw))
  expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(raw).length)
  const native=boundGuideSchema(singleScenarioSchemaV16('scenario-1'),p,'opponent-1')
  assertNativeScenarioSchema(expandScenarioOutput(packed,true),native)
  assertGuideSchemaBudget(compactGuideSchema(scenarioOutputSchema(native)))
  const decoded=expandScenarioOutput(packed,true),c=decoded.scenarios[0]
  c.replyComparison.options[0].turns.opponent.events[0].description='Branch-only mutation'
  expect(c.turns.opponent.events[0].description).not.toBe('Branch-only mutation')
  const bad=structuredClone(packed);bad.scenarios[0].turns.next.attack=9999
  expect(()=>expandScenarioOutput(bad,true)).toThrow('riferimento eventTable')
  const unused=structuredClone(packed);unused.scenarios[0].moveTable.push({})
  expect(()=>expandScenarioOutput(unused,true)).toThrow('non referenziati')
  const ambiguous=structuredClone(packed);ambiguous.scenarios[0].eventTable[0].description='Hidden second description'
  expect(()=>expandScenarioOutput(ambiguous,true)).toThrow('chiavi codificate ambigue')
  const missing=structuredClone(packed);delete missing.scenarios[0].replyComparison.replies.access
  expect(()=>expandScenarioOutput(missing,true)).toThrow('tre ruoli')
  const wrongOrder=structuredClone(packed);wrongOrder.scenarios[0].replyComparison.optionOrder=['direct','direct','direct']
  expect(()=>expandScenarioOutput(wrongOrder,true)).toThrow('ordine dei rami')
  const wrongCard=expandScenarioOutput(packed,true);wrongCard.scenarios[0].turns.ours.draw='absent'
  expect(()=>assertNativeScenarioSchema(wrongCard,native)).toThrow('fuori enum')
  const wrongSide=expandScenarioOutput(packed,true);wrongSide.scenarios[0].turns.ours.events[0].attack={printId:'b',attackName:'B only'}
  expect(()=>assertNativeScenarioSchema(wrongSide,native)).toThrow('schema originario')
  expect(()=>assertNativeScenarioSchema({x:1},{type:'object',unknownConstraint:true})).toThrow('non supportato')
})

it('recognizes placeholder refusal before secondary access errors and preserves all three role requirements',()=>{
  const raw=rawV16('scenario-1')
  raw.limitations=['Non ho completato il caso richiesto.']
  expect(()=>assertConstructedScenarios(raw)).toThrow('COSTRUZIONE NON COMPLETATA')
  const bad=rawV16('scenario-1');bad.scenarios[0].replyComparison.options[0].id='non-costruita'
  expect(()=>assertConstructedScenarios(bad)).toThrow('ricostruisci un caso più semplice')
  const duplicate=rawV16('scenario-1');duplicate.scenarios[0].replyComparison.options[0].id='access'
  expect(()=>assertConstructedScenarios(duplicate)).toThrow('ID duplicati')
  const schema=scenarioOutputSchema(boundGuideSchema(singleScenarioSchemaV16('scenario-1'),packetV17(),'opponent-1'))
  expect(schema.properties.scenarios.items.properties.replyComparison.properties.replies.required).toEqual(['direct','access','defend','others'])
  expect(schema.properties.scenarios.items.properties.replyComparison.properties.replies.properties.access.properties.accessProof.type).toBe('object')
})

it('generates v17 through a placeholder retry, checks every expanded constraint and persists only after both critics',async()=>{
  const s=setup(),p=packetV17();let placeholder=true
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'&&placeholder){placeholder=false;const raw=nativeV17('scenario-1');raw.limitations=['Non ho completato il caso richiesto.'];return packScenarioOutput(raw)}
      if(stage==='scenarios-1'||stage==='scenarios-2'){
        if(stage==='scenarios-1'){const d=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(d.previousInvalid.message).toContain('COSTRUZIONE NON COMPLETATA');expect(d.previousInvalid.raw.scenarioEncoding).toBe('pg-scenario-tables-1')}
        return packScenarioOutput(nativeV17(stage.replace('scenarios-','scenario-')))
      }
      if(stage.startsWith('prose'))return proseV14()
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(data.draft.scenarios).toHaveLength(2);return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(7);assertGuideReport({...p.basis,guide})
    expect([...s.work.archive.values('guide-expanded-response')]).toHaveLength(2)
    expect(guide.scenarios[0]).not.toHaveProperty('eventTable')
    guide.scenarios[0].tacticalAudit!.pop();expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})

it('keeps native v16 audits, access receipts and all gates through independent reviews and report reload',async()=>{
  const s=setup(),p=packetV16()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'||stage==='scenarios-2')return rawV16(stage.replace('scenarios-','scenario-'))
      if(stage.startsWith('prose'))return proseV14()
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(data.tacticalFrontier).toHaveLength(2)
      expect(data.draft.scenarios.every((v:any)=>v.tacticalAudit.length>0)).toBe(true);return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6);assertGuideReport({...p.basis,guide})
    guide.scenarios[0].tacticalAudit!.pop();expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})

it('requires native audit coverage and real extra access events, including full-prefix reuse only',()=>{
  const p=packetV16(),raw=rawV16('scenario-1')
  expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p,false).errors).toEqual([])
  const missing=structuredClone(raw);delete missing.scenarios[0].turns.opponent.tactical
  expect(()=>projectGuideLedger(missing,p)).toThrow('audit obbligatorio')
  const incomplete=structuredClone(raw);incomplete.scenarios[0].replyComparison.options[0].forkAtEvent--
  expect(()=>projectGuideLedger(incomplete,p)).toThrow('audit del prefisso')
  const badAccess=structuredClone(raw),o=badAccess.scenarios[0].replyComparison.options.find((o:any)=>o.id==='access')
  o.accessProof.eventIndex=1;expect(()=>projectGuideLedger(badAccess,p)).toThrow('accessProof.eventIndex')
  const omitted=structuredClone(raw);omitted.scenarios[0].turns.next.tactical.cards=[]
  expect(checkGuide(compileGuideTactics(projectGuideLedger(omitted,p)),p,false).errors.some(e=>e.includes('accesso/sviluppo omesso'))).toBe(true)
  const schema=singleScenarioSchemaV16('scenario-1').properties.scenarios.items
  expect(schema.properties).not.toHaveProperty('tacticalAudit');expect(schema.properties).not.toHaveProperty('retreatCosts')
  expect(schema.properties.turns.properties.ours.required).toContain('tactical')
  const instructions=causalInstructions('scenarios-1',true,true,true,true,true)
  expect(instructions).not.toContain('retreatCosts usa costo stampato')
  expect(instructions).not.toContain('ogni evento ha retreatCostId=null')
  expect(instructions).not.toContain('tacticalAudit copre OGNI')
})

it('binds retreat cost to the unique outgoing Active and never guesses cross references',()=>{
  const s=rawV16('scenario-1').scenarios[0],event={kind:'retreat',description:'Synthetic retreat',retreat:{adjustments:[]},moves:[
    {side:'ours',printId:'outgoing',count:1,from:'active',to:'bench'},
    {side:'ours',printId:'incoming',count:1,from:'bench',to:'active'}],energyRoutes:[]}
  s.turns.ours.events.unshift(event);prepareNativeDecisions(s)
  expect(s.retreatCosts).toEqual([{id:'retreat-1',context:'Synthetic retreat',side:'ours',printId:'outgoing',adjustments:[]}])
  expect(s.turns.ours.events[0].retreatCostId).toBe('retreat-1')
  const ambiguous=structuredClone(s);ambiguous.turns.ours.events[0].moves.push(structuredClone(event.moves[0]))
  expect(()=>prepareNativeDecisions(ambiguous)).toThrow('un solo Attivo uscente')
  const nonRetreat=structuredClone(s);nonRetreat.turns.ours.events[0].kind='effect'
  expect(()=>prepareNativeDecisions(nonRetreat)).toThrow('evento non retreat')
  const noProof=structuredClone(s);delete noProof.turns.ours.events[0].retreat
  expect(()=>prepareNativeDecisions(noProof)).toThrow('ritirata incompleta')
})

it('retains v15 tactical coverage across a timeout retry, independent reviews and persistence',async()=>{
  const s=setup(),p=packetV15();let timedOut=false
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      assertGuideSchemaBudget(schema);const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'){if(!timedOut){timedOut=true;throw new AiFailure('timeout','Synthetic timeout')};return rawV15('scenario-1')}
      if(stage==='scenarios-2')return rawV15('scenario-2')
      if(stage.startsWith('prose'))return proseV14()
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));expect(data.tacticalFrontier).toHaveLength(2)
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(7);expect(guide.scenarios.every(s=>s.tacticalAudit!.length>0)).toBe(true)
    assertGuideReport({...p.basis,guide})
    guide.scenarios[0].tacticalAudit!.pop();expect(()=>assertGuideReport({...p.basis,guide})).toThrow()
  }finally{s.close()}
})

it('derives effective v15 HP with sourced modifiers and rejects absent sources or knocked-out annotations',()=>{
  const p=packetV15(),raw=rawV15('scenario-1'),r=raw.scenarios[0].positionAnnotations[0]
  r.damage=170;r.hpAdjustment={amount:20,sourceIds:['card:b']}
  expect(projectGuideLedger(raw,p).scenarios[0].state).toContain('10/180 PS')
  r.hpAdjustment.amount=0;expect(()=>projectGuideLedger(raw,p)).toThrow('Pokémon vivo')
  r.hpAdjustment={amount:20,sourceIds:['card:absent']};expect(()=>projectGuideLedger(raw,p)).toThrow('modificatore PS')
})
function proseV14():any{
  const c=contentV4();c.scenarios=[];c.claims=[]
  for(const chapter of c.chapters)if(chapter.dependsOn.includes('s1'))chapter.dependsOn=['scenario-1']
  for(const e of c.exercises)e.scenarioIds=['scenario-1'];return c
}

it('accepts typed attack damage after retreat but retains retreat cost and exact attack checks in v14',()=>{
  const p=packetV14(),raw=rawV14(),calc=raw.scenarios[0].calculations[0]
  calc.label='Practice dopo la ritirata';calc.purpose='damage';calc.attack={printId:'a',attackName:'Practice'}
  expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p).errors).toEqual([])
  calc.purpose='other';calc.attack=null
  expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p).errors.join('\n')).toContain('ritirata')
  calc.purpose='damage';calc.attack={printId:'a',attackName:'invented'}
  expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p).errors.length).toBeGreaterThan(0)
})

it('plans v14 calls and persists a fully checked guide without changing completed cases',async()=>{
  const s=setup(),p=packetV14(),stages:string[]=[]
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      const stage=stageOf(prompt);stages.push(stage);assertGuideSchemaBudget(schema)
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
      expect(data.packet.basis.promptVersion).toBe('matchup-guide-14')
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage.startsWith('scenarios-'))return rawV14(stage==='scenarios-1'?'scenario-1':'scenario-2')
      if(stage.startsWith('prose')){expect(data.requestedChapterKinds).toEqual(guideChapterKinds);return proseV14()}
      return reviewed
    }})
    expect(stages).toEqual(['plan','scenarios-1','scenarios-2','review-scenarios-1','prose','review-1'])
    expect([...s.work.archive.values('guide-token-plan')]).toHaveLength(6)
    assertGuideReport({...p.basis,guide})
  }finally{s.close()}
})

it('reserves every remaining v14 gate and does not start with fewer than six calls',async()=>{
  const s=setup();let calls=0
  try{await expect(generateDeepGuide({packet:packetV14(),config,work:s.work,request:'Guida',attemptLimit:5,runner:async()=>{calls++;return {}}})).rejects.toThrow('Budget insufficiente');expect(calls).toBe(0)}finally{s.close()}
})

it('repairs only the assigned v14 case and repeats both criticisms within eight invocations',async()=>{
  const s=setup(),stages:string[]=[]
  try{
    const guide=await generateDeepGuide({packet:packetV14(),config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt);stages.push(stage)
      const data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage.startsWith('scenarios-'))return rawV14(stage==='scenarios-1'?'scenario-1':'scenario-2')
      if(stage==='review-scenarios-1')return {verdict:'revise',findings:[{targetId:'scenario-1',severity:'major',message:'Synthetic review only',sourceIds:['card:a'],correction:'Restate the same complete synthetic case'}],checks:['Synthetic fixture']}
      if(stage==='repair-scenarios'){expect(data.caseIds).toEqual(['scenario-1']);expect(data.draft.scenarios).toHaveLength(1);return rawV14('scenario-1')}
      if(stage.startsWith('prose'))return proseV14()
      return reviewed
    }})
    expect(stages).toEqual(['plan','scenarios-1','scenarios-2','review-scenarios-1','repair-scenarios','review-scenarios-2','prose','review-1'])
    expect(guide.scenarios[1]).toEqual(compileGuideTactics(projectGuideLedger(rawV14('scenario-2'),packetV14())).scenarios[0])
    assertGuideReport({...packetV14().basis,guide})
  }finally{s.close()}
})

it('retries an identical v14 prompt after timeout without overwriting immutable context or resetting calls',async()=>{
  const s=setup(),prompts:string[]=[];let timedOut=false
  try{
    const guide=await generateDeepGuide({packet:packetV14(),config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios-1'){
        prompts.push(prompt)
        if(!timedOut){timedOut=true;throw new AiFailure('timeout','Synthetic timeout, no external service')}
        return rawV14('scenario-1')
      }
      if(stage==='scenarios-2')return rawV14('scenario-2')
      if(stage.startsWith('prose'))return proseV14()
      return reviewed
    }})
    expect(prompts).toHaveLength(2);expect(prompts[0]).toBe(prompts[1])
    expect(guide.generation.attempts).toHaveLength(7)
    expect(guide.generation.attempts[1].status).toBe('failed')
    const plans=[...s.work.archive.values<any>('guide-token-plan')].map(v=>v.value)
    expect(plans[1].remainingCalls).toBe(7);expect(plans[2].remainingCalls).toBe(6)
    expect([...s.work.archive.values('guide-call-data')]).toHaveLength(6)
    assertGuideReport({...packetV14().basis,guide})
  }finally{s.close()}
})

it('keeps deck observations out of movements and consumption while covering the physically revealed copy',()=>{
  const p=packetV13(),raw=rawV13(),base=compileGuideTactics(projectGuideLedger(raw,p))
  const event=raw.scenarios[0].turns.opponent.events[0]
  event.deckObservations=[{side:'opponent',printId:'e',count:10,position:'bottom',sourceIds:['card:b']}]
  const projected=compileGuideTactics(projectGuideLedger(raw,p)),s=projected.scenarios[0]
  expect(checkGuide(projected,p).errors).toEqual([])
  expect(s.inventory).toEqual(base.scenarios[0].inventory)
  expect(s.setupDraws).toEqual(base.scenarios[0].setupDraws)
  expect(s.replyComparison!.options[0].requiredCards).toEqual(base.scenarios[0].replyComparison!.options[0].requiredCards)
  expect(s.resources.find(r=>r.side==='opponent'&&r.printId==='e')!.count).toBeGreaterThan(base.scenarios[0].resources.find(r=>r.side==='opponent'&&r.printId==='e')!.count)
  expect((s as any).lineEvents.map((e:any)=>({moves:e.moves,handAfter:e.handAfter}))).toEqual((base.scenarios[0] as any).lineEvents.map((e:any)=>({moves:e.moves,handAfter:e.handAfter})))
  expect(compileGuideTactics(projectGuideLedger(projected,p))).toEqual(projected)
  event.deckObservations[0].count=60;expect(()=>projectGuideLedger(raw,p)).toThrow('non dimostrata nel mazzo')
})

it('rejects same-zone pseudo-movements with a precise correction and excludes them in the v13 schema',()=>{
  const p=packetV13(),raw=rawV13(),event=raw.scenarios[0].turns.opponent.events[0]
  event.moves.push({side:'opponent',printId:'b',count:1,from:'deck',to:'deck'})
  expect(()=>projectGuideLedger(raw,p)).toThrow('deck→deck non è un trasferimento')
  expect(event.moves.at(-1).to).toBe('deck') // No automatic deletion of the model's data.
  event.moves.pop();event.energyRoutes.push({side:'opponent',printId:'e',count:1,path:['deck','deck'],attachment:null,hostPrintId:null,sourceIds:['rules']})
  expect(()=>projectGuideLedger(raw,p)).toThrow('due zone consecutive uguali')
  const bound:any=boundGuideSchema(singleScenarioSchemaV13('scenario-1'),p,'opponent-1')
  const alternatives=bound.properties.scenarios.items.properties.turns.properties.ours.properties.events.items.properties.moves.items.anyOf
  expect(alternatives).toHaveLength(20)
  for(const node of alternatives)expect(node.properties.to.enum).not.toContain(node.properties.from.enum[0])
  expect(assertGuideSchemaBudget(compactGuideSchema(bound)).enumValues).toBeLessThanOrEqual(1000)
})

it('uses the compact v13 schema with unchanged local, critic and persistence gates',async()=>{
  const s=setup(),p=packetV13()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      expect(assertGuideSchemaBudget(schema).enumValues).toBeLessThanOrEqual(1000)
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage.startsWith('scenarios-'))return rawV13(stage==='scenarios-1'?'scenario-1':'scenario-2')
      if(stage==='prose'){
        const c=contentV4();c.scenarios=[];c.claims=[]
        for(const chapter of c.chapters)if(chapter.dependsOn.includes('s1'))chapter.dependsOn=['scenario-1']
        for(const e of c.exercises)e.scenarioIds=['scenario-1'];return c
      }
      expect(prompt).toContain('REGISTRO v13');return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6);assertGuideReport({...p.basis,guide})
    expect([...s.work.archive.values('guide-schema-encoding')].length).toBe(6)
  }finally{s.close()}
})

it('covers intermediate and Basic board attacks and rejects unexecuted branch references without treating exclusions as certified',()=>{
  const p=packetV12(),raw=rawV12(),c=compileGuideTactics(projectGuideLedger(raw,p))
  expect(checkGuide(c,p).errors).toEqual([])
  expect(responseAttackCandidates(c.scenarios[0],p.sources)).toEqual([{printId:'b',attackName:'Practice'},{printId:'b',attackName:'B only'}])
  const review=(raw.scenarios[0].replyComparison as any).attackReview
  review.pop();expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p).errors.join('\n')).toContain('b / B only')
  review.push({printId:'b',attackName:'B only',replyId:'direct',reason:'False reference'})
  expect(checkGuide(compileGuideTactics(projectGuideLedger(raw,p)),p).errors.join('\n')).toContain('senza ramo che lo esegua')
  const extra=structuredClone(c.scenarios[0]) as any
  extra.inventory.push({side:'opponent',printId:'a',zone:'bench',count:1})
  expect(responseAttackCandidates(extra,p.sources)).toContainEqual({printId:'a',attackName:'Practice'})
  extra.inventory=extra.inventory.filter((r:any)=>r.printId!=='a'||r.side!=='opponent')
  extra.lineEvents=structuredClone(extra.lineEvents)
  const reply=extra.lineEvents.find((e:any)=>e.turn===extra.replyComparison.options[0].replyTurn)
  reply.moves.push({side:'opponent',printId:'b',count:1,from:'bench',to:'evolution'},{side:'opponent',printId:'a',count:1,from:'hand',to:'bench'})
  expect(responseAttackCandidates(extra,p.sources)).toContainEqual({printId:'a',attackName:'Practice'})
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
})

it('derives reduced damage from a complete named witness and retains both reduced-budget gates',()=>{
  const p=packetV12(),c=compileGuideTactics(projectGuideLedger(rawV12(),p)),s=c.scenarios[0],comparison=s.replyComparison!
  const witness=structuredClone(comparison.options[0]);witness.id='witness';witness.terms=[30];witness.multiplier=1;witness.damage=30;witness.reachesThreshold=false;witness.requiredCards=[]
  comparison.options.push(witness)
  comparison.omissionTests[0].witnessReplyId='witness'
  deriveOmissionWitnesses(s)
  expect(comparison.omissionTests[0]).toMatchObject({terms:[30],multiplier:1,remainingDamage:30,maximumNewCards:0})
  expect(checkGuide(c,p).errors).toEqual([])
  witness.requiredCards=[{printId:'e',count:1,access:'Too expensive'}]
  expect(checkGuide(c,p).errors.join('\n')).toContain('testimone fuori dal budget ridotto')
  comparison.omissionTests[0].witnessReplyId='missing'
  expect(()=>deriveOmissionWitnesses(s)).toThrow('costruirlo prima')
})

it('binds each retreat to its outgoing Active and source cost while preserving Energy holder validation',()=>{
  const p=packetV12(),raw=rawV12(),s=raw.scenarios[0]
  s.retreatCosts=[{id:'r1',context:'Synthetic zero retreat',side:'ours',printId:'a',adjustments:[{sourceId:'rules',amount:-1,reason:'Synthetic modifier only'}]}]
  const c=compileGuideTactics(projectGuideLedger(raw,p))
  expect(c.scenarios[0].retreatCosts![0].printedCost).toBe(1)
  expect(c.scenarios[0].calculations.find(c=>c.retreatCostId==='r1')!.expected).toBe(0)
  const expanded:any={id:'test',retreatCosts:c.scenarios[0].retreatCosts,setupEvents:[{kind:'retreat',side:'ours',retreatCostId:null,moves:[{side:'ours',printId:'a',count:1,from:'active',to:'bench'},{side:'ours',printId:'a',count:1,from:'bench',to:'active'}]}]}
  expect(()=>validateConstructedRetreats(expanded)).toThrow('retreatCostId')
  expanded.setupEvents[0].retreatCostId='r1';expect(()=>validateConstructedRetreats(expanded)).not.toThrow()
  expanded.retreatCosts[0].side='opponent';expect(()=>validateConstructedRetreats(expanded)).toThrow('retreatCostId')
  const schema=boundGuideSchema(singleScenarioSchemaV12('scenario-1'),p,'opponent-1') as any
  expect(schema.properties.scenarios.items.properties.retreatCosts.items.anyOf[0].properties.printedCost).toBeUndefined()
  expect(schema.properties.scenarios.items.properties.replyComparison.properties.omissionTests.items.properties.remainingDamage).toBeUndefined()
  expect(causalInstructions('scenarios-1',true)).toContain('hostPrintId anche in attached')
})

it('generates and persists v12 only after attack coverage, local checks and both independent reviews',async()=>{
  const s=setup(),p=packetV12()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage.startsWith('scenarios-'))return rawV12(stage==='scenarios-1'?'scenario-1':'scenario-2')
      if(stage==='prose'){
        const c=contentV4();c.scenarios=[];c.claims=[]
        for(const chapter of c.chapters)if(chapter.dependsOn.includes('s1'))chapter.dependsOn=['scenario-1']
        for(const e of c.exercises)e.scenarioIds=['scenario-1'];return c
      }
      expect(prompt).toContain('REVISIONE v12');return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(6)
    assertGuideReport({...p.basis,guide})
    const bad=structuredClone(guide);bad.scenarios[0].replyComparison!.omissionTests[0].remainingDamage=90
    expect(()=>assertGuideReport({...p.basis,guide:bad})).toThrow()
  }finally{s.close()}
})

it('enforces ordinary first-turn/Supporter/manual-assignment rules without counting discarded Supporters as played',()=>{
  const p=packetV11(),trainer=guideSource('card:c','card','C',null,JSON.stringify({printId:'c',name:'C',category:'Trainer',gameplay:{trainerType:'Supporter'}}))
  const sources=[...p.sources,trainer]
  const played:any={turn:1,side:'ours',description:'Play C',trainer:'c',attackName:null,moves:[{side:'ours',printId:'c',count:1,from:'hand',to:'discard'}],energyRoutes:[]}
  expect(()=>validateTurnLegality([played],sources,'ours')).toThrow('vietato al primo giocatore')
  expect(()=>validateTurnLegality([{...played,trainer:null}],sources,'ours')).not.toThrow()
  expect(()=>validateTurnLegality([{...played,turn:2,side:'opponent',moves:[{...played.moves[0],side:'opponent'}]}],sources,'ours')).not.toThrow()
  const second={...played,turn:3}
  expect(()=>validateTurnLegality([second,second],sources,'ours')).toThrow('più di un Supporter')
  expect(()=>validateTurnLegality([{...played,trainer:null,attackName:'Practice'}],sources,'ours')).toThrow('non può attaccare')
  const attach:any={turn:3,side:'ours',description:'Attach',trainer:null,attackName:null,moves:[],energyRoutes:[{side:'ours',printId:'e',count:1,path:['hand','attached'],attachment:'manual',sourceIds:['rules']}]}
  expect(()=>validateTurnLegality([attach,attach],sources,'ours')).toThrow('assegnazione manuale')
  expect(()=>validateTurnLegality([{...attach,energyRoutes:[{...attach.energyRoutes[0],attachment:'effect',sourceIds:['card:e']}]}],sources,'ours')).toThrow('senza carta')
  expect(()=>validateTurnLegality([{...attach,energyRoutes:[{...attach.energyRoutes[0],attachment:'effect',sourceIds:['card:c']}]}],sources,'ours')).toThrow('senza Supporter legalmente giocato')
})

it('requires the Energy holder on outgoing attached routes too, preserving the legacy guard',()=>{
  // Expansion contract only; this synthetic route does not prove a legal retreat.
  const p=packetV11(),s=rawV11().scenarios[0],event:any={kind:'effect',description:'Remove Energy',trainer:null,attack:null,moves:[]}
  s.setupRounds[0].ours.events.push(event)
  event.energyRoutes=[{side:'ours',printId:'e',count:1,path:['attached','discard'],hostPrintId:null,sourceIds:['rules'],attachment:null}]
  expect(()=>expandTurnBlocks(structuredClone(s),p.sources,true,true)).toThrow('hostPrintId richiesto anche per rimozioni')
  expect(()=>expandTurnBlocks(structuredClone(s),p.sources,true,false)).toThrow('Energia assegnata senza destinatario')
  event.energyRoutes[0].hostPrintId='a'
  const expanded=structuredClone(s);expandTurnBlocks(expanded,p.sources,true,true)
  expect(expanded.setupEvents.flatMap((e:any)=>e.moves)).toContainEqual({side:'ours',printId:'e',count:1,from:'attached',to:'discard'})
})

it('derives scenario descriptions, HP and reply sequences from executed v11 facts and rejects stale position annotations',()=>{
  const p=packetV11(),raw=rawV11(),c=compileGuideTactics(projectGuideLedger(raw,p))
  expect(checkGuide(c,p).errors).toEqual([])
  expect(c.scenarios[0].title).toBe('Decisione sintetica sul seguito')
  expect(c.scenarios[0].state).toContain('160/160 PS')
  expect(c.scenarios[0].explanation).toContain('Premi rimasti 6/6')
  expect(c.scenarios[0].replyComparison!.options[0].sequence.length).toBeGreaterThan(0)
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  const tampered=structuredClone(c);tampered.scenarios[0].explanation='Old state with wrong Energy and prizes'
  expect(projectGuideLedger(tampered,p).scenarios[0].explanation).toBe(c.scenarios[0].explanation)
  raw.scenarios[0].positionAnnotations[0].damage=160
  expect(()=>projectGuideLedger(raw,p)).toThrow('Pokémon vivo e presente')
  raw.scenarios[0].positionAnnotations.pop()
  raw.scenarios[0].positionAnnotations[0].damage=0
  expect(()=>projectGuideLedger(raw,p)).toThrow('danni/condizioni mancanti')
})

it('executes conditional branch turns only while the game continues and never skips illegal same-turn actions',()=>{
  const p=packetV11(),raw=rawV11(),s=raw.scenarios[0],o=s.replyComparison.options[0]
  s.opening.ours.bench=[];s.positionAnnotations=s.positionAnnotations.filter((r:any)=>!(r.side==='ours'&&r.zone==='bench'))
  const attack=o.turns.opponent.events[0]
  Object.assign(attack,{kind:'knockout',action:'active-ko',affectedSide:'ours',moves:[{side:'ours',printId:'a',count:1,from:'active',to:'discard'}]})
  attack.energyRoutes.push({side:'opponent',printId:'e',count:1,path:['prizes','hand'],attachment:null,hostPrintId:null,sourceIds:['rules']})
  const c=compileGuideTactics(projectGuideLedger(raw,p)),branch:any=c.scenarios[0].replyComparison!.options[0]
  expect(checkGuide(c,p).errors).toEqual([])
  expect(branch.termination).toEqual({winner:'opponent',reason:'no-pokemon'})
  expect(branch.unreachedPlan).toHaveLength(2)
  expect(branch.expandedLineEvents.at(-1).action).toBe('active-ko')
  o.turns.opponent.events.push({...attack,action:'other',kind:'effect',attack:null,moves:[],energyRoutes:[],description:'Unconditional action after the KO'})
  expect(()=>projectGuideLedger(raw,p)).toThrow('azione dopo la fine effettiva')
})

it('rejects v11 terminal declarations, missing first turns and first-turn Supporter setups before critique',()=>{
  const p=packetV11(),raw=rawV11(),o=raw.scenarios[0].replyComparison.options[0]
  o.turns.next={terminal:true}
  expect(()=>projectGuideLedger(raw,p)).toThrow('piano v11 richiede risposta e seguito completi')
  o.turns.next=structuredClone(raw.scenarios[0].turns.next);o.forkAtEvent=0
  expect(()=>projectGuideLedger(raw,p)).toThrow('ramo privo del nostro primo turno')
  const illegal=rawV11(),s=illegal.scenarios[0]
  p.ourList.cards.find(c=>c.printId==='e')!.count--;p.ourList.cards.push({printId:'c',name:'C',count:1})
  p.sources.push(guideSource('card:c','card','C',null,JSON.stringify({printId:'c',name:'C',category:'Trainer',gameplay:{trainerType:'Supporter'}})))
  s.opening.ours.hand[1]='c';s.setupRounds[0].ours.events=[{kind:'play',description:'Illegal first-turn Supporter',trainer:'c',attack:null,moves:[{side:'ours',printId:'c',count:1,from:'hand',to:'discard'}],energyRoutes:[]}]
  expect(()=>projectGuideLedger(illegal,p)).toThrow('vietato al primo giocatore')
})

it('scopes case facts to both complete exact lists without truncating sources or changing the archived global packet',()=>{
  const p=packetV11();p.opponentLists.push({...p.opponentLists[0],id:'other',cards:[{printId:'z',name:'Z',count:60}]})
  p.sources.push(guideSource('card:z','card','Z',null,'Full Z source'),guideSource('other','list','Other',null,'Full other list'))
  const before=JSON.stringify(p),view=scopedConstructionPacket(p,'opponent-1')
  expect(view.opponentLists.map(l=>l.id)).toEqual(['opponent-1'])
  expect(view.ourList.cards.reduce((n,c)=>n+c.count,0)).toBe(60)
  expect(view.sources.some(s=>s.id==='card:z'||s.id==='other')).toBe(false)
  expect(view.sources.find(s=>s.id==='card:a')!.content).toBe(p.sources.find(s=>s.id==='card:a')!.content)
  expect(JSON.stringify(p)).toBe(before)
  expect(causalInstructions('scenarios-1')).not.toContain('CONTRATTO v6')
  const schema=boundGuideSchema(singleScenarioSchemaV11('scenario-1'),view,'opponent-1') as any
  expect(schema.properties.scenarios.maxItems).toBe(1)
  expect(schema.properties.scenarios.items.properties.explanation).toBeUndefined()
  expect(schema.properties.scenarios.items.properties.replyComparison.properties.options.items.properties.turns.properties.next.anyOf).toBeUndefined()
})

it('builds the two v11 cases separately, carries failed output into retry and preserves all independent publication gates',async()=>{
  const s=setup(),p=packetV11();let first=0
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage.startsWith('scenarios-')){
        const c=rawV11(stage==='scenarios-1'?'scenario-1':'scenario-2')
        expect(prompt).not.toContain('CONTRATTO v10');expect(prompt).toContain('ourCapabilities')
        if(stage==='scenarios-1'&&first++===0)c.scenarios[0].positionAnnotations[0].damage=999
        else if(stage==='scenarios-1')expect(prompt).toContain('OUTPUT PRECEDENTE DA CORREGGERE')
        return c
      }
      if(stage==='prose'){
        const c=contentV4();c.scenarios=[];c.claims=[]
        for(const chapter of c.chapters)if(chapter.dependsOn.includes('s1'))chapter.dependsOn=['scenario-1']
        for(const e of c.exercises)e.scenarioIds=['scenario-1']
        return c
      }
      expect(prompt).toContain('REVISIONE v11');return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(7)
    expect(guide.generation.attempts.map(a=>a.stage)).toEqual(['plan','scenarios-1','scenarios-1','scenarios-2','review-scenarios-1','prose','review-1'])
    assertGuideReport({...p.basis,guide})
    expect([...s.work.archive.values('guide-input-scope')].length).toBeGreaterThan(0)
    const bad=structuredClone(guide);bad.scenarios[0].explanation='Stale old state'
    expect(()=>assertGuideReport({...p.basis,guide:bad})).toThrow()
  }finally{s.close()}
})

it('binds attack/card pairs to actor sources and verifies the declared card is actually Active',()=>{
  const p=packetV10(),schema=boundGuideSchema(guideScenarioSchemaV10,p,'opponent-1') as any
  const refs=schema.properties.scenarios.items.properties.turns.properties.next.properties.attack.properties.attack.anyOf
  expect(refs.flatMap((r:any)=>r.properties?.attackName?.enum??[])).toEqual(['Practice'])
  const raw=rawV10();raw.scenarios[0].turns.next.attack.attack={printId:'b',attackName:'Practice'}
  expect(()=>projectGuideLedger(raw,p)).toThrow('non è l’Attivo corrente')
  raw.scenarios[0].turns.next.attack.attack={printId:'a',attackName:'B only'}
  expect(()=>projectGuideLedger(raw,p)).toThrow('coppia carta/attacco')
})

it('normalizes only explicit adjacent KO/prize awards and rejects ambiguous, repeated or wrong-side awards',()=>{
  const ko:any={turn:3,side:'ours',kind:'knockout',action:'active-ko',affectedSide:'opponent',attackName:'Practice',description:'KO',moves:[{side:'opponent',printId:'b',count:1,from:'active',to:'discard'}],energyRoutes:[]}
  const prize:any={turn:3,side:'ours',kind:'prize',action:'other',affectedSide:'ours',attackName:null,description:'Take the declared prize',moves:[{side:'ours',printId:'e',count:1,from:'prizes',to:'hand'}],energyRoutes:[]}
  const result=normalizeCombatEvents([ko,prize])
  expect(result).toHaveLength(2);expect(result[0].moves).toHaveLength(2);expect(result[1].moves).toEqual([])
  expect(ko.moves).toHaveLength(1) // Original response unchanged.
  expect(()=>normalizeCombatEvents([ko,{...prize,turn:4}])).toThrow('univoco')
  expect(()=>normalizeCombatEvents([ko,{...prize,moves:[{...prize.moves[0],side:'opponent'}]}])).toThrow('univoco')
  expect(()=>normalizeCombatEvents([ko,prize,prize])).toThrow('univoco')
  expect(()=>normalizeCombatEvents([ko,{...prize,kind:'play',moves:[]},prize])).toThrow('univoco')
  expect(()=>normalizeCombatEvents([prize])).toThrow('univoco')
  expect(()=>normalizeCombatEvents([{...ko,moves:[...ko.moves,{...prize.moves[0],side:'opponent'}]}])).toThrow('lato del Pokémon KO')
})

it('projects folded awards with correct hands, prize counts, development indices and persistence reprojection',()=>{
  const raw=rawV10(),p=packetV10(),s=raw.scenarios[0],attack=s.turns.next.attack
  attack.action='active-ko';attack.affectedSide='opponent';attack.kind='knockout'
  attack.moves=[{side:'opponent',printId:'b',count:1,from:'active',to:'discard'}]
  attack.energyRoutes=[{side:'opponent',printId:'e',count:1,path:['attached','discard'],hostPrintId:'b',sourceIds:['card:a']}]
  s.turns.next.afterAttack=[{kind:'prize',action:'other',affectedSide:'ours',attack:null,description:'Take one prize',moves:[],energyRoutes:[{side:'ours',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['rules']}]},
    {kind:'play',action:'promote',affectedSide:'opponent',attack:null,description:'Promote the reserve',moves:[{side:'opponent',printId:'b',count:1,from:'bench',to:'active'}],energyRoutes:[]}]
  const c=compileGuideTactics(projectGuideLedger(raw,p)),projected:any=c.scenarios[0]
  expect(checkGuide(c,p).errors).toEqual([])
  expect(projected.steps[5]).toMatchObject({action:'active-ko',prizesTaken:1,before:{ourPrizes:6},after:{ourPrizes:5}})
  expect(projected.steps).toHaveLength(7)
  expect(projected.lineEvents[6].prizeResolvedAt).toBe(5)
  expect(projected.development.at(-1).stepIndexes.every((i:number)=>i<projected.steps.length)).toBe(true)
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  s.turns.next.afterAttack.pop()
  expect(()=>projectGuideLedger(raw,p)).toThrow('promozione obbligatoria omessa')
})

it('requires complete v10 branch attacks or a demonstrated terminal game, and preserves the first-turn prefix limit',()=>{
  const p=packetV10(),raw=rawV10(),o=raw.scenarios[0].replyComparison.options[0]
  o.turns.next={terminal:true}
  expect(()=>projectGuideLedger(raw,p)).toThrow('terminale dichiarato senza fine partita')
  o.turns.next={draw:'e',beforeAttack:[],afterAttack:[]}
  expect(()=>projectGuideLedger(raw,p)).toThrow('attacco successivo del ramo mancante')
  o.forkAtEvent=6
  expect(()=>projectGuideLedger(raw,p)).toThrow('solo il nostro primo turno')
  const terminal=rawV10(),s=terminal.scenarios[0],branch=s.replyComparison.options[0]
  s.opening.ours.bench=[]
  const attack=branch.turns.opponent.events[0]
  Object.assign(attack,{kind:'knockout',action:'active-ko',affectedSide:'ours',moves:[{side:'ours',printId:'a',count:1,from:'active',to:'discard'}]})
  branch.turns.opponent.events.push({kind:'prize',action:'other',affectedSide:'opponent',attack:null,description:'Take the explicit prize',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['rules']}]})
  branch.turns.next={terminal:true}
  const c=compileGuideTactics(projectGuideLedger(terminal,p))
  expect(checkGuide(c,p).errors).toEqual([])
  expect(c.scenarios[0].replyComparison!.options[0].steps!.at(-1)).toMatchObject({action:'active-ko',prizesTaken:1})
})

it('requires three distinct reply roles and source-backed real extra access rather than relabelled hand play',()=>{
  const p=packetV10(),raw=rawV10(),c=compileGuideTactics(projectGuideLedger(raw,p))
  expect(checkGuide(c,p).errors).toEqual([])
  const comparison=c.scenarios[0].replyComparison!
  comparison.coverage!.access=comparison.coverage!.direct
  expect(checkGuide(c,p).errors.join('\n')).toContain('tre repliche distinte')
  comparison.coverage!.access='access';comparison.options.find(o=>o.id==='access')!.accessProof=null
  expect(checkGuide(c,p).errors.join('\n')).toContain('senza prova e fonte')
  const noAccess=rawV10();noAccess.scenarios[0].replyComparison.options[2].turns.opponent.events.shift()
  expect(checkGuide(compileGuideTactics(projectGuideLedger(noAccess,p)),p).errors.join('\n')).toContain('senza ricerca, recupero o pesca')
})

it('generates v10 with capability evidence, complete normalized branches and unchanged independent review/persistence gates',async()=>{
  const s=setup(),p=packetV10()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      expect(prompt).toContain('opponentCapabilities')
      if(stage==='scenarios')return {...rawV10(),chapters:[],exercises:[]}
      if(stage==='prose')return {...contentV4(),scenarios:[],claims:[]}
      expect(prompt).toContain('REVISIONE v10');expect(prompt).not.toContain('OUTPUT v10')
      const draft=JSON.parse(prompt.split('DATI CONGELATI:\n')[1]).draft
      expect(draft.scenarios[0].replyComparison.options[0].expandedLineEvents).toHaveLength(6)
      expect(draft.scenarios[0].replyComparison.options[0].lineEvents).toBeUndefined()
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(5);assertGuideReport({...p.basis,guide})
    const bad=structuredClone(guide);(bad.scenarios[0].replyComparison!.options[0] as any).expandedLineEvents[0].moves=[]
    expect(()=>assertGuideReport({...p.basis,guide:bad})).toThrow()
  }finally{s.close()}
})

it('builds v9 actors, development and cumulative physical resources from native turn blocks',()=>{
  const p=packetV9(),c=compileGuideTactics(projectGuideLedger(rawV9(),p)),s=c.scenarios[0]
  expect(checkGuide(c,p).errors).toEqual([])
  expect(s.development!.map(d=>[d.turn,d.side])).toEqual([[3,'ours'],[4,'opponent'],[5,'ours']])
  expect(s.resources).toContainEqual({side:'ours',printId:'e',count:8})
  expect(s.replyComparison!.options[0].replyTurn).toBe(4)
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  const missing=rawV9();missing.scenarios[0].turns.next.attack.attackName=null
  expect(()=>projectGuideLedger(missing,p)).toThrow('attacco successivo esplicito')
})

it('counts unused draws and taken prizes as distinct physical copies, reuses recoveries and takes maxima across branches',()=>{
  const p=packetV9(),s=projectGuideLedger(rawV9(),p).scenarios[0]
  const m=(from:string,to:string,count=1)=>({side:'ours' as const,printId:'e',count,from:from as any,to:to as any})
  const result=physicalResources(s,p.ourList,p.opponentLists[0],[[{turn:3,side:'ours',moves:[m('deck','hand'),m('prizes','hand'),m('hand','discard'),m('discard','hand'),m('hand','discard')]}],
    [{turn:3,side:'ours',moves:[m('deck','hand',3)]}]])
  expect(result.primaryByTurn.get(3)).toContainEqual({side:'ours',printId:'e',count:8})
  expect(result.resources).toContainEqual({side:'ours',printId:'e',count:9})
})

it('validates every declared Energy edge and host without inventing access or replacing unavailable Energy',()=>{
  const p=packetV9(),raw=rawV9(),route=raw.scenarios[0].turns.opponent.events[0].energyRoutes[0]
  route.count=8
  expect(()=>projectGuideLedger(raw,p)).toThrow('hand=7')
  route.count=1;route.path=['deck','hand','attached']
  expect(projectGuideLedger(raw,p).scenarios[0].resources).toContainEqual({side:'opponent',printId:'e',count:8})
  route.hostPrintId='a'
  expect(()=>projectGuideLedger(raw,p)).toThrow('destinatario dell’Energia non presente')
  route.hostPrintId='b';route.sourceIds=[]
  expect(()=>projectGuideLedger(raw,p)).toThrow('fonti verificate')
  route.sourceIds=['card:e'];raw.scenarios[0].turns.opponent.events[0].moves=[{side:'opponent',printId:'e',count:1,from:'hand',to:'attached'}]
  expect(()=>projectGuideLedger(raw,p)).toThrow('Energia fuori dai percorsi')
})

it('requires a complete next attack in every branch unless the ledger already ends the game',()=>{
  const p=packetV9(),raw=rawV9(),s=raw.scenarios[0],o=s.replyComparison.options[0]
  o.forkAtEvent=2;o.turns.opponent=structuredClone(s.turns.opponent)
  expect(()=>projectGuideLedger(raw,p)).toThrow('ramo direct incompleto')
  s.opening.ours.bench=[]
  o.turns.opponent.events=[{...s.turns.opponent.events[0],kind:'knockout',action:'active-ko',affectedSide:'ours',moves:[{side:'ours',printId:'a',count:1,from:'active',to:'discard'}],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['card:b']}]}]
  s.replyComparison.omissionTests=[]
  expect(()=>projectGuideLedger(raw,p)).not.toThrow()
})

it('binds only Energy IDs in routes, excludes them from ordinary moves and requires a named final attack',()=>{
  const schema=boundGuideSchema(guideScenarioSchemaV9,packetV9(),'opponent-1') as any
  const s=schema.properties.scenarios.items.properties,next=s.turns.properties.next.properties
  expect(next.attack.properties.attackName).toEqual({type:'string',enum:['Practice']})
  expect(s.turns.properties.opponent.properties.events.items.properties.energyRoutes.items.anyOf[1].properties.printId.enum).toEqual(['e'])
  expect(s.turns.properties.opponent.properties.events.items.properties.moves.items.anyOf[1].properties.printId.enum).toEqual(['b'])
  expect(s.resources).toBeUndefined();expect(s.turnAudit).toBeUndefined()
  expect(s.opening.properties.opponent.properties.bench.items.enum).toEqual(['b'])
})

it('generates v9 with corrected draw scope, complete normalized review data and all persistence gates',async()=>{
  const s=setup(),p=packetV9()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios')return {...rawV9(),chapters:[],exercises:[]}
      if(stage==='prose')return {...contentV4(),scenarios:[],claims:[]}
      expect(prompt).toContain('REVISIONE v9');expect(prompt).not.toContain('OUTPUT v9')
      const draft=JSON.parse(prompt.split('DATI CONGELATI:\n')[1]).draft
      expect(draft.scenarios[0].turns).toBeUndefined()
      expect(draft.scenarios[0].lineEvents).toHaveLength(6)
      expect(draft.scenarios[0].setupLedger.events.length).toBeGreaterThan(4)
      expect(draft.scenarios[0].resources).toContainEqual({side:'ours',printId:'e',count:8})
      expect(prompt).toContain('specificDraws riguarda SOLO identità avversarie')
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(5);assertGuideReport({...p.basis,guide})
    const bad=structuredClone(guide);bad.scenarios[0].resources.find(r=>r.side==='ours'&&r.printId==='e')!.count--
    expect(()=>assertGuideReport({...p.basis,guide:bad})).toThrow()
  }finally{s.close()}
})

it('derives reply costs from the complete response turn and distinguishes consumption from interchangeable stock',()=>{
  const p=packetV8(),c=compileGuideTactics(projectGuideLedger(rawV8(),p)),s=c.scenarios[0]
  expect(checkGuide(c,p).errors).toEqual([])
  expect(s.inventory.filter(r=>r.side==='opponent'&&r.printId==='e'&&r.zone==='hand')[0].count).toBe(6)
  expect(s.replyComparison!.options[0]).toMatchObject({requiredCards:[{printId:'e',count:1}],attachments:1,retreatEnergy:0})
  expect(s.replyComparison!.omissionTests[0].maximumNewCards).toBe(0)
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  const dominated=structuredClone(c)
  dominated.scenarios[0].replyComparison!.options[0].retreatEnergy=2
  expect(checkGuide(dominated,p).errors.join('\n')).toContain('meno risorse/pescate')
  const schema=boundGuideSchema(guideScenarioSchemaV8,p,'opponent-1') as any
  expect(schema.properties.scenarios.items.properties.replyComparison.properties.options.items.properties.requiredCards).toBeUndefined()
  const bad=rawV8();bad.scenarios[0].replyComparison.options[1].replyTurn=2
  expect(()=>projectGuideLedger(bad,p)).toThrow('turno della replica assente')
})

it('requires numerical omission proofs and a real affordable witness for positive residual damage',()=>{
  const p=packetV8(),c=compileGuideTactics(projectGuideLedger(rawV8(),p))
  const test=c.scenarios[0].replyComparison!.omissionTests[0]
  test.remainingDamage=50;test.terms=[50]
  expect(checkGuide(c,p).errors.join('\n')).toContain('senza ramo testimone')
  test.witnessReplyId='direct'
  expect(checkGuide(c,p).errors.join('\n')).toContain('fuori dal budget')
  test.terms=[30]
  expect(checkGuide(c,p).errors.join('\n')).toContain('formula o budget')
  const affordable=structuredClone(c.scenarios[0].replyComparison!.options[1])
  affordable.id='witness';affordable.requiredCards=[];affordable.attachments=0;affordable.damage=50;affordable.terms=[50];affordable.reachesThreshold=false
  c.scenarios[0].replyComparison!.options.push(affordable);test.witnessReplyId='witness';test.terms=[50]
  expect(checkGuide(c,p).errors).toEqual([])
})

it('counts recovered copies once, includes shared-prefix spending and measures discarded retreat Energy separately',()=>{
  const p=packetV8(),s=projectGuideLedger(rawV8(),p).scenarios[0]
  const event=(turn:number,moves:any[],kind='play',side='opponent')=>({turn,side,kind,moves})
  const m=(from:string,to:string)=>({side:'opponent',printId:'e',count:1,from,to})
  const events:any[]=[event(3,[m('hand','attached')],'play','ours'),event(4,[m('hand','discard')]),event(4,[m('discard','hand')]),event(4,[m('hand','discard')]),event(4,[m('attached','discard')],'retreat'),event(5,[m('hand','attached')],'play','ours')]
  expect(replyCost(s,events,4,p.sources)).toMatchObject({requiredCards:[{printId:'e',count:1}],attachments:0,retreatEnergy:1})
  expect(()=>replyCost(s,events,3,p.sources)).toThrow('appartenere all’avversario')
})

it('exposes every available defensive promotion before the chosen bench card moves to Active',()=>{
  const p=packetV7(),raw=rawV7()
  p.opponentLists[0].cards.find(r=>r.printId==='e')!.count--
  p.opponentLists[0].cards.push({...p.opponentLists[0].cards[0],printId:'c',name:'C',count:1})
  p.sources.push(guideSource('card:c','card','C',null,JSON.stringify({printId:'c',name:'C',category:'Pokemon',stage:'Basic',gameplay:{retreat:1}})))
  for(const scenario of raw.scenarios){
    scenario.opening.opponent.hand[1]='c'
    scenario.setupEvents.push({turn:2,side:'opponent',kind:'play',description:'Terzo Base sintetico',attackName:null,moves:[{side:'opponent',printId:'c',count:1,from:'hand',to:'bench'}]})
  }
  const c=projectGuideLedger(raw,p),s:any=c.scenarios[0]
  s.lineEvents=[{turn:3,side:'ours',moves:[{side:'opponent',printId:'b',count:1,from:'active',to:'discard'}]},
    {turn:3,side:'ours',moves:[{side:'opponent',printId:'b',count:1,from:'bench',to:'active'}]}]
  s.replyComparison.options=[]
  expect(guideOpportunities(c,p)).toContainEqual(expect.objectContaining({scenarioId:s.id,printId:'b',side:'opponent',turn:3,kind:'promotion-choice'}))
  expect(guideOpportunities(c,p)).toContainEqual(expect.objectContaining({scenarioId:s.id,printId:'c',side:'opponent',turn:3,kind:'promotion-choice'}))
})

it('generates v8 autonomously with derived budgets, independent reviews and persistence reprojection',async()=>{
  const s=setup(),p=packetV8()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt)=>{
      const stage=stageOf(prompt)
      expect(prompt).toContain('BUDGET DI CONSUMO')
      expect(prompt).not.toContain('deve togliere UNA copia')
      expect(prompt).toContain('specificDraws riguarda SOLO identità avversarie')
      expect(prompt).not.toContain('specificDraws resta obbligatorio e deve includere le pescate decisive, anche del setup')
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios')return {...rawV8(),chapters:[],exercises:[]}
      if(stage==='prose')return {...contentV4(),scenarios:[],claims:[]}
      expect(prompt).toContain('REVISIONE v8');expect(prompt).not.toContain('OUTPUT v8')
      expect(prompt).toContain('promozione diretta del sacrificabile')
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(5)
    assertGuideReport({...p.basis,guide})
    const altered=structuredClone(guide);altered.scenarios[0].replyComparison!.options[0].requiredCards=[]
    expect(()=>assertGuideReport({...p.basis,guide:altered})).toThrow()
  }finally{s.close()}
})

it('binds printing IDs, initial card counts and attacks to the exact available lists',()=>{
  const schema=boundGuideSchema(guideScenarioSchemaV7,packetV7(),'opponent-1') as any
  const props=schema.properties.scenarios.items.properties
  expect(props.opening.properties.ours.properties.active.enum).toEqual(['a'])
  expect(props.opening.properties.ours.properties.hand.minItems).toBe(6)
  expect(props.opening.properties.ours.properties.prizes.maxItems).toBe(6)
  expect(props.replyComparison.properties.options.items.properties.specificDraws.items.enum).toEqual(['b','e'])
  expect(props.lineEvents.items.properties.moves.items.anyOf[0].properties.printId.enum).toEqual(['a','e'])
  expect(props.lineEvents.items.properties.moves.items.anyOf[1].properties.printId.enum).toEqual(['b','e'])
  expect(props.replyComparison.properties.options.items.properties.specificDraws.items.enum).not.toContain('RiskyRuins')
  expect(props.lineEvents.items.properties.attackName.anyOf[0].enum).toEqual(['Practice'])
})

it('derives initial placement and development anchors, and demands a real next attack',()=>{
  const p=packetV7(),c=compileGuideTactics(projectGuideLedger(rawV7(),p))
  expect(checkGuide(c,p).errors).toEqual([])
  expect(c.scenarios[0].setupLedger!.openingHands.reduce((n,r)=>n+r.count,0)).toBe(14)
  expect(c.scenarios[0].development!.map(d=>[d.turn,d.side])).toEqual([[3,'ours'],[4,'opponent'],[5,'ours']])
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  const bad=rawV7();bad.scenarios[0].opening.ours.hand.pop()
  expect(()=>projectGuideLedger(bad,p)).toThrow('setup incompleto')
  const incomplete=rawV7();incomplete.scenarios[0].lineEvents[2].attackName=null
  expect(()=>projectGuideLedger(incomplete,p)).toThrow('attacco successivo')
  const fake=rawV7();fake.scenarios[0].lineEvents[2].attackName='Invented attack'
  expect(()=>projectGuideLedger(fake,p)).toThrow('scheda dell’Attivo')
})

it('generates a bounded v7 guide and retains all final persistence and review gates',async()=>{
  const s=setup(),p=packetV7()
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async(prompt,_config,schema)=>{
      const stage=stageOf(prompt)
      if(stage==='plan')return {...plan,opponentListId:'opponent-1'}
      if(stage==='scenarios'){
        expect(JSON.stringify(schema)).toContain('"enum":["b","e"]')
        return {...rawV7(),chapters:[],exercises:[]}
      }
      if(stage==='prose')return {...contentV4(),scenarios:[],claims:[]}
      expect(prompt).toContain('VALUTAZIONE DELLA PROIEZIONE')
      expect(prompt).toContain('REVISIONE v7')
      expect(prompt).not.toContain('Il setup v7 SOSTITUISCE')
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(5)
    assertGuideReport({...p.basis,guide})
    expect([...s.work.archive.values('guide-output-schema')].length).toBeGreaterThan(0)
  }finally{s.close()}
})

it('expands shared reply prefixes and rejects empty or invalid branches without weakening v5 checks',()=>{
  const p=packetV6(),raw=rawV6(),c=compileGuideTactics(projectGuideLedger(raw,p))
  expect(checkGuide(c,p).errors).toEqual([])
  expect(c.scenarios[0].replyComparison!.options[1].steps).toEqual(c.scenarios[0].steps)
  expect(compileGuideTactics(projectGuideLedger(c,p))).toEqual(c)
  const bad=rawV6();bad.scenarios[0].replyComparison.options[1].forkAtEvent=30
  expect(()=>projectGuideLedger(bad,p)).toThrow('prefisso')
  bad.scenarios[0].replyComparison.options[1].forkAtEvent=0
  expect(()=>projectGuideLedger(bad,p)).toThrow('senza eventi')
  c.scenarios[0].replyComparison!.options[1].intent='attack'
  expect(checkGuide(c,p).errors.join(' ')).toContain('offensivo e difensivo')
})

it('extracts actual hand Supporters, board abilities and retreat candidates without assuming legality',()=>{
  const p=packetV5(),c=projectGuideLedger(rawV5(),p)
  p.sources[0]=guideSource('card:a','card','A',null,JSON.stringify({printId:'a',name:'A',gameplay:{retreat:1,abilities:[{name:'Preparation'}]}}))
  p.sources.push(guideSource('card:e','card','Supporter fixture',null,JSON.stringify({printId:'e',name:'Supporter fixture',gameplay:{trainerType:'Supporter'}})))
  const candidates=guideOpportunities(c,p)
  expect(candidates.some(c=>c.kind==='supporter'&&c.side==='ours'&&c.printId==='e')).toBe(true)
  expect(candidates.some(c=>c.kind==='ability:Preparation'&&c.side==='ours')).toBe(true)
  expect(candidates.some(c=>c.kind==='defensive-retreat'&&c.detail.includes('Non assumere legalità'))).toBe(true)
  expect(candidates.some(c=>c.kind==='supporter'&&c.printId==='a')).toBe(false)
})

it('supplies the same development and defensive candidates to scenario and full critics within eight calls',async()=>{
  const s=setup(),p=packetV6();let reviews=0
  try{
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
      const stage=stageOf(prompt)
      if(stage==='plan') return plan
      if(stage==='scenarios') return {...rawV6(),chapters:[],exercises:[]}
      if(stage==='prose') return {...contentV4(),scenarios:[],claims:[]}
      if(stage.startsWith('review')){
        reviews++;expect(prompt).toContain('opportunities');expect(prompt).toContain('replica difensiva');expect(prompt).toContain('VALUTAZIONE DELLA PROIEZIONE')
      }
      return reviewed
    }})
    expect(reviews).toBe(2);expect(guide.generation.attempts).toHaveLength(5)
    assertGuideReport({...p.basis,guide})
    expect(renderToStaticMarkup(createElement(DeepMatchupGuide,{guide,renderText:text=>text}))).toContain('Difesa · ')
  }finally{s.close()}
})

it('projects complete inventory, hands, board and independent branches from the same movements', () => {
  const raw = rawV5(), p = packetV5(), c = compileGuideTactics(projectGuideLedger(raw, p))
  expect(checkGuide(c, p).errors).toEqual([])
  for (const s of c.scenarios) {
    expect(s.inventory.filter(r => r.side === 'ours').reduce((n,r) => n+r.count, 0)).toBe(60)
    expect(s.setupLedger!.events.at(-1)!.handAfter).toEqual({ ours: 6, opponent: 6 })
    expect(s.setupDraws).toEqual({ ours: 1, opponent: 1 })
    expect(s.steps).toHaveLength(3)
    expect(s.replyComparison!.options[0].steps).toEqual(s.steps)
  }
  expect(compileGuideTactics(projectGuideLedger(c, p))).toEqual(c)
  expect(raw.scenarios[0].inventory).toBeUndefined()
  const invalid = rawV5(); invalid.scenarios[0].lineEvents[0].moves = [{side:'ours',printId:'a',count:10,from:'hand',to:'bench'}]
  expect(() => projectGuideLedger(invalid,p)).toThrow('non disponibile')
  const mismatch = rawV5(); mismatch.scenarios[0].developmentEvents[0].turn = 20
  expect(() => projectGuideLedger(mismatch,p)).toThrow('non collegato')
})

it('generates and persists a projected guide while rejecting tampered derived state', async () => {
  const s=setup(), p=packetV5()
  try {
    const guide=await generateDeepGuide({packet:p,config,work:s.work,request:'Guida',runner:async prompt=>{
      const stage=stageOf(prompt)
      if(stage.startsWith('review')) {
        expect(prompt).toContain('VALUTAZIONE DELLA PROIEZIONE')
        expect(prompt).not.toContain('Non scrivere inventory')
        expect(prompt).toContain('qualsiasi discrepanza effettiva')
      }
      if(stage==='plan') return plan
      if(stage==='scenarios') return {...rawV5(),chapters:[],exercises:[]}
      if(stage==='prose') return {...contentV4(),scenarios:[],claims:[]}
      return reviewed
    }})
    expect(guide.generation.attempts).toHaveLength(5)
    assertGuideReport({...p.basis,guide})
    const tampered=structuredClone(guide); tampered.scenarios[0].state='Mano dichiarata falsa'
    expect(()=>assertGuideReport({...p.basis,guide:tampered})).toThrow('registro unico')
  } finally {s.close()}
})

it('requires audited setup turns, a concrete development line and independent transitions for every reply', () => {
  const c = compileGuideTactics(contentV4())
  expect(checkGuide(c, packetV4()).errors).toEqual([])
  const bad = structuredClone(c); bad.scenarios[0].turnAudit = []
  expect(checkGuide(bad, packetV4()).errors.join(' ')).toContain('senza verifica della scelta')
  const shallow = structuredClone(c); shallow.scenarios[0].development!.pop()
  expect(checkGuide(shallow, packetV4()).errors.join(' ')).toContain('due nostri turni')
  const branch = structuredClone(c); const step = branch.scenarios[0].replyComparison!.options[0].steps![0]; step.after = { ...step.after, ourBench: step.after.ourBench + 1 }
  expect(checkGuide(branch, packetV4()).errors.join(' ')).toContain('other')
  const resource = structuredClone(c); resource.scenarios[0].replyComparison!.options[0].specificDraws = ['e']
  expect(checkGuide(resource, packetV4()).errors.join(' ')).toContain('omessa dalle risorse')
})

it('maps an unambiguous nested reply finding to its scenario without retrying or waiving the finding', async () => {
  const s = setup(); let reviews = 0
  try {
    const guide = await generateDeepGuide({ packet: packetV4(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt)
      if (stage === 'plan') return plan
      if (stage === 'scenarios' || stage === 'repair-scenarios') {
        const c = contentV4(); c.scenarios[0].replyComparison!.options[0].id = 'unique-reply'; c.scenarios[0].replyComparison!.minimumReplyId = 'unique-reply'
        return { ...c, chapters: [], exercises: [] }
      }
      if (stage.startsWith('review-scenarios') && reviews++ === 0) return { verdict: 'revise', checks: [], findings: [{
        severity: 'major', targetId: 'unique-reply', message: 'Confrontare la replica', correction: 'Rivalutare', sourceIds: ['card:b'] }] }
      if (stage === 'prose') return { ...contentV4(), scenarios: [], claims: [] }
      return reviewed
    } })
    expect(guide.generation.attempts).toHaveLength(7)
    expect([...s.work.archive.values('guide-invalid-response')]).toHaveLength(0)
    expect([...s.work.archive.values<any>('guide-review')].some(r => r.value.findings[0]?.targetId === 's1')).toBe(true)
  } finally { s.close() }
})
function setup() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-guide-'))
  const path = join(folder, 'data.sqlite'), projects = new ProjectStore(path), jobs = new AiJobStore(path)
  const project = projects.create({ name: 'Guide', format: 'STANDARD' })
  const job = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
  let work = new AiAnalysisWork(join(folder, 'job'), jobs, job.id, new AbortController().signal, { kind: job.kind, args: [], guideVersion: 1 })
  return { folder, path, projects, jobs, project, job, get work() { return work }, reopen() {
    jobs.suspend(job.id, 'Interruzione della prova', 'failure')
    jobs.retryAfterIntervention(job.id)
    jobs.resume(job.id)
    work.close(); work = new AiAnalysisWork(join(folder, 'job'), jobs, job.id, new AbortController().signal, { kind: job.kind, args: [] })
    return work
  }, close() { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('blocks the pilot failures on quantities, KO/promotion, final prizes, weakness and retreat', () => {
  expect(checkGuide(content(), packet()).errors).toEqual([])
  for (const side of ['ours', 'opponent'] as const) {
    const c = content(); c.scenarios[0].resources.find(r => r.side === side)!.count = 5
    expect(checkGuide(c, packet()).errors.join(' ')).toContain('quantità non disponibile')
  }
  const ko = content(); ko.scenarios[0].steps[1].after.opponentBench--
  expect(checkGuide(ko, packet()).errors.length).toBeGreaterThan(0)
  const final = content(); final.scenarios[0].steps[1].after.ourPrizes = 0; final.scenarios[0].steps[1].prizesTaken = 4
  final.scenarios[0].steps[2].before.ourPrizes = 0; final.scenarios[0].steps[2].after.ourPrizes = 0
  expect(checkGuide(final, packet()).errors.join(' ')).toContain('fine della partita')
  const damage = content(); damage.scenarios[0].calculations[0].expected = 20
  expect(checkGuide(damage, packet()).errors.length).toBeGreaterThan(0)
  const retreat = content(); retreat.scenarios[0].calculations[1].expected = -1
  expect(checkGuide(retreat, packet()).errors.length).toBeGreaterThan(0)
  const hand = content(); hand.scenarios[0].setupDraws.ours = 5
  expect(checkGuide(hand, packet()).errors.join(' ')).toContain('carte iniziali/pescate non contabilizzate')
  const missing = content(); missing.scenarios[0].inventory.find(r => r.side === 'opponent' && r.zone === 'deck')!.count--
  expect(checkGuide(missing, packet()).errors.join(' ')).toContain('inventario iniziale incompleto')
})

it('keeps completed stages across a real SQLite close/reopen and charges only actual invocations', async () => {
  const s = setup(); const called: string[] = []
  try {
    await expect(generateDeepGuide({ packet: packet(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); called.push(stage)
      if (stage === 'decisions') throw new Error('Interruzione: Accedi a Codex')
      return response(stage)
    } })).rejects.toThrow('Interruzione')
    const guide = await generateDeepGuide({ packet: packet(), config, work: s.reopen(), request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); called.push(stage); return response(stage)
    } })
    expect(called.filter(s => s === 'plan')).toHaveLength(1)
    expect(called.filter(s => s === 'gameplan')).toHaveLength(1)
    expect(guide.generation.attempts).toHaveLength(6)
    expect(guide.generation.attempts.filter(a => a.status === 'failed')).toHaveLength(1)
    expect(guide.chapters).toHaveLength(8)
    expect(s.work.guideVersion).toBe(1)
  } finally { s.close() }
})

it('never validates a critic-rejected draft and enforces the persisted budget including failed attempts', async () => {
  const s = setup()
  try {
    await expect(generateDeepGuide({ packet: packet(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt)
      if (stage.startsWith('review')) return { verdict: 'revise', checks: [], findings: [{ severity: 'major', targetId: 's1', message: 'Replica ignorata', correction: 'Rivalutare', sourceIds: ['card:b'] }] }
      if (stage === 'repair') return { ...content(), removeIds: [] }
      return response(stage)
    } })).rejects.toThrow('ancora problemi')
    expect(s.work.archive.value('guide', 'validated')).toBeUndefined()
    expect([...s.work.archive.values('guide-draft')].length).toBeGreaterThan(0)
    const attempts = [...s.work.archive.values<MatchupGuide['generation']['attempts'][number]>('guide-attempt-start')].map(a => a.value)
    while (attempts.length < 8) {
      const a = { ...attempts[0], sequence: attempts.length + 1, status: 'failed' as const }
      attempts.push(a); s.work.archive.saveValue('guide-attempt-start', String(a.sequence).padStart(3, '0'), a)
    }
    let count = 0
    await expect(generateDeepGuide({ packet: packet(), config, work: s.reopen(), request: 'Altro input', runner: async () => { count++; return plan } })).rejects.toThrow('8 tentativi')
    expect(count).toBe(0)
  } finally { s.close() }
})

it('invalidates dependent chapters and exercises transitively', () => {
  const c = content(); c.chapters.find(c => c.kind === 'development')!.dependsOn = ['s1']
  expect(invalidatedGuideIds(c, ['s1'])).toEqual(expect.arrayContaining(['s1', 'development', 'closing', 'e1', 'e2']))
})

it('reconciles opening hands, each zone movement, draws and final inventory without waiving old gates', () => {
  expect(checkGuide(contentV2(), packetV2()).errors).toEqual([])
  const check = (change: (c: GuideContent) => void, message: string) => {
    const c = contentV2(); change(c); expect(checkGuide(c, packetV2()).errors.join(' ')).toContain(message)
  }
  check(c => { c.scenarios[0].setupLedger!.events[0].moves.pop() }, 'mano ours')
  check(c => { c.scenarios[0].setupLedger!.events[1].moves[1].from = 'deck' }, 'non dispone')
  check(c => { c.scenarios[0].setupLedger!.events[2].handAfter.ours = 0 }, 'mano ours')
  check(c => { c.scenarios[0].setupLedger!.events[2].kind = 'effect' }, 'setupDraws')
  check(c => { c.scenarios[0].returnedToDeck.ours = 1 }, 'returnedToDeck')
  check(c => { c.scenarios[0].setupLedger = null }, 'registro della preparazione mancante')
  check(c => { c.chapters.find(c => c.kind === 'closing')!.dependsOn = [] }, 'collegamento agli scenari')
  check(c => { c.scenarios[0].calculations[0].expected = 20 }, 'calcolo non valido')
})

it('validates scenarios independently before prose and repairs a ledger without manual input', async () => {
  const s = setup(), calls: string[] = []
  try {
    const guide = await generateDeepGuide({ packet: packetV2(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage)
      if (stage === 'scenarios') { const c = responseV2(stage) as GuideContent; c.scenarios[0].setupLedger!.events[2].handAfter.ours = 0; return c }
      // Even a mistaken critic pass cannot override the invalid hand.
      if (stage === 'prose') expect([...s.work.archive.values('guide-scenarios-validated')]).toHaveLength(1)
      return responseV2(stage)
    } })
    expect(calls).toEqual(['plan', 'scenarios', 'review-scenarios-1', 'repair-scenarios', 'review-scenarios-2', 'prose', 'review-1'])
    expect(guide.generation.attempts).toHaveLength(7)
    expect(checkGuide(guide, guide).errors).toEqual([])
  } finally { s.close() }
})

it('archives an invalid critic response, identifies the field and retries automatically within eight calls', async () => {
  const s = setup(); let critiques = 0
  try {
    const guide = await generateDeepGuide({ packet: packetV2(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt)
      if (stage === 'review-scenarios-1' && critiques++ === 0) return { verdict: 'revise', checks: [], findings: [
        { severity: 'major', targetId: 's1 / s2', message: 'Errore di formato', correction: 'Verificare', sourceIds: [] }] }
      if (stage === 'review-scenarios-1') expect(prompt).toContain('findings[0].targetId')
      return responseV2(stage)
    } })
    expect(guide.generation.attempts).toHaveLength(6)
    expect(guide.generation.attempts[2].status).toBe('failed')
    expect(s.work.archive.value<any>('guide-raw-response', '003').raw.findings[0].targetId).toBe('s1 / s2')
    expect(s.work.archive.value<any>('guide-attempt-failure', '003').code).toBe('invalid-response')
    expect([...s.work.archive.values('guide-invalid-response')]).toHaveLength(1)
  } finally { s.close() }
})

it('stops before prose on repeated critic-format errors or rejected scenarios', async () => {
  for (const malformed of [true, false]) {
    const s = setup(), calls: string[] = []
    try {
      await expect(generateDeepGuide({ packet: packetV2(), config, work: s.work, request: 'Guida', runner: async prompt => {
        const stage = stageOf(prompt); calls.push(stage)
        if (stage.startsWith('review')) return malformed ? { verdict: 'pass', checks: [''], findings: [] } : {
          verdict: 'revise', checks: [], findings: [{ severity: 'major', targetId: 's1', message: 'Replica più forte', correction: 'Ricalcolare', sourceIds: ['card:b'] }] }
        return responseV2(stage)
      } })).rejects.toThrow(malformed ? 'checks' : 'scenari ancora non validati')
      expect(calls).not.toContain('prose')
      expect(calls).toHaveLength(malformed ? 4 : 5)
      expect(s.work.archive.value('guide', 'validated')).toBeUndefined()
    } finally { s.close() }
  }
})

it('counts invalid final critiques and substantive repairs in the same durable eight-call budget', async () => {
  const s = setup(), calls: string[] = []; let invalidCount = 0
  try {
    await expect(generateDeepGuide({ packet: packetV2(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage)
      if (stage === 'review-1' && invalidCount++ === 0) return { verdict: 'pass', checks: [''], findings: [] }
      if (stage.startsWith('review-') && !stage.startsWith('review-scenarios')) return {
        verdict: 'revise', checks: [], findings: [{ severity: 'major', targetId: 's1', message: 'Replica più forte', correction: 'Ricalcolare', sourceIds: ['card:b'] }] }
      return responseV2(stage)
    } })).rejects.toThrow('ancora problemi')
    expect(calls).toHaveLength(8)
    expect(s.work.archive.value('guide', 'validated')).toBeUndefined()
    let extra = 0
    await expect(generateDeepGuide({ packet: packetV2(), config, work: s.reopen(), request: 'Input diverso', runner: async () => { extra++; return plan } })).rejects.toThrow('8 tentativi')
    expect(extra).toBe(0)
  } finally { s.close() }
})

it('reports precise critic contract errors without accepting malformed or empty findings', () => {
  expect(() => readGuideReview({ verdict: 'revise', checks: [], findings: [{ severity: 'major', targetId: 's1',
    message: 'Rilievo', correction: '', sourceIds: [] }] })).toThrow('findings[0].correction')
  expect(() => readGuideReview({ verdict: 'pass', findings: [], checks: Array(101).fill('check') })).toThrow('checks')
})

it('derives individual bench entries without duplicating the common effect or accepting mixed events', () => {
  const c = contentV3(), s = c.scenarios[0], before = s.steps[0].before
  s.steps = [{ action: 'bench', side: 'ours', description: 'Effetto comune pagato una volta', prizesTaken: 0,
    before, after: { ...before, ourBench: 3 }, benchEntries: [
      { printId: 'a', description: 'Primo ingresso' }, { printId: 'a', description: 'Secondo ingresso' }] }]
  s.resources.find(r => r.side === 'ours')!.count = 4
  const compiled = compileGuideTactics(c)
  expect(compiled.scenarios[0].steps.map(s => [s.before.ourBench, s.after.ourBench])).toEqual([[1, 2], [2, 3]])
  expect(compiled.scenarios[0].steps.filter(s => s.groupDescription)).toHaveLength(1)
  expect(compiled.scenarios[0].steps.map(s => s.description)).toEqual(['Primo ingresso', 'Secondo ingresso'])
  expect(c.scenarios[0].steps).toHaveLength(1)
  expect(compileGuideTactics(compiled)).toEqual(compiled)
  expect(checkGuide(compiled, packetV3()).errors).toEqual([])
  for (const mixed of [true, false]) {
    const bad = structuredClone(c)
    if (mixed) bad.scenarios[0].steps[0].after.ourPrizes--
    else bad.scenarios[0].steps[0].benchEntries!.pop()
    expect(compileGuideTactics(bad).scenarios[0].steps).toHaveLength(1)
    expect(checkGuide(compileGuideTactics(bad), packetV3()).errors.length).toBeGreaterThan(0)
  }
})

it('derives retreat from printed cost and signed modifiers and rejects hidden or unverified costs', () => {
  const c = compileGuideTactics(contentV3())
  expect(c.scenarios[0].calculations.find(c => c.retreatCostId)).toMatchObject({ terms: [1, -2], multiplier: 1, minimum: 0, expected: 0 })
  expect(checkGuide(c, packetV3()).errors).toEqual([])
  const check = (mutate: (c: GuideContent) => void, message: string) => {
    const bad = contentV3(); mutate(bad); expect(checkGuide(compileGuideTactics(bad), packetV3()).errors.join(' ')).toContain(message)
  }
  check(c => { c.scenarios[0].retreatCosts![0].printedCost = 0 }, 'costo stampato')
  check(c => { c.scenarios[0].retreatCosts![0].adjustments[0].sourceId = 'missing' }, 'fonte del modificatore')
  check(c => { c.scenarios[0].calculations.push({ label: 'Ritirata', terms: [0], multiplier: 1, minimum: null, expected: 0 }) }, 'precalcolato')
  c.scenarios[0].calculations.find(c => c.retreatCostId)!.terms = [0]
  expect(checkGuide(c, packetV3()).errors.join(' ')).toContain('formula di ritirata incompleta')
})

it('separates sufficient replies from extra development and blocks superfluous requirements, bad thresholds and absent cards', () => {
  const check = (mutate: (c: GuideContent) => void, message: string) => {
    const c = compileGuideTactics(contentV3()); mutate(c); expect(checkGuide(c, packetV3()).errors.join(' ')).toContain(message)
  }
  expect(checkGuide(compileGuideTactics(contentV3()), packetV3()).errors).toEqual([])
  check(c => { c.scenarios[0].replyComparison!.minimumReplyId = 'extended' }, 'meno risorse')
  check(c => { c.scenarios[0].replyComparison!.omissionTests[0].remainingDamage = 95 }, 'requisito superfluo')
  check(c => { c.scenarios[0].replyComparison!.omissionTests = [] }, 'manca prova di rimozione')
  check(c => { c.scenarios[0].replyComparison!.options[0].damage = 110 }, 'danno della replica')
  check(c => { c.scenarios[0].replyComparison!.options[0].reachesThreshold = false }, 'soglia di KO')
  check(c => { c.scenarios[0].replyComparison!.options[0].requiredCards[0].count = 3 }, 'risorsa avversaria non disponibile')
  check(c => { c.scenarios[0].replyComparison!.options[0].sourceIds = ['missing'] }, 'prove della replica incomplete')
  check(c => { c.scenarios[0].replyComparison = null }, 'confronto delle repliche mancante')
})

it('archives automatic derivations before the independent critic and preserves the v3 contract on resume', async () => {
  const s = setup(), calls: string[] = []
  try {
    await expect(generateDeepGuide({ packet: packetV3(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage)
      if (stage === 'review-scenarios-1') {
        expect(prompt).toContain('"retreatCostId":"retreat-a"')
        expect([...s.work.archive.values('guide-derived-tactics')]).toHaveLength(1)
      }
      if (stage === 'prose') throw new Error('Interruzione: Accedi a Codex')
      return responseV3(stage)
    } })).rejects.toThrow('Interruzione')
    const guide = await generateDeepGuide({ packet: packetV3(), config, work: s.reopen(), request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage); return responseV3(stage)
    } })
    expect(calls).toEqual(['plan', 'scenarios', 'review-scenarios-1', 'prose', 'prose', 'review-1'])
    expect(guide.generation.attempts).toHaveLength(6)
    expect(checkGuide(guide, guide).errors).toEqual([])
    expect(guide.basis.promptVersion).toBe('matchup-guide-3')
    assertGuideReport({ ...guide.basis, guide })
    const html = renderToStaticMarkup(createElement(DeepMatchupGuide, { guide, renderText: text => text }))
    expect(html).toContain('Confronto delle repliche e risorse necessarie')
    expect(html).toContain('Se manca una risorsa')
    expect(html).toContain('nessuna carta specifica')
    expect(html).toContain('1 + -2')
    expect(() => assertGuideReport({ ...guide.basis, guide: { ...guide, basis: { ...guide.basis, promptVersion: 'unknown' as never } } })).toThrow('non corrisponde')
  } finally { s.close() }
})

it('resumes v2 after verified scenarios without repeating calls or resetting failed-attempt accounting', async () => {
  const s = setup(), calls: string[] = []
  try {
    await expect(generateDeepGuide({ packet: packetV2(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage)
      if (stage === 'prose') throw new Error('Interruzione: Accedi a Codex')
      return responseV2(stage)
    } })).rejects.toThrow('Interruzione')
    const guide = await generateDeepGuide({ packet: packetV2(), config, work: s.reopen(), request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage); return responseV2(stage)
    } })
    expect(calls).toEqual(['plan', 'scenarios', 'review-scenarios-1', 'prose', 'prose', 'review-1'])
    expect(guide.generation.attempts).toHaveLength(6)
    expect(guide.generation.attempts.filter(a => a.status === 'failed')).toHaveLength(1)
  } finally { s.close() }
})

it('upgrades legacy tactical text without replaying its raw query archive and keeps old workflow contracts on resume', async () => {
  const s = setup()
  let legacyWork: AiAnalysisWork | undefined
  try {
    const oldJob = s.jobs.start('matchup-generate', s.project.id, 'legacy-workflow')
    const directory = join(s.folder, 'legacy')
    legacyWork = new AiAnalysisWork(directory, s.jobs, oldJob.id, new AbortController().signal, { kind: oldJob.kind, args: [] })
    legacyWork.close()
    legacyWork = new AiAnalysisWork(directory, s.jobs, oldJob.id, new AbortController().signal, { kind: oldJob.kind, args: [], guideVersion: 1 })
    expect(legacyWork.guideVersion).toBeUndefined()
    const p = packet(), text = 'Piano integrale '.repeat(600) + 'legacy-full-end'
    const previous = { projectId: p.basis.projectId, metaId: p.basis.metaId, opponentId: p.basis.opponentId,
      deckHash: p.basis.deckHash, generatedAt: '2026-10-30T00:00:00.000Z', sampleDeckUrl: null,
      strategy: text, strengths: 'Punti forti', weaknesses: 'Rischi', ourKeyCards: 'A', theirKeyCards: 'B', limitations: 'Ipotesi',
      aiQueries: { archive: 'raw-archive-marker'.repeat(40_000) } as never }
    let calls = 0
    const guide = await generateDeepGuide({ packet: p, config, work: s.work, request: 'Aggiorna', previous, revision: true,
      runner: async prompt => {
        calls++; expect(prompt).toContain('legacy-full-end'); expect(prompt).not.toContain('raw-archive-marker')
        return response(stageOf(prompt))
      } })
    expect(calls).toBe(5)
    expect(guide.chapters).toHaveLength(8)
  } finally { legacyWork?.close(); s.close() }
})

it('applies only unambiguous minor textual corrections and requires a separate final review within eight calls', async () => {
  const s = setup(), calls: string[] = []
  const correction = { targetId: 'development', before: 'Contenuto di development', after: 'Testo corretto della linea' }
  const minor = { verdict: 'revise' as const, findings: [{ severity: 'minor' as const, targetId: 'development', message: 'Testo incoerente', correction: 'Allineare', sourceIds: [] }], checks: [], textCorrections: [correction] }
  try {
    const guide = await generateDeepGuide({ packet: packet(), config, work: s.work, request: 'Guida', runner: async prompt => {
      const stage = stageOf(prompt); calls.push(stage)
      if (stage === 'review-1') return { ...minor, findings: [{ ...minor.findings[0], severity: 'major' }], textCorrections: [] }
      if (stage === 'repair') return { ...content(), removeIds: [] }
      if (stage === 'review-2') return minor
      return response(stage)
    } })
    expect(calls.at(-1)).toBe('review-3')
    expect(guide.generation.attempts).toHaveLength(8)
    expect(guide.chapters.find(c => c.id === 'development')!.body).toBe(correction.after)
    const duplicate = content(); duplicate.chapters.find(c => c.id === 'development')!.body += ` ${correction.before}`
    expect(applyGuideTextCorrections(duplicate, minor)).toBeNull()
    expect(applyGuideTextCorrections(content(), { ...minor, findings: [{ ...minor.findings[0], severity: 'major' }] })).toBeNull()
    expect(applyGuideTextCorrections(content(), { ...minor, textCorrections: [{ ...correction, before: 'Non presente' }] })).toBeNull()
    const scenarioPatch = { targetId: 's1', before: 'Replica che rompe il piano', after: 'Replica corretta' }
    const scenarioReview = { ...minor, findings: [{ ...minor.findings[0], targetId: 's1' }], textCorrections: [scenarioPatch] }
    const corrected = applyGuideTextCorrections(content(), scenarioReview)!
    expect(corrected.scenarios[0].opponentResponse).toBe('Replica corretta')
    expect(corrected.scenarios[0].inventory).toEqual(content().scenarios[0].inventory)
    expect(corrected.scenarios[0].steps).toEqual(content().scenarios[0].steps)
    const ambiguous = content(); ambiguous.scenarios[0].pivot = scenarioPatch.before
    expect(applyGuideTextCorrections(ambiguous, scenarioReview)).toBeNull()
    expect(applyGuideTextCorrections(content(), { ...scenarioReview, textCorrections: [{ ...scenarioPatch, before: content().scenarios[0].setupHistory }] })).toBeNull()
  } finally { s.close() }
})

it('revises only affected content and forces a repair when a dependent chapter was omitted', async () => {
  const s = setup()
  try {
    const p = packet(), before = content()
    before.chapters.find(c => c.id === 'closing')!.dependsOn = ['resources']
    const previous = deepGuideReport({ ...p.basis, generatedAt: '2026-10-30T00:00:00.000Z', sampleDeckUrl: null }, {
      ...before, formatVersion: 1, basis: p.basis, ourList: p.ourList, opponentLists: p.opponentLists, sources: p.sources,
      review: { verdict: 'pass', findings: [], checks: [] }, localChecks: checkGuide(before, p).checks,
      generation: { config, attempts: [], parentDependencyHash: null } })
    const calls: string[] = []
    const guide = await generateDeepGuide({ packet: p, config, work: s.work, request: 'Conserva una risorsa', previous, revision: true,
      runner: async prompt => {
        const stage = stageOf(prompt); calls.push(stage)
        if (stage.startsWith('review')) return reviewed
        const kind = stage === 'revision' ? 'resources' : 'closing'
        return { ...before, chapters: [{ ...before.chapters.find(c => c.id === kind)!, body: `Rivisto ${kind}` }],
          claims: [], scenarios: stage === 'repair' ? [{ ...before.scenarios[0], id: 'new-scenario' }] : [],
          exercises: [], limitations: ['Limite aggiornato'], removeIds: [] }
      } })
    expect(calls).toEqual(['revision', 'review-1', 'repair', 'review-2'])
    expect(guide.chapters.find(c => c.id === 'opening')).toEqual(before.chapters.find(c => c.id === 'opening'))
    expect(guide.scenarios.slice(0, 2)).toEqual(before.scenarios)
    expect(guide.scenarios[2].id).toBe('new-scenario')
    expect(guide.limitations).toEqual(['Limite aggiornato'])
    expect(guide.chapters.find(c => c.id === 'closing')!.body).toBe('Rivisto closing')
    expect(s.jobs.diagnostics(s.job.id)?.guide).toMatchObject({ attempts: 4, localErrors: 0, validated: true })
  } finally { s.close() }
})

it('accepts explicit revalidation of unchanged dependencies without waiving quantity errors', async () => {
  for (const badQuantity of [false, true]) {
    const s = setup(), p = packet(), before = content(), calls: string[] = []
    before.chapters.find(c => c.id === 'closing')!.dependsOn = ['resources']
    const previous = deepGuideReport({ ...p.basis, generatedAt: '2026-10-30T00:00:00.000Z', sampleDeckUrl: null }, {
      ...before, formatVersion: 1, basis: p.basis, ourList: p.ourList, opponentLists: p.opponentLists, sources: p.sources,
      review: { verdict: 'pass', findings: [], checks: [] }, localChecks: checkGuide(before, p).checks,
      generation: { config, attempts: [], parentDependencyHash: null } })
    try {
      const result = generateDeepGuide({ packet: p, config, work: s.work, request: 'Rivedi la risorsa', previous, revision: true,
        runner: async prompt => {
          const stage = stageOf(prompt); calls.push(stage)
          if (stage.startsWith('review')) return { ...reviewed, revalidatedIds: ['closing', 's1'] }
          const bad = structuredClone(before.scenarios[0]); bad.resources[0].count = 20
          return { chapters: [{ ...before.chapters.find(c => c.id === 'resources')!, body: 'Nuova spiegazione della risorsa' }],
            claims: [], scenarios: badQuantity ? [bad] : [], exercises: [], limitations: [], changeSummary: 'Risorsa rivista', removeIds: [] }
        } })
      if (badQuantity) {
        await expect(result).rejects.toThrow('Guida non pubblicata')
        expect(s.work.archive.value('guide', 'validated')).toBeUndefined()
      } else {
        const guide = await result
        expect(calls).toEqual(['revision', 'review-1'])
        expect(guide.chapters.find(c => c.id === 'closing')).toEqual(before.chapters.find(c => c.id === 'closing'))
        expect(guide.review.revalidatedIds).toContain('closing')
      }
    } finally { s.close() }
  }
})

it('recovers only validated guides, preserves legacy history and rejects mismatched lists before persistence', async () => {
  const s = setup()
  try {
    s.projects.importDeck({ projectId: s.project.id, rawText: '4 A\n56 Energy', source: 'paste' })
    const metaId = 'a'.repeat(64), date = '2026-10-30T12:00:00.000Z'
    s.projects.saveMetaSnapshot({ id: metaId, fetchedAt: date, sourceUrl: 'https://limitlesstcg.com/decks',
      circuit: 'WESTERN', format: 'STANDARD', period: 'Test', decks: [{ id: '284', name: 'B', url: 'https://limitlesstcg.com/decks/284', share: 1, count: 1 }] } as never)
    const ctx = s.projects.getCurrentDeckContext(s.project.id)!
    const p = packet(); p.basis = { ...p.basis, projectId: s.project.id, metaId, deckHash: s.projects.getCurrentDeckHash(s.project.id)!, deckVersionId: ctx.versionId, deckResolutionId: ctx.resolutionId }
    p.basis.dependencyHash = packetHash(p)
    const guide = await generateDeepGuide({ packet: p, config, work: s.work, request: 'Guida', runner: async prompt => response(stageOf(prompt)) })
    const base = { jobId: s.job.id, projectId: s.project.id, metaId, opponentId: '284', deckHash: p.basis.deckHash,
      deckVersionId: ctx.versionId, deckResolutionId: ctx.resolutionId, generatedAt: date, sampleDeckUrl: null }
    const report = deepGuideReport(base, guide)
    assertGuideReport(report)
    s.jobs.prepare(s.job.id, { analysisVersion: 3, validatedDraft: true, base })
    s.jobs.ready(s.job.id, { report })
    const ready = s.jobs.get(s.job.id)!
    expect(recoverMatchupJob(ready, s.jobs, s.projects, s.folder)).toBe('applied')
    expect(recoverMatchupJob(ready, s.jobs, s.projects, s.folder)).toBe('applied')
    const other = s.projects.create({ name: 'Other', format: 'STANDARD' })
    expect(s.projects.listMatchupReports(other.id, metaId)).toEqual([])
    expect(() => s.projects.saveMatchupReport({ ...report, deckHash: 'different' })).toThrow('lista')
    const broken = structuredClone(report); broken.guide!.sources[0].content = 'altered'
    expect(() => s.projects.saveMatchupReport(broken)).toThrow('impronta')
    const reopened = new ProjectStore(s.path)
    try {
      expect(reopened.listMatchupReports(s.project.id, metaId)[0].guide).toEqual(guide)
      expect(reopened.listMatchupDiscussions(s.project.id, '284')).toHaveLength(1)
    } finally { reopened.close() }
    if (process.env.POKEGURU_GUIDE_UI_DB) {
      const db = new DatabaseSync(s.path, { readOnly: true })
      try { await backup(db, process.env.POKEGURU_GUIDE_UI_DB) } finally { db.close() }
    }
  } finally { s.close() }
})
