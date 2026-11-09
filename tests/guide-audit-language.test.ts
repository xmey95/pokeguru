import {it,expect} from 'vitest'
import {segmentFixture} from './fixtures/guide-segment'
import {auditText,auditLanguagePass} from './fixtures/guide-audit'
import {collectGuideAuditCandidates} from '../src/shared/guide-ledger-projection'
import {auditQuantityContext,renderAuditNarrative} from '../src/main/guide-audit-quantities'
import {auditLanguageRequest} from '../src/main/guide-audit-language-review'
import {guideSource} from '../src/main/matchup-guide-packet'

function fixture(text:string,version:1|2|3|4=2,printedRule?:string){
 const f=segmentFixture(),native:any=structuredClone(f.scenario)
 Object.assign(f.packet.basis,{promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1',asOf:'2026-11-05'})
 if(printedRule)f.packet.sources.push(guideSource('synthetic-rule','rules','Synthetic cardinality rule',null,printedRule))
 native.setupRounds=[{ours:{draw:'e',events:[],decision:{availableAttack:'Synthetic',choice:'Keep',reason:'Synthetic'},tactical:{cards:[],attacks:[],promotions:[],comparison:'Synthetic'}},opponent:{...structuredClone(f.opponent),decision:{availableAttack:'Synthetic',choice:'Keep',reason:'Synthetic'}}}]
 const packet=f.packet as any,facts=collectGuideAuditCandidates(native,packet,{kind:'setup'},true),context=auditQuantityContext(native,packet,facts,facts.locations[0]),target={id:'test-field',text,parts:auditText(text),allowedWindows:context.windows.map(w=>w.id),maximum:1600,anchorHash:'synthetic-physical-body'}
 const request=auditLanguageRequest([target],context,[{id:'turn',label:'Turn',value:1}],{packet:f.packet,scope:{projectId:'test',jobId:'test',configHash:'test',dependencyHash:'test'},archive:{values:()=>[]}} as any,24,version),data=request.data as any
 return {context,request,data,pass:()=>auditLanguagePass(data)}
}
it.each(['Nessuna promozione serve.','Non serve alcuna promozione.','Confronta entrambi gli attacchi.','Una linea prudente conserva il pivot.'])('accepts a contextual qualitative judgment, never a lexical exemption: %s',text=>{
 const f=fixture(text);expect(renderAuditNarrative(auditText(text),f.context,1600,undefined,3)).toBe(text);expect(()=>f.request.read(f.pass())).not.toThrow()
})
it('preserves historical rejection without treating the provisional new renderer as a quantitative pass',()=>{
 const f=fixture('Nessuna promozione serve.');expect(()=>renderAuditNarrative(auditText('Nessuna promozione serve.'),f.context,600)).toThrow('quantità libera')
 const raw=f.pass();raw.targets.t0.allClaimsChecked=false;expect(()=>f.request.read(raw)).toThrow('copertura incompleta')
})
it.each(['Restano 2 copie nel mazzo.','Restano due copie nel mazzo.'])('rejects explicit counts classified as qualitative: %s',text=>{const f=fixture(text);expect(()=>f.request.read(f.pass())).toThrow('numerale esplicito')})
it('checks an inventory claim against the real window, including a lexical zero claim',()=>{
 const f=fixture('Nessuna copia nel mazzo.'),raw=f.pass(),window=f.context.windows[0],a=raw.targets.t0.annotations[0]
 Object.assign(a,{kind:'inventory',declaredCount:0,quantity:{windowId:window.id,side:'ours',printId:'p',zone:'deck',host:null,count:3}})
 expect(()=>f.request.read(raw)).toThrow('verdetto incompatibile')
 raw.verdict='revise';raw.targets.t0.findings=[{quote:'Nessuna copia',reason:'The actual deck balance is three.'}];expect(()=>f.request.read(raw)).not.toThrow()
 a.declaredCount=3;expect(()=>f.request.read(raw)).toThrow('numero affermato')
})
it('requires both the actual count and the count asserted in the text, without allowing either to be forged',()=>{
 const f=fixture('Restano 3 copie nel mazzo.'),raw=f.pass(),window=f.context.windows[0],a=raw.targets.t0.annotations[0]
 Object.assign(a,{kind:'inventory',declaredCount:3,quantity:{windowId:window.id,side:'ours',printId:'p',zone:'deck',host:null,count:3}});expect(()=>f.request.read(raw)).not.toThrow()
 a.quantity.count=4;expect(()=>f.request.read(raw)).toThrow('ha 3 copie')
 a.quantity.count=3;a.declaredCount=2;expect(()=>f.request.read(raw)).toThrow('diverso dal testo')
 a.declaredCount=3;a.quantity.windowId='foreign';expect(()=>f.request.read(raw)).toThrow()
})
it('requires exact hint coverage and a full-field check; findings forbid a positive verdict',()=>{
 const f=fixture('Una linea confronta entrambi gli attacchi.'),raw=f.pass();raw.targets.t0.annotations[1]=raw.targets.t0.annotations[0];expect(()=>f.request.read(raw)).toThrow('copertura incompleta')
 const revised=f.pass();revised.targets.t0.findings=[{quote:'linea',reason:'An implicit claim remains unresolved.'}];expect(()=>f.request.read(revised)).toThrow('verdetto incompatibile')
})
it('rejects invented printed values and invented source quotes',()=>{
 const f=fixture('Costo 2.'),raw=f.pass(),a=raw.targets.t0.annotations[0],measure=f.context.measures.find(m=>m.value==='1')!
 Object.assign(a,{kind:'measure',declaredCount:2,measureId:measure.id});expect(()=>f.request.read(raw)).toThrow('verdetto incompatibile')
 Object.assign(a,{kind:'source',measureId:null,source:{id:'rules',quote:'Invented rule costs 2'}});expect(()=>f.request.read(raw)).toThrow('citazione originale')
})
it('does not accept a review after its bound context or source text changes',()=>{
 const f=fixture('Nessuna promozione serve.'),raw=f.pass();f.data.targets[0].text='Nessuna copia nel mazzo.';expect(()=>f.request.read(raw)).toThrow('contesto del riesame alterato')
})
it.each(['You must discard a card from your hand.','Once during your turn, you may draw 2 cards.','Search for a Basic {F} Pokémon.'])('binds one to printed rule wording without changing the historical reader: %s',quote=>{
 for(const version of [1,2] as const){const f=fixture('La regola richiede uno.',version,quote),raw=f.pass();Object.assign(raw.targets.t0.annotations[0],{kind:'source',declaredCount:1,source:{id:'synthetic-rule',quote}});if(version===1)expect(()=>f.request.read(raw)).toThrow('valore assente');else expect(()=>f.request.read(raw)).not.toThrow()}
})
it.each(['a few cards','a pair of cards','Twice during your turn.','Search for a Basic {Z} Pokémon.'])('rejects an unsupported declared one for %s',quote=>{const f=fixture('La regola richiede uno.',2,quote),raw=f.pass();Object.assign(raw.targets.t0.annotations[0],{kind:'source',declaredCount:1,source:{id:'synthetic-rule',quote}});expect(()=>f.request.read(raw)).toThrow('valore assente')})
it('keeps exact citations and declared counts mandatory when a printed type icon is present',()=>{
 const quote='Search for a Basic {F} Pokémon.',f=fixture('La regola richiede uno.',4,quote),raw=f.pass(),a=raw.targets.t0.annotations[0]
 Object.assign(a,{kind:'source',declaredCount:1,source:{id:'synthetic-rule',quote}});expect(()=>f.request.read(raw)).not.toThrow()
 a.source.quote='Search for a Basic {W} Pokémon.';expect(()=>f.request.read(raw)).toThrow('citazione originale')
 a.source.quote=quote;a.declaredCount=2;expect(()=>f.request.read(raw)).toThrow('numero affermato')
})
it('makes a numerical declaration and exactly the relevant binding structurally mandatory',()=>{
 const f=fixture('La regola richiede due.',2,'Discard 2 cards.'),raw=f.pass(),a=raw.targets.t0.annotations[0];Object.assign(a,{kind:'source',declaredCount:2,source:{id:'synthetic-rule',quote:'Discard 2 cards.'}});expect(()=>f.request.read(raw)).not.toThrow();a.declaredCount=null;expect(()=>f.request.read(raw)).toThrow();a.declaredCount=2;a.contextId='turn';expect(()=>f.request.read(raw)).toThrow()
})
it('cannot substitute the draw count for the once count in the same authentic source quote',()=>{const quote='Once during your turn, draw 2 cards.',f=fixture('La regola richiede uno.',2,quote),raw=f.pass();Object.assign(raw.targets.t0.annotations[0],{kind:'source',declaredCount:2,source:{id:'synthetic-rule',quote}});expect(()=>f.request.read(raw)).toThrow('numero affermato')})
it('represents an unproven quantity as a literal negative, never as a qualitative exemption or positive pass',()=>{
 const f=fixture('Il risultato dichiarato è 36.',3),raw=f.pass(),a=raw.targets.t0.annotations[0];Object.assign(a,{kind:'unproven',declaredCount:36});expect(()=>f.request.read(raw)).toThrow('negativo');raw.verdict='revise';raw.targets.t0.findings=[{quote:f.data.targets[0].text,reason:'Missing original numeric evidence.'}];expect(()=>f.request.read(raw)).not.toThrow();a.declaredCount=35;expect(()=>f.request.read(raw)).toThrow('negativo')
})
it('checks arithmetic results independently and accepts a grounded mismatch only as a negative requiring correction',()=>{
 const f=fixture('Il risultato dichiarato è 9.',3,'Value 3.'),raw=f.pass(),a=raw.targets.t0.annotations[0],leaf={kind:'source',quantity:null,measureId:null,contextId:null,source:{id:'synthetic-rule',quote:'Value 3.',value:3},resultIndex:null};Object.assign(a,{kind:'calculation',declaredCount:9,calculation:{steps:[{operation:'multiply',left:leaf,right:structuredClone(leaf)}]}});expect(()=>f.request.read(raw)).not.toThrow();a.calculation.steps[0].operation='add';expect(()=>f.request.read(raw)).toThrow('verdetto incompatibile');raw.verdict='revise';raw.targets.t0.findings=[{quote:f.data.targets[0].text,reason:'The grounded expression yields six, not nine.'}];expect(()=>f.request.read(raw)).not.toThrow()
})
it('requires exact whole-target findings and separates successful implicit checks from actual findings',()=>{
 const f=fixture('Una linea prudente conserva il pivot.',3),raw=f.pass();expect(()=>f.request.read(raw)).not.toThrow();raw.verdict='revise';raw.targets.t0.findings=[{quote:'Una linea […] pivot.',reason:'Abbreviated quote.'}];expect(()=>f.request.read(raw)).toThrow();expect(f.request.task).toContain('MAI conferme');expect(f.request.task).toContain('unproven')
})

it('binds official Prize excerpts in protocol4 and refuses altered evidence or an invented scalar',()=>{
 const f=fixture('Prende 3 Premi.',4),raw=f.pass(),source=f.data.gameRuleSources[2],a=raw.targets.t0.annotations[0];Object.assign(a,{kind:'source',declaredCount:3,source:{id:source.id,quote:JSON.parse(source.content).excerpt}});expect(()=>f.request.read(raw)).not.toThrow();a.declaredCount=2;expect(()=>f.request.read(raw)).toThrow();a.declaredCount=3;source.content+=' forged';expect(()=>f.request.read(raw)).toThrow('fonti Premi');
})
it.each(['Flip a coin. If heads, prevent damage.','Put a damage counter on that Pokémon.'])('authenticates a literal singular game unit without permitting a forged count: %s',quote=>{
 const f=fixture('La regola richiede 1.',4,quote),raw=f.pass(),a=raw.targets.t0.annotations[0]
 Object.assign(a,{kind:'source',declaredCount:1,source:{id:'synthetic-rule',quote}})
 expect(()=>f.request.read(raw)).not.toThrow()
 a.declaredCount=2;expect(()=>f.request.read(raw)).toThrow('diverso dal testo')
 const two=fixture('La regola richiede 2.',4,quote),forged=two.pass()
 Object.assign(forged.targets.t0.annotations[0],{kind:'source',declaredCount:2,source:{id:'synthetic-rule',quote}})
 expect(()=>two.request.read(forged)).toThrow('valore assente dalla citazione')
 a.declaredCount=1;a.source.quote='Flip a coin.'
 if(quote!=='Flip a coin. If heads, prevent damage.')expect(()=>f.request.read(raw)).toThrow('citazione originale')
})
