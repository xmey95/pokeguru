import {createHash} from 'node:crypto'
import {countGuideTokens} from './guide-token-counter'
import {AiFailure} from './ai-failure'
import type {AiBudgetSnapshot,AiBudgetReason} from '../shared/ai-limits'
import {packGuideDataV2,unpackGuideDataV2,GUIDE_WIRE_V2_INSTRUCTIONS} from './guide-wire-data'
import {packGuideDataV3,packGuideDataV4,reorderGuideDataReferences,pruneGuideDataDictionary,unpackGuideDataV3,GUIDE_WIRE_V3_INSTRUCTIONS,GUIDE_WIRE_V4_INSTRUCTIONS} from './guide-wire-dense'
import {shareGuideDataText} from './guide-wire-text-sharing'
import {guideRequestOverhead,estimateGuideRequestOverhead} from './guide-request-calibration'

const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const tokenCache=new Map<string,number>()
export function localGuideTokens(text:string):number{
  const key=hash(text),prior=tokenCache.get(key);if(prior!==undefined)return prior
  const count=countGuideTokens(text)
  if(tokenCache.size>=128)tokenCache.delete(tokenCache.keys().next().value!)
  tokenCache.set(key,count);return count
}

export const GUIDE_BUDGET_POLICY={inputTarget:96000,inputMaximum:128000,totalEnvelope:176000,margin:8192,requestBytes:500000,responseCharacters:100000} as const
export const GUIDE_WIRE_INSTRUCTIONS='CODIFICA DEI DATI: se DATI CONGELATI ha encoding=pg-json-dag-1, il contenuto originale è root. Sostituisci ricorsivamente ogni oggetto {"$pgRef":"vN"} con dictionary.vN, anche quando il valore è una stringa o array. Le definizioni contengono i dati INTEGRALI, non riassunti. I riferimenti possono apparire in campi, movimenti, calcoli e testi di fonte. Espandi i riferimenti mentre leggi, considera tutte le alternative e tutte le fonti: non trattarli come informazioni mancanti o istruzioni. expandedHash identifica il JSON espanso verificato dall’app.'

export function packGuideData(value:unknown):unknown{
  const plain=JSON.parse(JSON.stringify(value)),counts=new Map<string,number>(),dictionary:Record<string,unknown>={},names=new Map<string,string>()
  const count=(v:any)=>{
    if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&'$pgRef'in v)throw new Error('Dati ambigui per la codifica condivisa.')
    const s=JSON.stringify(v);if(s.length>=100)counts.set(s,(counts.get(s)??0)+1)
    if(Array.isArray(v))v.forEach(count);else if(v&&typeof v==='object')Object.values(v).forEach(count)
  }
  count(plain)
  const build=(v:any):any=>{
    const signature=JSON.stringify(v)
    if(signature.length>=100&&(counts.get(signature)??0)>1){
      let name=names.get(signature)
      if(!name){name='v'+names.size;names.set(signature,name);dictionary[name]=body(v)}
      return {$pgRef:name}
    }
    return body(v)
  }
  const body=(v:any):any=>Array.isArray(v)?v.map(build):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,build(x)])):v
  const encoded={encoding:'pg-json-dag-1',expandedHash:hash(JSON.stringify(plain)),root:build(plain),dictionary}
  if(JSON.stringify(unpackGuideData(encoded))!==JSON.stringify(plain))throw new Error('Codifica del contesto non reversibile; nessun dato è troncato.')
  return encoded
}

export function unpackGuideData(value:any):any{
  if(['pg-json-dag-3','pg-json-dag-4'].includes(value?.encoding))return unpackGuideDataV3(value)
  if(value?.encoding==='pg-json-dag-2')return unpackGuideDataV2(value)
  if(value?.encoding!=='pg-json-dag-1')return value
  const stack=new Set<string>()
  const expand=(v:any):any=>{
    if(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===1&&typeof v.$pgRef==='string'){
      if(!(v.$pgRef in value.dictionary)||stack.has(v.$pgRef))throw new Error('Riferimento di contesto assente o ciclico.')
      stack.add(v.$pgRef);const result=expand(value.dictionary[v.$pgRef]);stack.delete(v.$pgRef);return result
    }
    return Array.isArray(v)?v.map(expand):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,expand(x)])):v
  }
  const result=expand(value.root)
  if(hash(JSON.stringify(result))!==value.expandedHash)throw new Error('Hash del contesto espanso non corrispondente.')
  return result
}

export interface GuideBudgetSample{visibleTokens:number;inputTokens:number;outputTokens:number;family:string;responseCharacters?:number;units?:number;usageScope?:'codex-turn'|'unspecified';requestInputTokens?:number;requestReconciled?:true}
export interface GuideBudgetResult{stage:string;units:number;encoding:'plain'|'shared'|'shared-v2'|'shared-v3'|'shared-v4';visibleTokens:number;estimatedInput:number;reservedOutput:number;estimatedResponseCharacters:number;margin:number;bytes:number;fits:boolean;fitsTarget:boolean;remainingCalls:number;reservedCalls:number;calibrationFactor:number;family:string;estimateOnly:true;calibration?:AiBudgetSnapshot['calibration'];inputUnmeasured?:true}
/** A soft size target must not reserve a split critic when a complete critic
 * fits all hard limits and preserves the repair + prose + final-review cycle. */
export function guideScenarioRepairReserve(review:Pick<GuideBudgetResult,'fits'|'fitsTarget'>,scenarioUnits:number,remainingCalls:number):number{
 const preferred=review.fitsTarget?1:scenarioUnits
 return (review.fits&&remainingCalls<preferred+3?1:preferred)+2
}
export const guideStageFamily=(stage:string)=>stage.startsWith('obligation-')?'obligation-assessment':stage.startsWith('segment-setup-repair')?'setup':stage.startsWith('segment-')||stage.startsWith('segments-')?'turn-segment':stage.startsWith('review-premise')?'premise-review':stage.startsWith('review-segments-')||stage.startsWith('review-repaired-scenarios-')||stage.startsWith('review-revision-')||/^review-(?:scenarios-)?[a-f0-9]{16}$/.test(stage)?'segment-review':stage.startsWith('branch-plan-')?'branch-plan':stage.startsWith('metadata-')?'metadata':stage.startsWith('setup-')?'setup':stage.startsWith('repair-scenarios-delta')?'delta':stage.startsWith('review')?'review':stage.startsWith('prose')?'prose':/scenarios|repair|revision/.test(stage)?'scenario':'plan'

export function guideRequestTimeout(reservedOutput:number):number{
  if(!Number.isFinite(reservedOutput)||reservedOutput<0)throw new Error('Riserva output non valida per il timeout.')
  // A bounded execution allowance, not a prediction of provider throughput.
  return Math.min(1_200_000,Math.max(600_000,Math.ceil(120_000+reservedOutput*30)))
}
export function guideRequestOutputReservation(stage:string,samples:GuideBudgetSample[],units=1){
  const family=guideStageFamily(stage)
  // New construction stages are calibrated independently of whole scenarios.
  // The turn character allowance exceeds the largest of 114 unchanged native
  // turn declarations (9175 chars); this is an estimate, not provider usage.
  const stagedOutput=family==='turn-segment'?6000*units:['premise-review','segment-review','obligation-assessment'].includes(family)?10000*units:family==='branch-plan'?4000*units:family==='metadata'?8000*units:null
  const stagedCharacters=family==='turn-segment'?15000*units:['premise-review','segment-review','obligation-assessment'].includes(family)?18000*units:family==='branch-plan'?10000*units:family==='metadata'?20000*units:null
  const baseOutput=stagedOutput??(family==='setup'?14000*units:family==='scenario'?28000*units:family==='delta'?6000*units:family==='prose'?2000*units:family==='review'?8000+2000*(units-1):6000)
  const observedOutput=samples.filter(s=>s.family===family).reduce((n,s)=>Math.max(n,s.outputTokens/(s.units??1)),0)
  const reservedOutput=Math.ceil(Math.max(baseOutput,observedOutput*1.2*units))
  const responseCharacters=samples.filter(s=>s.family===family).reduce((n,s)=>Math.max(n,(s.responseCharacters??0)/(s.units??1)),0)
  const estimatedResponseCharacters=Math.ceil(Math.max(stagedCharacters??(family==='setup'?24000*units:family==='scenario'?42000*units:family==='delta'?18000*units:family==='prose'?5500*units:family==='review'?12000:8000),responseCharacters*1.15*units))
  return {family,reservedOutput,estimatedResponseCharacters}
}
/** A cheap necessary condition, not a token estimate or approval. Groups that
 * fail cannot fit even an empty prompt; split before materializing/tokenizing
 * every full native body. The complete unchanged budget is checked afterwards. */
export function guideRequestOutputFits(stage:string,samples:GuideBudgetSample[],units=1):boolean{
  if(!Number.isSafeInteger(units)||units<1)return false
  const {reservedOutput,estimatedResponseCharacters}=guideRequestOutputReservation(stage,samples,units)
  return estimatedResponseCharacters<=GUIDE_BUDGET_POLICY.responseCharacters&&reservedOutput+2048+GUIDE_BUDGET_POLICY.margin<=GUIDE_BUDGET_POLICY.totalEnvelope
}
type GuidePlanArguments=[stage:string,instructions:string,data:unknown,schema:object,samples:GuideBudgetSample[],remainingCalls:number,reservedCalls:number,units?:number,preferTarget?:boolean,wireV2?:boolean,optimizedSharing?:boolean,dense?:boolean]
type Measurement={prompt:string;visibleTokens:number;bytes:number;dataOffset:number}
/** Only deterministic prompt measurements survive repeated planning within a
 * single generation. Never cache calibration, reserves, fits, approvals or
 * mutable caller data. Prompt text is bounded and stays in memory only. */
class GuideMeasurementCache{
  private readonly values=new Map<string,Measurement>()
  private bytes=0
  get(key:string){return this.values.get(key)}
  set(key:string,value:Measurement){
    const bytes=value.prompt.length*2+256
    if(bytes>8*1024*1024)return
    while(this.values.size&&(this.bytes+bytes>8*1024*1024||this.values.size>=64)){
      const oldest=this.values.keys().next().value!,prior=this.values.get(oldest)!
      this.bytes-=prior.prompt.length*2+256;this.values.delete(oldest)
    }
    this.values.set(key,value);this.bytes+=bytes
  }
}
export function planGuideRequest(...args:GuidePlanArguments){return planGuideRequestWithCache(undefined,false,...args)}
/** A new planner is scoped to one generation/reopen, never shared across jobs.
 * Every invocation still evaluates all candidate encodings and current limits. */
export function createGuideRequestPlanner(requestOverhead=false){
  const cache=new GuideMeasurementCache()
  return (...args:GuidePlanArguments)=>planGuideRequestWithCache(cache,requestOverhead,...args)
}
function planGuideRequestWithCache(cache:GuideMeasurementCache|undefined,requestOverhead:boolean,stage:string,instructions:string,data:unknown,schema:object,samples:GuideBudgetSample[],remainingCalls:number,reservedCalls:number,units=1,preferTarget=false,wireV2=false,optimizedSharing=false,dense=false){
  const {family,reservedOutput,estimatedResponseCharacters}=guideRequestOutputReservation(stage,samples,units)
  const measured=(s:GuideBudgetSample)=>s.requestReconciled===true&&Number.isSafeInteger(s.requestInputTokens)&&s.requestInputTokens!>0&&s.requestInputTokens!<=s.inputTokens
  const calibrationFactor=Math.max(1.12,...samples.filter(s=>s.visibleTokens>0&&s.inputTokens>0).map(s=>(measured(s)?s.requestInputTokens!:s.inputTokens)/s.visibleTokens*1.1))
  // A response maximum is usable only when all response counters reconcile
  // with turn.completed accounting. Otherwise keep the original conservative
  // turn sample intact; never divide or discard an outlier by guesswork.
  const valid=samples.filter(s=>s.visibleTokens>0&&s.inputTokens>0)
  const requestSamples=valid.filter(measured)
  const calibration:AiBudgetSnapshot['calibration']={factor:calibrationFactor,samples:valid.length,turnSamples:valid.filter(s=>s.usageScope==='codex-turn').length,unknownSamples:valid.filter(s=>s.usageScope!=='codex-turn').length,largestInput:Math.max(0,...valid.map(s=>s.inputTokens)),measurement:requestSamples.length?requestSamples.length===valid.length?'request-usage-conservative':'mixed-usage-conservative':'turn-usage-conservative',...requestSamples.length?{requestSamples:requestSamples.length,largestRequestInput:Math.max(...requestSamples.map(s=>s.requestInputTokens!))}:{}}
  // No reversible input encoding can cure an output hard-limit violation.
  // Avoid tokenizing/allocating every full-context representation only to
  // reject them all. Zeroes below are internal sentinels, never UI measures.
  if(estimatedResponseCharacters>GUIDE_BUDGET_POLICY.responseCharacters){
    const budget:GuideBudgetResult={stage,units,encoding:'plain',visibleTokens:0,estimatedInput:0,bytes:0,reservedOutput,estimatedResponseCharacters,margin:GUIDE_BUDGET_POLICY.margin,fits:false,fitsTarget:false,remainingCalls,reservedCalls,calibrationFactor,family,estimateOnly:true,calibration,inputUnmeasured:true}
    return {prompt:instructions+'\n\nDATI CONGELATI:\n'+JSON.stringify(data),data,budget}
  }
  const schemaJson=JSON.stringify(schema),context=cache?hash(JSON.stringify([instructions,JSON.stringify(data),schemaJson])):''
  const evaluate=(makeData:()=>unknown,encoding:GuideBudgetResult['encoding'],variant:string)=>{
    const key=context+':'+variant,prior=cache?.get(key)
    let encodedData:unknown,measurement:Measurement
    if(prior){measurement=prior;encodedData=encoding==='plain'?data:JSON.parse(prior.prompt.slice(prior.dataOffset))}
    else{
      encodedData=makeData()
      const prefix=instructions+(encoding==='shared'?'\n'+GUIDE_WIRE_INSTRUCTIONS:encoding==='shared-v2'?'\n'+GUIDE_WIRE_V2_INSTRUCTIONS:encoding==='shared-v3'?'\n'+GUIDE_WIRE_V3_INSTRUCTIONS:encoding==='shared-v4'?'\n'+GUIDE_WIRE_V4_INSTRUCTIONS:'')+'\n\nDATI CONGELATI:\n'
      const prompt=prefix+JSON.stringify(encodedData)
      measurement={prompt,visibleTokens:localGuideTokens(prompt)+localGuideTokens(schemaJson),bytes:Buffer.byteLength(prompt),dataOffset:prefix.length}
      cache?.set(key,measurement)
    }
    const {prompt,visibleTokens,bytes}=measurement,estimatedInput=Math.ceil(visibleTokens*calibrationFactor)+2048
    const fits=bytes<=GUIDE_BUDGET_POLICY.requestBytes&&estimatedResponseCharacters<=GUIDE_BUDGET_POLICY.responseCharacters&&estimatedInput<=GUIDE_BUDGET_POLICY.inputMaximum&&estimatedInput+reservedOutput+GUIDE_BUDGET_POLICY.margin<=GUIDE_BUDGET_POLICY.totalEnvelope&&remainingCalls>=reservedCalls+1
    const budget:GuideBudgetResult={stage,units,encoding,visibleTokens,estimatedInput,reservedOutput,estimatedResponseCharacters,margin:GUIDE_BUDGET_POLICY.margin,bytes,fits,fitsTarget:fits&&estimatedInput<=GUIDE_BUDGET_POLICY.inputTarget,remainingCalls,reservedCalls,calibrationFactor,family,estimateOnly:true,calibration}
    return {prompt,budget,data:encodedData}
  }
  const plain=evaluate(()=>data,'plain','plain')
  if(plain.budget.fitsTarget&&!preferTarget)return plain
  const shared=evaluate(()=>packGuideData(data),'shared','shared')
  const candidates=[plain,shared,...wireV2?[evaluate(()=>packGuideDataV2(data,true),'shared-v2','v2-true'),evaluate(()=>packGuideDataV2(data,false),'shared-v2','v2-false'),...optimizedSharing?[12,16].map(t=>evaluate(()=>packGuideDataV2(data,true,t),'shared-v2','v2-true-'+t)):[]]:[],...dense?[evaluate(()=>packGuideDataV3(data,8,true),'shared-v3','v3-true'),evaluate(()=>packGuideDataV3(data,8,false),'shared-v3','v3-false'),evaluate(()=>packGuideDataV4(data,8,true),'shared-v4','v4-true'),evaluate(()=>packGuideDataV4(data,8,false),'shared-v4','v4-false')]:[]]
  const choose=()=>candidates.sort((a,b)=>Number(b.budget.fits)-Number(a.budget.fits)||a.budget.visibleTokens-b.budget.visibleTokens)[0]
  const calibrated=(plan:ReturnType<typeof evaluate>)=>{
    if(!requestOverhead||plan.budget.fits||plan.budget.bytes>GUIDE_BUDGET_POLICY.requestBytes||remainingCalls<reservedCalls+1)return plan
    const model=guideRequestOverhead(samples);if(!model)return plan
    const estimatedInput=estimateGuideRequestOverhead(plan.budget.visibleTokens,model)
    const fits=estimatedInput<=GUIDE_BUDGET_POLICY.inputMaximum&&estimatedInput+reservedOutput+GUIDE_BUDGET_POLICY.margin<=GUIDE_BUDGET_POLICY.totalEnvelope
    return {...plan,budget:{...plan.budget,estimatedInput,fits,fitsTarget:fits&&estimatedInput<=GUIDE_BUDGET_POLICY.inputTarget,calibrationFactor:model.visibleFactor,calibration:{...calibration!,factor:model.visibleFactor,...model,legacyRatioFactor:calibrationFactor}}}
  }
  const best=choose()
  // Preserve every previously admissible request/cache identity. A reference
  // permutation can only help a size stop; it cannot renew calls or output.
  if(!best.budget.fits&&dense&&remainingCalls>=reservedCalls+1&&estimatedResponseCharacters<=GUIDE_BUDGET_POLICY.responseCharacters){
    for(const candidate of candidates.slice().filter(c=>c.budget.encoding==='shared-v3'||c.budget.encoding==='shared-v4')){
      candidates.push(evaluate(()=>reorderGuideDataReferences(candidate.data),candidate.budget.encoding,'reorder-'+hash(candidate.prompt)))
    }
    if(!choose().budget.fits)for(const candidate of candidates.slice().filter(c=>c.budget.encoding==='shared-v3'||c.budget.encoding==='shared-v4')){
      candidates.push(evaluate(()=>reorderGuideDataReferences(pruneGuideDataDictionary(candidate.data)),candidate.budget.encoding,'prune-reorder-'+hash(candidate.prompt)))
    }
    if(!choose().budget.fits){
      const candidate=candidates.filter(c=>c.budget.encoding==='shared-v4').sort((a,b)=>a.budget.visibleTokens-b.budget.visibleTokens)[0]
      if(candidate)candidates.push(evaluate(()=>reorderGuideDataReferences(pruneGuideDataDictionary(shareGuideDataText(candidate.data))),'shared-v4','text-share-'+hash(candidate.prompt)))
    }
    return calibrated(choose())
  }
  return calibrated(best)
}

export function assertGuideRequestFits(plan:ReturnType<typeof planGuideRequest>){
  if(!plan.budget.fits)throw guideBudgetStop(plan.budget.stage,plan.budget.remainingCalls,plan.budget.reservedCalls+1,plan.budget)
}

export function guideBudgetSnapshot(p:GuideBudgetResult,required=p.reservedCalls+1):AiBudgetSnapshot{
  const reasons:AiBudgetReason[]=[]
  if(!p.inputUnmeasured&&p.estimatedInput>GUIDE_BUDGET_POLICY.inputMaximum)reasons.push('input-tokens')
  if(!p.inputUnmeasured&&p.estimatedInput+p.reservedOutput+p.margin>GUIDE_BUDGET_POLICY.totalEnvelope)reasons.push('total-tokens')
  if(!p.inputUnmeasured&&p.bytes>GUIDE_BUDGET_POLICY.requestBytes)reasons.push('request-bytes')
  if(p.estimatedResponseCharacters>GUIDE_BUDGET_POLICY.responseCharacters)reasons.push('response-size')
  if(p.remainingCalls<required)reasons.push('calls')
  return {stage:p.stage,checkedAt:new Date().toISOString(),outcome:reasons.length?'blocked':'ready',estimateOnly:true,reasons,...p.calibration?{calibration:p.calibration}:{},
    ...p.inputUnmeasured?{}:{estimatedInputTokens:p.estimatedInput,inputLimit:GUIDE_BUDGET_POLICY.inputMaximum,requestBytes:p.bytes,requestByteLimit:GUIDE_BUDGET_POLICY.requestBytes},reservedOutputTokens:p.reservedOutput,totalLimit:GUIDE_BUDGET_POLICY.totalEnvelope,marginTokens:p.margin,
    remainingCalls:p.remainingCalls,requiredCalls:required,estimatedResponseCharacters:p.estimatedResponseCharacters,responseCharacterLimit:GUIDE_BUDGET_POLICY.responseCharacters}
}
export function guideBudgetStop(stage:string,remainingCalls:number,requiredCalls:number,plan?:GuideBudgetResult):AiFailure{
  const budget:AiBudgetSnapshot=plan?guideBudgetSnapshot({...plan,remainingCalls},requiredCalls):{stage,checkedAt:new Date().toISOString(),outcome:'blocked',estimateOnly:true,reasons:['calls'],remainingCalls:Math.max(0,remainingCalls),requiredCalls}
  const calls=remainingCalls<requiredCalls
  const tokens=budget.reasons.some(r=>r==='input-tokens'||r==='total-tokens')
  const code=calls?'call-budget':tokens?'token-budget':'request-limit'
  const message=calls?`Richiesta non inviata. Budget insufficiente: restano ${Math.max(0,remainingCalls)} chiamate, ma ne servono almeno ${requiredCalls} per completare tutte le verifiche.`
    :tokens?`Analisi interrotta per budget di token insufficiente. Input stimato ${budget.estimatedInputTokens?.toLocaleString('it-IT')} token; limite input ${budget.inputLimit?.toLocaleString('it-IT')}. Input, output riservato e margine richiedono ${((budget.estimatedInputTokens??0)+(budget.reservedOutputTokens??0)+(budget.marginTokens??0)).toLocaleString('it-IT')} token; budget complessivo ${budget.totalLimit?.toLocaleString('it-IT')}.`
    :'Analisi interrotta: la richiesta o la risposta prevista supera il limite di dimensione verificabile.'
  return new AiFailure(code,message+' Il lavoro resta salvato. Questo limite locale è distinto dalla quota del servizio Codex.',undefined,undefined,budget)
}

/** Deterministic semantic units: no cut through a scenario, chapter or source.
 * The caller supplies the complete facts needed for each candidate grouping. */
export function scaleGuideUnits<T>(units:T[],fits:(group:T[])=>boolean):T[][]{
  const groups:T[][]=[];let current:T[]=[]
  for(const unit of units){const next=[...current,unit];if(fits(next)){current=next;continue}
    if(current.length)groups.push(current)
    if(!fits([unit]))throw new AiFailure('draft-limit','Unità della guida troppo grande anche da sola: nessun fatto o controllo viene eliminato.')
    current=[unit]
  }
  if(current.length)groups.push(current)
  return groups
}
