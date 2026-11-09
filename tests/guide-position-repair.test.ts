import {it,expect} from 'vitest'
import {collectGuideSetupPosition,projectGuideSetup} from '../src/shared/guide-ledger-projection'
import {guidePositionNotes,GuidePositionAnnotationError} from '../src/shared/guide-causal-description'
import {segmentFixture} from './fixtures/guide-segment'

function fixture(){const f=segmentFixture();return {...f,packet:{...f.packet,ourList:{...f.packet.ourList,label:'Synthetic ours',url:null},opponentLists:f.packet.opponentLists.map(l=>({...l,label:'Synthetic opponent',url:null})),basis:{...f.packet.basis,promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1' as const}}}}
function pending(){const f=fixture();const raw:any=structuredClone(f.scenario);raw.firstOpponentTurn={draw:'e',events:[{kind:'effect',description:'Synthetic manual attachment with audit still pending.',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['card:e'],attachment:'manual'}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:[],reason:'Pending dedicated audit.'}}],decision:{availableAttack:'Synthetic attack',choice:'No first-turn attack',reason:'First player cannot attack.'},tactical:null};return {...f,raw}}
it('constructs positions before audit judgments while the public reader still rejects the same unaudited original',()=>{
 const f=pending(),before=structuredClone(f.raw),position=collectGuideSetupPosition(f.raw,f.packet)
 expect(position.inventory).toContainEqual({side:'opponent',printId:'e',zone:'attached',count:1});expect(position.nextTurn).toBe(2)
 expect(position).not.toHaveProperty('setupReceipt');expect(position).not.toHaveProperty('approved');expect(f.raw).toEqual(before)
 expect(()=>projectGuideSetup({scenarios:[f.raw]},f.packet)).toThrow('alternative PRIMA')
})
it.each(['stock','host','manual','first-turn-attack'] as const)('retains the %s movement control even when audit construction is pending',kind=>{
 const f=pending(),event=f.raw.firstOpponentTurn.events[0]
 if(kind==='stock')event.energyRoutes[0].count=60
 if(kind==='host')event.energyRoutes[0].hostPrintId='e'
 if(kind==='manual')f.raw.firstOpponentTurn.events.push(structuredClone(event))
 if(kind==='first-turn-attack'){event.attack={printId:'p',attackName:'Synthetic attack'};event.attackPayment={energy:[],costAdjustments:[]}}
 expect(()=>collectGuideSetupPosition(f.raw,f.packet)).toThrow()
})
it('collects identities from the executed ledger without accepting incorrect annotations or returning a receipt',()=>{
 const f=fixture(),raw=structuredClone(f.scenario);raw.positionAnnotations[0].zone='bench'
 const position=collectGuideSetupPosition(raw,f.packet)
 expect(position.inventory.filter(r=>r.zone==='active')).toEqual([{side:'ours',printId:'p',zone:'active',count:1},{side:'opponent',printId:'p',zone:'active',count:1}])
 expect(position).not.toHaveProperty('setupReceipt');expect(position).not.toHaveProperty('approved');expect(raw.positionAnnotations[0].zone).toBe('bench')
 expect(()=>projectGuideSetup({scenarios:[raw]},f.packet)).toThrow('danni/posizione')
})
it.each(['duplicate','missing','dead','copy','source'] as const)('retains the %s position control and reports the resulting board',kind=>{
 const f=fixture(),position=collectGuideSetupPosition(f.scenario,f.packet),annotations:any[]=structuredClone(f.scenario.positionAnnotations)
 if(kind==='duplicate')annotations.push(structuredClone(annotations[0]))
 if(kind==='missing')annotations.pop()
 if(kind==='dead')annotations[0].damage=120
 if(kind==='copy')annotations[0].copy=2
 if(kind==='source')annotations[0].hpAdjustment={amount:20,sourceIds:['card:missing']}
 let error:any;try{guidePositionNotes({id:'case',inventory:position.inventory,positionAnnotations:annotations},f.packet.sources,true,position.nextTurn)}catch(e){error=e}
 expect(error).toBeInstanceOf(GuidePositionAnnotationError);expect(error.message).toContain('Campo risultante dal registro');expect(error.message).toContain('"printId":"p"')
})
it('does not admit an illegal bench or card stock to construct position candidates',()=>{
 const f=fixture(),raw:any=structuredClone(f.scenario);raw.opening.ours.bench=['e']
 expect(()=>collectGuideSetupPosition(raw,f.packet)).toThrow('Panchina iniziale non Base')
})
