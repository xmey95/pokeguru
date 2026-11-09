import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {initializeGuideDelivery,registerDeliveryUnit,beginGuideDelivery,readGuideDelivery,deliveryUnit} from '../src/main/guide-delivery-policy'
import {guideHash} from '../src/main/matchup-guide-packet'
import type {GuideAttempt} from '../src/shared/matchup-guide'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
it('keeps the same historical turn location when the declaration can explicitly request replanning',()=>{
 const request=(version:number)=>({stage:'historical-turn',data:{caseId:'case',slotId:'round-1-opponent'},cacheValidation:{id:'guide-finite-setup-turn-'+version}})
 expect(deliveryUnit(request(1),'old')).toEqual({unitId:'old',key:'case/setup/round-1-opponent',repair:false})
 expect(deliveryUnit(request(2),'new')).toEqual({unitId:'new',key:'case/setup/round-1-opponent',repair:false})
 expect(deliveryUnit(request(3),'coherent')).toEqual({unitId:'coherent',key:'case/setup/round-1-opponent',repair:false})
 for(const version of [1,2])expect(deliveryUnit({stage:'historical-frame',data:{caseId:'case'},cacheValidation:{id:'guide-finite-setup-frame-'+version}},'frame').key).toBe('case/setup-header')
})
it('keeps the same audit slot and its two format failures across transport versions 3 and 4',()=>{
 const f=deliveryApplicationFixture(),a=f.archive;initializeGuideDelivery(f.options.packet,config,a)
 try{
  const request=(version:number)=>({stage:'audit',data:{caseId:'case',deliveryLineId:'setup',turnKey:'setup|2|ours'},cacheValidation:{id:'guide-finite-audit-'+version}})
  expect(deliveryUnit(request(3),'a').key).toBe(deliveryUnit(request(4),'b').key)
  const part={...request(4),cacheValidation:{id:'guide-finite-audit-part-1'}}
  expect(deliveryUnit(part,'part').key).toBe(deliveryUnit(request(4),'b').key)
  for(let i=0;i<2;i++){const id='format-'+i;registerDeliveryUnit(a,request(3+i),id);const attempt={sequence:i+1,stage:'segments-finite-audits',inputHash:guideHash(id)} as GuideAttempt;beginGuideDelivery(a,attempt,{units:[{unitId:id}]});a.saveValue('guide-attempt-end',String(i+1).padStart(3,'0'),{...attempt,status:'succeeded'});a.saveValue('guide-attempt-failure',String(i+1).padStart(3,'0'),{code:'invalid-response'})}
  registerDeliveryUnit(a,part,'new-input');expect(()=>beginGuideDelivery(a,{sequence:3,stage:'segments-finite-audits',inputHash:'new'} as GuideAttempt,{units:[{unitId:'new-input'}]})).toThrow('Due risposte non valide');expect([...a.values('guide-attempt-start')]).toHaveLength(2)
 }finally{f.close()}
})
function fixture(){const f=deliveryApplicationFixture(),a=f.archive;initializeGuideDelivery(f.options.packet,config,a)
 const invoke=(id:string,end=true)=>{registerDeliveryUnit(a,{stage:'same-host-location',data:{caseId:'unrelated-case'},cacheValidation:{id:'guide-finite-metadata-1'}},id);const sequence=readGuideDelivery(a).rows.length+1,key=String(sequence).padStart(3,'0'),attempt={sequence,stage:'metadata',inputHash:guideHash(id),status:'running',startedAt:'2026-11-06T00:00:00.000Z',endedAt:null,durationMs:0} as GuideAttempt;beginGuideDelivery(a,attempt,{units:[{unitId:id}]});if(end)a.saveValue('guide-attempt-end',key,{...attempt,status:'succeeded'});return key}
 return {...f,invoke}
}
it('persists a single 16-credit reserve across changed inputs and reopen, without renewing base work',()=>{const f=fixture();try{
 for(let i=0;i<17;i++)f.invoke('different-input-'+i)
 expect(readGuideDelivery(f.archive)).toMatchObject({repairs:16});expect(readGuideDelivery(f.archive).baseSeen.size).toBe(1)
 initializeGuideDelivery(f.options.packet,config,f.archive)
 expect(()=>f.invoke('another-input')).toThrow('Riserva condivisa');expect([...f.archive.values('guide-attempt-start')]).toHaveLength(17)
 expect(()=>initializeGuideDelivery({...f.options.packet,basis:{...f.options.packet.basis,dependencyHash:'changed'}},config,f.archive)).toThrow('congelata')
 expect(()=>initializeGuideDelivery(f.options.packet,{...config,model:'other'},f.archive)).toThrow('congelata')
}finally{f.close()}})
it('quarantines an invocation without a final receipt instead of repurchasing it',()=>{const f=fixture();try{f.invoke('first',false);expect(()=>f.invoke('second')).toThrow('quarantena');expect([...f.archive.values('guide-attempt-start')]).toHaveLength(1)}finally{f.close()}})
it('charges position-only repairs to the existing reserve from the first dispatch, across changed native inputs',()=>{const f=fixture();try{
 for(let i=0;i<16;i++){
  const id='position-input-'+i,request={stage:'segment-position-repair-case',data:{caseId:'case',native:{id:'case'},sourceHash:'different-'+i},cacheValidation:{id:'guide-finite-position-repair-1'}}
  expect(deliveryUnit(request,id).repair).toBe(true);registerDeliveryUnit(f.archive,request,id)
  const attempt={sequence:i+1,stage:'segments-finite-position-repair',inputHash:guideHash(id),status:'running',startedAt:'2026-11-06T00:00:00.000Z',endedAt:null,durationMs:0} as GuideAttempt
  beginGuideDelivery(f.archive,attempt,{units:[{unitId:id}]});f.archive.saveValue('guide-attempt-end',String(i+1).padStart(3,'0'),{...attempt,status:'succeeded'})
 }
 expect(readGuideDelivery(f.archive).repairs).toBe(16);expect(readGuideDelivery(f.archive).baseSeen.size).toBe(0)
 const id='one-more';registerDeliveryUnit(f.archive,{stage:'segment-position-repair-case',data:{caseId:'case'},cacheValidation:{id:'guide-finite-position-repair-1'}},id)
 expect(()=>beginGuideDelivery(f.archive,{sequence:17,stage:'segments-finite-position-repair',inputHash:guideHash(id)} as GuideAttempt,{units:[{unitId:id}]})).toThrow('Riserva condivisa')
}finally{f.close()}})
it.each(['invalid-format','negative'] as const)('stops after two %s results at the same logical location even when input identities change',kind=>{const f=fixture();try{
 for(let i=0;i<2;i++){const id='input-'+i,key=f.invoke(id);if(kind==='invalid-format')f.archive.saveValue('guide-attempt-failure',key,{code:'invalid-response'});else{const outcome={unitId:id,batchHash:guideHash([id]),accepted:true,value:{verdict:'revise'}};f.archive.saveValue('guide-segment-unit-result-v1',guideHash(outcome),outcome)}}
 expect(()=>f.invoke('changed-again')).toThrow(kind==='negative'?'Secondo giudizio negativo':'Due risposte non valide');expect([...f.archive.values('guide-attempt-start')]).toHaveLength(2)
}finally{f.close()}})
it('rejects missing or changed dispatches and unknown request families before dispatch',()=>{const f=fixture();try{
 f.invoke('first');const a=f.archive,missing=new Proxy(a,{get(t,k){if(k==='values')return function*(role:string){if(role!=='guide-delivery-dispatch-v1')yield* t.values(role)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
 expect(()=>readGuideDelivery(missing)).toThrow('senza ricevuta')
 expect(()=>deliveryUnit({stage:'unknown',data:{},cacheValidation:{id:'unregistered'}},'unit')).toThrow('non ammessa')
 const changed=new Proxy(a,{get(t,k){if(k==='value')return (role:string,key:string)=>{const v=t.value<any>(role,key);return role==='guide-delivery-unit-v1'?{...v,key:'another-slot'}:v};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
 expect(()=>readGuideDelivery(changed)).toThrow('descrittore')
}finally{f.close()}})
