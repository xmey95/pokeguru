import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {guideHash} from './matchup-guide-packet'

type Archive=Pick<AiEvidenceArchive,'values'|'saveValue'>&Partial<Pick<AiEvidenceArchive,'value'|'id'|'projectId'>>
const role='guide-segment-output-capacity-v1'
type Context=NonNullable<GuideSegmentRequest<unknown>['outputCapacity']>
type CapacityRequest=Pick<GuideSegmentRequest<unknown>,'outputCapacity'>
interface Observation{version:1;context:Context;failedUnits:number;maximumUnits:number;code:'output-limit'}
export function guideOutputGroupCount(units:number,capacity:number):number{
 if(!Number.isSafeInteger(units)||units<0||capacity!==Infinity&&(!Number.isSafeInteger(capacity)||capacity<1))throw new Error('Capienza output: conteggio dei gruppi non valido.')
 return units?capacity===Infinity?1:Math.ceil(units/capacity):0
}
function lookup<T>(archive:Archive,role:string,key:string):T|undefined{
 if(archive.value)return archive.value<T>(role,key)
 for(const row of archive.values<T>(role))if(row.key===key)return row.value
}
function contextFor(request:CapacityRequest,archive:Archive){
 const context=request.outputCapacity
 if(context&&(archive.id!==undefined&&archive.id!==context.scope.jobId||archive.projectId!==undefined&&archive.projectId!==context.scope.projectId))throw new Error('Capienza output: archivio di un altro job o progetto.')
 return context
}
/** Empirical upper bound for this native protocol/config/packet, not a claim
 * about the service's token limit. Never transfers a tactical approval. */
export function guideOutputCapacity(request:CapacityRequest,archive:Archive):number{
 const context=contextFor(request,archive)
 if(!context)return Infinity
 const scopeHash=guideHash(context)
 let maximum=Infinity
 for(const row of archive.values<Observation>(role)){
  if(guideHash(row.value.context)!==scopeHash)continue
  const v=row.value
  if(row.key!==guideHash(v)||v.version!==1||v.code!=='output-limit'||!Number.isSafeInteger(v.failedUnits)||v.failedUnits<2||v.maximumUnits!==Math.max(1,Math.floor(v.failedUnits/2)))throw new Error('Capienza output: osservazione persistita non verificabile.')
  maximum=Math.min(maximum,v.maximumUnits)
 }
 // Import only actual failed native batches from the same archived job,
 // model configuration and packet. Old prompts/results remain untouched.
 if(context.kind==='guide-segment-declaration-2'&&archive.id===context.scope.jobId&&archive.projectId===context.scope.projectId){
  for(const {key,value:failure}of archive.values<any>('guide-attempt-failure')){
   if(failure.code!=='output-limit'||!/^segments-(?:main|reply)-/.test(failure.stage??''))continue
   const start=lookup<any>(archive,'guide-attempt-start',key),end=lookup<any>(archive,'guide-attempt-end',key)
   if(!start||end?.status!=='failed'||end.inputHash!==start.inputHash||start.stage!==failure.stage)continue
   const origin=lookup<any>(archive,'guide-prompt',start.inputHash),data=lookup<any>(archive,'guide-call-data',start.inputHash)?.data
   if(!origin?.config||guideHash({config:origin.config,protocol:'segments-v28-1'})!==context.scope.configHash)continue
   const units=data?.units
   if(!Array.isArray(units)||units.length<2||!units.every((u:any)=>u.data?.previousReceipt&&u.data?.prefix&&!u.data?.protocol&&guideHash(u.data.packet)===context.packetHash))continue
   if(guideHash(origin.prompt)!==start.inputHash)throw new Error('Capienza output: impronta della richiesta storica diversa.')
   maximum=Math.min(maximum,Math.max(1,Math.floor(units.length/2)))
  }
 }
 return maximum
}
export function recordGuideOutputCapacity(requests:CapacityRequest[],archive:Archive):void{
 if(requests.length<2)return
 const context=contextFor(requests[0],archive)
 if(!context||requests.some(r=>guideHash(contextFor(r,archive))!==guideHash(context)))return
 const record:Observation={version:1,context:structuredClone(context),failedUnits:requests.length,maximumUnits:Math.max(1,Math.floor(requests.length/2)),code:'output-limit'}
 archive.saveValue(role,guideHash(record),record)
}
