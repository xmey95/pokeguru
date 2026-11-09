import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideSource,packetHash,guideHash} from '../src/main/matchup-guide-packet'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {assertGuideFinalReviewEvidence} from '../src/main/guide-segment-review-history'

const config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null}
for(const mode of ['single','final-resume','repair-resume','rewrite-original'] as const)it('uses current supplemental evidence without changing native scopes: '+mode,async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'late-evidence-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path),project=projects.create({name:'Synthetic supplemental evidence',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'supplemental')
 let work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
 const fixture=syntheticSegmentProtocol(project.id),initial=guideHash(fixture.packet),stages:string[]=[],criticSources:string[][]=[]
 let prose=false,repaired=false,rejected=false,interrupted=false
 const runner=async(prompt:string,_config:unknown,schema:object)=>{
  const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])) as any,raw=fixture.response(stage,data,schema) as any;stages.push(stage)
  if(stage.startsWith('prose')&&!stage.startsWith('prose-repair')){raw.chapters[0].body+=' Hypothetical off-list reference: Late reference draws one card.';prose=true}
  if(stage.startsWith('prose-repair')){
   for(const unit of raw.units)if(unit.response.content.body)unit.response.content.body+=' Second reference is a separate hypothetical supplementary card.'
   repaired=true
  }
  if(prose&&stage.startsWith('review'))for(const [index,unit]of (data.units??[]).entries()){
   if(unit.data.reviewScope.kind!=='guide-text')continue
   const sources=unit.data.packet.sources.map((s:any)=>s.id);criticSources.push(sources)
   expect(sources).toContain('card:late')
   if(repaired){expect(sources).toContain('card:second');expect(unit.data.reviewHistory.findings.length).toBeGreaterThan(0);expect(unit.data.reviewHistory.reviews[0].snapshot.data.packet.sources.some((s:any)=>s.id==='card:late')).toBe(true)}
   if(mode==='repair-resume'&&!rejected){raw.units[index].response={...raw.units[index].response,verdict:'revise',findings:[{severity:'major',targetId:'chapter-summary',message:'Clarify the hypothetical supplementary reference.',correction:'Keep the source explicit and do not treat it as stock in the exact lists.',sourceIds:['card:late'],proposedActions:[],counterlines:[],repair:{kind:'text',targetId:'chapter-summary'}}]};rejected=true}
  }
  return raw
 }
 const ensureEvidence=(packet:typeof fixture.packet,text:string)=>{
  if(!prose)return {packet,missing:[]}
  const next=structuredClone(packet)
  if(mode==='rewrite-original'){next.sources[0].content+=' Rewrite frozen source';next.sources[0].hash=guideHash(next.sources[0].content)}
  else{
   if(text.includes('Late reference')&&!next.sources.some(s=>s.id==='card:late'))next.sources.push(guideSource('card:late','card','Late reference',null,JSON.stringify({printId:'late',name:'Late reference',category:'Trainer',gameplay:{effect:'Synthetic: draw one card.'}})))
   if(repaired&&text.includes('Second reference')&&!next.sources.some(s=>s.id==='card:second')){next.sources.push(guideSource('card:second','card','Second reference',null,JSON.stringify({printId:'second',name:'Second reference',category:'Trainer',gameplay:{effect:'Synthetic reference only.'}})));next.gaps.push('Synthetic supplemental uncertainty must remain explicit.')}
  }
  next.basis.dependencyHash=packetHash(next);return {packet:next,missing:[]}
 }
 const options={packet:fixture.packet,config,request:'Synthetic late evidence coverage.',runner,ensureEvidence}
 try{
  if(mode==='rewrite-original'){
   await expect(generateDeepGuide({...options,work})).rejects.toThrow('estensione non valida');expect(criticSources).toEqual([]);expect(work.archive.value('guide','validated')).toBeUndefined();return
  }
  if(mode==='repair-resume'){
   await expect(generateDeepGuide({...options,work,onStage:stage=>{if(rejected&&!interrupted&&stage.startsWith('prose-repair')){interrupted=true;throw Error('Synthetic interruption with supplementary evidence')}}})).rejects.toThrow('Synthetic interruption')
   expect([...work.archive.values('guide-segment-evidence-extension-v1')]).toHaveLength(1)
   work.close();work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
  }
  if(mode==='final-resume'){
   await expect(generateDeepGuide({...options,work,onStage:stage=>{if(prose&&!interrupted&&stage.startsWith('review-')){interrupted=true;throw Error('Synthetic interruption before final criticism')}}})).rejects.toThrow('Synthetic interruption before final criticism')
   expect([...work.archive.values('guide-segment-evidence-extension-v1')]).toHaveLength(1)
   work.close();work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
   const originalValue=work.archive.value.bind(work.archive)
   const beforeResume=stages.length
   work.archive.value=((role:string,key:string)=>{
    const value=originalValue<any>(role,key)
    if(role!=='guide-segment-prose-v1'||!value)return value
    const changed=structuredClone(value);changed.draft.scenarios[0].conclusion+=' Unpaid alteration of the verified scenario.';changed.draftHash=guideHash(changed.draft);return changed
   }) as typeof work.archive.value
   try{await expect(generateDeepGuide({...options,work})).rejects.toThrow('checkpoint diverso dai registri')}
   finally{work.archive.value=originalValue}
   expect(stages).toHaveLength(beforeResume)
  }
  const guide=await generateDeepGuide({...options,work})
  assertGuideIntegrity(guide);expect(guide.sources.some(s=>s.id==='card:late')).toBe(true);expect(guideHash(fixture.packet)).toBe(initial)
  expect(criticSources.length).toBeGreaterThan(0);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16)
  if(mode==='final-resume')expect(stages.filter(stage=>stage==='prose')).toHaveLength(1)
  const pinned=work.archive.value<any>('guide-segment-native-scope-v1','native')!
  expect(pinned.anchor.basis.dependencyHash).toBe(fixture.packet.basis.dependencyHash);expect(pinned.anchor.sources.some((s:any)=>s.id==='card:late')).toBe(false)
  const approval=work.archive.value<any>('guide-segment-final-approval-v1','validated')!
  expect(approval.evidencePacket.sources.some((s:any)=>s.id==='card:late')).toBe(true)
  expect(approval.reviewKeys.length).toBeGreaterThanOrEqual(3)
  assertGuideSegmentApproval(guide,work.archive)
  if(mode==='single'){
   const archive=work.archive
   const hidden={id:archive.id,projectId:archive.projectId,value:<T>(role:string,key:string)=>role==='guide-segment-final-approval-v1'?undefined:archive.value<T>(role,key),values:archive.values.bind(archive),saveValue:archive.saveValue.bind(archive)}
   expect(()=>assertGuideSegmentApproval(guide,hidden)).toThrow('senza attestazione')
   const changed=structuredClone(guide);changed.chapters[0].body+=' Unreviewed addition.'
   expect(()=>assertGuideSegmentApproval(changed,archive)).toThrow('senza attestazione')
   const later=structuredClone(approval.evidencePacket)
   later.sources.push(guideSource('card:unreviewed','card','Unreviewed supplemental card',null,'Synthetic new source'));later.basis.dependencyHash=packetHash(later)
   expect(()=>assertGuideFinalReviewEvidence(approval.reviewKeys,{scope:approval.scope,packet:approval.nativePacket,evidenceAnchor:approval.evidenceAnchor,evidencePacket:later,archive})).toThrow('non aggiornato')
  }
  if(mode==='repair-resume'){expect(guide.sources.some(s=>s.id==='card:second')).toBe(true);expect(guide.limitations).toContain('Synthetic supplemental uncertainty must remain explicit.');expect([...work.archive.values('guide-segment-evidence-extension-v1')]).toHaveLength(2)}
  const calls=stages.length;work.close();work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
  expect(await generateDeepGuide({...options,work,runner:async()=>{throw Error('Completed recovery must not invoke AI')}})).toEqual(guide);expect(stages).toHaveLength(calls)
 }finally{work.close();jobs.close();projects.close()}
},60000)
