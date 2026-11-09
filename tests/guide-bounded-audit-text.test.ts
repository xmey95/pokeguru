import {it,expect} from 'vitest'
import {boundedAuditTextSchema,readBoundedAuditText,boundedAuditOutputCharacters,boundedAuditOutputUnits,BOUNDED_AUDIT_TEXT_INSTRUCTIONS} from '../src/main/guide-bounded-audit-text'
import {guideRequestOutputReservation} from '../src/main/guide-request-budget'
import {renderAuditNarrative,type AuditQuantityContext} from '../src/main/guide-audit-quantities'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {quantifiedAuditPatch} from '../src/main/guide-audit-repair'
import {auditLanguageInput} from '../src/main/guide-audit-language-review'
import {guideHash} from '../src/main/matchup-guide-packet'
import {auditText} from './fixtures/guide-audit'
const context:AuditQuantityContext={version:1,caseId:'case',opponentListId:'opponent',cards:[{side:'ours',printId:'p',name:'Porygon2',total:4},{side:'ours',printId:'e',name:'Synthetic Energy',total:4}],windows:[{id:'before-action',path:['setupRounds',0,'ours','events',0],lineId:'setup',turn:2,side:'ours',when:'before',balances:[{side:'ours',printId:'e',zone:'hand',count:2}],hosts:[],unknownAttachments:[]}],measures:[{id:'printed',label:'Printed cost',value:'1'}]}
const wire=(text:string)=>({text,parts:auditText(text)})
it('shares the 600 limit across complete text, fragments, instructions and the final reader',()=>{
 const schema=boundedAuditTextSchema(context)
 expect(schema.properties.text.maxLength).toBe(600);expect(schema.properties.parts.items.properties.text.anyOf[0].maxLength).toBe(600);expect(schema.properties.parts.maxItems).toBe(24)
 expect(BOUNDED_AUDIT_TEXT_INSTRUCTIONS).toContain('600');expect(BOUNDED_AUDIT_TEXT_INSTRUCTIONS).not.toMatch(/1000|1600/)
 expect(readBoundedAuditText(wire('x'.repeat(600)),context).text).toHaveLength(600)
 expect(()=>readBoundedAuditText(wire('x'.repeat(601)),context)).toThrow()
})
it('counts every expanded atom and prevents a short declared text from hiding an overlong expansion',()=>{
 const parts=[{text:null,quantity:null,card:{side:'ours',printId:'p'},measureId:null},...auditText('x'.repeat(592))],text=renderAuditNarrative(parts,context,600,undefined,3)
 expect(text.length).toBe(600);expect(readBoundedAuditText({text,parts},context).text).toBe(text)
 const longer=[...parts,auditText('x')[0]]
 expect(()=>readBoundedAuditText({text:'Short declaration',parts:longer},context)).toThrow('601 caratteri, limite 600')
})
it('requires exact correspondence and never rewrites, truncates or summarizes the source parts',()=>{
 const raw={text:'Short declaration',parts:auditText('A different explanation')},original=structuredClone(raw)
 expect(()=>readBoundedAuditText(raw,context)).toThrow('non coincide esattamente');expect(raw).toEqual(original)
 expect(()=>readBoundedAuditText({text:'Short',parts:[auditText('x'.repeat(400))[0],auditText('y'.repeat(400))[0]]},context)).toThrow('800 caratteri, limite 600')
})
it('keeps the original 24-part capacity independently of semantic-span controls',()=>{
 const parts=Array.from({length:24},()=>auditText('x')[0])
 expect(readBoundedAuditText({text:'x'.repeat(24),parts},context).parts).toHaveLength(24)
 expect(()=>readBoundedAuditText({text:'x'.repeat(25),parts:[...parts,auditText('x')[0]]},context)).toThrow()
})
it('retains the unchanged UTF-16 limit, including supplementary characters',()=>{
 expect(readBoundedAuditText(wire('😀'.repeat(300)),context).text.length).toBe(600)
 expect(()=>readBoundedAuditText(wire('😀'.repeat(300)+'x'),context)).toThrow('601 caratteri, limite 600')
})
it('retains quantity windows, counts and source binding even when the text is under 600',()=>{
 const part={text:null,quantity:{windowId:'before-action',side:'ours',printId:'e',zone:'hand',host:null,count:2},card:null,measureId:null},parts=[part],text=renderAuditNarrative(parts,context,600,undefined,3)
 expect(readBoundedAuditText({text,parts},context).text).toContain('2 copie')
 expect(()=>readBoundedAuditText({text,parts:[{...part,quantity:{...part.quantity,count:3}}]},context)).toThrow('ha 2 copie')
 expect(()=>readBoundedAuditText({text,parts},context,[])).toThrow('finestra non pertinente')
 expect(()=>readBoundedAuditText({text:'Foreign',parts:[{text:null,quantity:null,card:{side:'ours',printId:'foreign'},measureId:null}]},context)).toThrow()
})
it('preserves canonical parts and the 600 target in the independent semantic-review input',()=>{
 const data={auditNarrativeVersion:4,deliveryBounded:true,auditProtocol:3,quantityContext:context,quantityContextHash:guideHash(context),decisions:[],promotions:[],native:{body:{events:[]}},locationPath:['body'],auditCards:['p','e'],auditAttacks:[]},raw={decisions:{},tactical:{comparison:wire('Conditional synthetic comparison.'),promotions:{}}}
 const patch=quantifiedAuditPatch(data,raw)
 expect(patch.tactical?.comparison).toBe(raw.tactical.comparison.text);expect(patch.targets[0].maximum).toBe(600);expect(patch.targets[0].parts).toEqual(raw.tactical.comparison.parts)
 expect(auditLanguageInput(patch.targets,context)).toHaveLength(1)
 expect(()=>quantifiedAuditPatch(data,{...raw,tactical:{...raw.tactical,comparison:auditText('Downgrade')}})).toThrow()
})
it('reserves both representations and scales with actual reference sizes without changing the 600 limit',()=>{
 const small=boundedAuditOutputCharacters(context,1),full=boundedAuditOutputCharacters(context,17),large=structuredClone(context)
 large.cards[0].printId='long-reference-'.repeat(20)
 expect(small).toBeGreaterThan(2400);expect(full).toBeGreaterThan(small);expect(full).toBeLessThan(100000);expect(boundedAuditOutputCharacters(large,1)).toBeGreaterThan(small)
 expect(()=>boundedAuditOutputCharacters(context,18)).toThrow();expect(()=>boundedAuditOutputCharacters(context,0)).toThrow()
 assertNativeScenarioSchema(wire('Complete'),boundedAuditTextSchema(context))
})
it('converts all one-to-seventeen target layouts into the same existing planner character units without double expansion',()=>{
 for(let n=1;n<=17;n++){const chars=boundedAuditOutputCharacters(context,n),units=boundedAuditOutputUnits(context,n),budget=guideRequestOutputReservation('segments-finite-audits',[],units);expect(budget.estimatedResponseCharacters).toBeGreaterThanOrEqual(chars);expect(budget.estimatedResponseCharacters).toBeLessThanOrEqual(100000);expect(budget.reservedOutput).toBe(6000*units)}
 const large=structuredClone(context);large.cards[0].printId='very-long-reference'.repeat(60)
 expect(boundedAuditOutputUnits(large,17)).toBeGreaterThan(6)
})
