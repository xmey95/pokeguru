import {guideHash} from './matchup-guide-packet'
import type {AiEvidenceArchive} from './ai-evidence-archive'

export const deliveryAllowanceRole='guide-delivery-repair-allowance-v1'
export interface DeliveryRepairAllowance{
 version:1;id:string;jobId:string;projectId:string;manifestHash:string;previousAllowanceHash:string|null;
 afterSequence:number;historyHash:string|null;repairLimit:number;maximumCalls:number;reservedCalls:number;
 authorityReference:string;approvedAt:string
}
type Archive=Pick<AiEvidenceArchive,'id'|'projectId'|'values'|'value'>
const grantKeys='version,id,jobId,projectId,manifestHash,previousAllowanceHash,afterSequence,historyHash,repairLimit,maximumCalls,reservedCalls,authorityReference,approvedAt'.split(',').sort().join(',')
/** The host action is separate from AI transport. A grant cannot change the
 * original manifest, make past overdraw valid, renew an approval, or raise the
 * total call ceiling. Readers authenticate every prefix anchor before reuse. */
export function readDeliveryAllowances(archive:Archive,manifest:{repairCredits:number;maximum:number},history:{key:string;value:any}[]){
 const rows=[...archive.values<DeliveryRepairAllowance>(deliveryAllowanceRole)],next=new Map<string|null,typeof rows[number]>()
 const authority=new Set<string>(),ids=new Set<string>(),bySequence=new Map(history.map(r=>[r.value.sequence,r.value]))
 for(const row of rows){const g=row.value
  if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).sort().join(',')!==grantKeys)throw Error('Struttura della concessione non valida.')
  if(row.key!==guideHash(g)||g.version!==1||g.jobId!==archive.id||g.projectId!==archive.projectId||g.manifestHash!==guideHash(manifest)||g.maximumCalls!==manifest.maximum||!Number.isSafeInteger(g.afterSequence)||g.afterSequence<0||g.afterSequence>history.length||g.historyHash!==(g.afterSequence?guideHash(bySequence.get(g.afterSequence)):null)||!Number.isSafeInteger(g.repairLimit)||g.repairLimit<=manifest.repairCredits||g.repairLimit>manifest.maximum||!Number.isSafeInteger(g.reservedCalls)||g.reservedCalls<0||g.reservedCalls>manifest.maximum-g.afterSequence||typeof g.id!=='string'||!(/^[a-z0-9-]{8,80}$/).test(g.id)||typeof g.authorityReference!=='string'||!(/^[a-z0-9:._-]{1,160}$/).test(g.authorityReference)||typeof g.approvedAt!=='string'||!(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).test(g.approvedAt)||!Number.isFinite(Date.parse(g.approvedAt))||!(g.previousAllowanceHash===null||typeof g.previousAllowanceHash==='string'&&/^[a-f0-9]{64}$/.test(g.previousAllowanceHash))||next.has(g.previousAllowanceHash)||authority.has(g.authorityReference)||ids.has(g.id))throw Error('Concessione di riparazioni estranea, alterata o duplicata.')
  for(let n=1;n<=g.afterSequence;n++)if(!archive.value('guide-attempt-end',String(n).padStart(3,'0')))throw Error('Concessione prima dell’esito di una richiesta.')
  next.set(g.previousAllowanceHash,row);authority.add(g.authorityReference);ids.add(g.id)
 }
 const chain:typeof rows=[];let previous:string|null=null,limit=manifest.repairCredits,after=0
 while(next.has(previous)){const row:{key:string;value:DeliveryRepairAllowance}=next.get(previous)!,g=row.value
  const spent=history.filter(r=>r.value.sequence<=g.afterSequence&&r.value.repair).length
  if(g.afterSequence<after||g.repairLimit<=limit||g.repairLimit-limit>manifest.repairCredits||g.repairLimit-spent+g.reservedCalls>manifest.maximum-g.afterSequence)throw Error('Concessione oltre la capacità residua o non monotona.')
  chain.push(row);previous=row.key;limit=g.repairLimit;after=g.afterSequence
 }
 if(chain.length!==rows.length)throw Error('Catena delle concessioni incompleta o ciclica.')
 const at=(sequence:number)=>{const row=chain.filter(r=>r.value.afterSequence<sequence).at(-1);return {repairLimit:row?.value.repairLimit??manifest.repairCredits,allowanceHash:row?.key??null}}
 return {chain,at,...at(history.length+1)}
}
