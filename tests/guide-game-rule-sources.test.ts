import {it,expect} from 'vitest'
import {guideGameRuleSources,isGuideGameRuleSource} from '../src/main/guide-game-rule-sources'
import {auditSourceQuantities} from '../src/main/guide-audit-source-quantities'
import {readAuditCalculation} from '../src/main/guide-audit-calculation'
import {guideSource,guideHash} from '../src/main/matchup-guide-packet'
import {hasGuideSourceQuote} from '../src/main/guide-source-quote'
const operand=(kind:string,fields:any)=>({kind,quantity:null,measureId:null,contextId:null,source:null,resultIndex:null,...fields})
it('adds an exact separately scoped zero-damage excerpt without modifying historical Prize or damage-order sources',()=>{
 const sources=guideGameRuleSources('2026-10-30'),source=sources.find(s=>s.id==='rules:damage:nonpositive')!,rule=JSON.parse(source.content)
 expect(sources.slice(0,3).map(s=>s.id)).toEqual(['rules:prizes:knock-out-1','rules:prizes:pokemon-ex-2','rules:prizes:mega-evolution-ex-3'])
 expect(rule.locator).toContain('F6');expect(rule.scope).toContain('neutral multiplier');expect(rule.evidenceType).toBe('verbatim-excerpt')
 expect(auditSourceQuantities(rule.excerpt)).toEqual([0]);expect(hasGuideSourceQuote(source.content,rule.excerpt)).toBe(true)
 expect(source.hash).toBe(guideHash(source.content));expect(isGuideGameRuleSource(source,'2026-10-30')).toBe(true)
 expect(isGuideGameRuleSource({...source,content:source.content+' altered'},'2026-10-30')).toBe(false)
 expect(guideGameRuleSources('2025-09-25')).toEqual([])
})
it('grounds the final maximum with zero while rejecting a zero invented from printed negative Resistance',()=>{
 const floor=guideGameRuleSources('2026-10-30').find(s=>s.id==='rules:damage:nonpositive')!,quote=JSON.parse(floor.content).excerpt,resistance=guideSource('synthetic-resistance','card','Synthetic printed Resistance',null,{resistance:'-30'})
 const data:any={packet:{sources:[floor,resistance]},context:{measures:[{id:'base',value:'10'}],windows:[],cards:[]},contextFacts:[]}
 const amount=operand('source',{source:{id:resistance.id,quote:'-30',value:30}}),zero=operand('source',{source:{id:floor.id,quote,value:0}})
 const proof={steps:[{operation:'subtract',left:operand('measure',{measureId:'base'}),right:amount},{operation:'maximum',left:operand('result',{resultIndex:0}),right:zero}]}
 expect(readAuditCalculation(proof,data,[])).toBe(0)
 proof.steps[1].right=operand('source',{source:{id:resistance.id,quote:'-30',value:0}});expect(()=>readAuditCalculation(proof,data,[])).toThrow('citazione numerica')
 proof.steps[1].right=zero;zero.source!.quote=quote.replace('0','1');expect(()=>readAuditCalculation(proof,data,[])).toThrow('citazione numerica')
})
