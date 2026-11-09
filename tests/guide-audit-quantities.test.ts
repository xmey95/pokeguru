import {it,expect} from 'vitest'
import {segmentFixture} from './fixtures/guide-segment'
import {auditText} from './fixtures/guide-audit'
import {collectGuideAuditCandidates} from '../src/shared/guide-ledger-projection'
import {auditQuantityContext,auditDecisionWindows,renderAuditNarrative} from '../src/main/guide-audit-quantities'
import {guideSource,type GuidePacket} from '../src/main/matchup-guide-packet'
const atom=(quantity:any)=>[{text:null,quantity:{host:null,...quantity},card:null,measureId:null}]
function fixture(){
 const f=segmentFixture(),packet={...f.packet,basis:{...f.packet.basis,promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1'}} as GuidePacket,native:any=structuredClone(f.scenario)
 const event={kind:'play',description:'Synthetic manual attachment.',moves:[],energyRoutes:[{side:'ours',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['rules'],attachment:'manual'}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null}
 native.setupRounds=[{ours:{draw:'e',events:[event],decision:{availableAttack:'Synthetic',choice:'Keep',reason:'Fixture'},tactical:{attacks:[],cards:[],promotions:[],comparison:'Incomplete'}},opponent:{...structuredClone(f.opponent),decision:{availableAttack:'Synthetic',choice:'Keep',reason:'Fixture'}}}]
 const facts=()=>collectGuideAuditCandidates(native,packet,{kind:'setup'},true)
 const context=()=>{const c=facts();return auditQuantityContext(native,packet,c,c.locations[0])}
 return {packet,native,event,facts,context}
}
it('derives deck, hand and attached balances around draw and payment in the existing ledger',()=>{
 const f=fixture(),c=f.context(),path=['setupRounds',0,'ours','events',0],before=c.windows.find(w=>w.when==='before'&&JSON.stringify(w.path)===JSON.stringify(path))!,after=c.windows.find(w=>w.when==='after'&&JSON.stringify(w.path)===JSON.stringify(path))!
 const n=(w:any,zone:string)=>w.balances.find((r:any)=>r.side==='ours'&&r.printId==='e'&&r.zone===zone)?.count??0
 expect([n(before,'deck'),n(before,'hand'),n(before,'attached')]).toEqual([43,7,0]);expect([n(after,'deck'),n(after,'hand'),n(after,'attached')]).toEqual([43,6,1])
 expect(c.windows.some(w=>w.path.at(-1)==='draw'&&w.when==='after')).toBe(true)
 expect(collectGuideAuditCandidates(f.native,f.packet,{kind:'setup'}).quantities).toBeUndefined()
})
it('renders explicit zero, listed total and remaining copies as different facts, including the opposing side',()=>{
 const c=fixture().context(),window=c.windows.find(w=>w.when==='before'&&w.path.at(-1)===0)!,q={windowId:window.id,side:'ours',printId:'p',zone:'deck',count:3}
 expect(renderAuditNarrative(atom(q),c,600)).toContain('3 copie')
 expect(renderAuditNarrative(atom({...q,zone:'discard',count:0}),c,600)).toContain('0 copie')
 expect(renderAuditNarrative(atom({...q,windowId:'list',zone:'list',count:4}),c,600)).toContain('nella lista')
 expect(renderAuditNarrative(atom({...q,side:'opponent'}),c,600)).toContain('del lato avversario')
 expect(()=>renderAuditNarrative(atom({...q,count:4}),c,600)).toThrow('ha 3 copie')
})
it('does not accept a post-payment state as proof of availability before the decision',()=>{
 const c=fixture().context(),path=['setupRounds',0,'ours','events',0],after=c.windows.find(w=>w.when==='after'&&JSON.stringify(w.path)===JSON.stringify(path))!,allowed=auditDecisionWindows(c,path)
 expect(()=>renderAuditNarrative(atom({windowId:after.id,side:'ours',printId:'e',zone:'hand',count:6}),c,600,allowed)).toThrow('finestra non pertinente')
})
it.each(['Restano 2 copie nel mazzo.','Restano due copie nel mazzo.','Both copies remain.','Resta una copia.','A single copy remains.'])('rejects free count prose rather than passing it to the main critic: %s',text=>{
 expect(()=>renderAuditNarrative(auditText(text),fixture().context(),600)).toThrow('quantità libera')
})
it('keeps digit-bearing names and printed cost facts usable without allowing unbound numbers',()=>{
 const f=fixture(),c=f.context();c.cards[0].name='Porygon2'
 expect(renderAuditNarrative([{text:null,quantity:null,card:{side:'ours',printId:'p'},measureId:null}],c,600)).toBe('Porygon2')
 const retreat=c.measures.find(m=>m.id.endsWith(':retreat'))!
 expect(renderAuditNarrative([{text:null,quantity:null,card:null,measureId:retreat.id}],c,600)).toContain('ritirata stampato: 1')
 expect(()=>renderAuditNarrative([{text:'Qualifier',quantity:null,card:null,measureId:retreat.id}],c,600)).toThrow('esattamente un contenuto')
})
it('rejects references to foreign cards and nonexistent windows even if the claimed value is zero',()=>{
 const c=fixture().context(),q={windowId:c.windows[0].id,side:'ours',printId:'p',zone:'deck',count:3}
 expect(()=>renderAuditNarrative(atom({...q,printId:'foreign',count:0}),c,600)).toThrow()
 expect(()=>renderAuditNarrative(atom({...q,windowId:'unobserved',count:0}),c,600)).toThrow()
 expect(()=>renderAuditNarrative(atom({...q,windowId:'list'}),c,600)).toThrow('finestra non pertinente')
})
it('includes the same printed Basic beneath an evolution as evolution rather than a searchable deck copy',()=>{
 const f=fixture(),card=JSON.parse(f.packet.sources[0].content);f.packet.sources.push(guideSource('card:q','card','Synthetic Stage One',null,JSON.stringify({...card,printId:'q',name:'Synthetic Stage One',stage:'Stage1',gameplay:{...card.gameplay,evolveFrom:'Synthetic Basic'}})))
 for(const l of [f.packet.ourList,...f.packet.opponentLists])l.cards=[{printId:'p',name:'Synthetic Basic',count:4},{printId:'q',name:'Synthetic Stage One',count:2},{printId:'e',name:'Basic Grass Energy',count:54}]
 f.native.opening.ours.hand=['q','e','e','e','e','e']
 f.native.positionAnnotations.find((a:any)=>a.side==='ours'&&a.zone==='active').printId='q'
 const round=structuredClone(f.native.setupRounds[0]);round.ours.events=[{...f.event,energyRoutes:[],moves:[{side:'ours',printId:'p',count:1,from:'active',to:'evolution'},{side:'ours',printId:'q',count:1,from:'hand',to:'active'}]}];f.native.setupRounds.push(round)
 const facts=f.facts(),c=auditQuantityContext(f.native,f.packet,facts,facts.locations.find(l=>l.turn===3)!),w=c.windows.find(w=>w.when==='after'&&w.path.at(-1)===0)!
 expect(w.balances.find(r=>r.side==='ours'&&r.printId==='p'&&r.zone==='evolution')?.count).toBe(1)
 expect(()=>renderAuditNarrative(atom({windowId:w.id,side:'ours',printId:'p',zone:'deck',count:4}),c,600)).toThrow('ha 3 copie')
})
it('includes explicit movement from prizes to hand without turning the remaining prizes into deck availability',()=>{
 const f=fixture();f.native.setupRounds[0].ours.events=[{...f.event,kind:'effect',energyRoutes:[{side:'ours',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['rules'],attachment:null}],moves:[]}]
 const c=f.context(),w=c.windows.find(w=>w.when==='after'&&w.path.at(-1)===0)!
 expect(w.balances.find(r=>r.side==='ours'&&r.printId==='e'&&r.zone==='prizes')?.count).toBe(5)
 expect(w.balances.find(r=>r.side==='ours'&&r.printId==='e'&&r.zone==='hand')?.count).toBe(8)
 expect(w.balances.find(r=>r.side==='ours'&&r.printId==='e'&&r.zone==='deck')?.count).toBe(43)
})
it('binds attached quantities to the actual physical recipient, never to an aggregate on another Pokémon',()=>{
 const f=fixture(),c=f.context(),after=c.windows.find(w=>w.when==='after'&&w.path.at(-1)===0)!,q={windowId:after.id,side:'ours',printId:'e',zone:'attached',host:{printId:'p',copy:1},count:1}
 expect(renderAuditNarrative(atom(q),c,600)).toContain('presso Synthetic Basic, copia 1')
 expect(()=>renderAuditNarrative(atom({...q,count:2}),c,600)).toThrow('ha 1 copie')
 expect(()=>renderAuditNarrative(atom({...q,host:{printId:'p',copy:2}}),c,600)).toThrow('destinatario assente')
})
