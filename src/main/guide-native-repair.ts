import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export interface NativeRepairCase {id:string;baseHash:string;scopeHash:string;native:Record<string,any>}
export function nativeRepairCase(native:Record<string,any>,scopeHash=''):NativeRepairCase{return {id:native.id,baseHash:digest({scopeHash,native}),scopeHash,native:structuredClone(native)}}
/** Resolve the validator's field path to its exact schema constraints. This is
 * feedback only: it never truncates, coerces or otherwise changes an AI value. */
export function nativeRepairConstraint(schema:any,path:string):unknown[]{
 const parts=path.replace(/^output\.?/,'').replace(/\[(\d+)\]/g,'.$1').split('.').filter(Boolean)
 const visit=(node:any,index:number):any[]=>{
  if(!node||typeof node!=='object')return []
  if(node.anyOf)return node.anyOf.flatMap((n:any)=>visit(n,index))
  if(index===parts.length)return [structuredClone(node)]
  return visit(/^\d+$/.test(parts[index])?node.items:node.properties?.[parts[index]],index+1)
 }
 return visit(schema,0)
}
export function nativeRepairSchema(cases:NativeRepairCase[],claimsSchema:object,requireChanges=false):object{
 const string={type:'string',minLength:1,maxLength:100000},object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
 return object({cases:{type:'array',minItems:cases.length,maxItems:cases.length,items:cases.length?{anyOf:cases.map(c=>object({id:{type:'string',const:c.id},baseHash:{type:'string',const:c.baseHash},operations:{type:'array',...requireChanges?{minItems:1}:{},maxItems:120,items:object({op:{type:'string',enum:['replace','add','remove']},path:{...string,maxLength:1000,pattern:'^/'},valueJson:string})}}))}:object({})},claims:claimsSchema,changeSummary:{...string,maxLength:5000}})
}
/** Atomic, hash-bound editing of AI declarations only. No derived state is
 * patched and no missing move, resource, proof or reason is inferred. */
export function applyNativeRepair(raw:any,cases:NativeRepairCase[],requireChanges=false):Record<string,any>[]{
 if(!raw||!Array.isArray(raw.cases)||raw.cases.length!==cases.length||new Set(raw.cases.map((c:any)=>c.id)).size!==cases.length)throw new Error('Riparazione: servono esattamente i casi assegnati, senza duplicati.')
 const result=[]
 for(const change of raw.cases){
  const base=cases.find(c=>c.id===change.id)
  if(!base||change.baseHash!==base.baseHash||digest({scopeHash:base.scopeHash,native:base.native})!==base.baseHash)throw new Error('Riparazione: hash o caso di partenza diverso; nessuna modifica applicata.')
  const native=structuredClone(base.native)
  if(!Array.isArray(change.operations)||change.operations.length>120)throw new Error('Riparazione: operazioni non valide.')
  for(const op of change.operations){
   if(!op||!['replace','add','remove'].includes(op.op)||typeof op.path!=='string'||!op.path.startsWith('/')||op.path.length>1000||typeof op.valueJson!=='string'||op.valueJson.length>100000)throw new Error('Riparazione: operazione non valida.')
   const path=op.path.slice(1).split('/').map((p:string)=>{if(/~(?![01])/.test(p))throw new Error('Riparazione: escape del percorso non valido.');return p.replace(/~1/g,'/').replace(/~0/g,'~')})
   if(['id','opponentListId','opening'].includes(path[0])||path.some((p:string)=>['__proto__','prototype','constructor'].includes(p)))throw new Error('Riparazione: identità, lista, opening e proprietà pericolose non modificabili.')
   let parent:any=native
   for(const key of path.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))throw new Error('Riparazione: percorso intermedio assente.');parent=parent[key]}
   const key=path.at(-1)!
   if(!parent||typeof parent!=='object')throw new Error('Riparazione: destinazione non strutturata.')
   let value:any;try{value=JSON.parse(op.valueJson)}catch{throw new Error('Riparazione: valueJson non è JSON valido.')}
   if(op.op==='remove'&&value!==null)throw new Error('Riparazione: remove richiede valueJson="null".')
   if(Array.isArray(parent)){
    const index=key==='-'&&op.op==='add'?parent.length:/^(0|[1-9]\d*)$/.test(key)?Number(key):-1
    if(!Number.isSafeInteger(index)||index<0||index>(op.op==='add'?parent.length:parent.length-1))throw new Error('Riparazione: indice array assente o fuori limite.')
    if(op.op==='add')parent.splice(index,0,value);else if(op.op==='remove')parent.splice(index,1);else parent[index]=value
   }else{
    const exists=Object.hasOwn(parent,key)
    if(op.op==='add'?exists:!exists)throw new Error('Riparazione: proprietà già presente per add o assente per replace/remove.')
    if(op.op==='remove')delete parent[key];else Object.defineProperty(parent,key,{value,writable:true,enumerable:true,configurable:true})
   }
  }
  if(requireChanges&&isDeepStrictEqual(native,base.native))throw new Error(`RIPARAZIONE SENZA MODIFICHE: ${base.id}. Le operazioni devono modificare realmente il caso assegnato e risolvere i rilievi; nessun candidato salvato.`)
  result.push(native)
 }
 return result
}

/** Revalidate parsed cache results too; changing only the repair summary or
 * object-key order cannot turn an unchanged scenario into a completed repair. */
export function assertRepairCaseProgress(before:readonly {id:string}[],after:unknown,ids:readonly string[]):void{
 if(!Array.isArray(after))throw new Error('RIPARAZIONE SENZA MODIFICHE: casi riparati mancanti.')
 for(const id of ids){const original=before.find(c=>c.id===id),updated=after.find(c=>c?.id===id)
  if(!original||!updated||isDeepStrictEqual(original,updated))throw new Error(`RIPARAZIONE SENZA MODIFICHE: ${id}. Il caso assegnato deve essere corretto prima del nuovo riesame.`)
 }
}
