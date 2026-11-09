import {guideHash,type GuidePacket} from './matchup-guide-packet'
import type {GuideContent} from '../shared/matchup-guide'
import type {GuideFiniteReview} from './guide-finite-review'

/** Exact source projection, not a summary. Preserve all own/reference cards,
 * cited variant lists and their complete cards, and sources of old findings.
 * Non-card evidence, gaps and all originals remain available unchanged. */
export function finiteReviewEvidence(packet:GuidePacket,draft:GuideContent,previous:GuideFiniteReview[],final:boolean):GuidePacket{
  const cited=new Set([...draft.scenarios,...draft.claims,...(final?[...draft.chapters,...draft.exercises]:[])].flatMap(item=>item.sourceIds))
  for(const review of previous)for(const finding of review.findings)for(const id of finding.sourceIds)cited.add(id)
  const listIds=new Set(draft.scenarios.map(s=>s.opponentListId))
  for(const list of packet.opponentLists)if(cited.has(list.id))listIds.add(list.id)
  const lists=packet.opponentLists.filter(l=>listIds.has(l.id)),prints=new Set([...packet.ourList.cards,...lists.flatMap(l=>l.cards)].map(c=>c.printId))
  return {...packet,opponentLists:lists,sources:packet.sources.filter(source=>source.kind!=='card'||prints.has(source.id.replace(/^card:/,''))||cited.has(source.id))}
}
/** The caller's token/audit envelope must describe the actual projected
 * packet. A model cannot supply a different list, source body or basis. */
export function assertFiniteEvidenceProjection(projection:GuidePacket,original:GuidePacket):void{
  for(const key of ['basis','ourList','matchup','deckContext','gaps'] as const)if(guideHash(projection[key])!==guideHash(original[key]))throw Error('Evidenze finite: base o condizioni diverse.')
  if(projection.opponentLists.some(l=>!original.opponentLists.some(o=>guideHash(o)===guideHash(l)))||projection.sources.some(s=>!original.sources.some(o=>guideHash(o)===guideHash(s))))throw Error('Evidenze finite: lista o fonte estranea.')
  const prints=new Set([...projection.ourList.cards,...projection.opponentLists.flatMap(l=>l.cards)].map(c=>c.printId))
  if(original.sources.some(s=>(s.kind!=='card'||prints.has(s.id.replace(/^card:/,'')))&&!projection.sources.some(p=>p.id===s.id)))throw Error('Evidenze finite: fonte necessaria alla lista o contesto non-card omessi.')
}
