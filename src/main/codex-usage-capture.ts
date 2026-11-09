import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import type {AiTokenUsage} from '../shared/ai-evidence'
export interface CodexResponseUsage {inputTokens:number;outputTokens:number;cachedInputTokens:number|null}
export interface CodexRequestUsage {status:'reconciled'|'unavailable'|'unreconciled';events:CodexResponseUsage[];maximumInputTokens:number|null;observedKeys:string[];accountingPrefixEvents?:number}
const number=(v:unknown):number|null=>{const n=typeof v==='string'&&/^\d+$/.test(v)?Number(v):v;return Number.isSafeInteger(n)&&Number(n)>=0?Number(n):null}
/** Retain only numeric usage and attribute names. No prompt, response, tool
 * output, credential, endpoint header or other attribute value is archived. */
export function readCodexUsageBatch(raw:any):{events:CodexResponseUsage[];keys:string[]}{
 const events:CodexResponseUsage[]=[],keys=new Set<string>()
 for(const resource of raw?.resourceLogs??raw?.resource_logs??[])for(const scope of resource.scopeLogs??resource.scope_logs??[])for(const record of scope.logRecords??scope.log_records??[]){
  const attributes:Record<string,any>={}
  for(const a of record.attributes??[]){if(typeof a.key!=='string')continue;keys.add(a.key);attributes[a.key]=a.value?.stringValue??a.value?.intValue??a.value?.doubleValue??a.value?.boolValue}
  if(!Object.values(attributes).some(v=>v==='response.completed'||v==='response_completed'))continue
  const take=(names:string[])=>{for(const name of names){const n=number(attributes[name]);if(n!==null)return n}return null}
  const inputTokens=take(['input_token_count','input_tokens','usage.input_tokens','inputTokens']),outputTokens=take(['output_token_count','output_tokens','usage.output_tokens','outputTokens'])
  if(inputTokens===null||outputTokens===null)continue
  events.push({inputTokens,outputTokens,cachedInputTokens:take(['cached_token_count','cached_input_token_count','cached_input_tokens','cached_tokens','usage.input_tokens_details.cached_tokens','cachedInputTokens'])})
 }
 return {events,keys:[...keys].filter(k=>/^[a-zA-Z0-9_.:-]{1,160}$/.test(k)).slice(0,100)}
}
export function reconcileCodexUsage(events:CodexResponseUsage[],usage:AiTokenUsage|null,keys:string[]=[]):CodexRequestUsage{
 const matches=(rows:CodexResponseUsage[])=>!!usage&&rows.length>0&&rows.reduce((n,e)=>n+e.inputTokens,0)===usage.inputTokens&&rows.reduce((n,e)=>n+e.outputTokens,0)===usage.outputTokens&&(!rows.every(e=>e.cachedInputTokens!==null)||rows.reduce((n,e)=>n+e.cachedInputTokens!,0)===usage.cachedInputTokens)
 let matched=matches(events),prefix=0
 if(!matched&&usage&&usage.outputTokens>0){
  const candidates:number[]=[]
  for(let i=1;i<events.length;i++){
   const before=events.slice(0,i),after=events.slice(i)
   // Keep EVERY event. Only a unique complete suffix can represent the CLI
   // turn; an auxiliary prefix must have no output and cannot hide a larger
   // request. No warmup attribution, fixed token offset or division is used.
   if(before.every(e=>e.outputTokens===0)&&Math.max(...before.map(e=>e.inputTokens))<=Math.max(...after.map(e=>e.inputTokens))&&matches(after))candidates.push(i)
  }
  if(candidates.length===1){matched=true;prefix=candidates[0]}
 }
 return {status:matched?'reconciled':events.length?'unreconciled':'unavailable',events,maximumInputTokens:matched?Math.max(...events.map(e=>e.inputTokens)):null,observedKeys:keys,...prefix?{accountingPrefixEvents:prefix}:{}}
}
export async function startCodexUsageCapture(){
 const nonce=randomBytes(24).toString('hex'),events:CodexResponseUsage[]=[],keys=new Set<string>()
 const server=createServer((req,res)=>{
  if(req.method!=='POST'||!req.url?.startsWith('/'+nonce)){res.writeHead(404).end();return}
  let bytes=0,chunks:Buffer[]=[]
  req.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8_000_000){chunks=[];req.destroy()}else chunks.push(chunk)})
  req.on('end',()=>{try{const result=readCodexUsageBatch(JSON.parse(Buffer.concat(chunks).toString()));events.push(...result.events);for(const k of result.keys)keys.add(k);res.writeHead(200,{'content-type':'application/json'}).end('{}')}catch{res.writeHead(400).end()}chunks=[]})
  req.on('error',()=>undefined)
 })
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve()})})
 const port=(server.address() as {port:number}).port,endpoint=`http://127.0.0.1:${port}/${nonce}`
 return {args:['--config',`otel.exporter={otlp-http={endpoint="${endpoint}",protocol="json"}}`,'--config','otel.log_user_prompt=false','--config','otel.trace_exporter="none"','--config','otel.metrics_exporter="none"','--config','analytics.enabled=false'],snapshot:(usage:AiTokenUsage|null)=>reconcileCodexUsage(events,usage,[...keys].slice(0,100)),close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve())})}
}
