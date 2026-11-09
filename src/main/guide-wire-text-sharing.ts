import {unpackGuideDataV3} from './guide-wire-dense'

/** Share literal text fragments with the existing v4 concatenation grammar.
 * This is an optional last sizing attempt, never a summary or a source edit. */
export function shareGuideDataText(value:any):unknown{
 if(value?.encoding!=='pg-json-dag-4')throw Error('Condivisione del testo disponibile soltanto per dati v4.')
 const original=JSON.stringify(unpackGuideDataV3(value)),strings=new Set<string>()
 const visit=(v:any):void=>{if(typeof v==='string'&&v.length>=40)strings.add(v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit)}
 visit(value.root);value.dictionary.forEach(visit)
 const candidates=new Set<string>()
 const find=(rows:string[],reverse:boolean)=>{rows.sort();for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];let n=0;while(n<a.length&&n<b.length&&a[n]===b[n])n++;if(n>=32)candidates.add(reverse?a.slice(0,n).split('').reverse().join(''):a.slice(0,n))}}
 find([...strings],false);find([...strings].map(s=>s.split('').reverse().join('')),true)
 const ranked=[...candidates].map(text=>({text,count:[...strings].filter(s=>s.includes(text)).length})).filter(v=>v.count>=2).sort((a,b)=>(b.text.length-12)*(b.count-1)-(a.text.length-12)*(a.count-1))
 const fragments:string[]=[];for(const r of ranked)if(!fragments.some(f=>f.includes(r.text)))fragments.push(r.text)
 const pieces=(s:string):(string|{fragment:string})[]=>{
  const out:(string|{fragment:string})[]=[];let rest=s
  for(;;){let best=-1,fragment:string|undefined
   for(const f of fragments){const i=rest.indexOf(f);if(i>=0&&(best<0||i<best||i===best&&f.length>fragment!.length)){best=i;fragment=f}}
   if(best<0){if(rest)out.push(rest);break}
   if(best)out.push(rest.slice(0,best));out.push({fragment:fragment!});rest=rest.slice(best+fragment!.length)
  }
  return out
 }
 const dictionary=[...value.dictionary],ids=new Map<string,number>(),ref=(s:string)=>{if(!ids.has(s)){ids.set(s,dictionary.length);dictionary.push(s)}return -ids.get(s)!-1}
 const transform=(v:any):any=>{
  if(typeof v==='string'&&v.length>=40){const p=pieces(v);if(!p.some(p=>typeof p!=='string'))return v;const out=p.map(p=>typeof p==='string'?p:ref(p.fragment));return out.length===1?out[0]:['+',...out]}
  if(Array.isArray(v)){
   // Syntax tokens, literal-array escapes and delta-base identifiers retain
   // their role. Only the represented values can be shared as literal text.
   const start=typeof v[0]==='string'&&(['!','?','+','='].includes(v[0])||/^\^\d+$/.test(v[0]))?1:0
   return [...v.slice(0,start),...v.slice(start).map(transform)]
  }
  return v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,transform(x)])):v
 }
 const root=transform(value.root)
 // Newly appended definitions are literal strings, never transformed again:
 // this cannot introduce self references or a cycle of fragment definitions.
 for(let i=0;i<value.dictionary.length;i++)dictionary[i]=transform(value.dictionary[i])
 const result={...value,root,dictionary}
 if(JSON.stringify(unpackGuideDataV3(result))!==original)throw Error('Condivisione del testo non reversibile; nessuna richiesta inviata.')
 return result
}
