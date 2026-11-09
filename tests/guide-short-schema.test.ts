import {it,expect} from 'vitest'
import {compactGuideSchema,shortGuideSchemaRefs,guideSchemaStats} from '../src/main/guide-schema-encoding'
function expand(schema:any):any{
 const visit=(v:any):any=>{if(Array.isArray(v))return v.map(visit);if(!v||typeof v!=='object')return v;if(v.$ref?.startsWith('#/$defs/'))return visit(schema.$defs[v.$ref.slice(8).replaceAll('~1','/').replaceAll('~0','~')]);return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='$defs').map(([k,x])=>[k,visit(x)]))};return visit(schema)
}
it('preserves every expanded constraint while shortening repeated definition references',()=>{
 const card={type:'string',enum:['foreign-a','foreign-b']},raw={type:'object',properties:Object.fromEntries(Array.from({length:18},(_,i)=>['field'+i,{type:'array',minItems:1,maxItems:5,items:card}])),additionalProperties:false,required:['field0']},compact=compactGuideSchema(raw),before=JSON.stringify(compact),short=shortGuideSchemaRefs(compact)
 expect(expand(short)).toEqual(raw);expect(expand(short)).toEqual(expand(compact));expect(JSON.stringify(compact)).toBe(before);expect(shortGuideSchemaRefs(short)).toEqual(short);expect(guideSchemaStats(short).bytes).toBeLessThan(guideSchemaStats(compact).bytes)
})
it('keeps literal $ref payloads, escaped definition names, external refs and source metadata intact',()=>{
 const raw={$defs:{'foreign/name':{type:'integer',minimum:1,maximum:9}},type:'object',properties:{number:{$ref:'#/$defs/foreign~1name'},literal:{const:{$ref:'#/$defs/foreign~1name'}},external:{$ref:'https://example.invalid/schema#/$defs/foreign~1name'},text:{type:'string',description:'Keep #/$defs/foreign~1name literally'}}},short:any=shortGuideSchemaRefs(raw)
 expect(short.properties.number.$ref).toBe('#/$defs/d0');expect(short.$defs.d0).toEqual(raw.$defs['foreign/name']);expect(short.properties.literal).toEqual(raw.properties.literal);expect(short.properties.external).toEqual(raw.properties.external);expect(short.properties.text).toEqual(raw.properties.text)
})
