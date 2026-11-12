import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {gzipSync} from 'node:zlib'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {matchingEvidenceValues,matchingEvidenceFields} from '../src/main/ai-evidence-selection'

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'pokeguru-selection-')),file=join(dir,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Independent selectors',format:'STANDARD'}),job=jobs.start('thread-ask',project.id,'independent'),archive=new AiEvidenceArchive(file,job)
 return {archive,file,projects,jobs,project,close(){archive.close();jobs.close();projects.close();rmSync(dir,{recursive:true,force:true})}}
}
it('selects ordered nested conjunctions and unions exactly across pages, mutations, reopen and jobs',()=>{
 const f=fixture(),role='nested-fields',filters=[{path:['request','validationId'],expected:['v3','v4']},{path:['request','data','sourceHash'],expected:['wanted']}]
 try{
  for(let i=0;i<75;i++)f.archive.saveValue(role,String(i).padStart(3,'0'),{request:{validationId:i%3?'v3':'v4',data:{sourceHash:i%4?'other':'wanted'}},nested:{n:i}})
  const view={values:<T>(r:string)=>f.archive.values<T>(r)},reference=()=>[...matchingEvidenceFields<any>(view,role,filters)],select=()=>[...matchingEvidenceFields<any>(f.archive,role,filters)]
  expect(select()).toEqual(reference());select()[0].value.nested.n=999;expect(select()).toEqual(reference())
  f.archive.saveValue(role,'new',{request:{validationId:'v4',data:{sourceHash:'wanted'}},nested:{n:75}})
  expect(select()).toEqual(reference())
  const reopened=new AiEvidenceArchive(f.file,{id:f.archive.id,projectId:f.archive.projectId,resourceId:f.archive.resourceId},true)
  try{expect([...matchingEvidenceFields(reopened,role,filters)]).toEqual(reference())}finally{reopened.close()}
  const project=f.projects.create({name:'Different project',format:'STANDARD'}),job=f.jobs.start('thread-ask',project.id,'other'),other=new AiEvidenceArchive(f.file,job)
  try{expect([...matchingEvidenceFields(other,role,filters)]).toEqual([])}finally{other.close()}
 }finally{f.close()}
})
it('preserves short circuit/null errors, missing and non-string leaves and uncached long fields',()=>{
 const f=fixture(),role='nested-fields',filters=[{path:['kind'],expected:['audit']},{path:['data','hash'],expected:['wanted']}]
 try{
  f.archive.saveValue(role,'a',{kind:'other',data:null});f.archive.saveValue(role,'b',{kind:'audit',data:{hash:12}})
  f.archive.saveValue(role,'c',{kind:'audit',data:{}});f.archive.saveValue(role,'d',{kind:'audit',data:{hash:'wanted'}})
  for(let i=0;i<2;i++)expect([...matchingEvidenceFields(f.archive,role,filters)].map(r=>r.key)).toEqual(['d'])
  f.archive.saveValue(role,'e',{kind:'audit',data:null})
  for(let i=0;i<2;i++)expect(()=>[...matchingEvidenceFields(f.archive,role,filters)]).toThrow(TypeError)
  f.archive.saveValue('long','a',{text:'é'.repeat(800)})
  for(let i=0;i<2;i++)expect([...matchingEvidenceFields(f.archive,'long',[{path:['text'],expected:['é'.repeat(800)]}])]).toHaveLength(1)
 }finally{f.close()}
})
it.each(['body','size','missing','ordinal','binding'] as const)('rechecks excluded originals and current bindings on nested selector cache hits: %s',kind=>{
 const f=fixture(),role='nested-fields',filters=[{path:['kind'],expected:['audit']},{path:['data','hash'],expected:['wanted']}]
 try{
  f.archive.saveValue(role,'a',{kind:'audit',data:{hash:'wanted'}});f.archive.saveValue(role,'b',{kind:'audit',data:{hash:'excluded'}})
  expect([...matchingEvidenceFields(f.archive,role,filters)]).toHaveLength(1)
  const db=new DatabaseSync(f.file)
  try{
   const hash=(db.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').get(f.archive.id,role,'b') as {object_hash:string}).object_hash
   if(kind==='body')db.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=?').run(gzipSync(JSON.stringify({kind:'audit',data:{hash:'wanted'}})),hash)
   if(kind==='size')db.prepare('UPDATE ai_evidence_objects SET bytes=bytes+1 WHERE hash=?').run(hash)
   if(kind==='missing')db.prepare('DELETE FROM ai_evidence_chunks WHERE object_hash=?').run(hash)
   if(kind==='ordinal')db.prepare('UPDATE ai_evidence_chunks SET ordinal=ordinal+1 WHERE object_hash=?').run(hash)
   if(kind==='binding'){
    db.prepare("UPDATE ai_evidence_values SET object_hash=(SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role=? AND key='a') WHERE job_id=? AND role=? AND key='b'").run(f.archive.id,role,f.archive.id,role)
    expect([...matchingEvidenceFields(f.archive,role,filters)].map(r=>r.key)).toEqual(['a','b'])
   }else expect(()=>[...matchingEvidenceFields(f.archive,role,filters)]).toThrow()
  }finally{db.close()}
 }finally{f.close()}
})
it('matches full scans, isolates mutable results, observes new entries and respects lightweight archive views',()=>{
 const f=fixture(),role='independent-selection'
 try{
  for(let i=0;i<75;i++)f.archive.saveValue(role,String(i).padStart(3,'0'),{unitId:i%3?'other':'target',nested:{amount:i}})
  const reference=()=>[...f.archive.values<any>(role)].filter(r=>r.value.unitId==='target')
  const select=()=>[...matchingEvidenceValues<any>(f.archive,role,'unitId','target')]
  expect(select()).toEqual(reference());select()[0].value.nested.amount=999;expect(select()).toEqual(reference())
  f.archive.saveValue(role,'new',{unitId:'target',nested:{amount:76}});expect(select()).toEqual(reference())
  const view={*values<T>(requested:string){for(const row of f.archive.values<T>(requested))if(row.key==='new')yield row}}
  expect([...matchingEvidenceValues<any>(view,role,'unitId','target')]).toEqual(reference().filter(r=>r.key==='new'))
  const job=f.jobs.start('thread-ask',f.project.id,'other'),other=new AiEvidenceArchive(f.file,job)
  try{expect([...other.valuesByField(role,'unitId','target')]).toEqual([])}finally{other.close()}
 }finally{f.close()}
})
it('rechecks excluded compressed bytes and metadata even after warming selector fields',()=>{
 const f=fixture(),role='independent-selection'
 try{
  f.archive.saveValue(role,'a',{unitId:'target',payload:'original'})
  f.archive.saveValue(role,'b',{unitId:'excluded',payload:'unrelated'})
  const select=()=>[...f.archive.valuesByField(role,'unitId','target')]
  expect(select()).toHaveLength(1)
  const db=new DatabaseSync(f.file)
  try{
   const {object_hash:hash}=db.prepare('SELECT object_hash FROM ai_evidence_values WHERE role=? AND key=?').get(role,'b') as {object_hash:string}
   const original=db.prepare('SELECT body FROM ai_evidence_chunks WHERE object_hash=? AND ordinal=0').get(hash) as {body:Uint8Array}
   db.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=0').run(gzipSync(JSON.stringify({unitId:'target',payload:'tampered'})),hash)
   expect(select).toThrow();db.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=0').run(original.body,hash);expect(select()).toHaveLength(1)
   db.prepare('UPDATE ai_evidence_objects SET bytes=bytes+1 WHERE hash=?').run(hash);expect(select).toThrow();db.prepare('UPDATE ai_evidence_objects SET bytes=bytes-1 WHERE hash=?').run(hash);expect(select()).toHaveLength(1)
   db.prepare('DELETE FROM ai_evidence_chunks WHERE object_hash=?').run(hash);expect(select).toThrow()
  }finally{db.close()}
 }finally{f.close()}
})
it('keeps long strings exact, handles reserved property names and does not hide null originals',()=>{
 const f=fixture(),role='independent-selection',long='𐀀'.repeat(200)
 try{
  f.archive.saveValue(role,'long',{unitId:long});f.archive.saveValue(role,'reserved',JSON.parse('{"__proto__":"target","unitId":"target"}'))
  f.archive.saveValue('primitive-role','text','x'.repeat(300000))
  for(let n=0;n<2;n++)expect([...f.archive.valuesByField('primitive-role','0','x')]).toHaveLength(1)
  for(let n=0;n<2;n++){expect([...f.archive.valuesByField(role,'unitId',long)]).toHaveLength(1);expect([...f.archive.valuesByField(role,'__proto__','target')]).toHaveLength(1);expect([...f.archive.valuesByField(role,'toString','target')]).toHaveLength(0)}
  f.archive.saveValue(role,'null',null);expect(()=>[...f.archive.valuesByField(role,'unitId','target')]).toThrow()
 }finally{f.close()}
})
it('selects shallow descriptor fields exactly and keeps literal dotted names distinct from paths',()=>{
 const f=fixture(),role='independent-descriptors'
 try{
  for(let n=0;n<72;n++)f.archive.saveValue(role,String(n),{request:{validationId:n%2?'other':'target',data:{unrelated:n}},'request.validationId':'literal'})
  const select=()=>[...f.archive.valuesByField<any>(role,['request','validationId'],'target')]
  const full=()=>[...f.archive.values<any>(role)].filter(r=>r.value.request.validationId==='target')
  expect(select()).toEqual(full());select()[0].value.request.validationId='mutated';expect(select()).toEqual(full())
  expect([...f.archive.valuesByField(role,'request.validationId','literal')]).toHaveLength(72)
  f.archive.saveValue(role,'broken',{request:null});expect(select).toThrow();expect(full).toThrow()
 }finally{f.close()}
})
