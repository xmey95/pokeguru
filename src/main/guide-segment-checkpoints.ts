import {createHash} from 'node:crypto'
import {forkGuideSegments,verifyGuideSegments,type GuideSegmentJournal,type GuideSegmentScope} from './guide-segments'
import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuidePacket} from './matchup-guide-packet'

type Archive=Pick<AiEvidenceArchive,'id'|'projectId'|'saveValue'|'value'|'values'>
export interface GuideSegmentLine {id:string;anchorHash:string}
interface Checkpoint {
  sequence:number;contextHash:string;previousHash:string|null;
  event:'root'|'fork'|'append'|'invalidate';journal:GuideSegmentJournal;line:GuideSegmentLine;
  feedback:{reviewHash:string;reason:string}|null;
  origin:{line:GuideSegmentLine;checkpointHash:string;turns:number}|null
}
// v1 was an isolated local prototype without branch identities. Preserve it;
// no production AI job has used either checkpoint namespace yet.
const role='guide-segment-checkpoint-v2'
export class GuideCheckpointPrefixSuperseded extends Error {
  constructor(){super('Checkpoint segmenti: prefisso condiviso cambiato; ricostruire il ramo e i discendenti.');this.name='GuideCheckpointPrefixSuperseded'}
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const contextHash=(scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,line:GuideSegmentLine)=>hash({scope,packet,scenarioId,rootHash,line})
function owner(archive:Archive,scope:GuideSegmentScope){
  if(archive.id!==scope.jobId||archive.projectId!==scope.projectId)throw new Error('Checkpoint segmenti: archivio di un altro job o progetto.')
}
function read(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,line:GuideSegmentLine={id:'main',anchorHash:rootHash},visiting=new Set<string>()):{key:string;value:Checkpoint;boundaries:Map<number,string>}|undefined{
  owner(archive,scope)
  if(!/^[a-zA-Z0-9:._-]{1,160}$/.test(line.id)||!line.anchorHash||(line.id==='main'&&line.anchorHash!==rootHash))throw new Error('Checkpoint segmenti: identità del ramo non valida.')
  const context=contextHash(scope,packet,scenarioId,rootHash,line)
  if(visiting.has(context))throw new Error('Checkpoint segmenti: dipendenze circolari fra rami.')
  visiting.add(context)
  const rows=[...archive.values<Checkpoint>(role)].filter(r=>r.value.contextHash===context).sort((a,b)=>a.value.sequence-b.value.sequence)
  let previous:typeof rows[number]|undefined
  let boundaries=new Map<number,string>()
  for(const row of rows){
    const value=row.value,j=value.journal,before=previous?.value.journal
    if(row.key!==hash(value)||value.sequence!==(previous?.value.sequence??-1)+1||value.previousHash!==(previous?.key??null)||j.setup.id!==scenarioId||j.rootHash!==rootHash||hash(value.line)!==hash(line))throw new Error('Checkpoint segmenti: catena o identità alterate.')
    if(!before){
      if(line.id==='main'){
        if(value.event!=='root'||j.segments.length||value.feedback!==null||value.origin!==null)throw new Error('Checkpoint segmenti: radice non valida.')
      }else{
        const origin=value.origin
        if(value.event!=='fork'||!origin||origin.line.id===line.id||value.feedback!==null||!Number.isSafeInteger(origin.turns)||origin.turns<0)throw new Error('Checkpoint segmenti: origine del ramo mancante.')
        const saved=archive.value<Checkpoint>(role,origin.checkpointHash)
        if(!saved||hash(saved)!==origin.checkpointHash||saved.contextHash!==contextHash(scope,packet,scenarioId,rootHash,origin.line))throw new Error('Checkpoint segmenti: prefisso sorgente non archiviato.')
        const selected=read(archive,scope,packet,scenarioId,rootHash,origin.line,visiting)
        const prefix=selected&&forkGuideSegments(selected.value.journal,scope,packet,Math.min(origin.turns,selected.value.journal.segments.length))
        if(!prefix||prefix.segments.length!==origin.turns||hash(prefix)!==hash(j)||selected?.boundaries.get(origin.turns)!==line.anchorHash)throw new GuideCheckpointPrefixSuperseded()
        const boundary=archive.value<Checkpoint>(role,line.anchorHash)
        if(!boundary||hash(boundary)!==line.anchorHash||boundary.contextHash!==saved.contextHash||hash(boundary.journal)!==hash(j))throw new Error('Checkpoint segmenti: accettazione del prefisso sorgente non verificabile.')
        const original=forkGuideSegments(saved.journal,scope,packet,origin.turns)
        if(hash(original)!==hash(j))throw new Error('Checkpoint segmenti: ramo diverso dal prefisso sorgente.')
        boundaries=new Map([...selected!.boundaries].filter(([turns])=>turns<=origin.turns))
      }
    }
    else{
      if(value.origin!==null)throw new Error('Checkpoint segmenti: origine ridefinita dopo il fork.')
      const retained=before.segments.slice(0,j.segments.length)
      if(j.rootHash!==before.rootHash||hash(j.scope)!==hash(before.scope)||j.packetHash!==before.packetHash)throw new Error('Checkpoint segmenti: contesto del prefisso cambiato.')
      if(value.event==='append'){
        if(j.segments.length!==before.segments.length+1||hash(j.segments.slice(0,-1))!==hash(before.segments)||value.feedback!==null)throw new Error('Checkpoint segmenti: append non consecutiva.')
      }else if(value.event==='invalidate'){
        if(j.segments.length>=before.segments.length||hash(j.segments)!==hash(retained)||!value.feedback?.reviewHash||!value.feedback.reason?.trim())throw new Error('Checkpoint segmenti: invalidazione senza prefisso o feedback verificabile.')
      }else throw new Error('Checkpoint segmenti: evento non valido.')
    }
    if(value.event==='invalidate'){
      for(const turns of boundaries.keys())if(turns>j.segments.length)boundaries.delete(turns)
    }else if(value.event==='root'||value.event==='fork'||value.event==='append')boundaries.set(j.segments.length,row.key)
    previous=row
  }
  // Historical rejected descendants stay in the immutable chain. Revalidate
  // the selected head against current controls, never resurrect an older head.
  if(previous)verifyGuideSegments(previous.value.journal,scope,packet)
  return previous?{...previous,boundaries}:undefined
}
export function loadGuideSegmentCheckpoint(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,line?:GuideSegmentLine):GuideSegmentJournal|undefined{
  const last=read(archive,scope,packet,scenarioId,rootHash,line)
  return last?structuredClone(last.value.journal):undefined
}
export interface GuideCheckpointInventoryEntry {
  line:GuideSegmentLine;checkpointHash:string;sequence:number;
  status:'selected'|'superseded-prefix';journal:GuideSegmentJournal|null
}
/** Enumerate actual accepted HEADS, not every old complete descendant. All
 * chains still pass the ordinary reader; only its explicit stale-prefix case
 * is classified as historical. Malformed or missing source chains still fail. */
export function readGuideCheckpointInventory(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string):GuideCheckpointInventoryEntry[]{
  owner(archive,scope)
  const rows=[...archive.values<Checkpoint>(role)],byKey=new Map(rows.map(r=>[r.key,r.value]))
  if(byKey.size!==rows.length)throw new Error('Inventario checkpoint: chiavi duplicate.')
  const snapshot:Archive={id:archive.id,projectId:archive.projectId,saveValue:()=>{throw new Error('Inventario checkpoint in sola lettura.')},
    value:<T>(requested:string,key:string)=>requested===role?byKey.get(key) as T|undefined:archive.value<T>(requested,key),
    *values<T>(requested:string){if(requested===role){for(const row of rows)yield row as {key:string;value:T}}else yield*archive.values<T>(requested)}}
  const lines=new Map<string,GuideSegmentLine>()
  for(const row of rows)if(row.value.journal?.setup?.id===scenarioId&&row.value.journal.rootHash===rootHash){
    if(row.key!==hash(row.value))throw new Error('Inventario checkpoint: riga alterata.')
    lines.set(hash(row.value.line),row.value.line)
  }
  const output:GuideCheckpointInventoryEntry[]=[]
  for(const line of lines.values()){
    const context=contextHash(scope,packet,scenarioId,rootHash,line)
    const matching=rows.filter(r=>r.value.contextHash===context).sort((a,b)=>a.value.sequence-b.value.sequence),latest=matching.at(-1)
    if(!latest)throw new Error('Inventario checkpoint: identità del contesto non verificabile.')
    // A stale source prefix must not hide corruption later in this chain.
    // Validate the immutable structure even when the live-prefix reader will
    // correctly refuse to replay its old descendants under the new source.
    let previous:typeof matching[number]|undefined
    for(const row of matching){
      const value=row.value,j=value.journal,before=previous?.value.journal
      if(row.key!==hash(value)||value.sequence!==(previous?.value.sequence??-1)+1||value.previousHash!==(previous?.key??null)||j.setup.id!==scenarioId||j.rootHash!==rootHash||hash(j.scope)!==hash(scope)||j.packetHash!==hash(packet)||hash(value.line)!==hash(line))throw new Error('Inventario checkpoint: catena storica alterata.')
      if(!before){
        if(line.id==='main'){
          if(value.event!=='root'||j.segments.length||value.feedback!==null||value.origin!==null)throw new Error('Inventario checkpoint: radice storica non valida.')
        }else{
          const origin=value.origin,saved=origin&&byKey.get(origin.checkpointHash),boundary=byKey.get(line.anchorHash)
          if(value.event!=='fork'||!origin||!Number.isSafeInteger(origin.turns)||origin.turns<0||origin.line.id===line.id||value.feedback!==null||!saved||hash(saved)!==origin.checkpointHash||saved.contextHash!==contextHash(scope,packet,scenarioId,rootHash,origin.line)||!boundary||hash(boundary)!==line.anchorHash||boundary.contextHash!==saved.contextHash||hash(boundary.journal)!==hash(j)||origin.turns>saved.journal.segments.length||hash({...saved.journal,segments:saved.journal.segments.slice(0,origin.turns)})!==hash(j))throw new Error('Inventario checkpoint: origine storica alterata.')
        }
      }else{
        if(value.origin!==null||j.rootHash!==before.rootHash||hash(j.scope)!==hash(before.scope)||j.packetHash!==before.packetHash)throw new Error('Inventario checkpoint: contesto storico alterato.')
        if(value.event==='append'){
          if(j.segments.length!==before.segments.length+1||hash(j.segments.slice(0,-1))!==hash(before.segments)||value.feedback!==null)throw new Error('Inventario checkpoint: append storica non consecutiva.')
        }else if(value.event==='invalidate'){
          if(j.segments.length>=before.segments.length||hash(j.segments)!==hash(before.segments.slice(0,j.segments.length))||!value.feedback?.reviewHash||!value.feedback.reason?.trim())throw new Error('Inventario checkpoint: invalidazione storica non valida.')
        }else throw new Error('Inventario checkpoint: evento storico non valido.')
      }
      previous=row
    }
    try{
      const head=read(snapshot,scope,packet,scenarioId,rootHash,line)
      if(!head)throw new Error('Inventario checkpoint: head mancante.')
      output.push({line:structuredClone(line),checkpointHash:head.key,sequence:head.value.sequence,status:'selected',journal:structuredClone(head.value.journal)})
    }catch(error){
      if(!(error instanceof GuideCheckpointPrefixSuperseded))throw error
      output.push({line:structuredClone(line),checkpointHash:latest.key,sequence:latest.value.sequence,status:'superseded-prefix',journal:null})
    }
  }
  if(!output.some(r=>r.line.id==='main'&&r.status==='selected'))throw new Error('Inventario checkpoint: linea principale mancante.')
  return output.sort((a,b)=>hash(a.line).localeCompare(hash(b.line)))
}
export function guideSegmentCheckpointFeedback(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,line?:GuideSegmentLine):Checkpoint['feedback']{
  return structuredClone(read(archive,scope,packet,scenarioId,rootHash,line)?.value.feedback??null)
}
/** Immutable event log; invalidation selects a shorter accepted prefix and
 * retains every previous descendant and the independent review reference. */
export function saveGuideSegmentCheckpoint(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,journal:GuideSegmentJournal,feedback:Checkpoint['feedback']=null,line:GuideSegmentLine={id:'main',anchorHash:journal.rootHash}):void{
  owner(archive,scope);verifyGuideSegments(journal,scope,packet)
  const previous=read(archive,scope,packet,journal.setup.id,journal.rootHash,line)
  if(previous&&hash(previous.value.journal)===hash(journal)&&feedback===null)return
  const value:Checkpoint={sequence:(previous?.value.sequence??-1)+1,contextHash:contextHash(scope,packet,journal.setup.id,journal.rootHash,line),previousHash:previous?.key??null,event:!previous?'root':feedback?'invalidate':'append',journal:structuredClone(journal),line:structuredClone(line),feedback:structuredClone(feedback),origin:null}
  persist(archive,scope,packet,value)
}
function persist(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,value:Checkpoint){
  // Validate the prospective chain before mutating SQLite.
  const candidate=hash(value),prospective:Archive={id:archive.id,projectId:archive.projectId,saveValue:(role,key,value)=>archive.saveValue(role,key,value),value:<T>(role:string,key:string)=>archive.value<T>(role,key),*values<T>(requested:string){yield* archive.values<T>(requested);if(requested===role)yield {key:candidate,value:value as T}}}
  read(prospective,scope,packet,value.journal.setup.id,value.journal.rootHash,value.line)
  archive.saveValue(role,candidate,value)
}
/** Branch storage keeps the exact accepted prefix and a live dependency on its
 * source. Changing that source prefix makes every old descendant unreadable. */
export function guideSegmentForkLine(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,targetId:string,turns:number,sourceLine:GuideSegmentLine={id:'main',anchorHash:rootHash}):GuideSegmentLine{
 if(targetId==='main'||targetId===sourceLine.id)throw new Error('Checkpoint segmenti: identificativo ramo riservato o uguale alla sorgente.')
 const source=read(archive,scope,packet,scenarioId,rootHash,sourceLine)
 if(!source)throw new Error('Checkpoint segmenti: sorgente del fork non archiviata.')
 const anchorHash=source.boundaries.get(turns)
 if(!Number.isSafeInteger(turns)||turns<0||!anchorHash)throw new Error('Checkpoint segmenti: accettazione del punto di fork assente.')
 return {id:targetId,anchorHash}
}
export function forkGuideSegmentCheckpoint(archive:Archive,scope:GuideSegmentScope,packet:GuidePacket,scenarioId:string,rootHash:string,targetId:string,turns:number,sourceLine:GuideSegmentLine={id:'main',anchorHash:rootHash}):{line:GuideSegmentLine;journal:GuideSegmentJournal}{
  if(targetId==='main'||targetId===sourceLine.id)throw new Error('Checkpoint segmenti: identificativo ramo riservato o uguale alla sorgente.')
  const source=read(archive,scope,packet,scenarioId,rootHash,sourceLine)
  if(!source)throw new Error('Checkpoint segmenti: sorgente del fork non archiviata.')
  const journal=forkGuideSegments(source.value.journal,scope,packet,turns),anchorHash=source.boundaries.get(turns)
  if(!anchorHash)throw new Error('Checkpoint segmenti: accettazione del punto di fork assente.')
  const line={id:targetId,anchorHash}
  const existing=read(archive,scope,packet,scenarioId,rootHash,line)
  if(existing)return {line,journal:structuredClone(existing.value.journal)}
  persist(archive,scope,packet,{sequence:0,contextHash:contextHash(scope,packet,scenarioId,rootHash,line),previousHash:null,event:'fork',journal,line,feedback:null,origin:{line:structuredClone(sourceLine),checkpointHash:source.key,turns}})
  return {line,journal:structuredClone(journal)}
}
