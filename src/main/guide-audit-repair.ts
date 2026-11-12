import {matchingEvidenceFields} from './ai-evidence-selection'
import {collectGuideAuditCandidates} from '../shared/guide-ledger-projection'
import {guideAuditAt,guideWithoutNativeAudits,type GuideAuditMode} from '../shared/guide-audit-candidates'
import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {assertFiniteTransportHistory} from './guide-finite-runtime'
import {auditQuantityContext,auditNarrativeSchema,renderAuditNarrative,auditDecisionWindows,auditPromotionWindows} from './guide-audit-quantities'
import {auditAnchor,readAuditDeclaration,resolveAuditLanguage,assertAuditLanguagePass,type AuditDeclarationRef} from './guide-audit-language-driver'
import type {AuditLanguageTarget} from './guide-audit-language-review'
import {AiFailure} from './ai-failure'
import {guideUntilValidAuthority,guideSemanticRetryAllowed} from './guide-run-policy'
import {isGuideDelivery,GUIDE_DELIVERY_DIMENSIONS as DELIVERY} from '../shared/guide-delivery'
import {boundedAuditTextSchema,readBoundedAuditText,BOUNDED_AUDIT_TEXT_INSTRUCTIONS,boundedAuditOutputUnits} from './guide-bounded-audit-text'

const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value})
const reason=(v:any,n:number)=>typeof v==='string'&&!!v.trim()&&v.length<=n
const sameSet=(a:any,b:string[])=>Array.isArray(a)&&a.every(v=>typeof v==='string')&&a.length===new Set(a).size&&a.length===b.length&&b.every(v=>a.includes(v))
const certificate=(path:(string|number)[],value:any,contextHash:string,anchorHash?:string)=>({target:JSON.stringify(path),valueHash:guideHash(value),contextHash,...anchorHash?{anchorHash}:{}})
export function quantifiedAuditPatch(data:any,raw:any,protocol:2|3=data.auditProtocol??2){
 const context=data.quantityContext,contextHash=guideHash(context),bounded=data.auditNarrativeVersion===4,maximum=(legacy:number)=>data.deliveryBounded?DELIVERY.auditTextCharacters:legacy
 if(contextHash!==data.quantityContextHash)throw Error('Audit quantitativo: contesto alterato.')
 if(bounded&&(!data.deliveryBounded||protocol!==3))throw Error('Audit bounded: contratto o protocollo non coerenti.')
 const render=(value:any,n:number,windows?:string[])=>bounded?readBoundedAuditText(value,context,windows).text:renderAuditNarrative(value,context,maximum(n),windows,protocol)
 const parts=(value:any)=>bounded?value.parts:value
 const decisions=Object.fromEntries(data.decisions.map((d:any)=>[d.key,render(raw.decisions[d.key],1000,auditDecisionWindows(context,d.path))])),tactical=raw.tactical===null?null:{comparison:render(raw.tactical.comparison,1600),promotions:Object.fromEntries(data.promotions.map((p:any)=>[p.key,render(raw.tactical.promotions[p.key],600,auditPromotionWindows(context,data.native,p.side))]))}
 const anchor=protocol===3?auditAnchor(data.native,data.locationPath):undefined
 const certificates=data.decisions.map((d:any)=>certificate([...d.path,'decisionProof'],{cards:d.candidateIds,reason:decisions[d.key]},contextHash,anchor))
 if(tactical)certificates.push(certificate([...data.locationPath,'tactical'],{cards:data.auditCards,attacks:data.auditAttacks,comparison:tactical.comparison,promotions:data.promotions.map((p:any)=>({side:p.side,printId:p.printId,reason:tactical.promotions[p.key]}))},contextHash,anchor))
 const anchorHash=auditAnchor(data.native,data.locationPath),targets:AuditLanguageTarget[]=data.decisions.map((d:any)=>({id:JSON.stringify([...d.path,'decisionProof','reason']),text:decisions[d.key],parts:parts(raw.decisions[d.key]),maximum:maximum(1000),allowedWindows:auditDecisionWindows(context,d.path),anchorHash}))
 if(tactical){targets.push({id:JSON.stringify([...data.locationPath,'tactical','comparison']),text:tactical.comparison,parts:parts(raw.tactical.comparison),maximum:maximum(1600),allowedWindows:context.windows.map((w:any)=>w.id),anchorHash});for(const [i,p]of data.promotions.entries())targets.push({id:JSON.stringify([...data.locationPath,'tactical','promotions',i,'reason']),text:tactical.promotions[p.key],parts:parts(raw.tactical.promotions[p.key]),maximum:600,allowedWindows:auditPromotionWindows(context,data.native,p.side),anchorHash})}
 return {decisions,tactical,certificates,targets}
}
const quantifiedPatch=quantifiedAuditPatch
export function auditContextFacts(data:any){
 const body=guideAuditAt(data.native,data.locationPath),events=[...body.events??[],...body.beforeAttack??[],...body.attack?[body.attack]:[],...body.afterAttack??[]]
 return [{id:'turn',label:'Turno globale',value:data.group.turn},{id:'cards',label:'Carte candidate distinte',value:data.auditCards.length},{id:'attacks',label:'Attacchi candidati distinti',value:data.auditAttacks.length},{id:'promotions',label:'Candidati alla promozione nel turno',value:data.promotions.length},...events.flatMap((e:any,i:number)=>[{id:'event-'+i+'-prizes',label:'Premi effettivamente mossi in mano nell’azione '+(i+1),value:e.moves.filter((m:any)=>m.from==='prizes'&&m.to==='hand').reduce((n:number,m:any)=>n+m.count,0)},{id:'event-'+i+'-manual',label:'Assegnazioni manuali nell’azione '+(i+1),value:e.energyRoutes.filter((r:any)=>r.attachment==='manual').reduce((n:number,r:any)=>n+r.count,0)}])]
}
export interface GuideAuditFeedback {reviewHash:string;findings:unknown[];targets:string[]}

/** The host supplies exact candidate identities, the model supplies every new
 * judgment. Nothing except tactical/decisionProof can change. This does not
 * grant physical or independent approval: callers MUST run their full reader. */
export async function repairGuideNativeAudits(native:Record<string,any>,mode:GuideAuditMode,options:GuideConstructionRuntime,feedback?:GuideAuditFeedback):Promise<Record<string,any>>{
  if(!options.prepareRequest)throw Error('Riparazione audit: runtime finito autenticato richiesto.')
  if(options.archive.id!==options.scope.jobId||options.archive.projectId!==options.scope.projectId||options.packet.basis.projectId!==options.scope.projectId||options.packet.basis.dependencyHash!==options.scope.dependencyHash)throw Error('Riparazione audit: job, progetto o dipendenze estranei.')
  assertFiniteTransportHistory(options.archive,options.scope)
  const certified=new Set<string>(),legacyRefs:string[]=[];let legacyAuditHistory=false
  for(const row of options.archive.values<any>('guide-native-audit-repair-v1')){
    const r=row.value
    if(r.frontierVersion!==undefined&&r.frontierVersion!==2)throw Error('Audit: versione dei candidati sconosciuta.')
    if(r.quantityVersion!==undefined&&r.quantityVersion!==1)throw Error('Audit quantitativo: versione sconosciuta.')
    if(r.quantityVersion===undefined){legacyAuditHistory=true;legacyRefs.push('receipt:'+row.key)}
    if(row.key!==guideHash(r)||r.version!==1||guideHash(r.scope)!==guideHash(options.scope)||!Array.isArray(r.refs)||r.requiresCompleteValidation!==true||r.requiresIndependentReview!==true)throw Error('Riparazione audit: ricevuta precedente alterata.')
    const actualCertificates:any[]=[]
    if(r.auditProtocol===3&&(!Array.isArray(r.languageRefs)||r.languageRefs.length!==r.refs.length))throw Error('Audit semantico: ricevute dei riesami incomplete.')
    for(const ref of r.refs){
      const outcome=options.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey),descriptor=options.archive.value<any>('guide-finite-request-v1',ref.unitId)
      const validationId=r.quantityVersion===1?'guide-finite-audit-'+(ref.inputVersion??2):'guide-finite-audit-1'
      const partition=ref.partitioned?readAuditDeclaration(ref,options,(_data,raw)=>raw):undefined
      if((partition?ref.inputVersion!==4||r.auditProtocol!==3:!(outcome?.accepted||r.auditProtocol===3&&ref.declarationOnly&&ref.inputVersion===2)||outcome.unitId!==ref.unitId||ref.outcomeKey!==guideHash(outcome))||descriptor?.request.validationId!==validationId||descriptor.request.data.sourceHash!==r.sourceHash||descriptor.request.data.candidatesHash!==r.candidatesHash||guideHash(descriptor.request.data.feedback??null)!==(r.feedbackHash??guideHash(null)))throw Error('Riparazione audit: ricevuta senza originali AI coerenti.')
      if((r.frontierVersion??1)!==(descriptor.request.data.frontierVersion??1))throw Error('Audit: versione dei candidati diversa dall’originale.');
      if(isGuideDelivery(options.packet.basis)&&r.deliveryLineId!==descriptor.request.data.deliveryLineId)throw Error('Riparazione audit: ricevuta di una linea diversa.')
      if(r.quantityVersion===1){const patch=quantifiedPatch(descriptor.request.data,partition?.raw??outcome.raw,r.auditProtocol??2);actualCertificates.push(...patch.certificates);if(r.auditProtocol===3)assertAuditLanguagePass(r.languageRefs[r.refs.indexOf(ref)],patch.targets,descriptor.request.data.quantityContext,options)}
      else {legacyAuditHistory=true;legacyRefs.push(ref.outcomeKey)}
    }
    if(r.quantityVersion===1){if(guideHash(actualCertificates)!==guideHash(r.certified))throw Error('Audit quantitativo: certificati diversi dagli originali AI.');for(const c of actualCertificates)certified.add(guideHash(c))}
  }
  const policyRole='guide-audit-count-policy-v1',policies=[...options.archive.values<any>(policyRole)],policy={version:1,scopeHash:guideHash(options.scope),mode:legacyAuditHistory?'legacy-read':'quantified',legacyRefs:[...new Set(legacyRefs)].sort()}
  if(policies.length>1||policies.some(r=>r.key!==guideHash(r.value)||guideHash(r.value)!==guideHash(policy)))throw Error('Audit quantitativo: politica del job alterata o tentativo di downgrade.')
  if(!policies.length)options.archive.saveValue(policyRole,guideHash(policy),policy)
  const sourceHash=guideHash(native),immutableHash=guideHash(guideWithoutNativeAudits(native,mode))
  // Replay paid audit declarations under their pinned candidate contract.
  // New repairs on authorized until-valid jobs include attached cards; old
  // receipts remain evidence, never a waiver of the stronger final gate.
  const matching=[...options.archive.values<any>('guide-native-audit-repair-v1')].filter(r=>r.value.sourceHash===sourceHash&&guideHash(r.value.scope)===guideHash(options.scope)&&guideHash(r.value.mode)===guideHash(mode)&&(r.value.feedbackHash??guideHash(null))===guideHash(feedback??null))
  const versions=new Set(matching.map(r=>r.value.frontierVersion??1))
  if(versions.size>1)throw Error('Audit: versioni ambigue degli stessi originali.')
  const frontierVersion:1|2=matching.length?(matching[0].value.frontierVersion??1):guideUntilValidAuthority(options.archive)?2:1
  const candidates=collectGuideAuditCandidates(native,options.packet,mode,false,frontierVersion),candidatesHash=guideHash(candidates)
  const allowed=candidates.locations.flatMap(l=>[JSON.stringify([...l.path,'tactical']),...l.events.map(path=>JSON.stringify([...path,'decisionProof']))])
  if(feedback&&(!feedback.reviewHash||!feedback.findings.length||!feedback.targets.length||new Set(feedback.targets).size!==feedback.targets.length||feedback.targets.some(id=>!allowed.includes(id))))throw Error('Riparazione audit: feedback o destinazioni estranei.')
  // Reconstruct a paid historical repair from its actual original strings.
  // Upgrading it to the new wire format would purchase it again BEFORE seeing
  // a later durable rejection, and could evade the two-review stop on resume.
  const historical=[...options.archive.values<any>('guide-native-audit-repair-v1')].filter(r=>r.value.auditProtocol!==3&&r.value.sourceHash===sourceHash&&guideHash(r.value.mode)===guideHash(mode)&&(r.value.feedbackHash??guideHash(null))===guideHash(feedback??null))
  if(historical.length>1)throw Error('Riparazione audit: riparazioni storiche ambigue.')
  if(historical.length){
    const r=historical[0].value,repaired=structuredClone(native)
    if(r.candidatesHash!==candidatesHash||r.immutableHash!==immutableHash)throw Error('Riparazione audit: candidati storici diversi dal registro corrente.')
    for(const ref of r.refs){const d=options.archive.value<any>('guide-finite-request-v1',ref.unitId).request,original=options.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey).raw
      assertNativeScenarioSchema(original,d.schema)
      const patch=r.quantityVersion===1?quantifiedPatch(d.data,original):original
      if(guideHash(d.data.native)!==sourceHash)throw Error('Riparazione audit: originale storico estraneo.')
      const location=candidates.locations.find(l=>[l.lineId,l.turn,l.side].join('|')===d.data.turnKey)!,group=candidates.groups.find(g=>g.lineId===location?.lineId&&g.turn===location.turn&&g.side===location.side)
      if(!group)throw Error('Riparazione audit: turno storico non presente.')
      for(const choice of d.data.decisions)guideAuditAt(repaired,choice.path).decisionProof={cards:choice.candidateIds,reason:patch.decisions[choice.key]}
      if(patch.tactical!==null)guideAuditAt(repaired,location.path).tactical={cards:[...new Set(group.cards.map(c=>c.printId))],attacks:group.attacks,comparison:patch.tactical.comparison,promotions:d.data.promotions.map((p:any)=>({side:p.side,printId:p.printId,reason:patch.tactical.promotions[p.key]}))}
    }
    if(guideHash(repaired)!==r.repairedHash||guideHash(guideWithoutNativeAudits(repaired,mode))!==immutableHash)throw Error('Riparazione audit: ripresa storica non corrispondente agli originali.')
    return repaired
  }
  const known=new Map<string,any>();for(const s of options.packet.sources.filter(s=>s.kind==='card')){try{const c=JSON.parse(s.content);known.set(c.printId,c)}catch{/* Full evidence gate remains mandatory. */}}
  let counted:ReturnType<typeof collectGuideAuditCandidates>|undefined
  const tasks=candidates.locations.flatMap(location=>{
    const key=[location.lineId,location.turn,location.side].join('|'),group=candidates.groups.find(g=>g.lineId===location.lineId&&g.turn===location.turn&&g.side===location.side)
    if(!group)return []
    // Historical v1 sources retain their exact cache identities. Fresh jobs
    // require the quantitative contract for EVERY audit, even complete prose.
    let quantityContext:ReturnType<typeof auditQuantityContext>|undefined
    const context=()=>quantityContext??=auditQuantityContext(native,options.packet,counted??=(collectGuideAuditCandidates(native,options.packet,mode,true,frontierVersion)),location)
    const covered=(path:(string|number)[],value:any)=>legacyAuditHistory||certified.has(guideHash(certificate(path,value,guideHash(context()),auditAnchor(native,location.path))))||certified.has(guideHash(certificate(path,value,guideHash(context()))))
    const decisions=candidates.choices.filter(c=>c.lineId===location.lineId&&c.turn===location.turn&&c.side===location.side).filter(c=>{const p=guideAuditAt(native,c.path).decisionProof;return feedback?.targets.includes(JSON.stringify([...c.path,'decisionProof']))||!sameSet(p?.cards,c.candidateIds)||!reason(p?.reason,1000)||!covered([...c.path,'decisionProof'],p)})
    const body=guideAuditAt(native,location.path).tactical,attacks=group.attacks,cards=[...new Set(group.cards.map(c=>c.printId))],promotions=[...new Map(group.promotions.flatMap(p=>p.printIds.map(printId=>[p.side+'|'+printId,{side:p.side,printId}] as const))).values()]
    const pairs=(body?.attacks??[]).map((a:any)=>a.printId+'|'+a.attackName)
    const tactical=feedback?.targets.includes(JSON.stringify([...location.path,'tactical']))||!body||!Array.isArray(body.cards)||new Set(body.cards).size!==body.cards.length||body.cards.some((id:string)=>!known.has(id))||cards.some(id=>!body.cards.includes(id))||!Array.isArray(body.attacks)||new Set(pairs).size!==pairs.length||body.attacks.some((a:any)=>!known.get(a.printId)?.gameplay?.attacks?.some((v:any)=>v.name===a.attackName))||attacks.some(a=>!pairs.includes(a.printId+'|'+a.attackName))||!reason(body.comparison,1600)||!Array.isArray(body.promotions)||body.promotions.length!==promotions.length||promotions.some(p=>!body.promotions.some((v:any)=>v.side===p.side&&v.printId===p.printId&&reason(v.reason,600)))||new Set((body.promotions??[]).map((p:any)=>p.side+'|'+p.printId)).size!==(body.promotions??[]).length||!covered([...location.path,'tactical'],body)
    return decisions.length||tactical?[{key,location,group,decisions,cards,attacks,promotions,tactical,quantityContext:context()}]:[]
  })
  if(!tasks.length)return structuredClone(native)
  const request=(task:typeof tasks[number],round=0,semanticFeedback:any=null,reserve=options.reserveOutside):GuideSegmentRequest<any>=>{
    const bounded=isGuideDelivery(options.packet.basis),narrative=bounded?boundedAuditTextSchema(task.quantityContext):auditNarrativeSchema(task.quantityContext),data={packet:options.packet,native,mode,sourceHash,immutableHash,candidatesHash,...frontierVersion===2?{frontierVersion:2}:{},...feedback?{feedback}:{},auditProtocol:3,...isGuideDelivery(options.packet.basis)?{deliveryBounded:true,auditNarrativeVersion:4,deliveryLineId:options.deliveryLineId??'setup'}: {},semanticRound:round,semanticFeedback,turnKey:task.key,group:task.group,decisions:task.decisions.map((c,i)=>({key:'d'+i,...c})),promotions:task.promotions.map((p,i)=>({key:'p'+i,...p})),quantityContext:task.quantityContext,quantityContextHash:guideHash(task.quantityContext),locationPath:task.location.path,auditCards:task.cards,auditAttacks:task.attacks}
    // Rebuild previously purchased descriptors exactly. Version changes never
    // reset a logical slot, discard its rejected raw, or repurchase valid work.
    const deliveryFollowupKeys=bounded?[...options.deliveryReserveKeys??[],native.id+'/audit-review/'+native.id+'/'+(options.deliveryLineId??'setup')+'/'+task.key+'/0']:undefined
    const prior=[...matchingEvidenceFields<any>(options.archive,'guide-finite-request-v1',[
      {path:['request','validationId'],expected:['guide-finite-audit-3','guide-finite-audit-4']},
      {path:['request','data','sourceHash'],expected:[sourceHash]},
    ])].sort((a,b)=>Buffer.compare(Buffer.from(a.key),Buffer.from(b.key))).map(r=>r.value).filter(d=>d.scopeHash===guideHash(options.scope)&&/^guide-finite-audit-[34]$/.test(d.request.validationId)&&['packet','native','mode','deliveryBounded','deliveryLineId','sourceHash','candidatesHash','quantityContextHash','turnKey','decisions','promotions','locationPath','auditCards','auditAttacks','semanticRound','semanticFeedback'].every(k=>guideHash(d.request.data[k])===guideHash((data as any)[k]))&&guideHash(d.request.data.feedback??null)===guideHash(feedback??null)).sort((a,b)=>a.request.retryOrdinal-b.request.retryOrdinal)
    if(prior.length){
      const saved=prior[0].request,{previousInvalid:_invalid,...savedData}=saved.data
      const read=(raw:any)=>{assertNativeScenarioSchema(raw,saved.schema);quantifiedPatch(savedData,raw);return structuredClone(raw)}
      const legacyUnits=Math.max(1,Math.ceil((1024+task.decisions.length*1000+(task.tactical?1600+task.promotions.length*600:0))/6000))
      const units=saved.validationId==='guide-finite-audit-4'?boundedAuditOutputUnits(task.quantityContext,task.decisions.length+(task.tactical?1+task.promotions.length:0)):Math.max(2,legacyUnits*2)
      return withGuideSegmentRetry({stage:saved.stage,role:saved.role,instructions:saved.instructions,task:saved.task,data:savedData,schema:saved.schema,units,deliveryFollowupKeys,outputCapacity:{scope:options.scope,packetHash:guideHash(options.packet),kind:saved.validationId},reserveCalls:reserve+1,read,cacheValidation:{id:saved.validationId,validate:value=>{read(value)}}},options.scope,options.archive)
    }
    const schema=object({caseId:literal(native.id),sourceHash:literal(sourceHash),candidatesHash:literal(candidatesHash),turnKey:literal(task.key),quantityContextHash:literal(data.quantityContextHash),decisions:object(Object.fromEntries(task.decisions.map((_,i)=>['d'+i,narrative]))),tactical:task.tactical?object({comparison:narrative,promotions:object(Object.fromEntries(task.promotions.map((_,i)=>['p'+i,narrative])))}):{type:'null'}})
    const read=(raw:any)=>{assertNativeScenarioSchema(raw,schema);quantifiedPatch(data,raw);return structuredClone(raw)}
    const units=bounded?boundedAuditOutputUnits(task.quantityContext,task.decisions.length+(task.tactical?1+task.promotions.length:0)):Math.max(2,Math.ceil((1024+task.decisions.length*1000+(task.tactical?1600+task.promotions.length*600:0))/6000)*2),validationId=bounded?'guide-finite-audit-4':'guide-finite-audit-3'
    return withGuideSegmentRetry({stage:'segment-finite-audit-'+native.id+'-'+task.key,role:'constructor',units,outputCapacity:{scope:options.scope,packetHash:guideHash(options.packet),kind:validationId},instructions:guideFiniteInstructions('native'),task:'Confronta TUTTI i candidati assegnati, conservando il registro. dN confronta la finestra prima dell’evento; pN valuta la promozione del lato indicato; comparison copre carte e attacchi del turno. Ogni frammento ha esattamente un contenuto non null: text naturale per condizioni e motivazioni, quantity per copie effettive di lato/stampa/zona/finestra/destinatario, measureId per valori stampati, card per nomi. Articoli, plurali e assenze logiche sono ammessi nel testo: non usare però la prosa per aggirare quantità, fonti o disponibilità. I riferimenti quantity restano verificati esattamente dal codice; una revisione semantica indipendente controllerà le affermazioni nel testo, incluse quelle implicite. list è totale lista, mai saldo del mazzo; non anticipare carte dei Premi, pescate o accessi. Mantieni tutte le condizioni, costi e limiti. '+(bounded?BOUNDED_AUDIT_TEXT_INSTRUCTIONS:'Limiti finali invariati: dN1000,comparison1600,pN600 caratteri.')+' Correggi ogni rilievo di feedback/semanticFeedback senza cambiare il registro. Il critico completo e la validazione fisica restano obbligatori.',data,schema,deliveryFollowupKeys,reserveCalls:reserve+1,read,cacheValidation:{id:validationId,validate:value=>{read(value)}}},options.scope,options.archive)
  }
  const declarations=tasks.map(task=>{
    const data=request(task).data as any
    const legacyIds=[...matchingEvidenceFields<any>(options.archive,'guide-finite-request-v1',[
      {path:['request','validationId'],expected:['guide-finite-audit-2']},
      {path:['request','data','sourceHash'],expected:[sourceHash]},
    ])].map(r=>r.key)
    const rows=[...matchingEvidenceFields<any>(options.archive,'guide-segment-unit-result-v1',[{path:['unitId'],expected:legacyIds}])].filter(r=>{const d=options.archive.value<any>('guide-finite-request-v1',r.value.unitId);return d?.scopeHash===guideHash(options.scope)&&d.request.validationId==='guide-finite-audit-2'&&['sourceHash','candidatesHash','quantityContextHash','turnKey','decisions','promotions','locationPath','auditCards','auditAttacks'].every(k=>guideHash(d.request.data[k])===guideHash(data[k]))&&guideHash(d.request.data.feedback??null)===guideHash(data.feedback??null)}).sort((a,b)=>Number(b.value.accepted)-Number(a.value.accepted)||b.value.retryOrdinal-a.value.retryOrdinal)
    const adopted=rows.flatMap(r=>{try{const ref:AuditDeclarationRef={unitId:r.value.unitId,outcomeKey:r.key,inputVersion:2,...r.value.accepted?{}:{declarationOnly:true}};readAuditDeclaration(ref,options,(d,raw)=>{assertNativeScenarioSchema(raw,options.archive.value<any>('guide-finite-request-v1',ref.unitId).request.schema);return quantifiedPatch(d,raw,3)});return [{raw:r.value.raw,ref}]}catch{return []}})[0]
    if(!adopted&&rows.some(r=>!r.value.accepted&&!guideSemanticRetryAllowed(options.archive,rows.filter(v=>!v.value.accepted&&v.value.unitKey===r.value.unitKey).length)))throw new AiFailure('invalid-response','Audit storico ancora invalido nel protocollo nuovo: due risposte non valide conservate; nessun costruttore riavviato dal cambio di formato.')
    return adopted
  })
  const repaired=structuredClone(native),refs:AuditDeclarationRef[]=[],languageRefs=[],certificates=[]
  for(const [index,task]of tasks.entries()){
    const data=request(task).data as any,reserve=options.reserveOutside+declarations.slice(index+1).reduce((n,d)=>n+(d?1:2),0),taskKey=guideHash({scope:options.scope,sourceHash,candidatesHash,key:task.key})
    const source=await resolveAuditLanguage(taskKey,declarations[index],(round,feedback)=>request(task,round,feedback,reserve),(raw,originalData)=>{const bound=originalData??data;return {context:bound.quantityContext,targets:quantifiedPatch(bound,raw,3).targets,contextFacts:auditContextFacts(bound)}},{...options,deliveryAuditKey:native.id+'/'+(options.deliveryLineId??'setup')+'/'+task.key},reserve)
    const sourceData=options.archive.value<any>('guide-finite-request-v1',source.ref.unitId)!.request.data,patch=quantifiedPatch(sourceData,source.raw,3);certificates.push(...patch.certificates);languageRefs.push(source.review)
    for(const [i,choice]of task.decisions.entries())guideAuditAt(repaired,choice.path).decisionProof={cards:[...choice.candidateIds],reason:patch.decisions['d'+i]}
    if(task.tactical){const tactical=patch.tactical;if(!tactical)throw Error('Audit quantitativo: motivazioni tattiche mancanti.');guideAuditAt(repaired,task.location.path).tactical={cards:task.cards,attacks:task.attacks,comparison:tactical.comparison,promotions:task.promotions.map((p,i)=>({...p,reason:tactical.promotions['p'+i]}))}}
    refs.push(source.ref)
  }
  if(guideHash(guideWithoutNativeAudits(repaired,mode))!==immutableHash)throw Error('Riparazione audit: registro o testo esterno agli audit modificato.')
  const record={version:1,quantityVersion:1,auditProtocol:3,...frontierVersion===2?{frontierVersion:2}:{},...isGuideDelivery(options.packet.basis)?{deliveryLineId:options.deliveryLineId??'setup'}:{},languageRefs,certified:certificates,scope:options.scope,packetHash:guideHash(options.packet),mode,sourceHash,immutableHash,candidatesHash,repairedHash:guideHash(repaired),...feedback?{feedbackHash:guideHash(feedback)}:{},refs,requiresCompleteValidation:true,requiresIndependentReview:true}
  const key=guideHash(record),existing=[...options.archive.values<any>('guide-native-audit-repair-v1')].filter(r=>r.value.auditProtocol===3&&(!isGuideDelivery(options.packet.basis)||r.value.deliveryLineId===(options.deliveryLineId??'setup'))&&r.value.sourceHash===sourceHash&&guideHash(r.value.scope)===guideHash(options.scope)&&guideHash(r.value.mode)===guideHash(mode)&&(r.value.feedbackHash??guideHash(null))===guideHash(feedback??null))
  if(existing.some(r=>r.key!==guideHash(r.value)||r.key!==key))throw Error('Riparazione audit: ricevuta precedente alterata o ambigua.')
  options.archive.saveValue('guide-native-audit-repair-v1',key,record)
  return repaired
}


