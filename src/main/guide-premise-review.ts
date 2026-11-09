import {readGuideReview,type GuideReview,type GuideFinding} from '../shared/matchup-guide'
import {guidePrizeRuleSources,isGuidePrizeRuleSource} from './guide-prize-rule-sources'
import type {GuideSource} from '../shared/matchup-guide'
import type {GuidePacket} from './matchup-guide-packet'
import type {GuideSegmentJournal,GuideSegmentScope} from './guide-segments'
import {guideAlternativeWitnessContext,guideAlternativeWitnessSchema,verifyGuideAlternativeWitness,type GuideAlternativeWitness} from './guide-review-witness'
import {guideReviewSchemaV24} from './matchup-guide-schema'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {verifyGuideSegments} from './guide-segments'

/** Facts from the same authenticated replay, not a tactical verdict. A card
 * can remain physically in hand while excluded from the receipt's candidates. */
export function guidePremiseChoiceFacts(prefix:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket){
  verifyGuideSegments(prefix,scope,packet)
  return prefix.segments.flatMap(segment=>(segment.receipt.events??[]).flatMap((event:any,eventIndex:number)=>{
    const choice=event.choiceBefore
    if(!choice)return []
    return [{eventIndex,kind:event.kind,trainer:event.trainer??null,attack:event.attack??null,
      lineId:choice.lineId,turn:choice.turn,side:choice.side,
      physicalHand:structuredClone(choice.hand),supporterUsed:choice.supporterUsed,
      manualUsed:choice.manualUsed,candidateIds:[...choice.candidateIds],
      decisionProofCards:event.decisionProof?.cards?[...event.decisionProof.cards]:null}]
  }))
}

export const GUIDE_PREMISE_CHOICE_INSTRUCTIONS='CONTRATTO DELLE RICEVUTE: decisionProof.cards deve coincidere con candidateIds nella stessa finestra del replay; non è l’elenco della mano fisica. Dopo un Supporter già giocato, le altre copie Supporter in mano sono escluse dai candidati della ricevuta, non dalla mano. physicalHand conserva tutte le copie per conteggi, costi, scarti ed effetti basati sulla mano. tactical.cards è invece un’unione temporale distinta. Non chiedere di aggiungere carte escluse alla ricevuta per attestare la loro presenza fisica. Questi candidati non certificano la giocabilità di ogni altra carta: verifica comunque costi, timing, filtri ed effetti. Puoi contestare il replay con fonti e condizioni reali; la sola presenza fisica non dimostra un’alternativa giocabile. Riesamina ogni rilievo originale senza cancellarlo o trasferire un pass.'

type Action={scenarioId:string;turn:number;side:'ours'|'opponent';action:'ordinary-evolution'|'other';reason:string}
export interface GuidePremiseGoalEvaluation {goalHash:string;firstTurnSatisfied:boolean;eventIndexes:number[];reason:string}
export type GuidePremiseReview=Omit<GuideReview,'findings'>&{
  reviewedHash:string;repairScope:'none'|'first-turn'|'setup';
  findings:(GuideFinding&{proposedActions:Action[];counterlines:GuideAlternativeWitness[]})[]
}
/** An additional early gate. It does not replace either full independent review. */
export function guidePremiseReviewSchema(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,ruleSources:GuideSource[]=[]):object{
  if(base.segments.length!==1)throw new Error('Critica anticipata: esaminare la premessa dopo il primo turno verificato, prima del seguito.')
  if(ruleSources.some(s=>!isGuidePrizeRuleSource(s,packet.basis.asOf)))throw Error('Critica anticipata: fonte di regole non autentica.')
  const context=guideAlternativeWitnessContext(base,scope,packet),schema=structuredClone(guideReviewSchemaV24)
  schema.properties.reviewedHash={type:'string',const:context.reviewedHash}
  schema.properties.repairScope={type:'string',enum:['none','first-turn','setup']}
  schema.required.push('reviewedHash','repairScope')
  schema.properties.revalidatedIds.maxItems=0;schema.properties.textCorrections.maxItems=0
  const finding=schema.properties.findings.items,action=finding.properties.proposedActions.items
  finding.properties.sourceIds.items={type:'string',enum:[...new Set([...packet.sources,...ruleSources].map(s=>s.id))]}
  finding.properties.targetId={type:'string',const:base.setup.id}
  action.properties.scenarioId={type:'string',const:base.setup.id}
  action.properties.turn={type:'integer',enum:context.windows.map(w=>w.turn)}
  finding.properties.counterlines={type:'array',maxItems:8,items:guideAlternativeWitnessSchema(base,scope,packet)}
  finding.required.push('counterlines')
  return schema
}
export function readGuidePremiseReview(raw:unknown,base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,ruleSources:GuideSource[]=packet.basis.analysisContract==='finite-evidence-1'?guidePrizeRuleSources(packet.basis.asOf):[]):GuidePremiseReview{
  assertNativeScenarioSchema(raw,guidePremiseReviewSchema(base,scope,packet,ruleSources))
  const parsed=readGuideReview(raw),value=raw as GuidePremiseReview
  if(!parsed.checks.length)throw new Error('Critica anticipata: verifiche svolte mancanti.')
  if(parsed.verdict==='pass'){
    if(parsed.findings.length||value.repairScope!=='none')throw new Error('Critica anticipata: pass incompatibile con rilievi o riparazioni.')
  }else {
    if(!parsed.findings.length)throw new Error('Critica anticipata: un verdetto non pass richiede almeno un rilievo reale e un ambito di riparazione.')
    if(value.repairScope==='none')throw new Error('Critica anticipata: repairScope=none è ammesso solo con pass senza rilievi. I rilievi presenti richiedono first-turn per correggere il primo turno/development, anche testo o comparison, oppure setup per cambiare la premessa. Conserva tutti i rilievi reali.')
  }
  for(const finding of value.findings){
    if(finding.sourceIds.some(id=>![...packet.sources,...ruleSources].some(s=>s.id===id)))throw new Error('Critica anticipata: fonte estranea.')
    if(finding.proposedActions.length!==finding.counterlines.length)throw new Error('Critica anticipata: ogni alternativa proposta richiede la propria controlinea eseguibile.')
    for(const [i,action]of finding.proposedActions.entries())verifyGuideAlternativeWitness(base,scope,packet,action,finding.counterlines[i])
  }
  // Semantic/source findings without proposed actions remain independent
  // criticisms. They are neither claimed mechanically proved nor discarded.
  return {...parsed,reviewedHash:value.reviewedHash,repairScope:value.repairScope,findings:structuredClone(value.findings)}
}

/** Transport enforces the same verdict/routing invariant as the independent
 * reader. Historical schemas remain unchanged for authenticated old requests. */
export function coherentGuidePremiseReviewSchema(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,ruleSources:GuideSource[]=[]):object{
  const schema=guidePremiseReviewSchema(base,scope,packet,ruleSources) as any
  const pass=structuredClone(schema),negative=structuredClone(schema)
  pass.properties.verdict={type:'string',const:'pass'}
  pass.properties.repairScope={type:'string',const:'none'}
  pass.properties.findings={...pass.properties.findings,minItems:0,maxItems:0}
  negative.properties.verdict={type:'string',enum:['revise','incomplete']}
  negative.properties.repairScope={type:'string',enum:['first-turn','setup']}
  negative.properties.findings={...negative.properties.findings,minItems:1}
  return {...schema,anyOf:[pass,negative]}
}

/** Disjoint complete alternatives avoid intersecting the same recursive turn
 * declarations three times in the provider grammar. The native reader still
 * checks the entire original schema and every executable counterline. */
export function compactGuidePremiseReviewSchema(base:GuideSegmentJournal,scope:GuideSegmentScope,packet:GuidePacket,ruleSources:GuideSource[]=[]):object{
  const coherent=coherentGuidePremiseReviewSchema(base,scope,packet,ruleSources) as any
  const [pass,negative]=coherent.anyOf
  // Empty arrays require no turn/witness grammar, but retain the original item
  // constraints in the mandatory native reader after transport decoding.
  pass.properties.findings={type:'array',minItems:0,maxItems:0,items:{type:'null'}}
  return {anyOf:[pass,negative]}
}
