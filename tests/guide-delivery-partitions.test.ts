import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {freezeDeliveryPartitions,readDeliveryPartitions,refineDeliveryPartitions} from '../src/main/guide-delivery-partitions'
import {guideHash} from '../src/main/matchup-guide-packet'
import {guideSegmentUnitIdentity} from '../src/main/guide-segment-batch'
import {guideTransportSnapshot} from '../src/main/guide-transport-evidence'
const targets=Array.from({length:4},(_,i)=>({id:'target-'+i,text:'Complete unchanged target '+i,parts:[{text:'Complete unchanged target '+i}],maximum:600,allowedWindows:['window'],anchorHash:'physical-anchor'}))
function fixture(){const f=deliveryApplicationFixture(),o=f.options,fullHash='original-full-context',groups=[targets.map(t=>t.id)];freezeDeliveryPartitions(fullHash,targets,groups,o)
 const fail=(index:number,ids:string[],code='output-limit')=>{const request:any={stage:'review-language',role:'critic',instructions:'Frozen independent review',task:'All assigned targets',data:{scope:o.scope,targets:ids.map((id,i)=>({...targets.find(t=>t.id===id),key:'t'+i,spans:[],contextHash:'original'}))},schema:{},unitKey:'frozen-unit-'+index,retryOrdinal:0,cacheValidation:{id:'guide-finite-audit-language-4'}};const {unitId}=guideSegmentUnitIdentity(request),key=String(index).padStart(3,'0'),inputHash=guideHash({index});o.archive.saveValue('guide-finite-request-v1',unitId,{version:1,unitId,scopeHash:guideHash(o.scope),request:guideTransportSnapshot(request)});o.archive.saveValue('guide-attempt-start',key,{inputHash});o.archive.saveValue('guide-attempt-end',key,{status:'failed'});o.archive.saveValue('guide-attempt-failure',key,{code});o.archive.saveValue('guide-call-data',inputHash,{data:{units:[{unitId,data:request.data}]}});return unitId}
 return {...f,o,fullHash,groups,fail}
}
it('replays exact whole-target refinement only after an authenticated failed invocation, without resetting prior groups',()=>{const f=fixture();try{
 const id=f.fail(1,f.groups[0]),split=refineDeliveryPartitions(f.fullHash,targets,f.groups,0,id,f.o);expect(split).toEqual([['target-0','target-1'],['target-2','target-3']]);expect(readDeliveryPartitions(f.fullHash,targets,f.o)).toEqual(split)
 const next=f.fail(2,split[1]),twice=refineDeliveryPartitions(f.fullHash,targets,split,1,next,f.o);expect(twice[0]).toEqual(split[0]);expect(twice.flat()).toEqual(targets.map(t=>t.id));expect(()=>freezeDeliveryPartitions(f.fullHash,targets,[['target-0']],f.o)).toThrow('immutabile')
 const changed=structuredClone(targets);changed[0].text='Truncated';expect(()=>readDeliveryPartitions(f.fullHash,changed,f.o)).toThrow('alterata')
}finally{f.close()}})
it('cannot invent an output failure, split a single atom, or exceed the four frozen groups',()=>{const f=fixture();try{
 expect(()=>refineDeliveryPartitions(f.fullHash,targets,f.groups,0,'no-invocation',f.o)).toThrow('ricevuta durevole')
 expect(()=>refineDeliveryPartitions(f.fullHash,targets,[['target-0']],0,'no-invocation',f.o)).toThrow('atomo')
 expect(()=>refineDeliveryPartitions(f.fullHash,targets,[['target-0'],['target-1'],['target-2'],['target-3']],0,'no-invocation',f.o)).toThrow('atomo')
 const id=f.fail(1,f.groups[0],'timeout');expect(()=>refineDeliveryPartitions(f.fullHash,targets,f.groups,0,id,f.o)).toThrow('ricevuta durevole')
}finally{f.close()}})
it('rejects a fabricated descriptor even when target identifiers and the failure code match',()=>{const f=fixture();try{
 const id=f.fail(1,f.groups[0]);refineDeliveryPartitions(f.fullHash,targets,f.groups,0,id,f.o)
 const archive=new Proxy(f.archive,{get(t,k){if(k==='value')return (role:string,key:string)=>{const v=t.value<any>(role,key);if(role==='guide-finite-request-v1')v.request.data.targets[0].text='Different text';return v};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
 expect(()=>readDeliveryPartitions(f.fullHash,targets,{...f.o,archive})).toThrow('autentico')
}finally{f.close()}})
