import {it,expect} from 'vitest'
import {auditArithmeticEvidence} from '../src/main/guide-audit-arithmetic-evidence'
import {readAuditCalculation} from '../src/main/guide-audit-calculation'
import {auditLanguageRequest} from '../src/main/guide-audit-language-review'
import {guideGameRuleSources,isGuideGameRuleSource} from '../src/main/guide-game-rule-sources'
import {auditText,auditLanguagePass} from './fixtures/guide-audit'
import {segmentFixture} from './fixtures/guide-segment'

function fixture(){
 const packet:any=segmentFixture().packet;packet.basis.asOf='2026-10-30'
 const cards=['a','b','c'].map(printId=>({side:'ours',printId,name:printId,total:4}))
 const context:any={version:1,caseId:'independent',opponentListId:'other',cards,windows:[{id:'before',lineId:'setup',turn:2,side:'ours',when:'before',path:['events',0],balances:cards.map((c,i)=>({side:c.side,printId:c.printId,zone:'prizes',count:i+1})),hosts:[],unknownAttachments:[]}],measures:[{id:'attack-damage',label:'Independent printed attack damage',value:'40'},{id:'other',label:'Unrelated measure',value:'70'},{id:'zero',label:'Zero',value:'0'},{id:'formula',label:'Printed formula',value:'40+'}]}
 const target={id:'independent-audit',text:'Restano 6 Premi.',parts:auditText('Restano 6 Premi.'),allowedWindows:['before'],maximum:600,anchorHash:'independent'}
 const runtime:any={packet,scope:{projectId:'test',jobId:'test',configHash:'test',dependencyHash:'test'},archive:{values:()=>[]}}
 return {context,packet,target,runtime}
}
it('supplies complete heterogeneous zone sums using the existing eight-step calculation contract',()=>{
 const f=fixture(),before=JSON.stringify(f.context),proof=auditArithmeticEvidence([{key:'t0',allowedWindows:['before'],spans:[{value:6}]}],f.context,[],f.packet)[0].aggregates[0]
 expect(proof).toMatchObject({side:'ours',zone:'prizes',windowId:'before',value:6,completeZoneTotal:true});expect(proof.calculation.steps).toHaveLength(2)
 expect(readAuditCalculation(proof.calculation,{...f,contextFacts:[]},['before'])).toBe(6);expect(JSON.stringify(f.context)).toBe(before)
})
it('keeps side, zone and decision window separate and never pools their matching partial counts',()=>{
 const f=fixture();f.context.windows[0].balances.push({side:'opponent',printId:'a',zone:'prizes',count:6},{side:'ours',printId:'a',zone:'hand',count:6});f.context.windows.push({...structuredClone(f.context.windows[0]),id:'future'})
 const evidence=auditArithmeticEvidence([{key:'t',allowedWindows:['before'],spans:[{value:6}]}],f.context,[],f.packet)[0]
 expect(evidence.aggregates).toHaveLength(1);const proof=evidence.aggregates[0].calculation
 expect(()=>readAuditCalculation(proof,{...f,contextFacts:[]},['future'])).toThrow('finestra');proof.steps[0].left.quantity.count=4;expect(()=>readAuditCalculation(proof,{...f,contextFacts:[]},['before'])).toThrow('ha 1 copie')
})
it('does not certify partial sums or bypass the eight-step bound',()=>{
 const f=fixture(),e=(value:number)=>auditArithmeticEvidence([{key:'t',allowedWindows:['before'],spans:[{value}]}],f.context,[],f.packet)[0]
 expect(e(3).aggregates).toEqual([])
 f.context.cards=Array.from({length:10},(_,i)=>({side:'ours',printId:String(i),name:String(i),total:1}));f.context.windows[0].balances=f.context.cards.map((c:any)=>({side:c.side,printId:c.printId,zone:'deck',count:1}));expect(e(10).aggregates).toEqual([])
 f.context.windows[0].balances.pop();expect(e(9).aggregates[0].calculation.steps).toHaveLength(8)
})
it('offers the neutral arithmetic identity from an exact positive measure mentioned in the target, never inventory or an unresolved printed formula',()=>{
 const f=fixture(),e=(values:number[])=>auditArithmeticEvidence([{key:'t',allowedWindows:['before'],spans:values.map(value=>({value}))}],f.context,[],f.packet)[0]
 expect(e([1]).identities).toEqual([]);expect(e([40]).identities).toEqual([])
 const witness=e([40,1]).identities;expect(witness).toHaveLength(1);expect(witness[0]).toMatchObject({value:1,measureId:'attack-damage',arithmeticOnly:true});expect(witness[0].calculation.steps[0].operation).toBe('divide')
})
it('makes arithmetic witnesses available to the critic, retaining count mismatches and literal negative verdicts',()=>{
 const f=fixture(),request=auditLanguageRequest([f.target],f.context,[],f.runtime,24),data:any=request.data,raw=auditLanguagePass(data),a=raw.targets.t0.annotations[0]
 expect(data.arithmeticEvidence[0].aggregates).toHaveLength(1);expect(request.task).toContain('TUTTI i saldi');expect(request.task).toContain('NON pass')
 Object.assign(a,{kind:'calculation',declaredCount:6,calculation:data.arithmeticEvidence[0].aggregates[0].calculation});expect(()=>request.read(raw)).not.toThrow()
 a.calculation.steps[1].operation='subtract';expect(()=>request.read(raw)).toThrow('verdetto incompatibile')
 Object.assign(a,{kind:'unproven',calculation:null});raw.verdict='revise';raw.targets.t0.findings=[{quote:f.target.text,reason:'The arithmetic total does not establish applicability of the claimed effect.'}];expect(request.read(raw).verdict).toBe('revise')
})
it('verifies a neutral identity without turning missing applicability into an automatic positive review',()=>{
 const f=fixture();f.target.text='Danno 40 ×1.';f.target.parts=auditText(f.target.text)
 const request=auditLanguageRequest([f.target],f.context,[],f.runtime,24),data:any=request.data,raw=auditLanguagePass(data)
 for(const a of raw.targets.t0.annotations){const span=data.targets[0].spans.find((s:any)=>s.id===a.spanId);Object.assign(a,span.value===40?{kind:'measure',declaredCount:40,measureId:'attack-damage'}:{kind:'calculation',declaredCount:1,calculation:data.arithmeticEvidence[0].identities[0].calculation})}
 expect(()=>request.read(raw)).not.toThrow();expect(request.task).toContain('non dimostra assenza di modificatori')
 raw.verdict='revise';raw.targets.t0.findings=[{quote:f.target.text,reason:'A relevant effect still changes damage; the identity alone does not justify a neutral factor.'}];expect(request.read(raw).verdict).toBe('revise')
})
it('authenticates the separate sourced damage paraphrase, without treating its prose as a printed scalar',()=>{
 const f=fixture(),rules=guideGameRuleSources(f.packet.basis.asOf),damage=rules.find(s=>s.id==='rules:damage:calculation-order')!,content=JSON.parse(damage.content)
 expect(rules).toHaveLength(5);expect(content.evidenceType).toBe('curated-paraphrase');expect(content.summary).toContain('only when it matches');expect(content.scope).toContain('Does not prove');expect(isGuideGameRuleSource(damage,'2025-09-25')).toBe(false)
 const request=auditLanguageRequest([f.target],f.context,[],f.runtime,24),data:any=request.data;data.gameRuleSources.at(-1).content+=' forged';expect(()=>request.read(auditLanguagePass(data))).toThrow('non autentiche')
})
