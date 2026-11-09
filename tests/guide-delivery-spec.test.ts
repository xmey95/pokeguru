import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {guideCampaignAllowance,assertGuideCampaignDispatch} from '../src/main/guide-campaign-budget'
import {deliveryManifest,DeliveryMachine,driveDelivery,hashDelivery,deliveryCapacityCheck,type DeliveryEvent} from '../scripts/guide-delivery-spec'

const binding={projectId:'synthetic-project',lineageId:'synthetic-lineage',ourListHash:'exact-our-60',opponentListHash:'exact-opponent-60',evidenceHash:'frozen-sources',configHash:'frozen-config'}
const make=()=>deliveryManifest(binding,{replies:2,setupTurns:0,auditGroups:1})
const accept=async()=>({kind:'accepted'} as const)
const run=(m:DeliveryMachine,read:Parameters<typeof driveDelivery>[1]['read']=accept,persist:Parameters<typeof driveDelivery>[1]['persist']=()=>{})=>driveDelivery(m,{read,persist,deadlineMs:500})

it('admits capacity without approving tactics and rejects oversized originals without dropping any field',()=>{
 const unit={events:Array.from({length:6},()=>({moves:Array(12).fill(null),energyRoutes:Array(8).fill(null)})),auditTargets:Array.from({length:17},()=>({text:'x'.repeat(600),spans:Array(8).fill(null)}))}
 expect(deliveryCapacityCheck(unit).admitted).toBe(true);const before=structuredClone(unit);unit.events.push({moves:Array(13).fill(null),energyRoutes:Array(9).fill(null)});unit.auditTargets.push({text:'x'.repeat(601),spans:Array(9).fill(null)})
 expect(deliveryCapacityCheck(unit)).toEqual({admitted:false,failures:['events','events/6/moves','events/6/energyRoutes','auditTargets','auditTargets/17/text','auditTargets/17/spans']});expect(unit.events.slice(0,6)).toEqual(before.events)
})
it('changes evidence identities and project scope without changing the bounded topology for other decks',()=>{
 const m=make(),changed=deliveryManifest({...binding,projectId:'unrelated-project',ourListHash:'unrelated-60-a',opponentListHash:'unrelated-60-b',evidenceHash:'other-card-rules'},m.shape)
 expect(changed.units).toEqual(m.units);expect(changed.maximumCalls).toBe(m.maximumCalls);expect(hashDelivery(changed)).not.toBe(hashDelivery(m))
})
it('admits only the residual authority from the real campaign accountant and preserves future reserves',()=>{
 const counts=[{id:'first',calls:355},{id:'second',calls:0},{id:'third',calls:0}],ceilings={perGuide:500,pool:1500,reserveEachLater:24},allowance=guideCampaignAllowance(counts,'first',ceilings)
 expect(allowance).toMatchObject({remaining:145,total:355,consumedByGuide:355,reservedForLater:48})
 const two=deliveryManifest(binding,{replies:2,setupTurns:5,auditGroups:4}),four=deliveryManifest(binding,{replies:4,setupTurns:5,auditGroups:4})
 expect(new DeliveryMachine(two,allowance.remaining).status).toBe('budget');expect(new DeliveryMachine(four,allowance.remaining).status).toBe('budget')
 const constrained=guideCampaignAllowance(counts,'first',{...ceilings,pool:400});expect(constrained.remaining).toBe(0);expect(new DeliveryMachine(make(),constrained.remaining).calls).toBe(0)
 expect(()=>assertGuideCampaignDispatch([{id:'first',calls:356},counts[1],counts[2]],'first',{...ceilings,pool:400})).toThrow('riserva');expect(counts[0].calls).toBe(355)
})

it('completes every admitted shape, including validation/save/reopen, within its computed bound',async()=>{
 let shapes=0
 for(const replies of [2,3,4] as const)for(let setupTurns=0;setupTurns<=5;setupTurns++)for(const auditGroups of [1,2,3,4] as const){
  const manifest=deliveryManifest(binding,{replies,setupTurns,auditGroups}),machine=new DeliveryMachine(manifest,500);let fuel=machine.fuel
  const status=await run(machine,accept,event=>{if(event.event.type==='start')expect(machine.fuel).toBe(--fuel);else expect(machine.fuel).toBe(fuel)})
  expect(status).toBe('complete');expect(machine.acceptedIds).toHaveLength(manifest.units.length);expect(machine.acceptedIds.at(-1)).toBe('host/reopen');expect(machine.calls).toBe(manifest.maximumCalls-16);expect(machine.history.length).toBe(2*(machine.calls+3));shapes++
 }
 expect(shapes).toBe(72)
 expect(deliveryManifest(binding,{replies:2,setupTurns:5,auditGroups:4}).maximumCalls).toBe(164)
 expect(deliveryManifest(binding,{replies:4,setupTurns:5,auditGroups:4}).maximumCalls).toBe(212)
},30000)

it('completes 36 asymmetric shapes without forcing filler replies or identical historical turns',async()=>{
 let count=0
 for(const r1 of [2,3,4] as const)for(const r2 of [2,3,4] as const)for(const s1 of [0,5])for(const s2 of [0,5]){
  const manifest=deliveryManifest(binding,{replies:[r1,r2],setupTurns:[s1,s2],auditGroups:[1,4]}),m=new DeliveryMachine(manifest,500)
  expect(await run(m)).toBe('complete');expect(manifest.maximumCalls).toBe(28+3*(s1+1+2*r1)+6*(s2+1+2*r2)+16)
  expect(manifest.units.some(u=>u.id==='case-1/reply-'+r1)).toBe(false);expect(manifest.units.some(u=>u.id==='case-2/reply-'+r2)).toBe(false);count++
 }
 expect(count).toBe(36)
},30000)

it('uses one shared repair pool even when each changed input requests a fresh retry',async()=>{
 const manifest=make(),m=new DeliveryMachine(manifest,500),seen=new Set<string>(),inputs=new Set<string>()
 const status=await run(m,async(u,hash)=>{expect(inputs.has(hash)).toBe(false);inputs.add(hash);if(u.role!=='host'&&!seen.has(u.id)){seen.add(u.id);return {kind:'invalid-format'}}return {kind:'accepted'}})
 expect(status).toBe('budget');expect(m.extraCalls).toBe(16);expect(m.calls).toBeLessThanOrEqual(manifest.maximumCalls);expect(m.acceptedIds).not.toContain('host/save')
})
it('repairs only the affected chapter, invalidates both final opinions and finishes without rewriting other chapters',async()=>{
 const m=new DeliveryMachine(make(),500),counts=new Map<string,number>();let revised=false
 expect(await run(m,async u=>{counts.set(u.id,(counts.get(u.id)??0)+1);if(u.id==='final-review-1'&&!revised){revised=true;return {kind:'revise',target:'chapter-0'}}return {kind:'accepted'}})).toBe('complete')
 expect(counts.get('chapter-0')).toBe(2);expect(counts.get('chapter-1')).toBe(1);expect(counts.get('case-1/setup-header')).toBe(1);expect(m.extraCalls).toBe(2)
})
it('stops after the second content negative on the same logical critic, despite changed request hashes',async()=>{
 const m=new DeliveryMachine(make(),500)
 expect(await run(m,async u=>u.id==='final-review-1'?{kind:'revise',target:'chapter-0'}:{kind:'accepted'})).toBe('content-limit');expect(m.acceptedIds).not.toContain('host/save')
 const reopened=new DeliveryMachine(make(),500,m.history,m.anchor);expect(reopened.next()).toBeNull();expect(reopened.status).toBe('content-limit')
})
it('cannot pay for a broad invalidation from the reserved final reviews and stops before another dispatch',async()=>{
 const m=new DeliveryMachine(make(),500);let negatives=0
 expect(await run(m,async u=>{if(u.id==='final-review-1'){negatives++;return {kind:'revise',target:'case-1/setup-header'}}return {kind:'accepted'}})).toBe('budget')
 expect(negatives).toBe(1);expect(m.calls).toBeLessThan(make().maximumCalls);expect(m.acceptedIds).not.toContain('host/save')
})
it.each(['fatal','oversize','unsupported'] as const)('terminates on %s and retains the consumed invocation',async kind=>{
 const m=new DeliveryMachine(make(),500);expect(await run(m,async()=>({kind}))).toBe(kind);expect(m.calls).toBe(1)
 const copy=new DeliveryMachine(make(),500,m.history,m.anchor);expect(await run(copy,()=>{throw Error('Must not dispatch')})).toBe(kind);expect(copy.calls).toBe(1)
})
it('bounds malformed responses and refuses publication with missing independent opinions',async()=>{
 const m=new DeliveryMachine(make(),500);expect(()=>m.start('host/save','foreign')).toThrow('Dispatch');expect(await run(m,async()=>({kind:'invalid-format'}))).toBe('format-limit');expect(m.calls).toBe(2)
})
it('routes malformed critic repair targets through the same bounded format retry without a fabricated pass',async()=>{
 const m=new DeliveryMachine(make(),500)
 expect(await run(m,async u=>u.id==='outline-review'?{kind:'revise',target:'not-an-ancestor'}:{kind:'accepted'})).toBe('format-limit')
 expect(m.calls).toBe(3);expect(m.acceptedIds).toEqual(['outline']);expect(m.history.filter(r=>r.event.type==='end'&&r.event.outcome.kind==='invalid-format')).toHaveLength(2)
})
it('finishes a never-settling operation with a deadline and never retries it on reopen',async()=>{
 const m=new DeliveryMachine(make(),500);let aborted=false
 const status=await driveDelivery(m,{deadlineMs:5,persist:()=>{},read:async(_u,_h,signal)=>{signal.addEventListener('abort',()=>{aborted=true});return new Promise(()=>{})}})
 expect(status).toBe('timeout');expect(aborted).toBe(true);expect(m.calls).toBe(1);const copy=new DeliveryMachine(make(),500,m.history,m.anchor);expect(copy.next()).toBeNull();expect(copy.status).toBe('timeout')
})
it('quarantines a started invocation with no durable result and preserves all counters',()=>{
 const m=new DeliveryMachine(make(),500);m.start('outline','exact-input');const copy=new DeliveryMachine(make(),500,m.history,m.anchor);expect(copy.status).toBe('quarantined');expect(copy.next()).toBeNull();expect(copy.calls).toBe(1);expect(()=>copy.settle('outline','exact-input',{kind:'accepted'})).toThrow('terminale')
})
it('retains the global repair pool when reopening after every settled invocation',()=>{
 const manifest=make();let m=new DeliveryMachine(manifest,500),steps=0
 while(m.next()){
  const unit=m.next()!,seen=m.history.filter(r=>r.event.type==='start'&&r.event.unitId===unit.id).length,input='input-'+steps
  m.start(unit.id,input);m.settle(unit.id,input,{kind:seen?'accepted':'invalid-format'});steps++
  m=new DeliveryMachine(manifest,500,m.history,m.anchor);expect(steps).toBeLessThanOrEqual(manifest.maximumCalls+3)
 }
 expect(m.status).toBe('budget');expect(m.extraCalls).toBe(16)
})
it.each(['host/validate','host/save','host/reopen'])('does not complete if the mandatory %s gate fails',async id=>{
 const m=new DeliveryMachine(make(),500);expect(await run(m,async u=>{if(u.id===id)throw Error('Synthetic gate failure');return {kind:'accepted'}})).toBe('fatal');expect(m.acceptedIds).not.toContain(id)
})
it('checks scope, frozen limits, exact event anchors, correspondence and repair ancestry',()=>{
 const manifest=make(),m=new DeliveryMachine(manifest,500);expect(()=>{m.manifest.maximumCalls=999}).toThrow();m.start('outline','input');expect(()=>m.settle('outline','other',{kind:'accepted'})).toThrow('corrispondente');expect(()=>m.settle('outline','input',{kind:'revise',target:'chapter-0'})).toThrow('antenata');m.settle('outline','input',{kind:'accepted'})
 const changed=deliveryManifest({...binding,ourListHash:'another-deck'},manifest.shape);expect(()=>new DeliveryMachine(changed,500,m.history,m.anchor)).toThrow('estraneo');expect(()=>new DeliveryMachine(manifest,500,m.history.slice(1),m.anchor)).toThrow('incompleto');const forged=m.history;forged[1].event={type:'end',unitId:'outline',inputHash:'wrong',outcome:{kind:'accepted'}};expect(()=>new DeliveryMachine(manifest,500,forged,{count:forged.length,tailHash:hashDelivery(forged.at(-1))})).toThrow('corrispondente')
 const enlarged=structuredClone(manifest);enlarged.repairCredits++;expect(()=>new DeliveryMachine(enlarged,500)).toThrow('modificato');expect(new DeliveryMachine(manifest,manifest.maximumCalls-1).next()).toBeNull()
})
it('persists and reopens the event lineage through the real archive, including saved/read-back stages',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'guide-delivery-spec-')),file=join(folder,'db.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Synthetic spec only',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-delivery-spec');let archive=new AiEvidenceArchive(file,job)
 try{
  const manifest=deliveryManifest({...binding,projectId:project.id,lineageId:job.id},{replies:2,setupTurns:0,auditGroups:1}),m=new DeliveryMachine(manifest,500)
  expect(await run(m,async u=>{if(u.id==='host/save')archive.saveValue('spec-only-artifact','synthetic',{ourListHash:binding.ourListHash,notAnAiGuide:true});if(u.id==='host/reopen'){archive.close();archive=new AiEvidenceArchive(file,job);expect(archive.value('spec-only-artifact','synthetic')).toEqual({ourListHash:binding.ourListHash,notAnAiGuide:true})}return {kind:'accepted'}},event=>archive.saveValue('delivery-spec-events',String(event.sequence).padStart(4,'0'),event))).toBe('complete')
  const log=[...archive.values<DeliveryEvent>('delivery-spec-events')].map(r=>r.value),reopened=new DeliveryMachine(manifest,500,log,m.anchor);expect(await run(reopened,()=>{throw Error('Must not repurchase')})).toBe('complete');expect(reopened.calls).toBe(m.calls);expect(()=>new DeliveryMachine(manifest,500,log.slice(0,-1),m.anchor)).toThrow('incompleto')
 }finally{archive.close();jobs.close();projects.close();const target=resolve(folder);if(!target.startsWith(resolve(tmpdir())+sep))throw Error('Unsafe test cleanup');rmSync(target,{recursive:true,force:true})}
},30000)

it('terminates adversarial mixed outcomes for every seed without exceeding the immutable fuel',async()=>{
 for(let seed=1;seed<=80;seed++){
  const m=new DeliveryMachine(make(),500);let n=seed,previousFuel=m.fuel
  const result=await run(m,async u=>{n=(Math.imul(n,1664525)+1013904223)>>>0;if(u.role==='host')return {kind:'accepted'};const v=n%12;if(v===0)return {kind:'fatal'};if(v<4)return {kind:'invalid-format'};if(v===4&&u.role==='critic')return {kind:'revise',target:'outline'};return {kind:'accepted'}},event=>{if(event.event.type==='start')expect(m.fuel).toBeLessThan(previousFuel);previousFuel=m.fuel})
  expect(result).not.toBe('running');expect(m.calls).toBeLessThanOrEqual(m.manifest.maximumCalls);expect(m.history.length).toBeLessThanOrEqual(2*(m.manifest.maximumCalls+3))
 }
},30000)
