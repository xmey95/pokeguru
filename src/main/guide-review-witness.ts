import {appendGuideSegment,forkGuideSegments,verifyGuideSegments,guideSegmentNativeSchema,type GuideSegmentJournal,type GuideSegmentScope} from './guide-segments'
import type {GuidePacket} from './matchup-guide-packet'
import {isDeepStrictEqual} from 'node:util'
import {projectGuideSetup} from '../shared/guide-ledger-projection'

const actionData=(v:any):any=>Array.isArray(v)?v.map(actionData):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>!['description','reason','tactical','comparison'].includes(k)).map(([k,x])=>[k,actionData(x)])):v
const turnActions=(body:Record<string,any>)=>actionData({draw:body.draw,events:(body.events??[...body.beforeAttack,body.attack,...body.afterAttack]).filter((e:any)=>e.attack||e.trainer||e.moves?.length||e.energyRoutes?.length||e.deckObservations?.length)})

export interface GuideAlternativeWitness {
  scenarioId:string;reviewedHash:string;parentHash:string;turn:number;side:'ours'|'opponent';
  sourceIds:string[];reason:string;
  continuation:{body:Record<string,any>;development:Record<string,any>}[]
}
/** A critic's alternative is replayed from the exact same accepted turn boundary.
 * The witness demonstrates mechanical executability, never tactical superiority
 * or the truth of a card-effect interpretation. Neither a rejected witness nor
 * an accepted one changes the critic's verdict or approves the guide. */
export function verifyGuideAlternativeWitness(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,action:{scenarioId:string;turn:number;side:'ours'|'opponent';action?:'ordinary-evolution'|'other'},witness:GuideAlternativeWitness){
  verifyGuideSegments(base,scope,packet)
  if(!base.segments.length)throw new Error('Controprova: serve almeno un turno verificato da confrontare.')
  const head=base.segments.at(-1)?.hash??base.rootHash
  const index=base.segments.findIndex(s=>s.receipt.lastTurn===action.turn)
  if(index<0||action.scenarioId!==base.setup.id||action.side!==(index===1?'opponent':'ours')||witness.scenarioId!==action.scenarioId||witness.turn!==action.turn||witness.side!==action.side||witness.reviewedHash!==head)throw new Error('Controprova: caso, turno o guida criticata diversi.')
  let journal=forkGuideSegments(base,scope,packet,index)
  if(witness.parentHash!==(journal.segments.at(-1)?.hash??journal.rootHash))throw new Error('Controprova: stato iniziale diverso dal prefisso verificato.')
  if(!Array.isArray(witness.sourceIds)||!witness.sourceIds.length||new Set(witness.sourceIds).size!==witness.sourceIds.length||witness.sourceIds.some(id=>!packet.sources.some(s=>s.id===id))||typeof witness.reason!=='string'||!witness.reason.trim()||witness.reason.length>4000)throw new Error('Controprova: fonti o motivo mancanti o estranei.')
  if(!Array.isArray(witness.continuation)||!witness.continuation.length||witness.continuation.length>base.segments.length-index)throw new Error('Controprova: seguito mancante o fuori orizzonte.')
  for(const [i,segment] of witness.continuation.entries()){
    if(segment.body.draw!==base.segments[index+i]?.body.draw)throw new Error('Controprova: pescata ordinaria diversa dalla posizione criticata; non dimostra un’alternativa con le stesse informazioni.')
    journal=appendGuideSegment(journal,scope,packet,segment.body,segment.development)
  }
  const receipt=journal.segments.at(-1)!.receipt
  if(journal.segments.length!==base.segments.length&&!receipt.terminal)throw new Error('Controprova: ramo incompleto; dimostrare il seguito o la fine effettiva della partita.')
  const originalTurn=base.segments[index].body,replacement=journal.segments[index].body
  if(action.action==='ordinary-evolution'){
    const events=replacement.events??[...replacement.beforeAttack,replacement.attack,...replacement.afterAttack]
    if(!events.some((e:any)=>e.moves?.some((m:any)=>m.side===action.side&&m.from==='hand'&&['active','bench'].includes(m.to)&&e.moves.some((p:any)=>p.side===m.side&&p.from===m.to&&p.to==='evolution'))))throw new Error('Controprova: evoluzione ordinaria proposta ma non eseguita nella linea alternativa.')
  }
  if(isDeepStrictEqual(turnActions(originalTurn),turnActions(replacement)))throw new Error('Controprova: il turno contestato non contiene una linea alternativa.')
  return {kind:'mechanically-verified-counterline' as const,scenarioId:base.setup.id,reviewedHash:head,parentHash:witness.parentHash,horizonTurns:base.segments.length,journal,receipt,sourceIds:[...witness.sourceIds],reason:witness.reason,effectsVerified:false as const,tacticalVerdict:'requires-independent-review' as const,guideApproved:false as const}
}

/** Exact contexts supplied to the independent critic; inventories are derived
 * before the proposed alternative, never reconstructed from its explanation. */
export function guideAlternativeWitnessContext(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket){
  verifyGuideSegments(base,scope,packet)
  if(!base.segments.length)throw new Error('Controprova: serve almeno un turno verificato da confrontare.')
  const setup=projectGuideSetup({scenarios:[base.setup]},packet)[0]
  return {scenarioId:base.setup.id,reviewedHash:base.segments.at(-1)!.hash,horizonTurns:base.segments.length,windows:base.segments.map((s,i)=>{
    const before=i?base.segments[i-1].receipt:setup
    return {turn:s.receipt.lastTurn,side:i===1?'opponent':'ours',parentHash:s.parentHash,inventory:structuredClone(before.inventory),board:structuredClone(before.board),ordinaryDraw:s.body.draw}
  }),limits:'Queste finestre precedono la pescata ordinaria indicata. La controlinea deve conservare le pescate del caso, dichiarare costi/accessi e completare il seguito o dimostrare la fine della partita. L’eseguibilità meccanica non dimostra effetti condizionali, danni o superiorità tattica; nessun finding è eliminato automaticamente.'}
}
export function guideAlternativeWitnessSchema(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket):object{
  const context=guideAlternativeWitnessContext(base,scope,packet)
  const schema=guideSegmentNativeSchema(base.setup.id,packet,base.setup.opponentListId)
  const object=(properties:Record<string,any>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)})
  const literal=(value:string|number)=>({type:typeof value,const:value})
  return {anyOf:context.windows.map((w,index)=>object({scenarioId:literal(context.scenarioId),reviewedHash:literal(context.reviewedHash),parentHash:literal(w.parentHash),turn:{type:'integer',const:w.turn},side:literal(w.side),sourceIds:{type:'array',minItems:1,maxItems:100,items:{type:'string',enum:packet.sources.map(s=>s.id)}},reason:{type:'string',minLength:1,maxLength:4000},continuation:{type:'array',minItems:1,maxItems:base.segments.length-index,items:{anyOf:['ours','opponent','next'].slice(index,base.segments.length).map(phase=>object({body:schema.properties.turns.properties[phase],development:schema.properties.developmentPlan.properties[phase]}))}}}))}
}
