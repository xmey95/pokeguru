import {it,expect} from 'vitest'
import {mergeGuideMetadataNeeds} from '../src/main/guide-metadata-partition'
import {projectGuideProofHistory,assertGuideReviewProofManifest,planGuideReviewProofs} from '../src/main/guide-review-proof-scope'
import {planGuideProofPhase} from '../src/main/guide-proof-partition'
import {assertGuideProofReviewEvidence} from '../src/main/guide-proof-review-evidence'
import {guideHash} from '../src/main/matchup-guide-packet'
import {planGuideRequest} from '../src/main/guide-request-budget'

it('reuses exact accepted proof units after calibration growth without estimating or buying them again',()=>{
 const packet:any={basis:{projectId:'independent'}},scope:any={jobId:'j',projectId:'independent'},draft:any={scenarios:[{id:'case',replyComparison:{options:['a','b','c'].map(id=>({id}))}}]},rows=new Map<string,Map<string,any>>(),archive:any={id:'j',projectId:'independent',values:(role:string)=>[...rows.get(role)??[]].map(([key,value])=>({key,value})),saveValue:(role:string,key:string,value:any)=>{if(!rows.has(role))rows.set(role,new Map());rows.get(role)!.set(key,value)}}
 const input:any={caseId:'case',baseViewId:'case',base:draft,completeDraft:draft,branchHeads:['a','b','c'].map(id=>({id,head:id})),requirements:[],history:{reviews:[],findings:[]},make:(_view:any,spec:any,id:string)=>{const ctx=guideHash(spec),read=(v:any)=>{if(v.ctx!==ctx)throw Error('wrong context');return v};return {stage:id,role:'critic',task:'synthetic',instructions:'synthetic',data:{packet,reviewContextHash:ctx},schema:{},reserveCalls:0,unitKey:ctx,read,cacheValidation:{id:'synthetic',validate:read}}}}
 const b=planGuideRequest('test','synthetic',{}, {},[],10,0).budget,options:any={scope,packet,archive,remainingCalls:()=>0,isCached:()=>false,estimate:()=>b,check:()=>{},reserveOutside:0},first=planGuideReviewProofs(input,options,'test')
 archive.saveValue('guide-proof-review-manifest-v1',first.manifestHash,first.manifest)
 for(const u of first.units){const value={ctx:u.request.unitKey};archive.saveValue('guide-segment-unit-result-v1',u.id,{accepted:true,unitKey:u.request.unitKey,retryOrdinal:0,raw:value,value})}
 const grown={...options,estimate:()=>{throw Error('uncached estimate after calibration growth')}}
 const resumed=planGuideReviewProofs(input,grown,'test')
 expect(resumed.manifestHash).toBe(first.manifestHash)
 expect(planGuideProofPhase(resumed.units.map(u=>u.request),grown,'test').uncachedCalls).toBe(0)
 expect(()=>planGuideReviewProofs(input,{...grown,packet:{basis:{projectId:'independent'},changedSource:true}},'test')).toThrow('uncached estimate')
})

it('merges every independent missing witness for a case without truncating or aliasing constructions',()=>{
 const requirements=Array.from({length:8},(_,i)=>({goal:'Independent condition '+i})),make=(values:any[])=>({kind:'needs-branches' as const,caseId:'case',constructionHash:'native-head',requirements:values})
 const first=make(requirements.slice(0,5)),second=make(requirements.slice(4)),before=structuredClone([first,second]),result=mergeGuideMetadataNeeds([first,second])
 expect(result).toEqual([make(requirements)]);expect([first,second]).toEqual(before)
 expect(()=>mergeGuideMetadataNeeds([first,{...second,constructionHash:'different'}])).toThrow('costruzioni differenti')
})

it('projects explicit historical witnesses while retaining the whole finding and immutable original hashes',()=>{
 const source:any={draft:{scenarios:[{id:'case',replyComparison:{options:['a','b','counter'].map(id=>({id,turns:{original:id},outcome:id}))}}]},contexts:['main','a','b','counter'].map(lineId=>({scenarioId:'case',lineId,receipt:{original:lineId}}))},finding={repair:{kind:'metadata',caseId:'case'},message:'Original finding with all conditions',counterlines:[{lineId:'counter',text:'Original counterline'}]},history:any={reviews:[{key:'original',unitId:'u',review:{draftHash:'draft-original',constructionHash:'head-original',reviewContextHash:'ctx-original',verdict:'fail',checks:[]},snapshot:{data:source,request:{stage:'old'}}}],findings:[{hash:guideHash(finding),finding,reviewKeys:['original']}]},before=structuredClone(history)
 const projected=projectGuideProofHistory(history,{caseId:'case',branchIds:['a'],historyFindingHashes:[guideHash(finding)]})
 expect(projected.findings).toEqual(history.findings)
 expect(projected.reviews[0].snapshot.data.contexts.map((c:any)=>c.lineId)).toEqual(['main','a','counter'])
 expect(projected.reviews[0].snapshot.data.draft.scenarios[0].replyComparison.options.map((o:any)=>o.id)).toEqual(['a','counter'])
 expect(projected.reviews[0].originalContextHash).toBe('ctx-original');expect(projected.reviews[0].originalReviewHash).toBe(guideHash(history.reviews[0].review));expect(history).toEqual(before)
 expect(()=>projectGuideProofHistory(history,{caseId:'case',branchIds:['a'],historyFindingHashes:['missing']})).toThrow('originale assente')
})

it('requires every pair and every original audit even when a manifest retains some accepted passes',()=>{
 const m:any={branchHeads:['a','b','c'].map(id=>({id,head:id})),requirements:[],historicalFindings:[{hash:'global',global:true,branchIds:['a','b','c']}],units:[['a','b'],['a','c'],['b','c']].map((branchIds,i)=>({id:String(i),branchIds,requirementIds:[],historyFindingHashes:['global']}))}
 assertGuideReviewProofManifest(m)
 const missing=structuredClone(m);missing.units.pop();expect(()=>assertGuideReviewProofManifest(missing)).toThrow('confronto')
 const noAudit=structuredClone(m);noAudit.units[2].historyFindingHashes=[];expect(()=>assertGuideReviewProofManifest(noAudit)).toThrow('audit storico')
})

it('accepts a complete preventive set but never treats it as the required final review',()=>{
 const scope:any={jobId:'j'},packet:any={basis:{}},proof:any={completeDraftHash:'full'},data={proofPartition:proof},row:any={key:'r',unitId:'u',review:{reviewContextHash:'ctx'},snapshot:{data}},run={version:1,scope,packetHash:guideHash(packet),completeDraftHash:'full',final:false,units:[{id:'u',reviewContextHash:'ctx'}]},runHash=guideHash(run),manifest:any={scope,packetHash:guideHash(packet),completeDraftHash:'full',branchHeads:[{id:'a',head:'h'}],requirements:[],historicalFindings:[],units:[{id:'u',proofHash:guideHash(proof),reviewContextHash:'ctx',branchIds:['a'],requirementIds:[],historyFindingHashes:[]}]},manifestHash=guideHash(manifest),archive:any={value:(role:string)=>({
  'guide-proof-review-run-membership-v1':{unitId:'u',reviewContextHash:'ctx',runHash},
  'guide-proof-review-run-v1':run,
  'guide-proof-review-membership-v1':{unitId:'u',proofHash:guideHash(proof),reviewContextHash:'ctx',manifestHash},
  'guide-proof-review-manifest-v1':manifest
 } as any)[role]},options:any={scope,packet,archive}
 expect(()=>assertGuideProofReviewEvidence([row],options)).not.toThrow()
 expect(()=>assertGuideProofReviewEvidence([row],options,undefined,true)).toThrow('Revisione completa')
 expect(()=>assertGuideProofReviewEvidence([],options,undefined,true)).toThrow('senza le critiche')
})
