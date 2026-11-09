import {guideHash} from './matchup-guide-packet'
import {assertGuideReviewProofManifest,type GuideReviewProofManifest} from './guide-review-proof-scope'
import {projectGuideCaseProofs,guideProofDirectory} from './guide-proof-partition'
import type {GuideContent} from '../shared/matchup-guide'
import type {GuideReviewEvidenceScope} from './guide-segment-review-history'

export function assertGuideProofReviewEvidence(rows:{key:string;unitId:string;review:any;snapshot:{data:any}}[],options:GuideReviewEvidenceScope,expected?:GuideContent,required=false){
 const partial=rows.filter(r=>r.snapshot.data.proofPartition)
 if(!partial.length){if(required)throw new Error('Attestazione partizionata senza le critiche dei frammenti.');return}
 const manifests=new Set<string>(),runs=new Set<string>()
 for(const row of rows){
  const membership=options.archive.value<any>('guide-proof-review-run-membership-v1',row.key)
  if(!membership||membership.unitId!==row.unitId||membership.reviewContextHash!==row.review.reviewContextHash)throw new Error('Critica senza appartenenza verificabile alla revisione completa.')
  runs.add(membership.runHash)
 }
 if(runs.size!==1)throw new Error('Critiche provenienti da revisioni complete differenti.')
 const runHash=[...runs][0],run=options.archive.value<any>('guide-proof-review-run-v1',runHash)
 if(!run||guideHash(run)!==runHash||required&&!run.final||guideHash(run.scope)!==guideHash(options.scope)||run.packetHash!==guideHash(options.evidencePacket??options.packet)||expected&&run.completeDraftHash!==guideHash(expected)||run.units.length!==rows.length||new Set(run.units.map((u:any)=>u.id)).size!==rows.length)throw new Error('Revisione completa partizionata assente,superata o incompleta.')
 for(const unit of run.units)if(!rows.some(r=>r.unitId===unit.id&&r.review.reviewContextHash===unit.reviewContextHash))throw new Error('Una critica obbligatoria della revisione completa è omessa.')
 for(const row of partial){
  const data=row.snapshot.data,proof=data.proofPartition,member=options.archive.value<any>('guide-proof-review-membership-v1',row.key)
  if(!member||member.unitId!==row.unitId||member.proofHash!==guideHash(proof)||member.reviewContextHash!==row.review.reviewContextHash)throw new Error('Critica senza appartenenza alla copertura delle prove.')
  manifests.add(member.manifestHash)
  if(proof.completeDraftHash!==run.completeDraftHash)throw new Error('Proiezione critica di una guida differente.')
  if(expected){const actual=projectGuideCaseProofs(expected,proof.caseId,proof.branchIds).scenarios[0];if(!actual||guideHash(actual)!==guideHash(data.draft.scenarios[0])||guideHash(guideProofDirectory(expected,proof.caseId))!==guideHash(data.branchDirectory))throw new Error('Prove o directory diversi dalla guida salvata.')}
 }
 for(const key of manifests){
  const m=options.archive.value<GuideReviewProofManifest>('guide-proof-review-manifest-v1',key)
  if(!m||guideHash(m)!==key||m.completeDraftHash!==run.completeDraftHash||guideHash(m.scope)!==guideHash(options.scope)||m.packetHash!==run.packetHash)throw new Error('Manifest delle prove assente o estraneo.')
  assertGuideReviewProofManifest(m)
  for(const unit of m.units){const row=rows.find(r=>r.unitId===unit.id);if(!row||unit.proofHash!==guideHash(row.snapshot.data.proofPartition)||unit.reviewContextHash!==row.review.reviewContextHash)throw new Error('Confronto,obbligo o audit storico obbligatorio omesso.')}
  if(expected){const ids=expected.scenarios.find(s=>s.id===m.caseId)?.replyComparison?.options.map(o=>o.id)??[];if(ids.length!==m.branchHeads.length||ids.some(id=>!m.branchHeads.some(b=>b.id===id)))throw new Error('Manifest senza tutti i rami della guida.')}
 }
 if(expected)for(const scenario of expected.scenarios){
  const relevant=rows.filter(r=>r.snapshot.data.draft.scenarios.some((s:any)=>s.id===scenario.id))
  if(!relevant.some(r=>r.snapshot.data.reviewScope.kind==='scenarios')||!relevant.some(r=>r.snapshot.data.reviewScope.kind==='guide-text'))throw new Error('Copertura finale senza tutte le critiche native e testuali del caso.')
  for(const row of relevant.filter(r=>r.snapshot.data.reviewScope.kind==='guide-text'))for(const key of ['chapters','claims','exercises','limitations','changeSummary'] as const)if(guideHash(row.snapshot.data.draft[key])!==guideHash(expected[key]))throw new Error('Critica testuale senza tutta la prosa della guida attuale.')
 }
}
