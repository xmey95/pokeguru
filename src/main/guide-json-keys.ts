import {createHash} from 'node:crypto'

/** Invocation-local keys for a PRIVATE, immutable JSON tree. Large subtree
 * strings must not all stay resident in encoder frequency/index maps. The
 * codecs still authenticate and byte-compare the complete final expansion. */
export function createGuideJsonKeys(){
 const objects=new WeakMap<object,{key:string;length:number}>()
 return (value:unknown)=>{
  if(value!==null&&typeof value==='object'){const known=objects.get(value);if(known)return known}
  const json=JSON.stringify(value),result={key:json.length<=128?'s'+json:'h'+createHash('sha256').update(json).digest('hex'),length:json.length}
  if(value!==null&&typeof value==='object')objects.set(value,result)
  return result
 }
}
