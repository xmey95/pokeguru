import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {guideHash} from '../src/main/matchup-guide-packet'
import {constructFiniteGuideContent} from '../src/main/guide-finite-generation'
import {finiteFinalReviewUnits,enableFinalTextPartitions,finalTextPartitionVersion} from '../src/main/guide-final-text-partitions'
import {finiteReviewRequest,type GuideFiniteReview} from '../src/main/guide-finite-review'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
it('assigns a case repair on prose to its visible chapter and global review while retaining native findings in every full-case unit',async()=>{
 const f=deliveryApplicationFixture();try{
  authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-history','2026-11-08T00:00:00.000Z')
  const result=await constructFiniteGuideContent(f.setups,f.options),draft=structuredClone(result.draft)
  for(const chapter of draft.chapters)chapter.body='Conditional source-grounded advice. '.repeat(85)
  enableFinalTextPartitions(f.options);expect(finalTextPartitionVersion(f.options)).toBe(2)
  const caseId=draft.scenarios[0].id,targetId=draft.chapters[0].id,base={severity:'major' as const,message:'Synthetic unresolved requirement.',correction:'Recheck the exact condition.',sourceIds:['card:p'],repair:{kind:'case' as const,caseId},proposedActions:[],counterlines:[]}
  const previous:GuideFiniteReview[]=[{contextHash:'original-opinion',verdict:'revise',checks:['Synthetic'],resolutions:[],findings:[{...base,targetId},{...base,targetId:caseId}]}]
  const units=finiteFinalReviewUnits(draft,f.options),assigned=units.filter(u=>u.proofCaseIds.includes(caseId)&&u.partition!.textIds.includes(targetId))
  expect(assigned).toHaveLength(1);expect(units.filter(u=>u.proofCaseIds.includes(caseId)).length).toBeGreaterThan(1)
  for(const unit of units){
   const request=finiteReviewRequest(draft,result.natives,result.plans,previous,f.options,true,unit.proofCaseIds,unit.partition),data:any=request.data
   expect(request.cacheValidation!.id).toBe('guide-finite-review-6')
   const prose=data.previousFindings.filter((r:any)=>r.finding.targetId===targetId),native=data.previousFindings.filter((r:any)=>r.finding.targetId===caseId)
   expect(prose.length).toBe(unit.id==='global-text'||assigned[0].id===unit.id?1:0)
   expect(native.length).toBe(unit.proofCaseIds.includes(caseId)?1:0)
   if(prose.length)expect(()=>request.read({contextHash:data.contextHash,verdict:'pass',findings:[],checks:['Synthetic'],resolutions:[]})).toThrow()
  }
 }finally{f.close()}
},120000)
it('does not retrofit a paid version1 policy, partition shape or history identity',()=>{
 const f=deliveryApplicationFixture();try{
  authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-history','2026-11-08T00:00:00.000Z')
  const original={version:1,scopeHash:guideHash(f.options.scope),characters:6000}
  f.archive.saveValue('guide-finite-final-text-partition-v1','policy',original);enableFinalTextPartitions(f.options)
  expect(finalTextPartitionVersion(f.options)).toBe(1);expect(f.archive.value('guide-finite-final-text-partition-v1','policy')).toEqual(original)
  const units=finiteFinalReviewUnits({chapters:[{id:'chapter'}],exercises:[],scenarios:[{id:'a'},{id:'b'}]} as any,f.options)
  expect(units.every(u=>u.partition&&!('historyScope' in u.partition))).toBe(true)
 }finally{f.close()}
})
