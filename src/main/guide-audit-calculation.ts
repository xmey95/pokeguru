import {auditNarrativeSchema,renderAuditNarrative,type AuditQuantityContext} from './guide-audit-quantities'
import {auditSourceQuantities} from './guide-audit-source-quantities'
import type {GuidePacket} from './matchup-guide-packet'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {hasGuideSourceQuote} from './guide-source-quote'

interface Context {context:AuditQuantityContext;contextFacts:{id:string;label:string;value:number}[];packet:GuidePacket}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value}),nil={type:'null'},ids=(values:string[])=>({type:'string',enum:[...new Set(values)]})
/** A bounded arithmetic program. Every leaf is original evidence or an earlier
 * computed result; there are no model-supplied numeric constants. It proves
 * arithmetic, not the applicability of an effect or a claim about inventory. */
export function auditCalculationSchema(data:Context){
 const common={kind:nil,quantity:nil,measureId:nil,contextId:nil,source:nil,resultIndex:nil},variant=(kind:string,fields:Record<string,any>)=>object({...common,kind:literal(kind),...fields})
 const alternatives=[variant('inventory',{quantity:(auditNarrativeSchema(data.context) as any).items.properties.quantity.anyOf[0]}),variant('result',{resultIndex:{type:'integer',minimum:0,maximum:6}})]
 if(data.context.measures.length)alternatives.push(variant('measure',{measureId:ids(data.context.measures.map(m=>m.id))}))
 if(data.contextFacts.length)alternatives.push(variant('context',{contextId:ids(data.contextFacts.map(f=>f.id))}))
 const sources=data.packet.sources.filter(s=>['card','rules'].includes(s.kind)).map(s=>s.id)
 if(sources.length)alternatives.push(variant('source',{source:object({id:ids(sources),quote:{type:'string',minLength:1,maxLength:1500},value:{type:'integer',minimum:0,maximum:10000}})}))
 const operand={anyOf:alternatives}
 return object({steps:{type:'array',minItems:1,maxItems:8,items:object({operation:{type:'string',enum:['add','subtract','multiply','divide','minimum','maximum']},left:operand,right:operand})}})
}
export function readAuditCalculation(proof:unknown,data:Context,allowedWindows:string[],decodedSources=true):number{
 assertNativeScenarioSchema(proof,auditCalculationSchema(data));const results:number[]=[]
 const leaf=(v:any,path:string):number=>{
  if(v.kind==='result'){if(v.resultIndex>=results.length)throw Error('Audit calcolo: riferimento futuro o circolare.');return results[v.resultIndex]}
  if(v.kind==='inventory'){renderAuditNarrative([{text:null,quantity:v.quantity,measureId:null,card:null}],data.context,10000,allowedWindows,3);return v.quantity.count}
  if(v.kind==='measure'){const m=data.context.measures.find(m=>m.id===v.measureId);if(!m)throw Error('Audit calcolo: misura mancante.');return Number.parseInt(m.value,10)}
  if(v.kind==='context'){const f=data.contextFacts.find(f=>f.id===v.contextId);if(!f)throw Error('Audit calcolo: fatto mancante.');return f.value}
  const s=data.packet.sources.find(s=>s.id===v.source.id)
  const exactQuote=!!s&&['card','rules'].includes(s.kind)&&!!(decodedSources?hasGuideSourceQuote(s.content,v.source.quote):v.source.quote.trim()&&s.content.includes(v.source.quote)),values=exactQuote?auditSourceQuantities(v.source.quote):[]
  if(!exactQuote||!values.includes(v.source.value))throw Error('Audit calcolo: operando senza citazione numerica originale. '+JSON.stringify({path,sourceId:v.source.id,quote:v.source.quote,declaredValue:v.source.value,exactQuote,availableValues:values}))
  return v.source.value
 }
 for(const step of (proof as any).steps){const index=results.length,left=leaf(step.left,'steps['+index+'].left'),right=leaf(step.right,'steps['+index+'].right')
  if(!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||step.operation==='divide'&&right===0)throw Error('Audit calcolo: operando non intero o divisione per zero.')
  const value=step.operation==='add'?left+right:step.operation==='subtract'?left-right:step.operation==='multiply'?left*right:step.operation==='divide'?left/right:step.operation==='minimum'?Math.min(left,right):Math.max(left,right)
  if(!Number.isSafeInteger(value)||Math.abs(value)>1_000_000)throw Error('Audit calcolo: risultato non intero o oltre il limite verificabile.')
  results.push(value)
 }
 const value=results.at(-1)!;if(value<0||value>10000)throw Error('Audit calcolo: risultato finale fuori intervallo.');return value
}
