import {SCENARIO_OUTPUT_FIELDS,CONTEXT_EVENT_TABLES,scenarioEventTable} from '../shared/guide-scenario-output'
type Schema=Record<string,any>
const object=(properties:Schema)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)})
const reference={type:'integer',minimum:0,maximum:1023}
const union=(nodes:Schema[])=>{const unique=[...new Map(nodes.map(n=>[JSON.stringify(n),n])).values()];return unique.length===1?unique[0]:{anyOf:unique}}
function shortKeys(s:Schema):Schema{
 const out=structuredClone(s)
 if(s.properties)out.properties=Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[SCENARIO_OUTPUT_FIELDS[k]??k,shortKeys(v as Schema)]))
 if(s.required)out.required=s.required.map((k:string)=>SCENARIO_OUTPUT_FIELDS[k]??k)
 if(s.items)out.items=shortKeys(s.items)
 if(s.anyOf)out.anyOf=s.anyOf.map(shortKeys)
 return out
}

/** Bind cards/attacks first, then share their complete typed declarations. The
 * expanded output is checked against the bound native schema as well. */
export function scenarioOutputSchema(native:Schema,contextual=false,inline=false,direct=false):Schema{
  if(direct){contextual=true;inline=true}
  if(inline)contextual=true
  const out=structuredClone(native)
  if(!out.properties?.scenarios||out.properties.scenarios.maxItems===0)return out
  const s=out.properties.scenarios.items,tables:Record<string,Schema[]>={...Object.fromEntries((contextual?CONTEXT_EVENT_TABLES:['eventTable']).map(k=>[k,[]])),moveTable:[],energyTable:[],auditTable:[]}
  const walk=(v:Schema,path:string[]=[]):Schema=>{
    if(v.properties?.moves&&v.properties?.energyRoutes){
      const e=structuredClone(v)
      if(direct)return shortKeys(e)
      if(!inline){
        tables.moveTable.push(e.properties.moves.items);tables.energyTable.push(e.properties.energyRoutes.items)
        e.properties.moves={...e.properties.moves,items:reference};e.properties.energyRoutes={...e.properties.energyRoutes,items:reference}
      }
      const setup=path.includes('setupRounds')||path.includes('firstOpponentTurn'),side=path.includes('opponent')||path.includes('firstOpponentTurn')?'opponent':'ours'
      const table=contextual?scenarioEventTable(side,setup,path.at(-1)==='attack'):'eventTable'
      tables[table].push(e);return structuredClone(reference)
    }
    if(v.properties?.attacks&&v.properties?.cards&&v.properties?.comparison){if(direct)return shortKeys(v);tables.auditTable.push(structuredClone(v));return structuredClone(reference)}
    const result=structuredClone(v)
    if(v.properties)result.properties=Object.fromEntries(Object.entries(v.properties).map(([k,node])=>[k,walk(node as Schema,[...path,k])]))
    if(v.items)result.items=walk(v.items,path)
    if(v.anyOf)result.anyOf=v.anyOf.map((n:Schema)=>walk(n,path))
    return result
  }
  const transformed=walk(s),c=transformed.properties.replyComparison,option=c.properties.options.items
  const access=structuredClone(option)
  // Access is a required executable role, not an optional/null receipt.
  if(access.properties.accessProof)access.properties.accessProof=access.properties.accessProof.anyOf.find((n:Schema)=>n.type==='object')
  const defend=structuredClone(option);defend.properties.intent={type:'string',const:'defend'}
  const replies=object({direct:option,access,defend,others:{type:'array',items:option,maxItems:5}})
  c.properties=Object.fromEntries(Object.entries(c.properties).map(([k,node])=>k==='options'?['replies',replies]:[k,node]))
  c.properties.optionOrder={type:'array',items:{type:'string',minLength:1,maxLength:160},minItems:3,maxItems:8}
  c.required=c.required.map((k:string)=>k==='options'?'replies':k);c.required.push('optionOrder')
  for(const [name,nodes]of Object.entries(tables)){
    if(direct)continue
    if(inline&&['moveTable','energyTable'].includes(name))continue
    if(!nodes.length)throw new Error('Schema scenari: tabella senza tipo '+name)
    transformed.properties[name]={type:'array',items:shortKeys(union(nodes)),maxItems:name==='moveTable'?1024: name==='auditTable'?60:512,...name===(contextual?'ourFinalAttacks':'eventTable')||name==='auditTable'?{minItems:1}:{}}
    transformed.required.push(name)
  }
  out.properties.scenarios.items=transformed
  out.properties.scenarioEncoding={type:'string',const:direct?'pg-scenario-inline-4':inline?'pg-scenario-tables-3':contextual?'pg-scenario-tables-2':'pg-scenario-tables-1'};out.required.push('scenarioEncoding')
  return out
}

/** JSON-schema subset emitted by our native builders. Fail closed for unknown
 * validation keywords; no reference-site card, enum, length or count is waived. */
export function assertNativeScenarioSchema(raw:any,schema:Schema):void{
  const clean={...raw};delete clean.__usage;delete clean.__responseCharacters;delete clean.__usageEvidence
  const validate=(v:any,s:Schema,path:string):string|null=>{
    const supported=new Set(['type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','const','enum','anyOf','description','title'])
    for(const key of Object.keys(s))if(!supported.has(key))return `${path}: vincolo schema non supportato ${key}`
    if(s.anyOf&&!s.anyOf.some((n:Schema)=>validate(v,n,path)===null))return `${path}: nessuna alternativa dello schema originario è rispettata`
    if('const'in s&&JSON.stringify(v)!==JSON.stringify(s.const))return `${path}: valore diverso da const`
    if(s.enum&&!s.enum.some((n:any)=>JSON.stringify(n)===JSON.stringify(v)))return `${path}: valore fuori enum`
    if(s.type){const actual=v===null?'null':Array.isArray(v)?'array':typeof v
      if(s.type==='integer'?!Number.isSafeInteger(v):s.type!==actual)return `${path}: tipo ${s.type} richiesto`
    }
    if(typeof v==='string'){
      const length=[...v].length
      if(s.minLength!==undefined&&length<s.minLength||s.maxLength!==undefined&&length>s.maxLength)return `${path}: lunghezza ${length}; minimo ${s.minLength??0}, massimo ${s.maxLength??'non limitato'}`
      if(s.pattern&&!new RegExp(s.pattern,'u').test(v))return `${path}: pattern richiesto ${s.pattern}`
    }
    if(typeof v==='number'&&(!Number.isFinite(v)||s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum))return `${path}: valore numerico fuori intervallo`
    if(Array.isArray(v)){
      if(s.minItems!==undefined&&v.length<s.minItems||s.maxItems!==undefined&&v.length>s.maxItems)return `${path}: numero di elementi non valido`
      if(s.items)for(const [i,item]of v.entries()){const error=validate(item,s.items,`${path}[${i}]`);if(error)return error}
    }
    if(v&&typeof v==='object'&&!Array.isArray(v)){
      for(const key of s.required??[])if(!Object.hasOwn(v,key))return `${path}.${key}: campo obbligatorio mancante`
      for(const [key,item]of Object.entries(v)){
        if(!s.properties?.[key]){if(s.additionalProperties===false)return `${path}.${key}: campo non ammesso`;continue}
        const error=validate(item,s.properties[key],`${path}.${key}`);if(error)return error
      }
    }
    return null
  }
  const error=validate(clean,schema,'output');if(error)throw new Error('Output scenari espanso non conforme: '+error)
}
