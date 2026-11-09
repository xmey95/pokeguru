import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {shareGuideDataText} from '../src/main/guide-wire-text-sharing'
import {packGuideDataV3,packGuideDataV4,pruneGuideDataDictionary,reorderGuideDataReferences,unpackGuideDataV3,GUIDE_WIRE_V3_INSTRUCTIONS,GUIDE_WIRE_V4_INSTRUCTIONS} from '../src/main/guide-wire-dense'
import {planGuideRequest,localGuideTokens,unpackGuideData} from '../src/main/guide-request-budget'

const prefix='Original source and complete physical conditions remain available. No quantity, resource or consequence is omitted. '
const suffix=' Preserve every condition and original source identity, including Pokémon 🐦 and whitespace.\n'
const fixture=()=>({rows:Array.from({length:80},(_,i)=>({id:'independent-'+i,text:prefix+'The independent decision is '+i+'.'+suffix})),literals:[['+',prefix+'literal'+suffix],['^0',0,-4],['?',-2],['!',1],-3],source:JSON.stringify({text:prefix+'Original JSON "quote"'+suffix,count:12}),conditions:'  '+prefix+'different'+suffix+'  '})
it('shares repeated literal fragments while preserving all fields, Unicode, source JSON, escapes and property order',()=>{
 const data=fixture(),original=JSON.stringify(data),encoded:any=packGuideDataV4(data),before=JSON.stringify(encoded),shared:any=shareGuideDataText(encoded)
 expect(JSON.stringify(unpackGuideDataV3(shared))).toBe(original)
 expect(JSON.stringify(unpackGuideDataV3(reorderGuideDataReferences(pruneGuideDataDictionary(shared))))).toBe(original)
 expect(shared.encoding).toBe(encoded.encoding);expect(shared.expandedHash).toBe(encoded.expandedHash)
 expect(JSON.stringify(shared).length).toBeLessThan(before.length)
 expect(JSON.stringify(data)).toBe(original);expect(JSON.stringify(encoded)).toBe(before)
})
it('rejects forged hashes, missing originals and other encodings before sharing any text',()=>{
 const encoded:any=packGuideDataV4(fixture()),bad=structuredClone(encoded);bad.expandedHash='forged'
 expect(()=>shareGuideDataText(bad)).toThrow('Hash')
 const missing=structuredClone(encoded);missing.root=-999999
 expect(()=>shareGuideDataText(missing)).toThrow('assente')
 expect(()=>shareGuideDataText(packGuideDataV3(fixture()))).toThrow('soltanto per dati v4')
})
it('uses the existing v4 grammar only after a token stop, keeping calibration, reserves and complete context',()=>{
 const data=fixture(),instructions='Keep every original condition.',schema={},legacy=[] as number[]
 legacy.push(planGuideRequest('prose-finite-units',instructions,data,schema,[{family:'prose',visibleTokens:1,inputTokens:1000,outputTokens:1000}],16,3,1,false,true,true,false).budget.visibleTokens)
 for(const version of [3,4])for(const deltas of [true,false]){
  const encoded=version===3?packGuideDataV3(data,8,deltas):packGuideDataV4(data,8,deltas)
  for(const wire of [encoded,reorderGuideDataReferences(encoded),reorderGuideDataReferences(pruneGuideDataDictionary(encoded))])legacy.push(localGuideTokens(instructions+'\n'+(version===3?GUIDE_WIRE_V3_INSTRUCTIONS:GUIDE_WIRE_V4_INSTRUCTIONS)+'\n\nDATI CONGELATI:\n'+JSON.stringify(wire))+localGuideTokens(JSON.stringify(schema)))
 }
 const samples=[{family:'prose' as const,visibleTokens:1000,inputTokens:Math.ceil((128500-2048)/Math.min(...legacy)*1000/1.1),outputTokens:1000}],plan=planGuideRequest('prose-finite-units',instructions,data,schema,samples,16,3,1,false,true,true,true)
 expect(plan.budget.fits).toBe(true);expect(plan.budget.encoding).toBe('shared-v4');expect(unpackGuideData(plan.data)).toEqual(data)
 expect(plan.budget.reservedCalls).toBe(3);expect(plan.budget.remainingCalls).toBe(16)
 expect(plan.budget.calibrationFactor).toBe(Math.max(1.12,samples[0].inputTokens/1000*1.1))
 const small={original:'Preserve an already admissible prompt.'},legacyPlan=planGuideRequest('prose-finite-units',instructions,small,schema,[],16,3)
 expect(planGuideRequest('prose-finite-units',instructions,small,schema,[],16,3,1,false,true,true,true)).toEqual(legacyPlan)
})
it('leaves an incompressible token stop and an exhausted call authority closed',()=>{
 const data={sources:Array.from({length:200},(_,i)=>createHash('sha256').update('Independent source '+i).digest('hex'))},samples=[{family:'prose' as const,visibleTokens:1,inputTokens:1000,outputTokens:1000}],before=JSON.stringify(data)
 const plan=planGuideRequest('prose-finite-units','Preserve originals.',data,{},samples,16,3,1,false,true,true,true)
 expect(plan.budget.fits).toBe(false);expect(plan.budget.estimatedInput).toBeGreaterThan(128000);expect(unpackGuideData(plan.data)).toEqual(data)
 expect(planGuideRequest('prose-finite-units','Preserve originals.',fixture(),{},[],3,3,1,false,true,true,true).budget.fits).toBe(false)
 expect(JSON.stringify(data)).toBe(before)
})
