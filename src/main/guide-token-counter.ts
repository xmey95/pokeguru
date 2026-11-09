import {Tiktoken} from 'js-tiktoken/lite'
import o200k from 'js-tiktoken/ranks/o200k_base'

let encoder:Tiktoken|undefined,pattern:RegExp|undefined,standalone:RegExp|undefined
const pieces=new Map<string,{count:number;bytes:number}>();let bytes=0
/** Exact ordinary-token counting with the installed encoder's public rank
 * pattern. BPE pieces are independent; cache immutable piece counts only.
 * Calibration, permissions, budgets and approvals are never cached here. */
export function countGuideTokens(text:string):number{
 encoder??=new Tiktoken(o200k);pattern??=new RegExp(o200k.pat_str,'ug');standalone??=new RegExp(o200k.pat_str,'ug')
 let count=0,covered=0
 for(const match of text.matchAll(pattern)){
  const piece=match[0]
  if(match.index!==covered||!piece.length)return encoder.encode(text,[],[]).length
  covered+=piece.length
  const old=pieces.get(piece);if(old){count+=old.count;continue}
  // Confirm that the public encode(piece) call preserves this precise BPE
  // boundary. Any contextual/unsupported split falls back to full encoding.
  standalone.lastIndex=0;const first=standalone.exec(piece)
  if(!first||first.index!==0||first[0]!==piece||standalone.exec(piece)!==null)return encoder.encode(text,[],[]).length
  const n=encoder.encode(piece,[],[]).length;count+=n
  const size=piece.length*2+64
  if(piece.length>512)continue
  while(pieces.size&&(pieces.size>=16384||bytes+size>2*1024*1024)){const key=pieces.keys().next().value!,value=pieces.get(key)!;bytes-=value.bytes;pieces.delete(key)}
  // A flat UTF-16 copy prevents a tiny cache key from retaining a whole
  // request string and preserves even unpaired surrogate code units exactly.
  const key=Buffer.from(piece,'utf16le').toString('utf16le');pieces.set(key,{count:n,bytes:size});bytes+=size
 }
 return covered===text.length?count:encoder.encode(text,[],[]).length
}
