import { guideChapterKinds } from '../shared/matchup-guide'
import {GUIDE_REPLY_OTHER_LIMIT} from '../shared/guide-construction-limits'
import {GUIDE_FINITE_ANALYSIS_CONTRACT,GUIDE_FINITE_REPLY_LIMIT} from '../shared/guide-analysis-scope'
import { guideSetupKinds, guideZones } from '../shared/guide-setup-ledger'
const str = { type: 'string' }
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' })
const id = { type: 'string', minLength: 1, maxLength: 160, pattern: '^[a-zA-Z0-9:._-]+$' }
const num = { type: 'number' }
const integer = { type: 'integer' }
const nullable = (v: object) => ({ anyOf: [v, { type: 'null' }] })
const arr = <T extends object>(items: T, maxItems?: number) => ({ type: 'array', items, ...(maxItems !== undefined ? { maxItems } : {}) })
const values = (...items: string[]) => ({ type: 'string', enum: items })
const obj = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false,
  properties, required: Object.keys(properties) })
const position = obj({ ourBench: integer, opponentBench: integer, ourPrizes: integer, opponentPrizes: integer })
const side = values('ours', 'opponent'), count = { type: 'integer', minimum: 0, maximum: 60 }
const ledgerCard = { side, printId: id, count: { ...count, minimum: 1 } }
const ledgerEvent = obj({ side, turn: count, kind: values(...guideSetupKinds), description: text(2000),
    moves: arr(obj({ ...ledgerCard, from: values(...guideZones), to: values(...guideZones) }), 80),
    handAfter: obj({ ours: count, opponent: count }) })
const ledgerSchema = obj({ openingHands: arr(obj(ledgerCard), 26), openingPrizes: arr(obj(ledgerCard), 26), events: { ...arr(ledgerEvent, 160), minItems: 1 } })
export const guideContentProperties = {
  chapters: arr(obj({ id: str, kind: values(...guideChapterKinds), title: str, body: str, sourceIds: arr(str), dependsOn: arr(str) })),
  claims: arr(obj({ id: str, text: str, sourceIds: arr(str), assumption: { type: 'boolean' } })),
  scenarios: arr(obj({ id: str, title: str, opponentListId: str, state: str, assumptions: arr(str),
    inventory: arr(obj({ side: values('ours', 'opponent'), printId: str, count: integer,
      zone: values('active', 'bench', 'evolution', 'attached', 'hand', 'discard', 'prizes', 'deck', 'stadium', 'lost') })),
    setupDraws: obj({ ours: integer, opponent: integer }), returnedToDeck: obj({ ours: integer, opponent: integer }), setupHistory: str,
    setupLedger: nullable(ledgerSchema),
    resources: arr(obj({ side: values('ours', 'opponent'), printId: str, count: integer })),
    benchLimit: obj({ ours: integer, opponent: integer }),
    steps: arr(obj({ action: values('gust', 'active-ko', 'bench-ko', 'promote', 'bench', 'other'), side: values('ours', 'opponent'),
      description: str, prizesTaken: integer, before: position, after: position })),
    calculations: arr(obj({ label: str, terms: arr(num), multiplier: num, minimum: nullable(num), expected: num })),
    explanation: str, opponentResponse: str, pivot: str, sourceIds: arr(str) })),
  exercises: arr(obj({ id: str, question: str, solution: str, sourceIds: arr(str), scenarioIds: arr(str) })),
  limitations: arr(str), changeSummary: str
}
export const guideContentSchema = obj(guideContentProperties)
export const guidePlanSchema = obj({ thesis: str, sections: arr(obj({ kind: values(...guideChapterKinds), objective: str, sourceIds: arr(str) })),
  additionalPrintIds: arr(str), additionalLists: arr(obj({ cardName: nullable(str), offset: integer })), gaps: arr(str) })
export const guideReviewSchema = obj({ verdict: values('pass', 'revise', 'incomplete'), findings: arr(obj({
  severity: values('blocking', 'major', 'minor'), targetId: id, message: text(4000), correction: text(4000), sourceIds: arr(id, 200) }), 50), checks: arr(text(30_000), 100),
  revalidatedIds: { ...arr(id, 200), description: 'ID esatti dei contenuti rivalutati dopo una modifica alle loro dipendenze, anche se il testo resta invariato. Per ciascun errore locale «ID: dipendenza modificata, contenuto da rivalutare nella patch», includi ID solo dopo avere verificato che sia ancora coerente con tutta la guida e il feedback. Se è incoerente, omettilo e apri un finding. Questa conferma non supera errori di quantità, aritmetica, fonti o struttura.' },
  textCorrections: { ...arr(obj({ targetId: id, before: text(8000), after: text(8000) }), 12), description:
    'Solo per rilievi minor di prosa: targetId esatto del capitolo, claim, scenario o esercizio. before è una citazione letterale unica nel testo: body, text, explanation/opponentResponse/pivot oppure question/solution; after è la sostituzione completa corretta. Coprire tutti i rilievi minor, altrimenti []. Non cambiare stato iniziale, storia, inventari, azioni, conti, riferimenti o fonti. La sostituzione richiederà una nuova revisione indipendente.' } })
export const guidePatchSchema = obj({ ...guideContentProperties, removeIds: arr(str) })
export const guideReviewSchemaV24=structuredClone(guideReviewSchema) as any
guideReviewSchemaV24.properties.findings.items.properties.proposedActions={...arr(obj({scenarioId:id,side,turn:{type:'integer',minimum:1,maximum:160},action:values('ordinary-evolution','other'),reason:text(4000)}),8),description:'Azioni concrete proposte dal finding: includere ogni evoluzione ordinaria suggerita con turno globale e lato reali, anche nel setup. [] solo per rilievi senza azione alternativa. Il primo turno di ogni giocatore vieta evoluzioni ordinarie anche per Base dal setup; controllare turnFacts prima di aprire un finding.'}
guideReviewSchemaV24.properties.findings.items.required.push('proposedActions')
export const guideScenarioSchema = obj({ ...guideContentProperties,
  chapters: arr(guideContentProperties.chapters.items, 0), exercises: arr(guideContentProperties.exercises.items, 0),
  scenarios: { ...arr(obj({ ...guideContentProperties.scenarios.items.properties, setupLedger: ledgerSchema }), 2), minItems: 2 } })
export const guideProseSchema = obj({ ...guideContentProperties, scenarios: arr(guideContentProperties.scenarios.items, 0) })

const retreatCosts = arr(obj({ id, context: text(4000), side, printId: id, printedCost: count,
  adjustments: arr(obj({ sourceId: id, amount: num, reason: text(4000) }), 12) }), 20)
const replyOption = obj({ id, sequence: { ...arr(text(4000), 30), minItems: 1 },
    requiredCards: arr(obj({ printId: id, count: { ...count, minimum: 1 }, access: text(4000) }), 30),
    specificDraws: arr(id, 30), attachments: count, terms: { ...arr(num, 30), minItems: 1 }, multiplier: num, damage: num,
    reachesThreshold: { type: 'boolean' }, remainingHp: num, outcome: text(4000), sourceIds: arr(id, 100) })
const replyComparison = obj({ objective: text(4000), threshold: num, minimumReplyId: nullable(id), preferredReplyId: id,
  options: { ...arr(replyOption, 6), minItems: 2 },
  omissionTests: arr(obj({ printId: id, remainingDamage: num, reason: text(4000) }), 30), conclusion: text(4000) })
const scenarioV3 = obj({ ...guideContentProperties.scenarios.items.properties, setupLedger: ledgerSchema,
  steps: arr(obj({ action: values('gust', 'active-ko', 'bench-ko', 'promote', 'bench', 'other'), side, description: text(4000), prizesTaken: count,
    before: position, after: position, benchEntries: arr(obj({ printId: id, description: text(4000) }), 8) }), 40),
  retreatCosts, replyComparison })
export const guideScenarioSchemaV3 = obj({ ...guideContentProperties, chapters: arr(guideContentProperties.chapters.items, 0),
  exercises: arr(guideContentProperties.exercises.items, 0), scenarios: { ...arr(scenarioV3, 2), minItems: 2 } })
export const guidePatchSchemaV3 = obj({ ...guideContentProperties, scenarios: arr(scenarioV3, 12), removeIds: arr(str) })
const scenarioV4 = obj({ ...scenarioV3.properties,
  turnAudit: arr(obj({ turn: count, side, availableAttack: text(4000), choice: text(4000), reason: text(4000) }), 60),
  development: arr(obj({ turn: count, side, stepIndexes: arr(count, 40), resources: arr(obj({ printId: id, count }), 60), access: text(4000), nextAttack: text(4000), pivot: text(4000) }), 20),
  replyComparison: obj({ ...replyComparison.properties, options: { ...arr(obj({ ...replyOption.properties, steps: scenarioV3.properties.steps }), 6), minItems: 2 } }) })
export const guideScenarioSchemaV4 = obj({ ...guideContentProperties, chapters: arr(guideContentProperties.chapters.items, 0), exercises: arr(guideContentProperties.exercises.items, 0), scenarios: { ...arr(scenarioV4, 2), minItems: 2 } })
export const guidePatchSchemaV4 = obj({ ...guideContentProperties, scenarios: arr(scenarioV4, 12), removeIds: arr(str) })
const without = (properties: Record<string, object>, keys: string[]) => Object.fromEntries(Object.entries(properties).filter(([key]) => !keys.includes(key)))
const movementEvent = obj(without(ledgerEvent.properties, ['handAfter']))
const lineEvent = obj({ ...movementEvent.properties, action: values('gust', 'active-ko', 'bench-ko', 'promote', 'bench', 'other'), affectedSide: side })
const scenarioV5 = obj({ ...without(scenarioV4.properties, ['state', 'inventory', 'setupDraws', 'returnedToDeck', 'setupHistory', 'steps', 'setupLedger', 'replyComparison', 'development']),
  developmentEvents: scenarioV4.properties.development,
  positionNotes: text(1500), setupLedger: obj({ openingHands: arr(obj(ledgerCard), 26), openingPrizes: arr(obj(ledgerCard), 26), events: arr(movementEvent, 160) }),
  lineEvents: arr(lineEvent, 40), replyComparison: obj({ ...replyComparison.properties,
    options: { ...arr(obj({ ...replyOption.properties, lineEvents: arr(lineEvent, 40) }), 6), minItems: 2 } }) })
export const guideScenarioSchemaV5 = obj({ ...guideContentProperties, chapters: arr(guideContentProperties.chapters.items, 0), exercises: arr(guideContentProperties.exercises.items, 0), scenarios: { ...arr(scenarioV5, 2), minItems: 2 } })
export const guidePatchSchemaV5 = obj({ ...guideContentProperties, scenarios: arr(scenarioV5, 12), removeIds: arr(str) })
const scenarioV6 = obj({ ...scenarioV5.properties, replyComparison: obj({ ...replyComparison.properties,
  options: { ...arr(obj({ ...replyOption.properties, intent: values('attack','defend'), forkAtEvent: count, lineEvents: arr(lineEvent,40) }),6), minItems: 2 } }) })
export const guideScenarioSchemaV6 = obj({ ...guideContentProperties, chapters: arr(guideContentProperties.chapters.items,0), exercises: arr(guideContentProperties.exercises.items,0), scenarios: {...arr(scenarioV6,2),minItems:2} })
export const guidePatchSchemaV6 = obj({ ...guideContentProperties, scenarios:arr(scenarioV6,12),removeIds:arr(str) })
const eventV7 = obj({...movementEvent.properties,attackName:nullable(str)})
const lineV7 = obj({...lineEvent.properties,attackName:nullable(str)})
const openingSide = obj({active:str,hand:{...arr(str,6),minItems:6},prizes:{...arr(str,6),minItems:6}})
const developmentV7 = obj({eventIndex:{type:'integer',minimum:0,maximum:39},resources:arr(obj({printId:id,count}),60),access:text(4000),nextAttack:text(4000),pivot:text(4000)})
const scenarioV7 = obj({...without(scenarioV6.properties,['setupLedger','developmentEvents','replyComparison']),
  opening:obj({ours:openingSide,opponent:openingSide}),setupEvents:arr(eventV7,160),lineEvents:{...arr(lineV7,40),minItems:3},
  developmentEvents:{...arr(developmentV7,20),minItems:3},
  replyComparison:obj({...replyComparison.properties,options:{...arr(obj({...replyOption.properties,intent:values('attack','defend'),forkAtEvent:count,lineEvents:arr(lineV7,40)}),6),minItems:2}})})
export const guideScenarioSchemaV7 = obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV7,2),minItems:2}})
export const guidePatchSchemaV7 = obj({...guideContentProperties,scenarios:arr(scenarioV7,12),removeIds:arr(str)})
const optionV8 = obj({...without(replyOption.properties,['requiredCards','attachments']),replyTurn:{type:'integer',minimum:1,maximum:60},intent:values('attack','defend'),forkAtEvent:count,lineEvents:arr(lineV7,40),promotionRationale:text(4000)})
const scenarioV8 = obj({...scenarioV7.properties,replyComparison:obj({...without(replyComparison.properties,['options','omissionTests']),
  options:{...arr(optionV8,8),minItems:2},omissionTests:arr(obj({printId:id,remainingDamage:num,terms:{...arr(num,30),minItems:1},multiplier:num,witnessReplyId:nullable(id),reason:text(4000)}),30)})})
export const guideScenarioSchemaV8 = obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV8,2),minItems:2}})
export const guidePatchSchemaV8 = obj({...guideContentProperties,scenarios:arr(scenarioV8,12),removeIds:arr(str)})
const energyRouteV9 = obj({side,printId:id,count:{...count,minimum:1},path:{...arr(values(...guideZones),5),minItems:2},hostPrintId:nullable(id),sourceIds:{...arr(id,5),minItems:1}})
const setupEventV9 = obj({...without(eventV7.properties,['turn','side']),energyRoutes:arr(energyRouteV9,40)})
const lineEventV9 = obj({...setupEventV9.properties,action:lineEvent.properties.action,affectedSide:side})
const finalAttackV9 = obj({...lineEventV9.properties,attackName:str})
const setupTurnV9 = obj({draw:id,events:arr(setupEventV9,29),decision:obj({availableAttack:text(4000),choice:text(4000),reason:text(4000)})})
const mainTurnV9 = obj({draw:id,events:arr(lineEventV9,11)})
const planNoteV9 = obj({access:text(4000),nextAttack:text(4000),pivot:text(4000)})
const branchTurnV9 = obj({draw:nullable(id),events:arr(lineEventV9,15)})
const branchTurnsV9 = obj({ours:branchTurnV9,opponent:branchTurnV9,next:branchTurnV9})
const optionV9 = obj({...without(optionV8.properties,['replyTurn','lineEvents']),turns:branchTurnsV9})
const openingSideV9 = obj({...openingSide.properties,bench:arr(str,5)})
const scenarioV9 = obj({...without(scenarioV8.properties,['resources','setupEvents','lineEvents','developmentEvents','turnAudit','replyComparison']),
  opening:obj({ours:openingSideV9,opponent:openingSideV9}),firstOpponentTurn:nullable(setupTurnV9),setupRounds:arr(obj({ours:setupTurnV9,opponent:setupTurnV9}),3),
  turns:obj({ours:mainTurnV9,opponent:mainTurnV9,next:obj({draw:id,beforeAttack:arr(lineEventV9,11),attack:finalAttackV9,afterAttack:arr(lineEventV9,3)})}),
  developmentPlan:obj({ours:planNoteV9,opponent:planNoteV9,next:planNoteV9}),
  replyComparison:obj({...(scenarioV8.properties.replyComparison as {properties:Record<string,object>}).properties,options:{...arr(optionV9,8),minItems:2}})})
export const guideScenarioSchemaV9 = obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV9,2),minItems:2}})
export const guidePatchSchemaV9 = obj({...guideContentProperties,scenarios:arr(scenarioV9,12),removeIds:arr(str)})
const attackRefV10=obj({printId:id,attackName:str})
const setupEventV10=obj({...without(setupEventV9.properties,['attackName']),description:text(1000),attack:nullable(attackRefV10)})
const lineEventV10=obj({...setupEventV10.properties,action:lineEvent.properties.action,affectedSide:side})
const finalAttackV10=obj({...lineEventV10.properties,attack:attackRefV10})
const setupTurnV10=obj({...setupTurnV9.properties,events:arr(setupEventV10,29)})
const mainTurnV10=obj({draw:id,events:arr(lineEventV10,11)})
const nextTurnV10=obj({draw:id,beforeAttack:arr(lineEventV10,11),attack:finalAttackV10,afterAttack:arr(lineEventV10,3)})
const branchTurnsV10=obj({ours:obj({draw:nullable(id),events:arr(lineEventV10,15)}),opponent:nullable(mainTurnV10),
  next:{anyOf:[nextTurnV10,obj({terminal:{type:'boolean',const:true}})]}})
const optionV10=obj({...without(optionV9.properties,['turns']),turns:branchTurnsV10,
  forkAtEvent:{type:'integer',minimum:0,maximum:12},
  accessProof:nullable(obj({sourceIds:{...arr(id,12),minItems:1},reason:text(4000)}))})
const scenarioV10=obj({...without(scenarioV9.properties,['firstOpponentTurn','setupRounds','turns','replyComparison']),firstOpponentTurn:nullable(setupTurnV10),
  setupRounds:arr(obj({ours:setupTurnV10,opponent:setupTurnV10}),3),turns:obj({ours:mainTurnV10,opponent:mainTurnV10,next:nextTurnV10}),
  replyComparison:obj({...(scenarioV8.properties.replyComparison as {properties:Record<string,object>}).properties,
    coverage:obj({direct:id,access:id,defend:id}),options:{...arr(optionV10,8),minItems:3}})})
export const guideScenarioSchemaV10=obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV10,2),minItems:2}})
export const guidePatchSchemaV10=obj({...guideContentProperties,scenarios:arr(scenarioV10,12),removeIds:arr(str)})
const routeV11=obj({...energyRouteV9.properties,attachment:nullable(values('manual','effect'))})
const setupEventV11=obj({...setupEventV10.properties,trainer:nullable(id),energyRoutes:arr(routeV11,40)})
const lineEventV11=obj({...setupEventV11.properties,action:lineEvent.properties.action,affectedSide:side})
const finalAttackV11=obj({...lineEventV11.properties,attack:attackRefV10})
const setupTurnV11=obj({...setupTurnV10.properties,events:arr(setupEventV11,29)})
const mainTurnV11=obj({draw:id,events:arr(lineEventV11,11)})
const nextTurnV11=obj({draw:id,beforeAttack:arr(lineEventV11,11),attack:finalAttackV11,afterAttack:arr(lineEventV11,3)})
const optionV11=obj({...without(optionV10.properties,['sequence','turns']),continuation:{type:'string',const:'if-game-continues'},
  turns:obj({ours:obj({draw:nullable(id),events:arr(lineEventV11,15)}),opponent:mainTurnV11,next:nextTurnV11})})
const causalNote=obj({reason:text(800),pivot:text(1500)})
const scenarioV11=obj({...without(scenarioV10.properties,['title','positionNotes','explanation','opponentResponse','pivot','firstOpponentTurn','setupRounds','turns','replyComparison','developmentPlan']),
  decision:text(240),positionAnnotations:arr(obj({side,printId:id,zone:values('active','bench'),copy:{type:'integer',minimum:1,maximum:8},damage:{type:'integer',minimum:0,maximum:1000},condition:nullable(text(100))}),18),
  firstOpponentTurn:nullable(setupTurnV11),setupRounds:arr(obj({ours:setupTurnV11,opponent:setupTurnV11}),3),turns:obj({ours:mainTurnV11,opponent:mainTurnV11,next:nextTurnV11}),
  developmentPlan:obj({ours:causalNote,opponent:causalNote,next:causalNote}),replyComparison:obj({...(scenarioV10.properties.replyComparison as {properties:Record<string,object>}).properties,options:{...arr(optionV11,8),minItems:3}})})
export const guideScenarioSchemaV11=obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV11,2),minItems:2}})
export function singleScenarioSchemaV11(idValue:string){return obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(obj({...scenarioV11.properties,id:{type:'string',const:idValue}}),1),minItems:1}})}
export const guidePatchSchemaV11=obj({...guideContentProperties,scenarios:arr(scenarioV11,12),removeIds:arr(str)})

const eventV12=obj({...lineEventV11.properties,retreatCostId:nullable(id)})
const setupEventV12=obj({...setupEventV11.properties,retreatCostId:nullable(id)})
const setupTurnV12=obj({...setupTurnV11.properties,events:arr(setupEventV12,29)})
const mainTurnV12=obj({draw:id,events:arr(eventV12,11)})
const nextTurnV12=obj({draw:id,beforeAttack:arr(eventV12,11),attack:obj({...eventV12.properties,attack:attackRefV10}),afterAttack:arr(eventV12,3)})
const optionV12=obj({...optionV11.properties,turns:obj({ours:obj({draw:nullable(id),events:arr(eventV12,15)}),opponent:mainTurnV12,next:nextTurnV12})})
const scenarioV12=obj({...scenarioV11.properties,
  retreatCosts:arr(obj({id,context:text(4000),side,printId:id,adjustments:arr(obj({sourceId:id,amount:num,reason:text(4000)}),12)}),20),
  firstOpponentTurn:nullable(setupTurnV12),setupRounds:arr(obj({ours:setupTurnV12,opponent:setupTurnV12}),3),turns:obj({ours:mainTurnV12,opponent:mainTurnV12,next:nextTurnV12}),
  replyComparison:obj({...without((scenarioV11.properties.replyComparison as {properties:Record<string,object>}).properties,['options','omissionTests']),
    options:{...arr(optionV12,8),minItems:3},attackReview:arr(obj({printId:id,attackName:str,replyId:nullable(id),reason:text(1500)}),40),
    omissionTests:arr(obj({printId:id,witnessReplyId:nullable(id),reason:text(4000)}),30)})})
export const guideScenarioSchemaV12=obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(scenarioV12,2),minItems:2}})
export function singleScenarioSchemaV12(idValue:string){return obj({...guideContentProperties,chapters:arr(guideContentProperties.chapters.items,0),exercises:arr(guideContentProperties.exercises.items,0),scenarios:{...arr(obj({...scenarioV12.properties,id:{type:'string',const:idValue}}),1),minItems:1}})}
export const guidePatchSchemaV12=obj({...guideContentProperties,scenarios:arr(scenarioV12,12),removeIds:arr(str)})

function withDeckObservations(schema:any):any{
  if(Array.isArray(schema))return schema.map(withDeckObservations)
  if(!schema||typeof schema!=='object')return schema
  const out:any=Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,withDeckObservations(v)]))
  if(schema.properties?.moves&&schema.properties?.energyRoutes){
    out.properties.deckObservations=arr(obj({side,printId:id,count:{...count,minimum:1},position:values('top','bottom'),sourceIds:{...arr(id,5),minItems:1}}),20)
    out.required=[...out.required,'deckObservations']
  }
  return out
}
export const guideScenarioSchemaV13=withDeckObservations(guideScenarioSchemaV12)
export const guidePatchSchemaV13=withDeckObservations(guidePatchSchemaV12)
export const singleScenarioSchemaV13=(idValue:string)=>withDeckObservations(singleScenarioSchemaV12(idValue))

function withCalculationPurpose(schema:any):any{
 if(Array.isArray(schema))return schema.map(withCalculationPurpose)
 if(!schema||typeof schema!=='object')return schema
 const out:any=Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,withCalculationPurpose(v)]))
 if(schema.properties?.calculations){
  out.properties.calculations.items=obj({...out.properties.calculations.items.properties,purpose:values('damage','other'),attack:nullable(attackRefV10)})
 }
 return out
}
export const guideScenarioSchemaV14=withCalculationPurpose(guideScenarioSchemaV13)
export const guidePatchSchemaV14=withCalculationPurpose(guidePatchSchemaV13)
export const singleScenarioSchemaV14=(idValue:string)=>withCalculationPurpose(singleScenarioSchemaV13(idValue))

function withTacticalAudit(schema:any):any{
  const out=structuredClone(schema)
  const scenario=out.properties.scenarios.items
  scenario.properties.tacticalAudit=arr(obj({lineIds:{...arr(id,10),minItems:1},turn:{type:'integer',minimum:1,maximum:60},side,
    attacks:arr(attackRefV10,60),cards:arr(id,60),comparison:text(1600)}),60)
  scenario.required.push('tacticalAudit')
  scenario.properties.positionAnnotations.items.properties.hpAdjustment=obj({amount:{type:'integer',minimum:-500,maximum:500},sourceIds:arr(id,6)})
  scenario.properties.positionAnnotations.items.required.push('hpAdjustment')
  return out
}
export const guideScenarioSchemaV15=withTacticalAudit(guideScenarioSchemaV14)
export const guidePatchSchemaV15=withTacticalAudit(guidePatchSchemaV14)
export const singleScenarioSchemaV15=(idValue:string)=>withTacticalAudit(singleScenarioSchemaV14(idValue))

/** Keep decisions beside the native turn/event. Context IDs and printed retreat
 * costs are derived from that same ledger, never independently generated. */
function withNativeDecisions(schema:any):any{
  const out=structuredClone(schema),s=out.properties.scenarios.items
  for(const key of ['tacticalAudit','retreatCosts']){delete s.properties[key];s.required=s.required.filter((k:string)=>k!==key)}
  const tactical=obj({attacks:arr(attackRefV10,60),cards:arr(id,60),comparison:text(1600)})
  const transform=(v:any)=>{
    if(!v||typeof v!=='object')return
    if(v.properties?.moves&&v.properties?.energyRoutes){
      delete v.properties.retreatCostId;v.required=v.required.filter((k:string)=>k!=='retreatCostId')
      v.properties.retreat=nullable(obj({adjustments:arr(obj({sourceId:id,amount:num,reason:text(4000)}),12)}));v.required.push('retreat')
    }
    if(v.properties?.draw&&(v.properties.events||v.properties.beforeAttack)){
      const sharedPrefix=!!v.properties.draw.anyOf
      v.properties.tactical=sharedPrefix?nullable(tactical):structuredClone(tactical);v.required.push('tactical')
    }
    if(v.properties?.accessProof){
      const proof=v.properties.accessProof.anyOf.find((x:any)=>x.properties)
      proof.properties.eventIndex={type:'integer',minimum:0,maximum:28};proof.required.push('eventIndex')
    }
    for(const x of Object.values(v))if(Array.isArray(x))x.forEach(transform);else if(x&&typeof x==='object')transform(x)
  }
  transform(s);return out
}
export const guideScenarioSchemaV16=withNativeDecisions(guideScenarioSchemaV15)
export const guidePatchSchemaV16=withNativeDecisions(guidePatchSchemaV15)
export const singleScenarioSchemaV16=(idValue:string)=>withNativeDecisions(singleScenarioSchemaV15(idValue))

function withPromotionReview(schema:any):any{
  const out=structuredClone(schema)
  const walk=(v:any)=>{
    if(!v||typeof v!=='object')return
    if(v.properties?.attacks&&v.properties?.cards&&v.properties?.comparison){
      v.properties.promotions=arr(obj({side,printId:id,reason:text(600)}),60);v.required.push('promotions')
    }
    for(const x of Object.values(v))if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')walk(x)
  }
  walk(out);return out
}
export const guideScenarioSchemaV19=withPromotionReview(guideScenarioSchemaV16)
export const guidePatchSchemaV19=withPromotionReview(guidePatchSchemaV16)
export const singleScenarioSchemaV19=(idValue:string)=>withPromotionReview(singleScenarioSchemaV16(idValue))

function withAccessReceipts(schema:any):any{
  const out=structuredClone(schema)
  const walk=(v:any,path:string[]=[])=>{
    if(!v||typeof v!=='object')return
    if(v.properties?.accessProof){delete v.properties.accessProof;v.required=v.required.filter((k:string)=>k!=='accessProof')}
    if(v.properties?.moves&&v.properties?.energyRoutes&&path.includes('turns')&&path.includes('opponent')){
      v.properties.accessReceipt=nullable(obj({sourceIds:{...arr(id,12),minItems:1},reason:text(4000)}));v.required.push('accessReceipt')
    }
    if(v.properties)for(const [key,node]of Object.entries(v.properties))walk(node,[...path,key])
    if(v.items)walk(v.items,path)
    if(v.anyOf)v.anyOf.forEach((n:any)=>walk(n,path))
  };walk(out);return out
}
export const guideScenarioSchemaV21=withAccessReceipts(guideScenarioSchemaV19)
export const guidePatchSchemaV21=withAccessReceipts(guidePatchSchemaV19)
export const singleScenarioSchemaV21=(idValue:string,allocated=false)=>{
  const out=withAccessReceipts(singleScenarioSchemaV19(idValue))
  if(allocated){const s=out.properties.scenarios.items;delete s.properties.opening;s.required=s.required.filter((k:string)=>k!=='opening')}
  return out
}
export const guidePlanSchemaV21=obj({...guidePlanSchema.properties,opponentListId:id,initialOpenings:{...arr(obj({id:values('scenario-1','scenario-2'),opening:guideScenarioSchemaV19.properties.scenarios.items.properties.opening}),2),minItems:2}})

function withBoardExitDeclarations(schema:any):any{
 const out=structuredClone(schema),walk=(v:any)=>{
  if(!v||typeof v!=='object')return
  if(v.properties?.moves&&v.properties?.energyRoutes){
   v.properties.boardExitProofs=arr(obj({side,printId:id,copy:nullable({type:'integer',minimum:1,maximum:8}),sourceIds:{...arr(id,12),minItems:1},reason:text(1600)}),18)
   v.properties.attachmentTargets=arr(obj({side,printId:id,hostPrintId:id,copy:nullable({type:'integer',minimum:1,maximum:8})}),40)
   v.required.push('boardExitProofs','attachmentTargets')
  }
  if(v.properties)Object.values(v.properties).forEach(walk);if(v.items)walk(v.items);if(v.anyOf)v.anyOf.forEach(walk)
 };walk(out);return out
}
export const guideScenarioSchemaV26=withBoardExitDeclarations(guideScenarioSchemaV21)
export const guidePatchSchemaV26=withBoardExitDeclarations(guidePatchSchemaV21)
export const singleScenarioSchemaV26=(idValue:string,allocated=false)=>withBoardExitDeclarations(singleScenarioSchemaV21(idValue,allocated))

const energySymbol=values('Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal','Fairy','Colorless','Dragon')
function withAttackPayment(schema:any):any{
 const out=structuredClone(schema),walk=(v:any)=>{if(!v||typeof v!=='object')return
  if(v.properties?.moves&&v.properties?.energyRoutes){
   v.properties.attackPayment=nullable(obj({energy:arr(obj({printId:id,copy:{type:'integer',minimum:1,maximum:60},units:{...arr(obj({types:{...arr(energySymbol,11),minItems:1}}),6),minItems:1},sourceIds:{...arr(id,12),minItems:1},reason:text(1000)}),60),costAdjustments:arr(obj({type:energySymbol,amount:{type:'integer',minimum:-10,maximum:10},sourceIds:{...arr(id,12),minItems:1},reason:text(1000)}),12)}))
   v.properties.decisionProof=nullable(obj({cards:arr(id,60),reason:text(1000)}));v.required.push('attackPayment','decisionProof')
  }
  if(v.properties)Object.values(v.properties).forEach(walk);if(v.items)walk(v.items);if(v.anyOf)v.anyOf.forEach(walk)
 };walk(out);return out
}
export const guideScenarioSchemaV27=withAttackPayment(guideScenarioSchemaV26)
export const guidePatchSchemaV27=withAttackPayment(guidePatchSchemaV26)
export const singleScenarioSchemaV27=(idValue:string,allocated=false)=>withAttackPayment(singleScenarioSchemaV26(idValue,allocated))
export const guideSetupKeys=['decision','assumptions','sourceIds','benchLimit','positionAnnotations','firstOpponentTurn','setupRounds']
export function guideSetupSchemaV27(idValue:string){const p=singleScenarioSchemaV27(idValue,true).properties.scenarios.items.properties;return obj({caseSetup:obj(Object.fromEntries(['id','opponentListId',...guideSetupKeys].map(k=>[k,p[k]]))),changeSummary:text(5000)})}
export function guideLineSchemaV27(idValue:string){const s=singleScenarioSchemaV27(idValue,true);for(const k of guideSetupKeys.filter(k=>!['assumptions','sourceIds'].includes(k))){delete s.properties.scenarios.items.properties[k];s.properties.scenarios.items.required=s.properties.scenarios.items.required.filter((v:string)=>v!==k)}return s}

/** Only v28 can omit turns after a proven game end, including an initial
 * alternative that wins before the reply. Executed winning turns stay present;
 * the complete ledger rejects markers unless the game already ended. */
function withTerminalReply(schema:any):any{
  const out=structuredClone(schema),next=out.properties.scenarios.items.properties.replyComparison.properties.options.items.properties.turns.properties.next
  out.properties.scenarios.items.properties.replyComparison.properties.options.items.properties.turns.properties.next={anyOf:[next,obj({terminal:{type:'boolean',const:true}})]}
  const turns=out.properties.scenarios.items.properties.replyComparison.properties.options.items.properties.turns.properties
  turns.opponent={anyOf:[turns.opponent,obj({terminal:{type:'boolean',const:true}})]}
  out.properties.scenarios.items.properties.replyComparison.properties.options.maxItems=GUIDE_REPLY_OTHER_LIMIT+3
  return out
}
function withTurnEnding(schema:any):any{
 const out=structuredClone(schema),p=out.properties.scenarios.items.properties
 for(const next of [p.replyComparison.properties.options.items.properties.turns.properties.next]){
  const event=next.properties.attack
  event.properties.attack=nullable(event.properties.attack)
  event.properties.action=values(...event.properties.action.enum,'end-turn')
 }
 return out
}
export const guideScenarioSchemaV28=withTerminalReply(withTurnEnding(guideScenarioSchemaV27))
export const guidePatchSchemaV28=withTerminalReply(withTurnEnding(guidePatchSchemaV27))
export const singleScenarioSchemaV28=(idValue:string,allocated=false)=>withTerminalReply(withTurnEnding(singleScenarioSchemaV27(idValue,allocated)))

/** Same native physical protocol, explicitly narrower strategic claims.
 * Historical schema objects and their request identities remain untouched. */
export function singleFiniteScenarioSchema(idValue:string,allocated=false){
  const schema=structuredClone(singleScenarioSchemaV28(idValue,allocated)) as any
  const scenario=schema.properties.scenarios.items,comparison=scenario.properties.replyComparison
  delete comparison.properties.coverage
  comparison.required=comparison.required.filter((key:string)=>key!=='coverage')
  comparison.properties.options.minItems=2
  comparison.properties.options.maxItems=GUIDE_FINITE_REPLY_LIMIT
  comparison.properties.options.items.properties.developmentPlan=obj({opponent:scenario.properties.developmentPlan.properties.opponent,next:nullable(scenario.properties.developmentPlan.properties.next)})
  comparison.properties.options.items.required.push('developmentPlan')
  comparison.properties.omissionTests={type:'array',items:comparison.properties.omissionTests.items,maxItems:0}
  const category=obj({replyId:nullable(id),reason:text(4000),sourceIds:{...arr(id,30),minItems:1}})
  scenario.properties.analysisScope=obj({contract:{type:'string',const:GUIDE_FINITE_ANALYSIS_CONTRACT},horizon:{type:'string',const:'ours-opponent-ours'},
    comparedReplyIds:{...arr(id,GUIDE_FINITE_REPLY_LIMIT),minItems:2},access:category,defend:category,limits:{...arr(text(4000),8),minItems:1}})
  scenario.required.push('analysisScope')
  return schema
}
