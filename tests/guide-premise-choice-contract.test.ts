import {it,expect} from 'vitest'
import {segmentFixture} from './fixtures/guide-segment'
import {guideHash,guideSource,type GuidePacket} from '../src/main/matchup-guide-packet'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {guidePremiseChoiceFacts} from '../src/main/guide-premise-review'
import {guidePremiseRequest} from '../src/main/guide-segment-generation'
import {prepareFiniteRequest} from '../src/main/guide-finite-runtime'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'

function fixture(){
 const f=segmentFixture(),packet=f.packet as unknown as GuidePacket
 Object.assign(packet.basis,{promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1',deliveryContract:'bounded-delivery-1'})
 packet.ourList={...packet.ourList,cards:[{printId:'p',name:'Synthetic Basic',count:4},{printId:'e',name:'Basic Grass Energy',count:54},{printId:'s',name:'Synthetic Supporter',count:2}]}
 packet.sources.push(guideSource('card:s','card','Synthetic Supporter',null,JSON.stringify({printId:'s',name:'Synthetic Supporter',category:'Trainer',gameplay:{trainerType:'Supporter',effect:'Synthetic Supporter with no additional resource change.'}})))
 const {turns,developmentPlan,...setup}=f.scenario as any
 setup.opening.ours.hand=['s','s','e','e','e','e'];setup.sourceIds.push('card:s')
 setup.firstOpponentTurn={draw:'e',events:[],decision:{availableAttack:'Synthetic attack',choice:'No first-turn attack',reason:'First player passes without attacking.'},tactical:structuredClone(turns.ours.tactical)}
 const event={kind:'effect',description:'Play one Supporter; another copy remains in hand.',moves:[{side:'ours',printId:'s',count:1,from:'hand',to:'discard'}],energyRoutes:[],attack:null,trainer:'s',retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:['p','e','s'],reason:'Consider the legal Supporter before its use.'},action:'other',affectedSide:'ours'}
 const attack={...event,description:'Attack while the other Supporter remains in hand.',moves:[],trainer:null,attack:{printId:'p',attackName:'Synthetic attack'},attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'The other Supporter remains physically in hand but cannot be played.'}}
 const body={...turns.ours,events:[event,attack],tactical:{...turns.ours.tactical,cards:['p','e','s']}}
 const scope={projectId:packet.basis.projectId,jobId:'synthetic-choice-contract',dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-config'}
 const journal=appendGuideSegment(createGuideSegments(setup,scope,packet),scope,packet,body,developmentPlan.ours)
 const rows=new Map<string,{key:string;value:any}[]>(),archive={id:scope.jobId,projectId:scope.projectId,value<T>(role:string,key:string):T|undefined{return rows.get(role)?.find(r=>r.key===key)?.value},*values<T>(role:string){yield* rows.get(role)??[] as {key:string;value:T}[]},saveValue(role:string,key:string,value:any){rows.set(role,[...rows.get(role)??[],{key,value}])}}
 authorizeGuideUntilValid(archive as any,packet,{provider:'codex',source:'global',model:null,reasoningEffort:null},'offline:choice-contract','2026-11-08T00:00:00.000Z')
 return {packet,scope,journal,body,archive,rows}
}
it('keeps an unplayable Supporter in physical hand counts while excluding it only from later decision candidates',()=>{
 const f=fixture(),before=guideHash(f.journal),facts=guidePremiseChoiceFacts(f.journal,f.scope,f.packet)
 const play=facts.find(w=>w.trainer==='s')!,attack=facts.find(w=>w.attack)!
 expect(play.supporterUsed).toBe(false);expect(play.candidateIds).toContain('s')
 expect(attack.supporterUsed).toBe(true);expect(attack.candidateIds).not.toContain('s')
 expect(attack.physicalHand.find((c:any)=>c.printId==='s')?.count).toBe(1)
 expect(attack.physicalHand.reduce((n:number,c:any)=>n+c.count,0)).toBe(6)
 expect(new Set(attack.decisionProofCards)).toEqual(new Set(attack.candidateIds))
 expect(guideHash(f.journal)).toBe(before)
 const root=createGuideSegments(f.journal.setup,f.scope,f.packet),bad=structuredClone(f.body);bad.events[1].decisionProof.cards.push('s')
 expect(()=>appendGuideSegment(root,f.scope,f.packet,bad,f.journal.segments[0].development)).toThrow('omesse o estranee')
 const forged=structuredClone(f.journal);forged.segments[0].receipt.events.at(-1).choiceBefore.hand=[]
 expect(()=>guidePremiseChoiceFacts(forged,f.scope,f.packet)).toThrow()
})
it('uses an explicit independent premise contract, preserves negative routing and keeps paid v4 requests unchanged',()=>{
 const f=fixture(),request=guidePremiseRequest(f.journal,f.scope,f.packet,3,f.archive)
 expect(request.cacheValidation.id).toBe('guide-premise-review-5')
 expect((request.data as any).auditChoiceContract.candidateWindows.some((w:any)=>w.supporterUsed&&w.physicalHand.some((c:any)=>c.printId==='s'))).toBe(true)
 expect(request.instructions).toContain('Puoi contestare il replay con fonti e condizioni reali')
 expect(prepareFiniteRequest(request,{scope:f.scope,archive:f.archive as any}).instructions).toBe(request.instructions)
 const data=request.data as any,negative={reviewedHash:data.witnessContext.reviewedHash,verdict:'revise',repairScope:'first-turn',checks:['Independent source interpretation remains open.'],findings:[{severity:'major',targetId:f.journal.setup.id,message:'A real source interpretation remains unresolved.',correction:'Check the original effect.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],revalidatedIds:[],textCorrections:[]}
 expect(request.read(negative).verdict).toBe('revise')
 expect(()=>request.read({...negative,verdict:'pass',repairScope:'none'})).toThrow()
 const historic={unitId:'paid-v4',scopeHash:guideHash(f.scope),request:{validationId:'guide-premise-review-4',data:{packet:f.packet,prefix:data.prefix}}}
 f.rows.set('guide-finite-request-v1',[{key:'paid-v4',value:historic}]);f.rows.set('guide-segment-unit-result-v1',[{key:'original-negative',value:{unitId:'paid-v4',accepted:true,value:negative}}])
 const retained=guidePremiseRequest(f.journal,f.scope,f.packet,3,f.archive)
 expect(retained.cacheValidation.id).toBe('guide-premise-review-4')
 expect((retained.data as any).auditChoiceContract).toBeUndefined()
 expect(retained.instructions).not.toContain('CONTRATTO DELLE RICEVUTE')
 expect(f.rows.get('guide-segment-unit-result-v1')![0].value.value).toBe(negative)
})
