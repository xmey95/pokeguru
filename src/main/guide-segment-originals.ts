import type {GuideContent,MatchupGuide} from '../shared/matchup-guide'
import {readGuideContent} from '../shared/matchup-guide'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {readGuideScenarioOriginals} from './guide-scenario-originals'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guideReplySeedSchema,guideReplySeeds,guideReplyFork,GUIDE_REPLY_MAX_OTHER,type GuideReplyPlan} from './guide-reply-plan'
import {guideSegmentNativeSchema,createGuideSegments,appendGuideSegment,type GuideSegmentJournal} from './guide-segments'
import {saveGuideSegmentCheckpoint,loadGuideSegmentCheckpoint,forkGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import {projectGuideLedger} from '../shared/guide-ledger-projection'
import {compileGuideTactics} from '../shared/guide-tactical-checks'
import type {GuideSegmentConstruction} from './guide-segment-review'
import type {GuideConstructionRuntime,GuideReplyConstruction} from './guide-reply-phase'
import {scopedConstructionPacket} from './guide-causal-contract'

export type GuideSegmentOriginals=NonNullable<MatchupGuide['generation']['segmentOriginals']>
/** Keep the original AI goals and branch notes, which cannot be recovered from
 * a published outcome or guessed from the main line. Receipts are recomputed. */
export function guideSegmentOriginals(construction:GuideSegmentConstruction,basis:MatchupGuide['basis']):GuideSegmentOriginals{
 return {formatVersion:1,scopeHash:guideHash(basis),cases:construction.mains.map(main=>{const built=construction.built.find(b=>b.native.id===main.setup.id)!;return {id:main.setup.id,nativeHash:guideHash(built.native),sourceMainHash:main.segments[2].hash,claims:structuredClone(built.raw.claims),limitations:[...built.raw.limitations],changeSummary:built.raw.changeSummary,seeds:structuredClone(guideReplySeeds(construction.plans.find(p=>p.caseId===main.setup.id)!)),branchNotes:construction.branches.filter(b=>b.caseId===main.setup.id).map(b=>({id:b.seed.id,...guideReplyFork(b.seed)===0?{ours:structuredClone(b.journal.segments[0].development) as {reason:string;pivot:string}}:{},opponent:b.journal.segments[0].receipt.terminal?null:structuredClone(b.journal.segments[1].development) as {reason:string;pivot:string},next:b.terminal?null:structuredClone(b.journal.segments[2].development) as {reason:string;pivot:string}}))}})}
}
export function readGuideSegmentOriginals(guide:MatchupGuide):GuideSegmentOriginals|undefined{
 const original=guide.generation.segmentOriginals
 if(original===undefined)return undefined // Historical/prototype reports remain readable.
 const invalid=()=>new Error('Originali dei segmenti non coerenti con gli scenari e le fonti della guida.')
 if(guide.basis.promptVersion!=='matchup-guide-28'||original.formatVersion!==1||original.scopeHash!==guideHash(guide.basis)||!Array.isArray(original.cases)||original.cases.length!==guide.scenarios.length||new Set(original.cases.map(c=>c.id)).size!==original.cases.length)throw invalid()
 const natives=readGuideScenarioOriginals(guide),packet:GuidePacket={basis:guide.basis,ourList:guide.ourList,opponentLists:guide.opponentLists,sources:guide.sources,matchup:'',deckContext:'',gaps:[]}
 for(const item of original.cases){
  const native=natives.find(n=>n.id===item.id)?.native as any
  if(!native||item.nativeHash!==guideHash(native)||!/^[a-f0-9]{64}$/.test(item.sourceMainHash)||!Array.isArray(item.seeds)||!Array.isArray(item.branchNotes)||item.seeds.length!==native.replyComparison.options.length||item.branchNotes.length!==item.seeds.length||new Set(item.seeds.map(s=>s.id)).size!==item.seeds.length||new Set(item.branchNotes.map(s=>s.id)).size!==item.branchNotes.length)throw invalid()
  readGuideContent({chapters:[],claims:item.claims,scenarios:[],exercises:[],limitations:item.limitations,changeSummary:item.changeSummary})
  if(item.claims.some(c=>!guide.claims.some(p=>p.id===c.id&&guideHash(p)===guideHash(c))))throw invalid()
  const scoped=scopedConstructionPacket(packet,native.opponentListId),schema=guideSegmentNativeSchema(item.id,scoped,native.opponentListId)
  for(const seed of item.seeds){
   if(!['direct','access','defend','other'].includes(seed.role))throw invalid()
   const seedSchema=guideReplySeedSchema(seed.role,scoped,item.id,GUIDE_REPLY_MAX_OTHER) as any
   if(guideReplyFork(seed)===0){seedSchema.properties.forkAtTurn={type:'integer',const:0};seedSchema.required.push('forkAtTurn')}
   assertNativeScenarioSchema(seed,seedSchema)
   const option=native.replyComparison.options.find((o:any)=>o.id===seed.id),note=item.branchNotes.find(n=>n.id===seed.id)
   if(!option||option.intent!==seed.intent||!note||(seed.role!=='other'&&native.replyComparison.coverage[seed.role]!==seed.id))throw invalid()
   if(guideReplyFork(seed)===0)assertNativeScenarioSchema(note.ours,schema.properties.developmentPlan.properties.ours)
   else if(note.ours!==undefined)throw invalid()
   if(option.turns.opponent.terminal===true){if(guideReplyFork(seed)!==0||note.opponent!==null)throw invalid()}
   else assertNativeScenarioSchema(note.opponent,schema.properties.developmentPlan.properties.opponent)
   if(option.turns.next.terminal===true){if(note.next!==null)throw invalid()}
   else assertNativeScenarioSchema(note.next,schema.properties.developmentPlan.properties.next)
  }
  for(const role of ['direct','access','defend'])if(item.seeds.filter(s=>s.role===role).length!==1)throw invalid()
 }
 return structuredClone(original)
}

/** Rebind original declarations into a NEW job and replay every receipt. This
 * creates no tactical approval and never reuses a journal from another scope. */
export function seedGuideSegmentRevision(guide:MatchupGuide,options:GuideConstructionRuntime):{construction:GuideSegmentConstruction;draft:GuideContent}|undefined{
 const original=readGuideSegmentOriginals(guide)
 if(!original)return undefined
 const {packet,scope,archive}=options,evidence=options.evidencePacket??packet
 if(guide.basis.projectId!==scope.projectId||guide.basis.opponentId!==packet.basis.opponentId)throw new Error('La guida da rivedere appartiene a un altro progetto o matchup.')
 if(archive.id!==scope.jobId||archive.projectId!==scope.projectId)throw new Error('Revisione: archivio estraneo.')
 const sameList=(a:any,b:any)=>b&&guideHash(a)===guideHash(b)
 if(!sameList(guide.ourList,evidence.ourList)||guide.opponentLists.some(a=>!sameList(a,evidence.opponentLists.find(b=>b.id===a.id)))||guide.sources.some(a=>!evidence.sources.some(b=>b.id===a.id&&guideHash(a)===guideHash(b))))return undefined
 const natives=readGuideScenarioOriginals(guide),construction:GuideSegmentConstruction={mains:[],plans:[],branches:[],built:[]}
 const save=(j:GuideSegmentJournal,line?:GuideReplyConstruction['line'])=>saveGuideSegmentCheckpoint(archive,scope,packet,j,null,line)
 for(const item of original.cases){
  const native=natives.find(n=>n.id===item.id)!.native as any,{turns,developmentPlan,...rest}=native
  const schema=guideSegmentNativeSchema(item.id,packet,native.opponentListId)
  const setup=Object.fromEntries(Object.keys(schema.properties).filter(k=>!['turns','developmentPlan'].includes(k)).map(k=>[k,rest[k]]))
  let main=createGuideSegments(setup,scope,packet),stored=loadGuideSegmentCheckpoint(archive,scope,packet,item.id,main.rootHash)
  if(!stored)save(main)
  for(const [i,phase]of ['ours','opponent','next'].entries()){
   main=appendGuideSegment(main,scope,packet,turns[phase],developmentPlan[phase])
   if(stored&&stored.segments.length>i){if(guideHash(stored.segments[i])!==guideHash(main.segments[i]))throw new Error('Revisione: linea seed diversa dalle dichiarazioni originali.')}
   else save(main)
  }
  construction.mains.push(main)
  const seeds=structuredClone(item.seeds),plan:GuideReplyPlan={caseId:item.id,mainHash:main.segments[2].hash,direct:seeds.find(s=>s.role==='direct')!,access:seeds.find(s=>s.role==='access')!,defend:seeds.find(s=>s.role==='defend')!,others:seeds.filter(s=>s.role==='other')}
  construction.plans.push(plan)
  for(const seed of seeds){
   const option=native.replyComparison.options.find((o:any)=>o.id===seed.id),notes=item.branchNotes.find(n=>n.id===seed.id)!
   const at=guideReplyFork(seed),fork=forkGuideSegmentCheckpoint(archive,scope,packet,item.id,main.rootHash,'reply-'+guideHash(seed),at)
   let journal=fork.journal
   for(const phase of (at===0?['ours','opponent','next']:['opponent','next']) as ('ours'|'opponent'|'next')[]){
    const turnIndex={ours:0,opponent:1,next:2}[phase],body=option.turns[phase]
    if(body.terminal===true)break
    const note=notes[phase]
    if(!note)throw new Error('Revisione: sviluppo originale del ramo mancante.')
    const prefix=journal.segments.length>turnIndex?{...journal,segments:journal.segments.slice(0,turnIndex)}:journal,next=appendGuideSegment(prefix,scope,packet,body,note)
    // Reopening a seeded job must select exactly its already verified prefix.
    if(journal.segments.length>turnIndex&&guideHash(journal.segments[turnIndex])!==guideHash(next.segments[turnIndex]))throw new Error('Revisione: checkpoint seed diverso dalle dichiarazioni originali.')
    if(journal.segments.length<=turnIndex){journal=next;save(journal,fork.line)}
   }
   const terminal=journal.segments.at(-1)!.receipt.terminal===true
   construction.branches.push({caseId:item.id,seed,line:fork.line,journal,terminal})
  }
  const raw:GuideContent={chapters:[],claims:structuredClone(item.claims),scenarios:[native],exercises:[],limitations:[...item.limitations],changeSummary:item.changeSummary}
  const content=compileGuideTactics(projectGuideLedger(raw,packet)),branches=construction.branches.filter(b=>b.caseId===item.id)
  const constructionHash=guideHash({main:main.segments[2].hash,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))})
  construction.built.push({raw,content,native,constructionHash})
 }
 const draft:GuideContent={chapters:structuredClone(guide.chapters),claims:structuredClone(guide.claims),scenarios:construction.built.flatMap(b=>b.content.scenarios),exercises:structuredClone(guide.exercises),limitations:[...new Set([...guide.limitations,...evidence.gaps])],changeSummary:guide.changeSummary}
 archive.saveValue('guide-segment-revision-seed-v1',guideHash([guide,scope,packet]),{parentGuideHash:guideHash(guide),parentBasisHash:guideHash(guide.basis),original,newScope:scope,newConstructionHash:guideHash(construction),tacticalApprovalReused:false})
 return {construction,draft}
}
