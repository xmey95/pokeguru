import type {GuideScenario,GuideSource} from '../shared/matchup-guide'
import {replyCost} from '../shared/guide-reply-costs'
import {responseAttackCandidates} from '../shared/guide-response-construction'

type Attack={printId:string;attackName:string}
type Line={id:string;replyTurn:number;events:any[]}
const pair=(a:Attack)=>JSON.stringify([a.printId,a.attackName])
const attacks=(events:any[]):Attack[]=>[...new Map(events.filter(e=>typeof e.attackerPrintId==='string'&&typeof e.attackName==='string').map(e=>{const a={printId:e.attackerPrintId,attackName:e.attackName};return [pair(a),a]})).values()]

/** Accounting/candidate identities from the caller's authenticated receipts.
 * No tactical judgment, damage interpretation or independent approval is made.
 * Complete native readers and both independent reviews remain mandatory. */
export function finiteMetadataFacts(input:{caseId:string;inventory:GuideScenario['inventory'];setupEvents:any[];mainEvents:any[];lines:Line[];sources:GuideSource[]}){
 const scenario={id:input.caseId,inventory:input.inventory,lineEvents:input.mainEvents,replyComparison:{options:input.lines.map(l=>({id:l.id,replyTurn:l.replyTurn,expandedLineEvents:l.events}))}} as unknown as GuideScenario
 return {version:1,caseId:input.caseId,
  attackCandidates:responseAttackCandidates(scenario,input.sources),
  calculationAttacks:attacks([...input.setupEvents,...input.mainEvents,...input.lines.flatMap(l=>l.events)]),
  replies:input.lines.map(l=>({id:l.id,replyTurn:l.replyTurn,
   cost:l.events.some(e=>e.turn===l.replyTurn&&e.side==='opponent')?replyCost(scenario,l.events,l.replyTurn,input.sources):{requiredCards:[],attachments:0,retreatEnergy:0},
   executedAttacks:attacks(l.events.filter(e=>e.turn===l.replyTurn&&e.side==='opponent'))}))}
}
export type FiniteMetadataFacts=ReturnType<typeof finiteMetadataFacts>

/** Restrict technical references to ledger candidates. Every comparison,
 * exclusion reason and conditional draw requirement remains AI-authored. */
export function bindFiniteMetadataFacts(schema:Record<string,any>,facts:FiniteMetadataFacts):Record<string,any>{
 const out=structuredClone(schema),metadata=out.properties.metadata,comparison=metadata.properties.replyComparison
 const review=comparison.properties.attackReview,base=review.items
 review.minItems=facts.attackCandidates.length;review.maxItems=facts.attackCandidates.length
 review.items=facts.attackCandidates.length?{anyOf:facts.attackCandidates.map(a=>{
  const row=structuredClone(base),ids=facts.replies.filter(r=>r.executedAttacks.some(b=>pair(a)===pair(b))).map(r=>r.id)
  row.properties.printId={type:'string',const:a.printId};row.properties.attackName={type:'string',const:a.attackName}
  row.properties.replyId=ids.length?{anyOf:[{type:'string',enum:ids},{type:'null'}]}:{type:'null'}
  return row
 })}:{type:'null'}
 for(const option of comparison.properties.options.items.anyOf){
  const r=facts.replies.find(r=>r.id===option.properties.id.const)
  if(!r)throw Error('Metadata: opzione senza fatti del proprio ramo.')
  // replyTurn is derived in modern native schemas; never reintroduce an
  // unrequired transport property merely to constrain an already fixed fact.
  if(Object.hasOwn(option.properties,'replyTurn'))option.properties.replyTurn={type:'integer',const:r.replyTurn}
  const ids=r.cost.requiredCards.map(c=>c.printId),draws=option.properties.specificDraws
  draws.items=ids.length?{type:'string',enum:ids}:{type:'string'}
  if(!ids.length)draws.maxItems=0
 }
 const calculation=metadata.properties.calculations?.items
 if(calculation?.properties.attack)calculation.properties.attack={anyOf:[...facts.calculationAttacks.map(a=>({type:'object',additionalProperties:false,properties:{printId:{type:'string',const:a.printId},attackName:{type:'string',const:a.attackName}},required:['printId','attackName']})),{type:'null'}]}
 return out
}
