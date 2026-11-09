import {it,expect} from 'vitest'
import {deliveryOutlineReviewSchema,readDeliveryOutlineReview,deliveryOutlineReviewRequest,reviewDeliveryOutline} from '../src/main/guide-delivery-outline'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {guideHash} from '../src/main/matchup-guide-packet'
import {compactGuideSchema,shortGuideSchemaRefs} from '../src/main/guide-schema-encoding'
import {prepareGuideSegmentBatch} from '../src/main/guide-segment-batch'
import {deliveryUnit,initializeGuideDelivery,registerDeliveryUnit,beginGuideDelivery,readGuideDelivery} from '../src/main/guide-delivery-policy'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import rejected from './fixtures/guide-outline-v1-rejections.json'
const plan={thesis:'Conditional plan for unrelated exact lists',initialOpenings:['on-play','on-draw']},value=(verdict:string,findings:string[])=>({planHash:guideHash(plan),verdict,findings})
function expand(schema:any){const visit=(v:any):any=>Array.isArray(v)?v.map(visit):!v||typeof v!=='object'?v:v.$ref?visit(schema.$defs[v.$ref.split('/').at(-1)]):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='$defs').map(([k,v])=>[k,visit(v)]));return visit(schema)}
it.each([['pass',[]],['revise',['The required resource is not justified.']],['incomplete',['The missing rule prevents a judgment.']]] as const)('accepts coherent %s in both transport and reader without rewriting it',(verdict,findings)=>{
 const raw=value(verdict,[...findings]),before=structuredClone(raw);expect(()=>assertNativeScenarioSchema(raw,deliveryOutlineReviewSchema(plan))).not.toThrow();expect(readDeliveryOutlineReview(raw,plan)).toEqual(before);expect(raw).toEqual(before)
})
it.each([['pass',['A positive confirmation.']],['revise',[]],['incomplete',[]],['revise',['   ']],['incomplete',['']]] as const)('rejects incoherent %s/%j equally in schema and reader',(verdict,findings)=>{
 const raw=value(verdict,[...findings]);expect(()=>assertNativeScenarioSchema(raw,deliveryOutlineReviewSchema(plan))).toThrow();expect(()=>readDeliveryOutlineReview(raw,plan)).toThrow()
})
it.each(rejected.raw)('keeps each real v1 rejection invalid; never removes its positive findings',raw=>{
 const before=guideHash(raw);expect(guideHash(rejected.plan)).toBe(raw.planHash);expect(()=>assertNativeScenarioSchema(raw,deliveryOutlineReviewSchema(rejected.plan))).toThrow();expect(()=>readDeliveryOutlineReview(raw,rejected.plan)).toThrow('verdict="pass" richiede findings=[]');expect(guideHash(raw)).toBe(before)
})
it('binds the exact plan and preserves required fields, lengths and rejection of unknown fields',()=>{
 for(const raw of [{...value('pass',[]),planHash:'foreign'},{verdict:'pass',findings:[]},{...value('pass',[]),checks:['Unrequested assertion']},value('revise',Array(9).fill('Issue')),value('revise',['x'.repeat(1201)])]){expect(()=>assertNativeScenarioSchema(raw,deliveryOutlineReviewSchema(plan))).toThrow();expect(()=>readDeliveryOutlineReview(raw,plan)).toThrow()}
})
it('returns actionable feedback for both contradictory combinations',()=>{
 expect(()=>readDeliveryOutlineReview(value('pass',['Positive confirmation.']),plan)).toThrow('non inserire conferme positive')
 expect(()=>readDeliveryOutlineReview(value('revise',[]),plan)).toThrow('almeno un problema concreto')
})
it('preserves the same rules in the complete batch after production schema sharing',()=>{const f=deliveryApplicationFixture();try{
 const request=deliveryOutlineReviewRequest(plan,f.options),batch=prepareGuideSegmentBatch([request],{stage:'review-delivery-outline',reserveCalls:0}).request,encoded=shortGuideSchemaRefs(compactGuideSchema(batch.schema)),original=expand(encoded);expect(original).toEqual(batch.schema)
 const unitId=(batch.data as any).units[0].unitId
 for(const raw of [value('pass',[]),value('revise',['Unresolved condition.'])])expect(()=>assertNativeScenarioSchema({units:[{unitId,response:raw}]},original)).not.toThrow()
 for(const raw of [value('pass',['Positive confirmation.']),value('incomplete',[])])expect(()=>assertNativeScenarioSchema({units:[{unitId,response:raw}]},original)).toThrow()
 expect(request.cacheValidation.id).toBe('guide-delivery-outline-review-2');expect(request.instructions).toContain('mai conferme');expect(request.task).toContain('pass con findings vuoto')
}finally{f.close()}})
it('maps versions to one location and cannot reset two historic format failures by changing the protocol',()=>{const f=deliveryApplicationFixture();try{
 initializeGuideDelivery(f.options.packet,{provider:'codex',source:'global',model:null,reasoningEffort:null},f.archive)
 const req=(version:number)=>({stage:'review-delivery-outline',data:{plan},cacheValidation:{id:'guide-delivery-outline-review-'+version}})
 expect(deliveryUnit(req(1),'old').key).toBe(deliveryUnit(req(2),'new').key)
 for(let i=1;i<=2;i++){const id='old-'+i;registerDeliveryUnit(f.archive,req(1),id);const a:any={sequence:i,stage:'review-delivery-outline',inputHash:guideHash(id),status:'running'};beginGuideDelivery(f.archive,a,{units:[{unitId:id}]});f.archive.saveValue('guide-attempt-end',String(i).padStart(3,'0'),{...a,status:'succeeded'});const outcome={unitId:id,batchHash:guideHash([id]),accepted:false,message:'Original contradiction'};f.archive.saveValue('guide-segment-unit-result-v1',guideHash(outcome),outcome)}
 registerDeliveryUnit(f.archive,req(2),'new');expect(()=>beginGuideDelivery(f.archive,{sequence:3,stage:'review-delivery-outline',inputHash:'new',status:'running'} as any,{units:[{unitId:'new'}]})).toThrow('Due risposte non valide');expect(readGuideDelivery(f.archive).rows).toHaveLength(2);expect(readGuideDelivery(f.archive).repairs).toBe(1)
}finally{f.close()}})
