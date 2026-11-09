export const aiBudgetReasons=['input-tokens','total-tokens','request-bytes','response-size','calls','repair-calls','base-slots'] as const
export type AiBudgetReason=typeof aiBudgetReasons[number]
export interface AiBudgetSnapshot {
  stage:string; checkedAt:string; outcome:'ready'|'blocked'; estimateOnly:true; reasons:AiBudgetReason[]
  estimatedInputTokens?:number; inputLimit?:number; reservedOutputTokens?:number; totalLimit?:number; marginTokens?:number
  remainingCalls:number; requiredCalls:number; requestBytes?:number; requestByteLimit?:number
  estimatedResponseCharacters?:number; responseCharacterLimit?:number
  repairs?:{limit:number;used:number;remaining:number;required:number}
  calibration?:{factor:number;samples:number;turnSamples:number;unknownSamples:number;largestInput:number;measurement:'turn-usage-conservative'|'request-usage-conservative'|'mixed-usage-conservative';requestSamples?:number;largestRequestInput?:number;model?:'request-overhead-v1';overheadTokens?:number;visibleFactor?:number;overheadFactor?:number;legacyRatioFactor?:number}
}
export function readAiBudget(value:unknown):AiBudgetSnapshot|undefined{
  const v=value as AiBudgetSnapshot
  if(!v||typeof v.stage!=='string'||!/^[a-z0-9-]{1,100}$/.test(v.stage)||typeof v.checkedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.checkedAt)||!Number.isFinite(Date.parse(v.checkedAt))||!['ready','blocked'].includes(v.outcome)||v.estimateOnly!==true||!Array.isArray(v.reasons)||v.reasons.some(r=>!aiBudgetReasons.includes(r))||!Number.isSafeInteger(v.remainingCalls)||v.remainingCalls<0||!Number.isSafeInteger(v.requiredCalls)||v.requiredCalls<0)return undefined
  const result:AiBudgetSnapshot={stage:v.stage,checkedAt:v.checkedAt,outcome:v.outcome,estimateOnly:true,reasons:[...new Set(v.reasons)],remainingCalls:v.remainingCalls,requiredCalls:v.requiredCalls}
  for(const key of ['estimatedInputTokens','inputLimit','reservedOutputTokens','totalLimit','marginTokens','requestBytes','requestByteLimit','estimatedResponseCharacters','responseCharacterLimit'] as const)if(Number.isSafeInteger(v[key])&&Number(v[key])>=0)result[key]=v[key]
  if(v.repairs!==undefined){const r=v.repairs
    if(!r||!['limit','used','remaining','required'].every(k=>Number.isSafeInteger(r[k as keyof typeof r])&&r[k as keyof typeof r]>=0)||r.used>r.limit||r.remaining!==r.limit-r.used||v.reasons.includes('repair-calls')!==(r.required>r.remaining)||r.required>r.remaining&&v.outcome!=='blocked')return undefined
    result.repairs={limit:r.limit,used:r.used,remaining:r.remaining,required:r.required}
  }else if(v.reasons.includes('repair-calls'))return undefined
  const c=v.calibration
  if(c&&['turn-usage-conservative','request-usage-conservative','mixed-usage-conservative'].includes(c.measurement)&&Number.isFinite(c.factor)&&c.factor>=1.12&&['samples','turnSamples','unknownSamples','largestInput'].every(k=>Number.isSafeInteger(c[k as keyof typeof c])&&Number(c[k as keyof typeof c])>=0)&&c.turnSamples+c.unknownSamples===c.samples){
    const requestValid=Number.isSafeInteger(c.requestSamples)&&c.requestSamples!>0&&c.requestSamples!<=c.samples&&Number.isSafeInteger(c.largestRequestInput)&&c.largestRequestInput!>0&&c.largestRequestInput!<=c.largestInput
    if(c.measurement==='turn-usage-conservative'||requestValid)result.calibration={factor:c.factor,samples:c.samples,turnSamples:c.turnSamples,unknownSamples:c.unknownSamples,largestInput:c.largestInput,measurement:c.measurement,...requestValid?{requestSamples:c.requestSamples,largestRequestInput:c.largestRequestInput}:{}}
    if(c.model!==undefined){
      if(c.model!=='request-overhead-v1'||!requestValid||c.requestSamples!==c.samples||c.unknownSamples!==0||!Number.isSafeInteger(c.overheadTokens)||c.overheadTokens!<0||c.visibleFactor!==1.12||c.overheadFactor!==1.1||c.factor!==c.visibleFactor||!Number.isFinite(c.legacyRatioFactor)||c.legacyRatioFactor!<1.12)delete result.calibration
      else Object.assign(result.calibration!,{model:c.model,overheadTokens:c.overheadTokens,visibleFactor:c.visibleFactor,overheadFactor:c.overheadFactor,legacyRatioFactor:c.legacyRatioFactor})
    }
  }
  return result
}

export interface AiQuotaWindow {usedPercent:number;windowDurationMins:number|null;resetsAt:number|null}
export interface AiQuotaBucket {id:string;name:string|null;primary:AiQuotaWindow|null;secondary:AiQuotaWindow|null}
export interface AiQuota {status:'available'|'unavailable';fetchedAt:string;buckets:AiQuotaBucket[];availableResets:number|null}
/** A quota percentage is never converted to a remaining number of tokens. */
export function readAiQuota(raw:any,now=new Date().toISOString()):AiQuota{
  const window=(v:any):AiQuotaWindow|null=>v&&typeof v.usedPercent==='number'&&Number.isFinite(v.usedPercent)&&v.usedPercent>=0&&v.usedPercent<=10000?{
    usedPercent:v.usedPercent,windowDurationMins:Number.isSafeInteger(v.windowDurationMins)&&v.windowDurationMins>0?v.windowDurationMins:null,
    resetsAt:Number.isSafeInteger(v.resetsAt)&&v.resetsAt>=0&&v.resetsAt<=8640000000000?v.resetsAt:null}:null
  const multi=raw?.rateLimitsByLimitId&&typeof raw.rateLimitsByLimitId==='object'&&!Array.isArray(raw.rateLimitsByLimitId)?Object.entries(raw.rateLimitsByLimitId):[]
  const entries=multi.length?multi:raw?.rateLimits?[[raw.rateLimits.limitId??'codex',raw.rateLimits]]:[]
  const buckets:AiQuotaBucket[]=entries.slice(0,20).flatMap(([key,v]:any)=>{
    const id=v?.limitId??key;if(typeof id!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(id))return []
    const primary=window(v?.primary),secondary=window(v?.secondary);if(!primary&&!secondary)return []
    return [{id,name:typeof v.limitName==='string'&&v.limitName.length<=100?v.limitName:null,primary,secondary}]
  })
  const availableResets=Number.isSafeInteger(raw?.rateLimitResetCredits?.availableCount)&&raw.rateLimitResetCredits.availableCount>=0?raw.rateLimitResetCredits.availableCount:null
  return {status:buckets.length?'available':'unavailable',fetchedAt:now,buckets,availableResets}
}
