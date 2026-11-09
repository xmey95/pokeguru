import {matchingEvidenceValues} from './ai-evidence-selection'
import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {finiteGuideRuntime,assertFiniteTransportHistory} from './guide-finite-runtime'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideSegmentUnitIdentity,guideSegmentAcceptedUnit} from './guide-segment-batch'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {AiFailure} from './ai-failure'
import {repairGuideNativeAudits} from './guide-audit-repair'
import {isGuideDelivery,assertGuideDeliveryNative,assertGuideDeliveryTurn} from '../shared/guide-delivery'
import {guideDeliverySchema} from './guide-delivery-schema'
import {repairGuideSetupPosition,GuideSetupPositionRejected} from './guide-position-repair'
import {plannedGuideHistoricalHeader,coherentGuideHistoricalTurn} from './guide-historical-plan'

const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value})
type Ref={unitId:string;outcomeKey:string}
interface Header {caseId:string;contextHash:string;frame:Record<string,any>;leadOpponent:boolean;rounds:number;changeSummary:string}
interface Turn {caseId:string;headerHash:string;slotId:string;previousHash:string;body:Record<string,any>}
interface Rejection {version:1;contextHash:string;ordinal:number;native:Record<string,any>;auditedHash?:string;message:string;header:Ref;turns:Ref[]}
interface PlanRejection {version:1;contextHash:string;ordinal:number;caseId:string;message:string;header:Ref;turns:Ref[];failedTurn:Ref;slotId:string}
export interface FiniteSetupInput<T>{
  caseId:string;nativeSchema:any;fixedOpening?:Record<string,any>;context:unknown
  /** The unchanged complete schema/ledger/physical/tactical gate. Fragments
   * are declarations, never independently approved setup states. */
  validate:(native:Record<string,any>,changeSummary:string)=>T
}

/** One frame followed by individual historical turns. Assembly only combines
 * AI-authored fields and the already frozen opening; it invents no movements,
 * audit, resources, annotations or approvals. Position-only repair can request
 * fresh AI annotations after the complete movement replay. Every setup still
 * passes the original complete reader before any main-line construction. */
export async function constructFiniteGuideSetup<T>(input:FiniteSetupInput<T>,original:GuideConstructionRuntime):Promise<T>{
  const options=original.prepareRequest?original:finiteGuideRuntime(original)
  assertFiniteTransportHistory(options.archive,options.scope)
  const delivery=isGuideDelivery(options.packet.basis),schema=delivery?guideDeliverySchema(input.nativeSchema,true):input.nativeSchema,properties=schema.properties,maxRounds=properties?.setupRounds?.maxItems
  if(!properties?.opening||!properties.firstOpponentTurn||!Number.isSafeInteger(maxRounds)||maxRounds<0||!properties.setupRounds.items?.properties?.ours||!properties.setupRounds.items.properties.opponent)throw Error('Setup frammentato: schema nativo completo non disponibile.')
  const contextHash=guideHash({scope:options.scope,packet:options.packet,caseId:input.caseId,schema,fixedOpening:input.fixedOpening??null,context:input.context})
  const untilValid=!!guideUntilValidAuthority(options.archive),planRole='guide-finite-setup-plan-rejection-v1',planning=[...options.archive.values<PlanRejection>(planRole)].filter(r=>r.value.contextHash===contextHash)
  for(const row of planning){
    const p=row.value
    if(!untilValid||row.key!==guideHash(p)||p.version!==1||p.caseId!==input.caseId||!Number.isSafeInteger(p.ordinal)||p.ordinal<0)throw Error('Setup frammentato: rifiuto di pianificazione alterato.')
    const frame=options.archive.value<any>('guide-segment-unit-result-v1',p.header.outcomeKey)
    for(const ref of [p.header,...p.turns,p.failedTurn]){
      const source=options.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey),d=options.archive.value<any>('guide-finite-request-v1',ref.unitId)
      if(!source?.accepted||source.unitId!==ref.unitId||ref.outcomeKey!==guideHash(source)||!d||d.scopeHash!==guideHash(options.scope)||d.request.data.caseId!==input.caseId||d.request.data.ordinal!==p.ordinal)throw Error('Setup frammentato: rifiuto di pianificazione senza originali autentici.')
      if(ref===p.header){if(!/^guide-finite-setup-frame-[12]$/.test(d.request.validationId)||source.value.contextHash!==contextHash)throw Error('Setup frammentato: quadro del rifiuto estraneo.')}
      else if(d.request.data.headerHash!==guideHash(frame.value)||!/^guide-finite-setup-turn-[123]$/.test(d.request.validationId))throw Error('Setup frammentato: turno del rifiuto estraneo.')
      if(ref===p.failedTurn&&(!/^guide-finite-setup-turn-[23]$/.test(d.request.validationId)||source.value.outcome!=='rebuild-required'||source.value.body!==null||source.value.reason!==p.message||source.value.slotId!==p.slotId))throw Error('Setup frammentato: rifiuto diverso dalla dichiarazione AI originale.')
      if(ref!==p.header&&ref!==p.failedTurn&&d.request.validationId!=='guide-finite-setup-turn-1'&&source.value.outcome!=='complete')throw Error('Setup frammentato: prefisso del rifiuto non completo.')
    }
  }
  const role='guide-finite-setup-negative-v1',known=[...options.archive.values<Rejection>(role)].filter(r=>r.value.contextHash===contextHash)
  for(const row of known)if(row.key!==guideHash(row.value)||row.value.version!==1||!Number.isSafeInteger(row.value.ordinal)||row.value.ordinal<0||!guideSemanticRetryAllowed(options.archive,row.value.ordinal))throw Error('Setup frammentato: rifiuto locale alterato.')
  if(new Set(known.map(r=>r.value.ordinal)).size!==known.length)throw Error('Setup frammentato: rifiuti locali ambigui.')
  if(new Set([...known,...planning].map(r=>r.value.ordinal)).size!==known.length+planning.length)throw Error('Setup frammentato: rifiuti di pianificazione ambigui.')
  const constructed=[...options.archive.values<any>('guide-finite-setup-constructed-v1')].filter(r=>r.value.contextHash===contextHash)
  for(const row of constructed){
    const saved=row.value
    if(row.key!==guideHash(saved)||saved.version!==1||!Number.isSafeInteger(saved.ordinal)||saved.ordinal<0||!guideSemanticRetryAllowed(options.archive,saved.ordinal)||guideHash(saved.scope)!==guideHash(options.scope)||saved.packetHash!==guideHash(options.packet)||saved.completeOriginalValidation!==true||saved.requiresIndependentPremiseReview!==true)throw Error('Setup frammentato: successore costruito alterato.')
    for(const ref of [saved.header,...saved.turns]){
      const source=options.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey),descriptor=options.archive.value<any>('guide-finite-request-v1',ref.unitId)
      if(!source?.accepted||source.unitId!==ref.unitId||ref.outcomeKey!==guideHash(source)||!descriptor||descriptor.scopeHash!==guideHash(options.scope))throw Error('Setup frammentato: successore senza originali autentici.')
      if(descriptor.request.data.caseId!==input.caseId||descriptor.request.data.ordinal!==saved.ordinal)throw Error('Setup frammentato: fonti di un altro caso o tentativo.')
      if(ref===saved.header&&(!/^guide-finite-setup-frame-[12]$/.test(descriptor.request.validationId)||descriptor.request.data.contextHash!==contextHash||source.value.contextHash!==contextHash))throw Error('Setup frammentato: quadro di un altro contesto.')
      if(ref!==saved.header){const frame=options.archive.value<any>('guide-segment-unit-result-v1',saved.header.outcomeKey);if(!/^guide-finite-setup-turn-[123]$/.test(descriptor.request.validationId)||descriptor.request.data.headerHash!==guideHash(frame.value)||descriptor.request.validationId!=='guide-finite-setup-turn-1'&&source.value.outcome!=='complete')throw Error('Setup frammentato: turno di un altro quadro.')}
    }
  }
  if(new Set(constructed.map(r=>r.value.ordinal)).size!==constructed.length)throw Error('Setup frammentato: successori costruiti ambigui.')
  const nonNull=(node:any)=>node.anyOf?.find((n:any)=>n.type!=='null')??node
  const frameSchema=object(Object.fromEntries(Object.entries(properties).filter(([key])=>!['firstOpponentTurn','setupRounds',...input.fixedOpening?['opening']:[]].includes(key))))
  const headerSchema=object({caseId:literal(input.caseId),contextHash:literal(contextHash),frame:frameSchema,leadOpponent:{type:'boolean'},rounds:{type:'integer',minimum:0,maximum:maxRounds},changeSummary:{type:'string',minLength:1,maxLength:2000}})
  const rejections:(Rejection|PlanRejection)[]=[]
  async function unit<V>(id:string,stage:string,make:()=>GuideSegmentRequest<V>):Promise<{value:V;source:Ref}>{
    let value:V|undefined
    await runGuideSegmentPhase([{id,request:make,accept:result=>{value=result}}],{...options,stage})
    const current=options.prepareRequest!(make()),unitId=guideSegmentUnitIdentity(current).unitId
    const source=[...matchingEvidenceValues<any>(options.archive,'guide-segment-unit-result-v1','unitId',unitId)].find(r=>r.value.unitId===unitId&&r.value.accepted)
    if(!source||value===undefined)throw Error('Setup frammentato: risposta originale accettata mancante.')
    readAcceptedGuideTransport(current,source,options.archive)
    return {value,source:{unitId,outcomeKey:source.key}}
  }
  for(let ordinal=0;guideSemanticRetryAllowed(options.archive,ordinal);ordinal++){
    options.check()
    const previousRejections=structuredClone(rejections)
    const header=await unit('frame','segments-finite-setup-frames',()=>{
      const read=(raw:unknown):Header=>{assertNativeScenarioSchema(raw,headerSchema);return structuredClone(raw) as Header}
      const legacy=withGuideSegmentRetry({stage:'segment-finite-setup-frame-'+input.caseId,role:'constructor',instructions:guideFiniteInstructions('native'),
        task:'Definisci soltanto il quadro del setup e quanti round precedenti sono necessari. Non scrivere i turni: ogni turno storico sarà richiesto separatamente. leadOpponent indica se il primo turno storico è avversario; ogni round contiene poi ours e opponent. Le annotazioni descrivono la posizione finale desiderata e saranno controllate soltanto sul registro completo. Non eliminare sviluppo o azioni per ridurre il numero dei round.',
        data:{packet:options.packet,context:input.context,caseId:input.caseId,contextHash,fixedOpening:input.fixedOpening??null,ordinal,previousRejections},schema:headerSchema,reserveCalls:options.reserveOutside,read,cacheValidation:{id:'guide-finite-setup-frame-1',validate:value=>{read(value)}}},options.scope,options.archive)
      return plannedGuideHistoricalHeader(legacy,headerSchema,maxRounds,options)
    })
    const headerHash=guideHash(header.value),slots:{id:string;side:'ours'|'opponent';schema:any}[]=[]
    if(header.value.leadOpponent)slots.push({id:'first-opponent',side:'opponent',schema:nonNull(properties.firstOpponentTurn)})
    for(let round=0;round<header.value.rounds;round++)for(const side of ['ours','opponent'] as const)slots.push({id:`round-${round+1}-${side}`,side,schema:properties.setupRounds.items.properties[side]})
    const turns:{slotId:string;body:Record<string,any>}[]=[],refs:Ref[]=[]
    let replan=false
    for(const [index,slot]of slots.entries()){
      const previousTurns=structuredClone(turns),previousHash=guideHash(previousTurns)
      const turnSchema=object({caseId:literal(input.caseId),headerHash:literal(headerHash),slotId:literal(slot.id),previousHash:literal(previousHash),body:slot.schema})
      const legacyTurn=()=>{
        const read=(raw:unknown):Turn=>{assertNativeScenarioSchema(raw,turnSchema);if(delivery)assertGuideDeliveryTurn((raw as Turn).body);return structuredClone(raw) as Turn}
        return withGuideSegmentRetry({stage:'segment-finite-setup-'+input.caseId+'-'+slot.id,role:'constructor',instructions:guideFiniteInstructions(delivery?'declaration':'native'),
          task:delivery?'Dichiara soltanto questo turno storico '+slot.side+', con tutte le azioni e risorse necessarie allo sviluppo richiesto da context e header.frame. Non riscrivere apertura, pescate, quadro o turni precedenti. previousTurns contiene dichiarazioni originali: ricava da esse le disponibilità, senza aggiungere risorse. tactical e decisionProof restano null in questa fase; verranno completati dagli audit separati prima del lettore completo e del critico. Prima di terminare verifica quali obiettivi storici sono realizzati dai movimenti e quali richiedono i turni successivi; non sostituire le azioni con un’ammissione di incompletezza.':
          'Costruisci soltanto questo turno storico '+slot.side+', completando movimenti, pagamenti, audit di attacchi/carte/promozioni e motivazioni. Non riscrivere il quadro o i turni precedenti. previousTurns contiene dichiarazioni originali, non stati approvati: ricava le disponibilità dalla medesima apertura e dal registro, senza aggiungere risorse. Tutto il setup passerà la validazione completa prima della linea. Le carte degli audit sono printId, mai sourceId o nomi.',
          data:{packet:options.packet,context:input.context,caseId:input.caseId,header:header.value,headerHash,slotId:slot.id,side:slot.side,ordinaryTurn:index+1,fixedOpening:input.fixedOpening??null,previousHash,previousTurns,ordinal,previousRejections},schema:turnSchema,reserveCalls:options.reserveOutside+slots.length-index-1,read,cacheValidation:{id:'guide-finite-setup-turn-1',validate:value=>{read(value)}}},options.scope,options.archive)
      }
      const turn=await unit<any>(slot.id,'segments-finite-setup-turns',()=>{
        const legacy=legacyTurn()
        if(!untilValid||guideSegmentAcceptedUnit(options.archive,options.prepareRequest!(legacy))!==undefined)return legacy
        const routedSchema=object({...turnSchema.properties,outcome:{type:'string',enum:['complete','rebuild-required']},reason:{type:'string',minLength:1,maxLength:600},body:{anyOf:[slot.schema,{type:'null'}]}})
        const read=(raw:any)=>{assertNativeScenarioSchema(raw,routedSchema);if(raw.outcome==='complete'){if(raw.body===null)throw Error('Turno storico completo senza body.');if(delivery)assertGuideDeliveryTurn(raw.body)}else if(raw.body!==null)throw Error('Turno storico respinto: body deve essere null.');return structuredClone(raw)}
        const routed=withGuideSegmentRetry({...legacy,task:legacy.task+' PROTOCOLLO DI PIANIFICAZIONE: outcome=complete richiede un turno realmente eseguibile con tutte le conseguenze. Nel budget eventi dello schema includi KO, movimenti dei Premi, scarti delle carte assegnate e promozioni separate; non basta citarli in decision. Riserva spazio alle risoluzioni obbligatorie prima di occupare tutti gli eventi con sviluppo differibile; distribuisci lo sviluppo nei turni storici legalmente disponibili. Non dichiarare attacchi dei quali ometti la risoluzione. Se il prefisso congelato è irraggiungibile o il piano non è rappresentabile, usa outcome=rebuild-required, body=null e reason con la contraddizione: il chiamante ripianificherà il quadro intero. Non restituire un turno vuoto con una spiegazione di impossibilità e non inventare azioni, risorse o una pesca per rimediare al passato. reason non è un audit o un pass della premessa.',schema:routedSchema,read,cacheValidation:{id:'guide-finite-setup-turn-2',validate:raw=>{read(raw)}}},options.scope,options.archive)
        return coherentGuideHistoricalTurn(routed,options)
      })
      if(turn.value.outcome==='rebuild-required'){
        const rejection:PlanRejection={version:1,contextHash,ordinal,caseId:input.caseId,message:turn.value.reason,header:header.source,turns:structuredClone(refs),failedTurn:turn.source,slotId:slot.id},priorPlan=planning.find(r=>r.value.ordinal===ordinal)
        if(priorPlan&&guideHash(priorPlan.value)!==guideHash(rejection))throw Error('Setup frammentato: rifiuto di pianificazione diverso dagli originali.')
        options.archive.saveValue(planRole,guideHash(rejection),rejection);rejections.push(rejection);replan=true;break
      }
      turns.push({slotId:slot.id,body:turn.value.body});refs.push(turn.source)
    }
    if(replan)continue
    const bodies=new Map(turns.map(t=>[t.slotId,t.body]))
    const native={...structuredClone(header.value.frame),...input.fixedOpening?{opening:structuredClone(input.fixedOpening)}:{},firstOpponentTurn:header.value.leadOpponent?bodies.get('first-opponent'):null,
      setupRounds:Array.from({length:header.value.rounds},(_,i)=>({ours:bodies.get(`round-${i+1}-ours`),opponent:bodies.get(`round-${i+1}-opponent`)}))}
    const prior=known.find(r=>r.value.ordinal===ordinal)
    if(prior){
      if(guideHash(prior.value.native)!==guideHash(native)||guideHash(prior.value.header)!==guideHash(header.source)||guideHash(prior.value.turns)!==guideHash(refs))throw Error('Setup frammentato: originale respinto diverso dalle fonti autentiche.')
      // Keep all earlier negatives. Resume the latest physical declaration;
      // only fresh, authenticated AI audit judgments may change its audit.
      if(known.some(r=>r.value.ordinal>ordinal)||constructed.some(r=>r.value.ordinal>ordinal)){rejections.push(prior.value);continue}
    }
    let result:T
    let audited=native
    try{
      assertNativeScenarioSchema(native,schema)
      audited=await repairGuideSetupPosition(native,options) as typeof native
      audited=await repairGuideNativeAudits(audited,{kind:'setup'},{...options,deliveryLineId:'setup'}) as typeof native
      if(delivery)assertGuideDeliveryNative(audited)
      if(prior&&(prior.value.auditedHash===guideHash(audited)||prior.value.auditedHash===undefined&&guideHash(audited)===guideHash(native))){
        if(guideSemanticRetryAllowed(options.archive,ordinal+1)){rejections.push(prior.value);continue}
        throw new AiFailure('draft-limit','Setup ancora non valido dopo due costruzioni complete frammentate: rifiuto noto conservato senza nuove dichiarazioni AI di audit.')
      }
      result=input.validate(audited,header.value.changeSummary)
    }
    catch(error){
      if(error instanceof AiFailure)throw error
      if(prior&&error instanceof GuideSetupPositionRejected){
        if(prior.value.message!==error.message)throw new AiFailure('invalid-response','Rifiuto del registro diverso dalla dichiarazione AI autentica conservata.')
        if(guideSemanticRetryAllowed(options.archive,ordinal+1)){rejections.push(prior.value);continue}
      }
      if(prior)throw new AiFailure('draft-limit',(ordinal===1?'Setup ancora non valido dopo due costruzioni complete frammentate.':'Setup già respinto: ripresa interrotta sul controllo originale.')+' Nessun controllo rimosso; dichiarazioni e rifiuti conservati. '+(error instanceof Error?error.message:String(error)))
      const rejection:Rejection={version:1,contextHash,ordinal,native,auditedHash:guideHash(audited),message:error instanceof Error?error.message:String(error),header:header.source,turns:refs}
      options.archive.saveValue(role,guideHash(rejection),rejection);rejections.push(rejection)
      if(!guideSemanticRetryAllowed(options.archive,ordinal+1))throw new AiFailure('draft-limit','Setup ancora non valido dopo due costruzioni complete frammentate. Nessun controllo rimosso; dichiarazioni e rifiuti conservati. '+rejection.message)
      continue
    }
    const record={version:1,contextHash,ordinal,scope:options.scope,packetHash:guideHash(options.packet),native:audited,originalNativeHash:guideHash(native),changeSummary:header.value.changeSummary,header:header.source,turns:refs,completeOriginalValidation:true,requiresIndependentPremiseReview:true}
    const saved=constructed.find(r=>r.value.ordinal===ordinal)
    if(saved&&guideHash(saved.value)!==guideHash(record))throw Error('Setup frammentato: il successore riaperto differisce dalle dichiarazioni autenticate.')
    options.archive.saveValue('guide-finite-setup-constructed-v1',guideHash(record),record)
    return result
  }
  throw Error('Setup frammentato: nessun risultato.')
}
import {guideSemanticRetryAllowed,guideUntilValidAuthority} from './guide-run-policy'
