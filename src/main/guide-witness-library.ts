import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash} from './matchup-guide-packet'
import {verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {readGuideCheckpointInventory,type GuideSegmentLine} from './guide-segment-checkpoints'
import type {GuideConstructionRuntime} from './guide-reply-phase'

export interface GuideWitnessProducer {
  role:'guide-segment-unit-result-v1';key:string;objectHash:string;
  unitId:string;unitKey:string;retryOrdinal:number;rawHash:string;valueHash:string
}
export interface GuideLibraryWitness {
  id:string;nativeHash:string;receiptsHash:string;journal:GuideSegmentJournal;
  frame:{rootHash:string;firstTurnHash:string;drawsHash:string;ordinaryDraws:{phase:string;hash:string}[]};
  aliases:{line:GuideSegmentLine;checkpointHash:string}[];
  producers:{turn:number;references:GuideWitnessProducer[]}[]
}
export interface GuideWitnessLibrary {
  version:1;scope:GuideConstructionRuntime['scope'];packetHash:string;caseId:string;rootHash:string;mainHash:string;
  members:GuideLibraryWitness[];
  excluded:{line:GuideSegmentLine;checkpointHash:string;reason:'superseded-prefix'|'incomplete'|'different-first-draw'|'unbound-producer'}[];
  complete:boolean;coherentDatabaseSnapshot:boolean;tacticalApprovalReused:false
}
const validatedLibraries=new WeakSet<object>()
export type VerifiedGuideWitnessLibrary=GuideWitnessLibrary&{readonly __verifiedLibrary?:never}
export function isVerifiedGuideWitnessLibrary(value:GuideWitnessLibrary):value is VerifiedGuideWitnessLibrary{return validatedLibraries.has(value)}
function sealLibrary(value:GuideWitnessLibrary):VerifiedGuideWitnessLibrary{
  const freeze=(v:any):void=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v)}}
  freeze(value);validatedLibraries.add(value);return value
}
type Runtime=Pick<GuideConstructionRuntime,'archive'|'scope'|'packet'>

/** The library includes every complete SELECTED checkpoint head of this root,
 * including retired plans. It imports facts as candidates, never AI approvals
 * or publication choices. Rejected descendants are not resurrected. */
export function readGuideWitnessLibrary(main:GuideSegmentJournal,options:Runtime):VerifiedGuideWitnessLibrary{
  const {archive,scope,packet}=options
  if(archive.id!==scope.jobId||archive.projectId!==scope.projectId)throw new Error('Biblioteca testimoni: archivio estraneo.')
  const owner=archive as Runtime['archive']&Partial<Pick<AiEvidenceArchive,'withReadSnapshot'>>
  if(!owner.withReadSnapshot)throw new Error('Biblioteca testimoni: lettura SQLite coerente non disponibile.')
  return owner.withReadSnapshot(()=>{
    verifyGuideSegments(main,scope,packet)
    if(!main.segments.length)throw new Error('Biblioteca testimoni: prima mossa e pescata di riferimento mancanti.')
    const inventory=readGuideCheckpointInventory(archive,scope,packet,main.setup.id,main.rootHash)
    const selectedMain=inventory.find(r=>r.line.id==='main'&&r.status==='selected')
    if(!selectedMain?.journal||guideHash(selectedMain.journal)!==guideHash(main))throw new Error('Biblioteca testimoni: linea principale superata.')
    const declarations=new Map<string,GuideWitnessProducer[]>()
    for(const row of archive.values<any>('guide-segment-unit-result-v1')){
      const outcome=row.value,value=outcome.value
      if(outcome.accepted!==true||value?.caseId!==main.setup.id||!value.body||!value.development||!['ours','opponent','next'].includes(value.phase))continue
      if(row.key!==guideHash(outcome)||typeof outcome.unitId!=='string'||typeof outcome.unitKey!=='string'||!Number.isSafeInteger(outcome.retryOrdinal)||outcome.retryOrdinal<0)throw new Error('Biblioteca testimoni: dichiarazione produttrice alterata.')
      const signature=guideHash({caseId:value.caseId,parentHash:value.parentHash,phase:value.phase,body:value.body,development:value.development})
      const reference:GuideWitnessProducer={role:'guide-segment-unit-result-v1',key:row.key,objectHash:guideHash(outcome),unitId:outcome.unitId,unitKey:outcome.unitKey,retryOrdinal:outcome.retryOrdinal,rawHash:guideHash(outcome.raw),valueHash:guideHash(value)}
      declarations.set(signature,[...declarations.get(signature)??[],reference])
    }
    const members=new Map<string,GuideLibraryWitness>(),excluded:GuideWitnessLibrary['excluded']=[]
    for(const entry of inventory){
      const reject=(reason:GuideWitnessLibrary['excluded'][number]['reason'])=>excluded.push({line:entry.line,checkpointHash:entry.checkpointHash,reason})
      if(entry.status==='superseded-prefix'){reject('superseded-prefix');continue}
      const journal=entry.journal!,head=journal.segments.at(-1)
      if(!head||!head.receipt.terminal&&journal.segments.length!==3){reject('incomplete');continue}
      if(guideHash(journal.segments[0].body.draw)!==guideHash(main.segments[0].body.draw)){reject('different-first-draw');continue}
      const producers=journal.segments.map((segment,index)=>({turn:index+1,references:declarations.get(guideHash({caseId:main.setup.id,parentHash:segment.parentHash,phase:segment.phase,body:segment.body,development:segment.development}))??[]}))
      if(producers.some(p=>!p.references.length)){reject('unbound-producer');continue}
      const nativeHash=guideHash(journal),id=guideHash({scope,packetHash:guideHash(packet),nativeHash}),alias={line:entry.line,checkpointHash:entry.checkpointHash},prior=members.get(id)
      if(prior){prior.aliases.push(alias);continue}
      members.set(id,{id,nativeHash,journal,receiptsHash:guideHash(journal.segments.map(s=>s.receipt)),
        frame:{rootHash:journal.rootHash,firstTurnHash:journal.segments[0].hash,drawsHash:guideHash(journal.segments.map(s=>({phase:s.phase,draw:s.body.draw}))),ordinaryDraws:journal.segments.map(s=>({phase:s.phase,hash:guideHash(s.body.draw)}))},
        aliases:[alias],producers})
    }
    const ordered=[...members.values()].map(m=>({...m,aliases:m.aliases.sort((a,b)=>guideHash(a).localeCompare(guideHash(b))),producers:m.producers.map(p=>({...p,references:p.references.sort((a,b)=>a.key.localeCompare(b.key))}))})).sort((a,b)=>a.id.localeCompare(b.id))
    return sealLibrary({version:1,scope:structuredClone(scope),packetHash:guideHash(packet),caseId:main.setup.id,rootHash:main.rootHash,mainHash:main.segments.at(-1)!.hash,
      members:ordered,excluded,complete:!!ordered.length&&!excluded.some(e=>e.reason==='unbound-producer'),coherentDatabaseSnapshot:true,tacticalApprovalReused:false})
  })
}

/** Deliberately contains neither bodies nor a claim that they were reviewed. */
export function guideWitnessDirectory(library:GuideWitnessLibrary){
  return {libraryHash:guideHash(library),caseId:library.caseId,rootHash:library.rootHash,complete:library.complete,
    members:library.members.map(({id,nativeHash,receiptsHash,frame,aliases})=>({id,nativeHash,receiptsHash,frame,aliases})),excluded:structuredClone(library.excluded),tacticalApprovalReused:false as const}
}
