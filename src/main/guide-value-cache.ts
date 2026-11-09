import {createHash} from 'node:crypto'

// Process-local results of pure JSON computations only. Never persist a pass,
// a critic verdict or an archive-chain decision here. Every cold key runs the
// original computation; errors are never cached. Full inputs, not claimed IDs
// or dependency hashes, identify entries.
const maximumBytes=16*1024*1024,maximumEntries=256
const values=new Map<string,{json:string;bytes:number}>()
let bytes=0
function plainJson(value:unknown,path=new WeakSet<object>()):boolean{
  if(value===null||typeof value==='string'||typeof value==='boolean')return true
  if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0)
  if(typeof value!=='object'||path.has(value)||Object.getOwnPropertySymbols(value).length)return false
  if(Array.isArray(value)){
    if(Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertyNames(value).length!==value.length+1)return false
    path.add(value)
    try{for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!('value'in d)||!plainJson(d.value,path))return false}return true}finally{path.delete(value)}
  }
  if(Object.getPrototypeOf(value)!==Object.prototype)return false
  path.add(value)
  try{for(const key of Object.getOwnPropertyNames(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(!d.enumerable||!('value'in d)||!plainJson(d.value,path))return false}return true}finally{path.delete(value)}
}
export function memoGuideJson<T>(namespace:string,input:unknown,compute:()=>T):T{
  // JSON.stringify alone loses undefined/NaN/holes/prototype distinctions.
  // Such values bypass caching and still face the original validators.
  if(!plainJson(input))return compute()
  const key=namespace+':'+createHash('sha256').update(JSON.stringify(input)).digest('hex'),prior=values.get(key)
  if(prior){values.delete(key);values.set(key,prior);return JSON.parse(prior.json) as T}
  const value=compute()
  if(!plainJson(value))return value
  const json=JSON.stringify(value),size=Buffer.byteLength(json)+Buffer.byteLength(key)
  if(size>maximumBytes)return value
  while(values.size>=maximumEntries||bytes+size>maximumBytes){const oldest=values.keys().next().value!,removed=values.get(oldest)!;values.delete(oldest);bytes-=removed.bytes}
  values.set(key,{json,bytes:size});bytes+=size
  return value
}
