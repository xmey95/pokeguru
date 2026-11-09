import type {GuideTacticalFrontier} from './guide-tactical-frontier'

export type GuideAuditPath=(string|number)[]
export type GuideAuditMode={kind:'setup'}|{kind:'prefix';turns:1|2|3}
export interface GuideAuditLocation {path:GuideAuditPath;lineId:string;turn:number;side:'ours'|'opponent';events:GuideAuditPath[]}
export interface GuideAuditCandidates {
  version:1;caseId:string;locations:GuideAuditLocation[]
  choices:{path:GuideAuditPath;candidateIds:string[];lineId:string;turn:number;side:string}[]
  groups:GuideTacticalFrontier[]
  /** Exact zone balances from the SAME replay, before and after native events.
   * Missing rows in a snapshot mean zero, never an unknown deck remainder. */
  quantities?:{cards:{side:'ours'|'opponent';printId:string;name:string;total:number}[];windows:{id:string;path:GuideAuditPath;lineId:string;turn:number;side:string;when:'before'|'after';resolvedWithPreviousKo?:boolean;balances:{side:string;printId:string;zone:string;count:number}[];hosts:{side:string;printId:string;copy:number;zone:string;stack:{printId:string;count:number}[];attached:{printId:string;count:number}[]}[];unknownAttachments:{side:string;printId:string;count:number}[]}[]}
}
export function guideAuditAt(root:any,path:GuideAuditPath):any{return path.reduce((value,key)=>value?.[key],root)}
/** Addresses originate from the native declaration, never from a model patch. */
export function guideAuditLocations(native:any,mode:GuideAuditMode):GuideAuditLocation[]{
  const locations:GuideAuditLocation[]=[];let turn=0
  const add=(path:GuideAuditPath,side:'ours'|'opponent',lineId='setup')=>{
    const body=guideAuditAt(native,path);turn++
    if(!body||body.terminal===true)return
    const events:GuideAuditPath[]=Array.isArray(body.events)?body.events.map((_:unknown,i:number)=>[...path,'events',i]):[
      ...(body.beforeAttack??[]).map((_:unknown,i:number)=>[...path,'beforeAttack',i]),
      ...body.attack?[[...path,'attack']]:[],...(body.afterAttack??[]).map((_:unknown,i:number)=>[...path,'afterAttack',i])]
    locations.push({path,lineId,turn,side,events})
  }
  if(native.firstOpponentTurn!==null)add(['firstOpponentTurn'],'opponent')
  for(let i=0;i<(native.setupRounds??[]).length;i++)for(const side of ['ours','opponent'] as const)add(['setupRounds',i,side],side)
  if(mode.kind==='prefix')for(const phase of ['ours','opponent','next'].slice(0,mode.turns))add(['turns',phase],phase==='opponent'?'opponent':'ours','main')
  return locations
}
/** Hash this projection to prove that only audits changed, including wording,
 * draws, annotations, development, movements, costs and card-effect proofs. */
export function guideWithoutNativeAudits(native:any,mode:GuideAuditMode):any{
  const copy=structuredClone(native)
  for(const location of guideAuditLocations(copy,mode)){
    delete guideAuditAt(copy,location.path).tactical
    for(const path of location.events)delete guideAuditAt(copy,path).decisionProof
  }
  return copy
}
