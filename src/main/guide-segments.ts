import {createHash} from 'node:crypto'
import {memoGuideJson} from './guide-value-cache'
import {projectGuidePrefix,projectGuideSetup} from '../shared/guide-ledger-projection'
import {boundGuideSchema} from './guide-bound-schema'
import {readRebuiltOpening} from './guide-decision-context'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guideSetupKeys,guideScenarioSchemaV27,guideScenarioSchemaV28} from './matchup-guide-schema'
import type {GuidePacket} from './matchup-guide-packet'

const phases=['ours','opponent','next'] as const
type Phase=typeof phases[number]
export interface GuideSegmentScope {projectId:string;jobId:string;dependencyHash:string;configHash:string}
interface Segment {phase:Phase;body:Record<string,any>;development:Record<string,any>;parentHash:string;receipt:any;hash:string}
export interface GuideSegmentJournal {
  version:1;scope:GuideSegmentScope;packetHash:string;setup:Record<string,any>;
  rootHash:string;segments:Segment[]
}
const hash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const object=(properties:Record<string,any>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)})
const setupKeys=['id','opponentListId','opening',...guideSetupKeys]
export const guideSegmentNativeSchema=(id:string,packet:GuidePacket,opponent:string):any=>{
  const p=(packet.basis.promptVersion==='matchup-guide-28'?guideScenarioSchemaV28:guideScenarioSchemaV27 as any).properties.scenarios.items.properties
  const properties=Object.fromEntries([...setupKeys,'turns','developmentPlan'].map(k=>[k,p[k]]))
  // A journal also represents an alternative, whose final turn can end without
  // attacking. Whole-scenario assembly still requires the main line's attack.
  if(packet.basis.promptVersion==='matchup-guide-28'){
    properties.turns=structuredClone(properties.turns)
    ;(properties.turns as any).properties.next=p.replyComparison.properties.options.items.properties.turns.properties.next.anyOf[0]
  }
  properties.id={type:'string',const:id}
  return boundGuideSchema(object(properties),packet,opponent)
}
const verifyRoot=(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket)=>{
  if(j?.version!==1||hash(j.scope)!==hash(scope)||j.packetHash!==hash(packet)||scope.projectId!==packet.basis.projectId||scope.dependencyHash!==packet.basis.dependencyHash||!['projectId','jobId','dependencyHash','configHash'].every(k=>typeof (scope as any)[k]==='string'&&(scope as any)[k].trim())||Object.keys(scope).length!==4)throw new Error('Segmenti: contesto, dati o versione diversi; prefisso non riusabile.')
  const schema=guideSegmentNativeSchema(j.setup.id,packet,j.setup.opponentListId)
  assertNativeScenarioSchema(j.setup,object(Object.fromEntries(setupKeys.map(k=>[k,schema.properties[k]]))))
  readRebuiltOpening(j.setup.id,j.setup.opening,packet,j.setup.opponentListId)
  const receipt=projectGuideSetup({scenarios:[j.setup]},packet)[0]
  if(j.rootHash!==hash({scope:j.scope,packetHash:j.packetHash,setup:j.setup,receipt}))throw new Error('Segmenti: setup o ricevuta iniziale alterati.')
}
export function createGuideSegments(setup:Record<string,any>,scope:GuideSegmentScope,packet:GuidePacket):GuideSegmentJournal{
  const j:GuideSegmentJournal={version:1,scope:structuredClone(scope),packetHash:hash(packet),setup:structuredClone(setup),rootHash:'',segments:[]}
  const receipt=projectGuideSetup({scenarios:[setup]},packet)[0]
  j.rootHash=hash({scope:j.scope,packetHash:j.packetHash,setup:j.setup,receipt})
  verifyRoot(j,scope,packet)
  return j
}
function replay(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket):Record<string,any>{
  return memoGuideJson('segment-replay-v1',{journal:j,scope,packet},()=>replayUncached(j,scope,packet))
}
function replayUncached(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket):Record<string,any>{
  verifyRoot(j,scope,packet)
  if(!Array.isArray(j.segments)||j.segments.length>3)throw new Error('Segmenti: numero di turni non valido.')
  const schema=guideSegmentNativeSchema(j.setup.id,packet,j.setup.opponentListId)
  const scenario={...structuredClone(j.setup),turns:{} as Record<string,any>,developmentPlan:{} as Record<string,any>}
  let parentHash=j.rootHash
  for(const [index,segment] of j.segments.entries()){
    const phase=phases[index]
    if(segment.phase!==phase||segment.parentHash!==parentHash)throw new Error('Segmenti: ordine o prefisso di partenza diverso.')
    assertNativeScenarioSchema(segment.body,schema.properties.turns.properties[phase])
    assertNativeScenarioSchema(segment.development,schema.properties.developmentPlan.properties[phase])
    scenario.turns[phase]=structuredClone(segment.body);scenario.developmentPlan[phase]=structuredClone(segment.development)
    const receipt=projectGuidePrefix({scenarios:[scenario]},packet,(index+1) as 1|2|3)[0]
    const expected=hash({parentHash,phase,body:segment.body,development:segment.development,receipt})
    if(hash(receipt)!==hash(segment.receipt)||expected!==segment.hash)throw new Error('Segmenti: ricevuta o turno alterati; ripetere la verifica.')
    parentHash=segment.hash
  }
  return scenario
}
/** Every new complete journal/scope/packet runs the original receipt replay.
 * Only identical plain JSON already replayed in this process can reuse it;
 * restart or mutation cannot inherit that result. This never certifies card
 * effects, tactical optimality or an independent critic's approval. */
export function verifyGuideSegments(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket):void{replay(j,scope,packet)}
/** Atomic append: validation failure leaves the accepted input journal intact. */
export function appendGuideSegment(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,body:Record<string,any>,development:Record<string,any>):GuideSegmentJournal{
  const scenario=replay(j,scope,packet),phase=phases[j.segments.length]
  if(!phase)throw new Error('Segmenti: tre turni già presenti; verificare rami e guida completa.')
  const schema=guideSegmentNativeSchema(j.setup.id,packet,j.setup.opponentListId)
  assertNativeScenarioSchema(body,schema.properties.turns.properties[phase])
  assertNativeScenarioSchema(development,schema.properties.developmentPlan.properties[phase])
  scenario.turns[phase]=structuredClone(body);scenario.developmentPlan[phase]=structuredClone(development)
  const receipt=projectGuidePrefix({scenarios:[scenario]},packet,(j.segments.length+1) as 1|2|3)[0]
  const parentHash=j.segments.at(-1)?.hash??j.rootHash
  const value={parentHash,phase,body:structuredClone(body),development:structuredClone(development),receipt}
  return {...structuredClone(j),segments:[...structuredClone(j.segments),{...value,hash:hash(value)}]}
}
/** A sibling starts at the exact accepted parent, never at another branch's
 * resulting board. All retained turns are replayed before the fork is returned. */
export function forkGuideSegments(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,turns:number):GuideSegmentJournal{
  replay(j,scope,packet)
  if(!Number.isSafeInteger(turns)||turns<0||turns>j.segments.length)throw new Error('Segmenti: punto di diramazione non verificato.')
  return {...structuredClone(j),segments:structuredClone(j.segments.slice(0,turns))}
}
/** Returns declarations only. Caller must assemble replies and run the unchanged
 * complete schema, ledger, tactical checks and independent final reviews. */
export function guideSegmentDeclarations(j:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket):Record<string,any>{return replay(j,scope,packet)}
