import {expect,it} from 'vitest'
import {projectGuideLedger,projectGuidePrefix} from '../src/shared/guide-ledger-projection'
import {segmentFixture} from './fixtures/guide-segment'
import {appendGuideSegment,createGuideSegments,forkGuideSegments,guideSegmentDeclarations,verifyGuideSegments} from '../src/main/guide-segments'
import {guideAlternativeWitnessContext,guideAlternativeWitnessSchema,verifyGuideAlternativeWitness,type GuideAlternativeWitness} from '../src/main/guide-review-witness'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {readGuidePremiseReview} from '../src/main/guide-premise-review'
import {GUIDE_PROMPT_VERSION} from '../src/shared/matchup-guide'
import {guideSource} from '../src/main/matchup-guide-packet'

it('verifies a real first turn without fabricating future turns or making it publishable',()=>{
  const {packet,scenario}=segmentFixture(),raw={scenarios:[scenario]},before=JSON.stringify(raw)
  const [receipt]=projectGuidePrefix(raw,packet as any,1)
  expect(receipt.kind).toBe('incomplete-guide-prefix');expect(receipt.lastTurn).toBe(1)
  expect(receipt.inventory.find((r:any)=>r.side==='ours'&&r.printId==='e'&&r.zone==='hand').count).toBe(7)
  expect(receipt.events).toHaveLength(1);expect(JSON.stringify(raw)).toBe(before)
  expect(()=>projectGuideLedger(raw,packet as any)).toThrow()
})

const scope={projectId:'project-a',jobId:'job-a',dependencyHash:'dependency-a',configHash:'config-a'}
const journalFixture=()=>{
  const {packet,scenario,opponent}=segmentFixture(),{turns,developmentPlan,...setup}=scenario
  return {packet,setup,ours:turns.ours,opponent,note:developmentPlan.ours}
}
it('derives an actually terminal opponent turn without fabricating a follow-up',()=>{
  const {packet,setup,ours,opponent,note}=journalFixture(),card=JSON.parse(packet.sources[0].content)
  card.gameplay.attacks[0].damage='120';packet.sources[0]=guideSource('card:p','card','p',null,JSON.stringify(card))
  packet.basis.promptVersion='matchup-guide-28'
  const first=appendGuideSegment(createGuideSegments(setup,scope,packet as any),scope,packet as any,ours,note)
  const attack={kind:'effect',description:'The printed synthetic attack deals 120, knocks out the only opposing Pokémon and takes one Prize.',moves:[{side:'ours',printId:'p',count:1,from:'active',to:'discard'}],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['card:p'],attachment:null}],attack:{printId:'p',attackName:'Synthetic attack'},trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'Compare every synthetic hand and field candidate before this free attack.'},action:'active-ko',affectedSide:'ours',accessReceipt:null}
  const terminal=appendGuideSegment(first,scope,packet as any,{...opponent,events:[attack]},note)
  expect(terminal.segments.at(-1)!.receipt.terminal).toBe(true)
  expect(terminal.segments.at(-1)!.receipt.termination).toEqual({winner:'opponent',reason:'no-pokemon'})
  expect(terminal.segments).toHaveLength(2)
  const {accessReceipt,...finalAttack}=attack
  expect(()=>appendGuideSegment(terminal,scope,packet as any,{draw:'e',beforeAttack:[],attack:{...finalAttack,moves:[],energyRoutes:[],action:'other',affectedSide:'opponent'},afterAttack:[],tactical:ours.tactical},note)).toThrow('dopo la fine effettiva')
})
it('persists and revalidates accepted prefixes and isolates sibling continuations',()=>{
  const {packet,setup,ours,opponent,note}=journalFixture()
  const root=createGuideSegments(setup,scope,packet as any),first=appendGuideSegment(root,scope,packet as any,ours,note)
  const restored=JSON.parse(JSON.stringify(first));verifyGuideSegments(restored,scope,packet as any)
  const sibling=forkGuideSegments(restored,scope,packet as any,1)
  const next=appendGuideSegment(sibling,scope,packet as any,opponent,note)
  expect(next.segments[0]).toEqual(first.segments[0]);expect(first.segments).toHaveLength(1);expect(root.segments).toHaveLength(0)
  expect(guideSegmentDeclarations(next,scope,packet as any).turns.opponent).toEqual(opponent)
  next.segments[1].body.draw='p'
  expect(first.segments[0]).toEqual(restored.segments[0])
  expect(()=>verifyGuideSegments(next,scope,packet as any)).toThrow('alterati')
})
it('rejects foreign context, edited receipts, unknown fields and incomplete tactical coverage atomically',()=>{
  const {packet,setup,ours,note}=journalFixture(),root=createGuideSegments(setup,scope,packet as any)
  const first=appendGuideSegment(root,scope,packet as any,ours,note),bytes=JSON.stringify(first)
  expect(()=>appendGuideSegment(first,scope,packet as any,{...ours,tactical:{...ours.tactical,cards:[]}},note)).toThrow('omesso')
  expect(JSON.stringify(first)).toBe(bytes)
  expect(()=>verifyGuideSegments(first,{...scope,projectId:'foreign'},packet as any)).toThrow('contesto')
  expect(()=>verifyGuideSegments(first,scope,{...packet,ourList:{...packet.ourList,id:'foreign'}} as any)).toThrow('contesto')
  first.segments[0].receipt.inventory[0].count++
  expect(()=>verifyGuideSegments(first,scope,packet as any)).toThrow('alterati')
  expect(()=>appendGuideSegment(root,scope,packet as any,{...ours,unvalidated:'extra'},note)).toThrow()
})

const nativeEvent=(extra:Record<string,any>)=>({kind:'effect',description:'Synthetic explicit action',moves:[],energyRoutes:[],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:['p','e'],reason:'Compare synthetic alternatives'},action:'other',affectedSide:'ours',...extra})
const completeFixture=()=>{
  const {packet,setup,ours,opponent,note}=journalFixture()
  const next={draw:'e',beforeAttack:[],attack:nativeEvent({attack:{printId:'p',attackName:'Synthetic attack'},attackPayment:{energy:[],costAdjustments:[]}}),afterAttack:[],tactical:ours.tactical}
  let journal=createGuideSegments(setup,scope,packet as any)
  for(const body of [ours,opponent,next])journal=appendGuideSegment(journal,scope,packet as any,body,note)
  const attach=nativeEvent({energyRoutes:[{side:'opponent',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['rules'],attachment:'manual'}],affectedSide:'opponent',accessReceipt:null})
  const witness:GuideAlternativeWitness={scenarioId:setup.id,reviewedHash:journal.segments[2].hash,parentHash:journal.segments[0].hash,turn:2,side:'opponent',sourceIds:['card:e'],reason:'Compare a synthetic manual attachment',continuation:[{body:{...opponent,events:[attach]},development:note},{body:next,development:note}]}
  const action={scenarioId:setup.id,turn:2,side:'opponent' as const}
  return {packet,journal,witness,action,note}
}
it('executes a critic counterline from the exact accepted state without approving tactics or changing the original',()=>{
  const {packet,journal,witness,action}=completeFixture(),before=JSON.stringify(journal)
  const result=verifyGuideAlternativeWitness(journal,scope,packet as any,action,witness)
  expect(result.receipt.board.groups.find((g:any)=>g.side==='opponent').attached).toEqual([{printId:'e',count:1}])
  expect(result.effectsVerified).toBe(false);expect(result.guideApproved).toBe(false)
  expect(result.journal.segments[0]).toEqual(journal.segments[0]);expect(JSON.stringify(journal)).toBe(before)
  assertNativeScenarioSchema(witness,guideAlternativeWitnessSchema(journal,scope,packet as any))
  const context=guideAlternativeWitnessContext(journal,scope,packet as any)
  expect(context.windows[1].parentHash).toBe(journal.segments[0].hash)
  expect(context.windows[1].inventory).toEqual(journal.segments[0].receipt.inventory)
})
it('keeps transition and compulsory promotion checks at each accepted turn boundary',()=>{
  const {packet,scenario,opponent}=segmentFixture()
  scenario.opening.ours.hand[0]='p'
  const bench=nativeEvent({moves:[{side:'ours',printId:'p',count:1,from:'hand',to:'bench'}],action:'other'})
  scenario.turns.ours.events.push(bench as never)
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,1)).toThrow('evento esplicito')
  bench.action='bench'
  const ko=nativeEvent({moves:[{side:'ours',printId:'p',count:1,from:'active',to:'discard'}],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['rules'],attachment:null}],attack:{printId:'p',attackName:'Synthetic attack'},attackPayment:{energy:[],costAdjustments:[]},action:'active-ko',affectedSide:'ours',accessReceipt:null})
  opponent.events.push(ko as never);Object.assign(scenario.turns,{opponent})
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,2)).toThrow('promozione obbligatoria')
})
it('rejects impossible, incomplete, foreign or merely reworded critic counterlines',()=>{
  const {packet,journal,witness,action}=completeFixture()
  expect(()=>verifyGuideAlternativeWitness(journal,scope,packet as any,action,{...witness,parentHash:'foreign'})).toThrow('stato iniziale')
  expect(()=>verifyGuideAlternativeWitness(journal,scope,packet as any,action,{...witness,continuation:witness.continuation.slice(0,1)})).toThrow('incompleto')
  const alteredDraw=structuredClone(witness);alteredDraw.continuation[0].body.draw='p'
  expect(()=>verifyGuideAlternativeWitness(journal,scope,packet as any,action,alteredDraw)).toThrow('pescata ordinaria')
  const impossible=structuredClone(witness);impossible.continuation[0].body.events[0].energyRoutes[0].count=2
  expect(()=>verifyGuideAlternativeWitness(journal,scope,packet as any,action,impossible)).toThrow('manuale')
  const reworded=structuredClone(witness);reworded.continuation[0].body={...journal.segments[1].body,tactical:{...journal.segments[1].body.tactical,comparison:'Different prose only'}}
  expect(()=>verifyGuideAlternativeWitness(journal,scope,packet as any,action,reworded)).toThrow('linea alternativa')
})
it('supports early premise criticism at the verified horizon without fabricating a full scenario',()=>{
  const {packet,setup,ours,note}=journalFixture(),root=createGuideSegments(setup,scope,packet as any)
  const first=appendGuideSegment(root,scope,packet as any,ours,note)
  const attach=nativeEvent({energyRoutes:[{side:'ours',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['rules'],attachment:'manual'}]})
  const action={scenarioId:setup.id,turn:1,side:'ours' as const}
  const witness={...action,reviewedHash:first.segments[0].hash,parentHash:first.rootHash,sourceIds:['card:e'],reason:'Compare a synthetic first-turn preparation',continuation:[{body:{...ours,events:[attach]},development:note}]}
  assertNativeScenarioSchema(witness,guideAlternativeWitnessSchema(first,scope,packet as any))
  const result=verifyGuideAlternativeWitness(first,scope,packet as any,action,witness)
  expect(result.horizonTurns).toBe(1);expect(result.journal.segments).toHaveLength(1);expect(result.guideApproved).toBe(false)
  const proposed={...action,action:'other',reason:'Compare first-turn preparation'}
  const review={verdict:'revise',reviewedHash:first.segments[0].hash,repairScope:'first-turn',findings:[{severity:'major',targetId:setup.id,message:'Consider the synthetic alternative',correction:'Compare the preparation before committing',sourceIds:['card:e'],proposedActions:[proposed],counterlines:[witness]}],checks:['Synthetic first turn checked'],revalidatedIds:[],textCorrections:[]}
  expect(readGuidePremiseReview(review,first,scope,packet as any).verdict).toBe('revise')
  const missing=structuredClone(review);missing.findings[0].counterlines=[]
  expect(()=>readGuidePremiseReview(missing,first,scope,packet as any)).toThrow('ogni alternativa')
  const mislabelled=structuredClone(review);mislabelled.findings[0].proposedActions[0].action='ordinary-evolution'
  expect(()=>readGuidePremiseReview(mislabelled,first,scope,packet as any)).toThrow('non eseguita')
  expect(()=>readGuidePremiseReview({...review,verdict:'pass'},first,scope,packet as any)).toThrow('pass incompatibile')
})
it('keeps source interpretations as explicit negative findings without pretending to execute or waive them',()=>{
  const {packet,setup,ours,note}=journalFixture(),root=createGuideSegments(setup,scope,packet as any),first=appendGuideSegment(root,scope,packet as any,ours,note)
  const review={verdict:'incomplete',reviewedHash:first.segments[0].hash,repairScope:'setup',findings:[{severity:'blocking',targetId:setup.id,message:'Synthetic conditional effect needs source interpretation',correction:'Rebuild the unsupported premise',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Conditional interpretation unresolved'],revalidatedIds:[],textCorrections:[]}
  expect(readGuidePremiseReview(review,first,scope,packet as any).findings).toEqual(review.findings)
  review.findings[0].sourceIds=['foreign-source']
  expect(()=>readGuidePremiseReview(review,first,scope,packet as any)).toThrow(/sourceIds.*fuori enum/)
})
it('shares the mechanical gates with the pending v28 contract without reusing v27 receipts or changing the app default',()=>{
  const {packet,setup,ours,note}=journalFixture()
  const previous=createGuideSegments(setup,scope,packet as any)
  packet.basis.promptVersion='matchup-guide-28'
  const current=createGuideSegments(setup,scope,packet as any)
  expect(appendGuideSegment(current,scope,packet as any,ours,note).segments).toHaveLength(1)
  expect(()=>verifyGuideSegments(previous,scope,packet as any)).toThrow('contesto')
  expect(GUIDE_PROMPT_VERSION).toBe('matchup-guide-27')
})
it('replays the second turn from the same opening and rejects illegal first-turn attacks',()=>{
  const {packet,scenario,opponent}=segmentFixture();Object.assign(scenario.turns,{opponent})
  const [receipt]=projectGuidePrefix({scenarios:[scenario]},packet as any,2)
  expect(receipt.lastTurn).toBe(2);expect(receipt.events.map((e:any)=>e.side)).toEqual(['ours','opponent'])
  scenario.turns.ours.events.push({kind:'attack',description:'Illegal first attack',attack:{printId:'p',attackName:'Synthetic attack'},moves:[],energyRoutes:[],deckObservations:[],attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'Synthetic choice'}} as never)
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,2)).toThrow('primo giocatore')
})
it('does not waive stock, tactical audit, schema boundaries or future branches',()=>{
  const {packet,scenario}=segmentFixture()
  scenario.turns.ours.tactical.cards=['p']
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,1)).toThrow('omesso')
  scenario.turns.ours.tactical.cards=['p','e'];scenario.turns.ours.draw='p'
  packet.ourList.cards[0].count=1
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,1)).toThrow('non disponibile')
  scenario.turns.ours.draw='e';Object.assign(scenario.turns,{next:{}})
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,1)).toThrow('turni futuri')
  delete (scenario.turns as any).next;Object.assign(scenario,{replyComparison:{options:[]}})
  expect(()=>projectGuidePrefix({scenarios:[scenario]},packet as any,1)).toThrow('separatamente')
})
