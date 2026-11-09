import {expect,it} from 'vitest'
import {compactGuideSchema,guideSchemaStats,assertGuideSchemaBudget,shortGuideSchemaRefs} from '../src/main/guide-schema-encoding'

export function expandSchema(schema:any):any{
  const expand=(value:any):any=>{
    if(Array.isArray(value))return value.map(expand)
    if(!value||typeof value!=='object')return value
    if(value.$ref)return expand(schema.$defs[value.$ref.split('/').at(-1)])
    return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='$defs').map(([k,v])=>[k,expand(v)]))
  }
  return expand(schema)
}

it('rejects an unrequired derived property in the actual shared transport schema before a provider call',()=>{
 const node={type:'object',properties:{id:{type:'string'},replyTurn:{type:'integer'}},required:['id'],additionalProperties:false}
 const shared=compactGuideSchema({type:'object',additionalProperties:false,properties:{left:node,right:node},required:['left','right']})
 expect(()=>assertGuideSchemaBudget(shared)).toThrow('trasporto strict')
 node.required.push('replyTurn')
 expect(()=>assertGuideSchemaBudget(compactGuideSchema({type:'object',additionalProperties:false,properties:{left:node,right:node},required:['left','right']}))).not.toThrow()
})

it('preserves the exact schema after resolving shared definitions, including enums, branches and limits',()=>{
  const leaf={type:'string',enum:Array.from({length:150},(_,i)=>`card-${i}`)},properties=Object.fromEntries(Array.from({length:12},(_,i)=>['field'+i,{type:'array',maxItems:5,items:leaf}]))
  const raw={type:'object',additionalProperties:false,properties,required:Object.keys(properties)}
  expect(()=>assertGuideSchemaBudget(raw)).toThrow('Nessun vincolo rimosso')
  const encoded=compactGuideSchema(raw)
  expect(expandSchema(encoded)).toEqual(raw)
  expect(assertGuideSchemaBudget(encoded).enumValues).toBe(150)
  expect(compactGuideSchema(encoded)).toEqual(encoded)
  expect(guideSchemaStats(encoded).bytes).toBeLessThan(guideSchemaStats(raw).bytes)
})

it('keeps all nested constraints and independent mutable copies while traversing a large repeated tree',()=>{
  const leaf={type:'object',properties:{kind:{type:'string',enum:['cost','damage','condition']},details:{type:'string',minLength:1,maxLength:4000}},required:['kind','details'],additionalProperties:false,description:'Nested conditions and exact source constraints remain present.'}
  const branch={type:'array',maxItems:8,items:{anyOf:[leaf,{type:'null'}]}},raw={type:'object',properties:Object.fromEntries(Array.from({length:36},(_,i)=>['line-'+i,branch])),required:['line-0'],additionalProperties:false,examples:[{nested:{value:['keep',1]}}]}
  const snapshot=JSON.stringify(raw),encoded=compactGuideSchema(raw),short=shortGuideSchemaRefs(encoded)
  expect(expandSchema(encoded)).toEqual(raw);expect(expandSchema(short)).toEqual(raw)
  expect(guideSchemaStats(short).bytes).toBeLessThan(guideSchemaStats(raw).bytes/3)
  const copy=compactGuideSchema(encoded) as any
  copy.examples[0].nested.value.push('only output');copy.required.push('only output')
  expect(JSON.stringify(raw)).toBe(snapshot)
  expect((encoded as any).examples[0].nested.value).toEqual(['keep',1])
})
