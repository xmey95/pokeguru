import type {GuideConstructionRuntime} from './guide-reply-phase'
import {constructGuideMainLines} from './guide-mainline-phase'
import {finiteGuideRuntime,assertFiniteTransportHistory} from './guide-finite-runtime'
import {constructGuideFiniteCases,finiteNativeWitnesses} from './guide-finite-cases'
import type {GuideFinitePlan} from './guide-finite-plan'
import {reviewFiniteGuide,readFiniteReviewHistory,aggregateFiniteGuideReviews,type GuideFiniteReview,type GuideFiniteFinding} from './guide-finite-review'
import {writeFiniteGuideProse} from './guide-finite-prose'
import {guideHash} from './matchup-guide-packet'
import {nativeRepairCase,nativeRepairSchema,applyNativeRepair} from './guide-native-repair'
import {guideContentProperties} from './matchup-guide-schema'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {assertConstructedRepair} from '../shared/guide-scenario-output'
import {checkGuide,readGuideContent,type GuideContent} from '../shared/matchup-guide'
import {GuidePremiseSetupRejected,withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {repairGuideSetup} from './guide-setup-repair'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {AiFailure} from './ai-failure'
import {routeFinitePremise,repairFinitePremiseAudits,repairFinitePremiseTexts} from './guide-finite-premise-audit'
import {assertFiniteAuditCountsMany,certifyFiniteAuditCounts,rejectedFiniteAuditReview} from './guide-audit-count-gate'
import {lateAuditFeedback as buildLateAuditFeedback,type LateAuditLink} from './guide-late-audit-feedback'
import {guideSegmentDeclarations} from './guide-segments'
import {finiteCriticContract} from './guide-finite-critic-contract'
import {hasFinalTextPartitions} from './guide-final-text-partitions'

const role='guide-finite-candidate-v1',outcomeRole='guide-segment-unit-result-v1'
interface Ref{unitId:string;outcomeKey:string}
interface Candidate {version:1;scopeHash:string;baseHash:string;ordinal:number;parentHash:string|null;raw:GuideContent;feedback:GuideFiniteFinding[];previousDraft:GuideContent|null;reviewRefs:Ref[];patchRef:Ref|null}
const rawFacts=(raw:GuideContent,plans:GuideFinitePlan[],options:GuideConstructionRuntime,deferCounts=false):GuideContent=>{
  const auditLines:any[]=[]
  const scenarios=raw.scenarios.map(native=>{const witnesses=finiteNativeWitnesses(native,plans.find(p=>p.caseId===native.id)!,options);if(!deferCounts)for(const line of witnesses.lines)auditLines.push(guideSegmentDeclarations(line.journal,options.scope,options.packet));return witnesses.content.scenarios[0]})
  if(!deferCounts)assertFiniteAuditCountsMany(auditLines,options.packet,options.archive)
  const facts=readGuideContent({...raw,scenarios,chapters:[],exercises:[],limitations:[...new Set([...raw.limitations,...scenarios.flatMap(s=>s.analysisScope!.limits),...(options.evidencePacket??options.packet).gaps])]},'matchup-guide-28',options.packet.basis.analysisContract)
  const checked=checkGuide(facts,options.evidencePacket??options.packet,false);if(checked.errors.length)throw Error(checked.errors.join('\n'));return facts
}
function knownReviewRefs(reviews:GuideFiniteReview[],options:GuideConstructionRuntime):Ref[]{
  return reviews.map(review=>{
    const row=[...options.archive.values<any>(outcomeRole)].find(r=>r.value.accepted&&guideHash(r.value.value)===guideHash(review))
    if(!row)throw Error('Riparazione finita: critica originale mancante.')
    return {unitId:row.value.unitId,outcomeKey:row.key}
  })
}
function readReviewRefs(refs:Ref[],options:GuideConstructionRuntime):GuideFiniteReview[]{
  const history=new Set(readFiniteReviewHistory(options).map(guideHash))
  return refs.map(ref=>{const row=options.archive.value<any>(outcomeRole,ref.outcomeKey);if(!row||row.unitId!==ref.unitId||guideHash(row)!==ref.outcomeKey||!row.accepted||!history.has(guideHash(row.value))||row.value.verdict==='pass')throw Error('Riparazione finita: rifiuto originale assente o alterato.');return row.value})
}
function repairProtocol(options:GuideConstructionRuntime):1|3|4{
 const quantitative=[...options.archive.values<any>('guide-audit-count-policy-v1')][0]?.value.mode==='quantified'
 return quantitative?finiteCriticContract(options)===3?4:3:1
}
function patchSchema(parent:Candidate,findings:GuideFiniteFinding[],options:GuideConstructionRuntime,protocol:1|3|4=repairProtocol(options)){
  const targets=new Set(findings.flatMap(f=>f.repair.kind==='case'?[f.repair.caseId]:[])),cases=parent.raw.scenarios.filter(s=>targets.has(s.id)).map(s=>nativeRepairCase(s as any,guideHash(options.packet.basis)))
  if(cases.length!==targets.size)throw Error('Riparazione finita: caso estraneo al piano.')
  const claims=structuredClone(guideContentProperties.claims) as any;claims.items.properties.sourceIds.items={type:'string',enum:(options.evidencePacket??options.packet).sources.map(s=>s.id)}
  const schema=nativeRepairSchema(cases,claims,true) as any
  schema.properties.candidateHash={type:'string',const:guideHash(parent)};schema.required.push('candidateHash')
  if(protocol===4){schema.properties.limitations=structuredClone(guideContentProperties.limitations);schema.required.push('limitations')}
  return {cases,schema}
}
function applyPatch(raw:any,parent:Candidate,findings:GuideFiniteFinding[],plans:GuideFinitePlan[],options:GuideConstructionRuntime,deferCounts=false,protocol:1|3|4=repairProtocol(options)){
  const {cases,schema}=patchSchema(parent,findings,options,protocol)
  assertNativeScenarioSchema(raw,schema);assertConstructedRepair(raw)
  const changed=applyNativeRepair(raw,cases,true)
  const next={...structuredClone(parent.raw),scenarios:parent.raw.scenarios.map(s=>changed.find(n=>n.id===s.id)??s),claims:structuredClone(raw.claims),...protocol===4?{limitations:structuredClone(raw.limitations)}:{},changeSummary:raw.changeSummary} as GuideContent
  rawFacts(next,plans,options,deferCounts);return next
}
function auditFeedback(links:LateAuditLink[],parent:Candidate,findings:GuideFiniteFinding[],plans:GuideFinitePlan[],options:GuideConstructionRuntime){
 return buildLateAuditFeedback(links,guideHash(parent),findings,options,(raw,protocol)=>applyPatch(raw,parent,findings,plans,options,true,protocol).scenarios.flatMap(native=>finiteNativeWitnesses(native,plans.find(p=>p.caseId===native.id)!,options).lines.map(line=>guideSegmentDeclarations(line.journal,options.scope,options.packet))))
}
function repairRequest(parent:Candidate,findings:GuideFiniteFinding[],plans:GuideFinitePlan[],options:GuideConstructionRuntime,lateLinks:LateAuditLink[]=[]):GuideSegmentRequest<any>{
  const protocol=repairProtocol(options)
  const late=auditFeedback(lateLinks,parent,findings,plans,options)
  const {cases,schema}=patchSchema(parent,findings,options),read=(raw:unknown)=>{applyPatch(raw,parent,findings,plans,options,true);return structuredClone(raw)}
  const quantitative=[...options.archive.values<any>('guide-audit-count-policy-v1')][0]?.value.mode==='quantified'
  const paid=[...options.archive.values<any>(outcomeRole)].filter(r=>r.value.accepted).map(r=>options.archive.value<any>('guide-finite-request-v1',r.value.unitId)).find(d=>d?.scopeHash===guideHash(options.scope)&&d.request.validationId==='guide-finite-native-repair-'+protocol&&d.request.data.candidateHash===guideHash(parent)&&guideHash(d.request.data.findings)===guideHash(findings)&&guideHash(d.request.data.lateAuditFeedback?.history??[])===guideHash(lateLinks))
  const positionEvidence=!!guideUntilValidAuthority(options.archive)&&(paid?paid.request.data.auditPositionEvidenceVersion===1:true)
  return withGuideSegmentRetry({stage:'repair-finite-cases-'+parent.ordinal,role:'constructor',instructions:guideFiniteInstructions('evaluation'),task:'Correggi tutti i rilievi sui casi con una transazione sui soli nativeCases assegnati. Conserva identità, lista, apertura, scelta delle risposte e orizzonte. Puoi correggere turni, sviluppo, conti, affermazioni o delimitare un consiglio; non aggiungere risposte e non inventare una prova. I testi dipendenti saranno riscritti e tutto riesaminato.'+(protocol===4?' Puoi correggere anche limitations globali: mantieni tutte le condizioni vere e le lacune, distinguendo esplicitamente il caso cui appartengono. contextCases sono contesto congelato; modifica i soli nativeCases assegnati. decisionProof.cards segue i candidati esatti del replay, che escludono un secondo Supporter dopo quello già usato. Non aggiungere carte non eleggibili per soddisfare una critica: chiarisci i fatti e sottoponili al nuovo riesame.':'' )+(quantitative?' Conserva le quantità citate negli audit solo se restano vere nel nuovo registro. Articoli e condizioni qualitative sono ammessi; nuovi conteggi o testi modificati richiedono riesame quantitativo indipendente. I campi fisici numerici e le prove restano completi e obbligatori.':'')+(late?' lateAuditFeedback contiene proposte provvisorie e veri rifiuti quantitativi, non approvazioni. Ricomponi la transazione completa dallo stesso candidato: conserva le correzioni valide di proposedPatch e correggi esattamente i testi respinti nei reviews. Non inventare quantità o prove mancanti; rendi condizionale un’affermazione non dimostrata. Tutti i nuovi testi avranno un altro riesame prima di diventare un candidato.':''),data:{packet:options.evidencePacket??options.packet,candidateHash:guideHash(parent),nativeCases:cases,claims:parent.raw.claims,findings,...positionEvidence?{auditPositionEvidenceVersion:1}:{},...protocol===4?{limitations:parent.raw.limitations,contextCases:parent.raw.scenarios}:{},...late?{lateAuditFeedback:late}:{}},schema,reserveCalls:options.reserveOutside,read,finalize:async raw=>{const next=applyPatch(raw,parent,findings,plans,options,true);if(quantitative){const natives=next.scenarios.flatMap(native=>finiteNativeWitnesses(native,plans.find(p=>p.caseId===native.id)!,options).lines.map(line=>guideSegmentDeclarations(line.journal,options.scope,options.packet)));await certifyFiniteAuditCounts(natives,options,false,positionEvidence)}applyPatch(raw,parent,findings,plans,options);return raw},cacheValidation:{id:'guide-finite-native-repair-'+protocol,validate:value=>{read(value)}}},options.scope,options.archive)
}
/** Pure candidate-chain replay. No scheduling, writes, progress observation or
 * provider call; each repair is reapplied from its actual accepted raw patch. */
function readCandidates(initial:Candidate,plans:GuideFinitePlan[],options:GuideConstructionRuntime):Candidate{
  const rows=[...options.archive.values<Candidate>(role)].filter(r=>r.value.baseHash===initial.baseHash),byParent=new Map<string,Candidate>()
  for(const row of rows){
    const c=row.value
    if(row.key!==guideHash(c)||c.version!==1||c.scopeHash!==guideHash(options.scope)||!Number.isSafeInteger(c.ordinal)||c.ordinal<0||!guideSemanticRetryAllowed(options.archive,c.ordinal,3))throw Error('Ripresa finita: candidato alterato o fuori policy.')
    const parent=c.parentHash??'root'
    if(byParent.has(parent))throw Error('Ripresa finita: due candidati successori, nessuna scelta implicita.')
    byParent.set(parent,c)
  }
  let current=byParent.get('root')??initial
  if(guideHash(current)!==guideHash(initial))throw Error('Ripresa finita: base diversa dai modelli accettati.')
  let count=byParent.has('root')?1:0
  while(byParent.has(guideHash(current))){
    const next=byParent.get(guideHash(current))!;count++
    if(next.ordinal!==current.ordinal+1)throw Error('Ripresa finita: revisione saltata.')
    const reviews=readReviewRefs(next.reviewRefs,options),findings=reviews.flatMap(r=>r.findings)
    if(guideHash(findings)!==guideHash(next.feedback))throw Error('Ripresa finita: rilievi cambiati rispetto ai rifiuti originali.')
    if(next.previousDraft){const facts=rawFacts(current.raw,plans,options);if(guideHash(next.previousDraft.scenarios)!==guideHash(facts.scenarios)||checkGuide(next.previousDraft,options.evidencePacket??options.packet).errors.length)throw Error('Ripresa finita: prosa di una base diversa.')}
    let expected=current.raw
    if(next.patchRef){
      const source=options.archive.value<any>(outcomeRole,next.patchRef.outcomeKey),descriptor=options.archive.value<any>('guide-finite-request-v1',next.patchRef.unitId)
      const validationId=descriptor?.request.validationId,protocol:1|3|4=validationId==='guide-finite-native-repair-4'?4:validationId==='guide-finite-native-repair-3'?3:1
      const quantified=[...options.archive.values<any>('guide-audit-count-policy-v1')][0]?.value.mode==='quantified'
      if(quantified?protocol===1:protocol!==1)throw Error('Ripresa finita: downgrade o protocollo quantitativo estraneo.')
      if(protocol===4&&finiteCriticContract(options)!==3)throw Error('Ripresa finita: correzione globale senza il proprio contratto critico.')
      if(!source||source.unitId!==next.patchRef.unitId||!source.accepted||guideHash(source)!==next.patchRef.outcomeKey||!descriptor||!['guide-finite-native-repair-1','guide-finite-native-repair-3','guide-finite-native-repair-4'].includes(validationId)||descriptor.request.data.candidateHash!==guideHash(current)||guideHash(descriptor.request.data.findings)!==guideHash(findings))throw Error('Ripresa finita: transazione originale mancante o estranea.')
      const {cases,schema}=patchSchema(current,findings,options,protocol)
      if(descriptor.request.data.lateAuditFeedback&&guideHash(auditFeedback(descriptor.request.data.lateAuditFeedback.history,current,findings,plans,options))!==guideHash(descriptor.request.data.lateAuditFeedback))throw Error('Ripresa finita: feedback quantitativo non autenticato.')
      if(guideHash(cases)!==guideHash(descriptor.request.data.nativeCases))throw Error('Ripresa finita: casi della transazione modificati.')
      assertNativeScenarioSchema(source.raw,schema)
      if(guideHash(source.raw)!==guideHash(source.value))throw Error('Ripresa finita: patch accettata diversa dall’originale.')
      expected=applyPatch(source.raw,current,findings,plans,options,false,protocol)
    }else if(findings.some(f=>f.repair.kind==='case'))throw Error('Ripresa finita: riparazione dei casi senza patch.')
    if(guideHash(expected)!==guideHash(next.raw))throw Error('Ripresa finita: candidato diverso dalla patch AI.')
    current=next
  }
  if(count!==rows.length)throw Error('Ripresa finita: revisione orfana.')
  rawFacts(current.raw,plans,options);return current
}
export async function constructFiniteGuideContent(setups:Record<string,any>[],original:GuideConstructionRuntime){
  const options=finiteGuideRuntime(original)
  const currentSetups=structuredClone(setups)
  let mains:Awaited<ReturnType<typeof constructGuideMainLines>>[number]['journal'][]
  for(;;){
    try{mains=(await constructGuideMainLines({...options,setups:currentSetups,reserveOutside:options.reserveOutside+8})).map(r=>r.journal);break}
    catch(error){
      if(!(error instanceof GuidePremiseSetupRejected)||!error.prefix)throw error
      const index=currentSetups.findIndex(s=>s.id===error.prefix!.setup.id)
      if(index<0||guideHash(currentSetups[index])!==guideHash(error.prefix.setup))throw Error('Premessa finita: rifiuto estraneo al setup corrente.')
      const route=await routeFinitePremise(error.prefix,error.review,{...options,reserveOutside:options.reserveOutside+8})
      if(route.mode==='audit')currentSetups[index]=(await repairFinitePremiseAudits(error.prefix,error.review,route,{...options,reserveOutside:options.reserveOutside+8})).setup
      else if(route.mode==='text')currentSetups[index]=(await repairFinitePremiseTexts(error.prefix,error.review,route,{...options,reserveOutside:options.reserveOutside+8})).setup
      else if(error.review.repairScope==='setup')currentSetups[index]=await repairGuideSetup(error.prefix,error.review,{...options,reserveOutside:options.reserveOutside+8})
    }
  }
  const construction=await constructGuideFiniteCases(mains,{...options,reserveOutside:options.reserveOutside+3})
  const raw:GuideContent={chapters:[],claims:construction.built.flatMap(b=>b.raw.claims),scenarios:construction.built.map(b=>b.native as any),exercises:[],limitations:[...new Set(construction.built.flatMap(b=>b.raw.limitations))],changeSummary:construction.built.map(b=>b.raw.changeSummary).join('\n')}
  const initial:Candidate={version:1,scopeHash:guideHash(options.scope),baseHash:guideHash({scope:options.scope,packet:options.packet,raw,plans:construction.plans}),ordinal:0,parentHash:null,raw,feedback:[],previousDraft:null,reviewRefs:[],patchRef:null}
  let current=readCandidates(initial,construction.plans,options)
  options.archive.saveValue(role,guideHash(initial),initial)
  for(;;){
    options.check();assertFiniteTransportHistory(options.archive)
    const facts=rawFacts(current.raw,construction.plans,options),history=readFiniteReviewHistory(options)
    let reviews=await reviewFiniteGuide(facts,current.raw.scenarios,construction.plans,history,{...options,reserveOutside:options.reserveOutside+2},false),draft:GuideContent|undefined
    if(reviews.every(r=>r.verdict==='pass')){
      draft=await writeFiniteGuideProse(facts,current.feedback,current.previousDraft??undefined,{...options,reserveOutside:options.reserveOutside+1})
      reviews=await reviewFiniteGuide(draft,current.raw.scenarios,construction.plans,readFiniteReviewHistory(options),options,true)
      if(reviews.every(r=>r.verdict==='pass'))return {draft,review:aggregateFiniteGuideReviews(reviews,hasFinalTextPartitions(options)),reviews,natives:current.raw.scenarios,plans:construction.plans,initialConstruction:construction,repairs:current.ordinal,candidateHash:guideHash(current)}
    }
    if(!guideSemanticRetryAllowed(options.archive,current.ordinal))throw new AiFailure('draft-limit','Guida finita ancora respinta dopo due riparazioni complessive. Nessuna espansione delle risposte o rinuncia ai controlli; lavoro e rilievi conservati.')
    const feedback=reviews.flatMap(r=>r.findings),reviewRefs=knownReviewRefs(reviews.filter(r=>r.verdict!=='pass'),options)
    let nextRaw=current.raw,patchRef:Ref|null=null
    if(feedback.some(f=>f.repair.kind==='case')){
      const lateLinks:LateAuditLink[]=[],repairOptions={...options,reserveOutside:options.reserveOutside+3}
      for(;;){
        const make=()=>options.prepareRequest!(repairRequest(current,feedback,construction.plans,repairOptions,lateLinks))
        let patch:unknown
        try{await runGuideSegmentPhase([{id:'native-patch',request:make,accept:value=>{patch=value}}],{...options,stage:'repair-finite-cases'})}
        catch(error){
          const review=rejectedFiniteAuditReview(error)
          if(!review||!guideUntilValidAuthority(options.archive))throw error
          const identity=guideSegmentUnitIdentity(make()),source=[...options.archive.values<any>(outcomeRole)].find(r=>r.value.unitId===identity.unitId&&r.value.accepted)
          if(!source)throw Error('Riparazione audit tardivi: proposta provvisoria originale mancante.')
          lateLinks.push({proposal:{unitId:identity.unitId,outcomeKey:source.key},review})
          auditFeedback(lateLinks,current,feedback,construction.plans,repairOptions)
          continue
        }
        const acceptedRequest=make(),unitId=guideSegmentUnitIdentity(acceptedRequest).unitId,source=[...options.archive.values<any>(outcomeRole)].find(r=>r.value.unitId===unitId&&r.value.accepted)
        if(!source)throw Error('Riparazione finita: risposta originale mancante.')
        readAcceptedGuideTransport(acceptedRequest,source,options.archive);nextRaw=applyPatch(patch,current,feedback,construction.plans,options);patchRef={unitId,outcomeKey:source.key}
        break
      }
    }
    const next:Candidate={version:1,scopeHash:current.scopeHash,baseHash:current.baseHash,ordinal:current.ordinal+1,parentHash:guideHash(current),raw:nextRaw,feedback,previousDraft:draft??null,reviewRefs,patchRef}
    options.archive.saveValue(role,guideHash(next),next);current=readCandidates(initial,construction.plans,options)
  }
}
import {guideSemanticRetryAllowed,guideUntilValidAuthority} from './guide-run-policy'
