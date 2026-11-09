import { createHash } from 'node:crypto'
import {memoGuideJson} from './guide-value-cache'

type Schema=Record<string,any>
const childMaps=['properties','$defs'],childNodes=['items','additionalProperties'],childArrays=['anyOf','oneOf','allOf']
const schemaKeys=new Set([...childMaps,...childNodes,...childArrays])
const eachChild=(s:Schema,visit:(s:Schema)=>void):void=>{
  for(const key of childMaps)if(s[key])for(const node of Object.values(s[key]))visit(node as Schema)
  for(const key of childNodes)if(s[key]&&typeof s[key]==='object')visit(s[key])
  for(const key of childArrays)if(Array.isArray(s[key]))s[key].forEach(visit)
}
const children=(s:Schema,visit:(s:Schema)=>Schema):Schema=>{
  // Clone each leaf once. Deep-cloning the entire remaining subtree at every
  // node made larger witness schemas spend minutes copying the same graph.
  const out=Object.fromEntries(Object.entries(s).map(([k,v])=>[k,schemaKeys.has(k)?v:structuredClone(v)]))
  for(const key of childMaps)if(s[key])out[key]=Object.fromEntries(Object.entries(s[key]).map(([k,v])=>[k,visit(v as Schema)]))
  for(const key of childNodes)if(s[key]&&typeof s[key]==='object')out[key]=visit(s[key])
  for(const key of childArrays)if(Array.isArray(s[key]))out[key]=s[key].map(visit)
  return out
}

/** Lossless encoding of repeated schema nodes. No enum, required field, limit,
 * branch or card/source binding is removed. Payload schemas stay in the archive. */
export function compactGuideSchema(schema:object):object{
  return memoGuideJson('compact-schema-v1',schema,()=>compactGuideSchemaUncached(schema))
}
function compactGuideSchemaUncached(schema:object):object{
  const root=schema as Schema
  if(root.$defs)return structuredClone(root)
  const counts=new Map<string,number>(),defs:Schema={},names=new Map<string,string>()
  const count=(node:Schema):void=>{const signature=JSON.stringify(node);counts.set(signature,(counts.get(signature)??0)+1);eachChild(node,count)}
  count(root)
  const build=(node:Schema,isRoot=false):Schema=>{
    const signature=JSON.stringify(node)
    if(!isRoot&&(counts.get(signature)??0)>1&&(signature.length>=70||Array.isArray(node.enum))){
      let name=names.get(signature)
      if(!name){name='s'+createHash('sha256').update(signature).digest('hex').slice(0,20);names.set(signature,name);defs[name]=children(node,n=>build(n))}
      return {$ref:`#/$defs/${name}`}
    }
    return children(node,n=>build(n))
  }
  const result=build(root,true)
  return Object.keys(defs).length?{...result,$defs:defs}:result
}

/** Alpha-renaming of root $defs only; constraints, data literals and external
 * references are unchanged. Short names avoid repeatedly tokenizing hashes. */
export function shortGuideSchemaRefs(schema:object):object{
 return memoGuideJson('short-schema-refs-v1',schema,()=>shortGuideSchemaRefsUncached(schema))
}
function shortGuideSchemaRefsUncached(schema:object):object{
 const root=schema as Schema
 if(!root.$defs)return structuredClone(root)
 const names=new Map(Object.keys(root.$defs).map((name,i)=>[name,'d'+i.toString(36)])),refs=new Map([...names].map(([name,alias])=>['#/$defs/'+name.replaceAll('~','~0').replaceAll('/','~1'),'#/$defs/'+alias]))
 const visit=(node:Schema):Schema=>{const result=children(node,visit);if(typeof node.$ref==='string'&&refs.has(node.$ref))result.$ref=refs.get(node.$ref);return result}
 const result=visit(root);result.$defs=Object.fromEntries(Object.entries(result.$defs).map(([name,node])=>[names.get(name)!,node]));return result
}

export function guideSchemaStats(schema:object){
  let properties=0,enumValues=0,stringCharacters=0
  const walk=(s:Schema):void=>{
    if(s.properties){properties+=Object.keys(s.properties).length;stringCharacters+=Object.keys(s.properties).join('').length}
    if(s.$defs)stringCharacters+=Object.keys(s.$defs).join('').length
    if(Array.isArray(s.enum)){enumValues+=s.enum.length;stringCharacters+=s.enum.filter((v:unknown)=>typeof v==='string').join('').length}
    if(typeof s.const==='string')stringCharacters+=s.const.length
    eachChild(s,walk)
  }
  walk(schema)
  return {bytes:Buffer.byteLength(JSON.stringify(schema)),properties,enumValues,stringCharacters}
}

export function assertGuideSchemaBudget(schema:object){
  const stats=guideSchemaStats(schema)
  if(stats.properties>5000||stats.enumValues>1000||stats.stringCharacters>120000)throw new Error(`Schema guida oltre i limiti locali: ${JSON.stringify(stats)}. Nessun vincolo rimosso e nessuna chiamata inviata.`)
  const strict=(node:Schema):void=>{
    if(node.type==='object'&&node.properties){
      const fields=Object.keys(node.properties),required=node.required
      if(node.additionalProperties!==false||!Array.isArray(required)||new Set(required).size!==required.length||required.length!==fields.length||fields.some(k=>!required.includes(k)))throw new Error('Schema guida non compatibile con il trasporto strict: properties/required/additionalProperties non allineati. Nessuna chiamata inviata.')
    }
    eachChild(node,strict)
  }
  strict(schema)
  return stats
}
