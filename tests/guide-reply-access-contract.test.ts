import {it,expect} from 'vitest'
import {segmentFixture} from './fixtures/guide-segment'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {guideReplyTurnRequest,guideReplyFutureCalls} from '../src/main/guide-reply-phase'
import {guideTurnDeclarationRequest} from '../src/main/guide-segment-generation'
import {readGuideAccessTurn} from '../src/shared/guide-native-decisions'
function setup(role='access'){
 const f=segmentFixture(),packet=f.packet as any,scope={projectId:packet.basis.projectId,jobId:'independent-contract',dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-config'},rows=new Map<string,any[]>()
 const {turns,developmentPlan,...native}=f.scenario
 const journal=appendGuideSegment(createGuideSegments(native,scope,packet),scope,packet,turns.ours,developmentPlan.ours)
 const state:any={caseId:native.id,seed:{id:'independent-'+role,role,intent:role==='defend'?'defend':'attack',goal:'Independent branch goal',sourceIds:['card:p']},line:{id:'independent-line'},journal,terminal:false}
 const archive:any={id:scope.jobId,projectId:scope.projectId,values:(role:string)=>rows.get(role)??[]}
 const options:any={scope,packet,archive,reserveOutside:4},base={stage:`segment-${state.caseId}-${state.line.id}-opponent`,reserveCalls:5,extraData:{reply:state.seed,lineId:state.line.id},repairFeedback:undefined,task:`Costruisci solo il prossimo turno della replica ${role}: ${state.seed.goal}. Il nostro prefisso resta identico.`,archive,validateBody:(body:any)=>{if(role==='access')readGuideAccessTurn(state.caseId,body.events)}}
 return {state,options,base,rows,original:guideTurnDeclarationRequest(journal,scope,packet,base)}
}
it('states the unchanged one-event access rule, keeps all schema constraints and carries the exact legacy rejection',()=>{
 const f=setup(),raw={sentinel:'original rejected AI payload'},message='Exact old rejection'
 f.rows.set('guide-segment-unit-result-v1',[{key:'old',value:{unitKey:f.original.unitKey,unitId:'old-unit',retryOrdinal:0,raw,message,accepted:false}}])
 const request=guideReplyTurnRequest(f.state,f.options),data=request.data as any
 expect(request.task).toContain('ESATTAMENTE un evento');expect(request.task).toContain('previousReceipt')
 expect(request.schema).toEqual(f.original.schema);expect(request.instructions).toBe(f.original.instructions)
 expect(request.unitKey).not.toBe(f.original.unitKey)
 expect(data.accessContract.previousUnitKey).toBe(f.original.unitKey)
 expect(data.accessContract.previousInvalid).toEqual({ordinal:1,unitId:'old-unit',raw,message})
 expect(data.previousInvalid).toBeUndefined();expect(data.prefix).toEqual((f.original.data as any).prefix)
 expect(()=>readGuideAccessTurn('independent',[])).toThrow('esattamente una')
})
it.each(['direct','other'])('keeps the original %s request identity and native schema',role=>{
 const f=setup(role),request=guideReplyTurnRequest(f.state,f.options)
 expect(request.unitKey).toBe(f.original.unitKey);expect(request.data).toEqual(f.original.data);expect(request.schema).toEqual(f.original.schema)
 expect(request.outputCapacity).toEqual(f.original.outputCapacity)
})
it('requires materializing the planned defense while preserving its original rejection and native schema',()=>{
 const f=setup('defend'),raw={sentinel:'old defensive payload'},message='Original defensive rejection'
 f.rows.set('guide-segment-unit-result-v1',[{key:'old',value:{unitKey:f.original.unitKey,unitId:'old-defend',retryOrdinal:0,raw,message,accepted:false}}])
 const request=guideReplyTurnRequest(f.state,f.options),data=request.data as any
 expect(request.task).toContain('DIFESA ESEGUITA');expect(request.schema).toEqual(f.original.schema)
 expect(data.defenseContract.previousInvalid).toEqual({ordinal:1,unitId:'old-defend',raw,message})
 expect(data.defenseContract.previousUnitKey).toBe(f.original.unitKey)
})
it('reserves every unfinished next turn at learned capacity, excluding derived terminal and complete branches',()=>{
 const state=(length:number,terminal=false)=>({journal:{segments:Array(length).fill({})},terminal}) as any
 const states=[state(1),state(2),state(2),state(2,true),state(3)]
 expect(guideReplyFutureCalls(states,1,Infinity)).toBe(1)
 expect(guideReplyFutureCalls(states,1,1)).toBe(3)
 expect(guideReplyFutureCalls(states,1,2)).toBe(2)
 expect(guideReplyFutureCalls(states,2,1)).toBe(0)
 const f=setup(),ordinary=guideReplyTurnRequest(f.state,f.options),reserved=guideReplyTurnRequest(f.state,f.options,3)
 expect(reserved.reserveCalls-ordinary.reserveCalls).toBe(2)
 expect(reserved.unitKey).toBe(ordinary.unitKey)
})
