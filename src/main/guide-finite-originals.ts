import type {MatchupGuide} from '../shared/matchup-guide'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'
import {guideHash} from './matchup-guide-packet'
import {verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {readGuideFinitePlan} from './guide-finite-plan'
import {finiteNativeWitnesses} from './guide-finite-cases'
import {readGuideScenarioOriginals} from './guide-scenario-originals'
import {assertGuideRuntimeEvidence} from './guide-evidence-extension'

/** Portable planning originals are provenance, never transferred approvals.
 * Rebuild both the original planning frame and every current repaired line. */
export function readGuideFiniteOriginals(guide:MatchupGuide){
  const saved=guide.generation.finiteOriginals,finite=guide.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT
  if(!finite){if(saved!==undefined)throw Error('Originali finiti associati a un contratto storico.');return}
  const fail=()=>new Error('Originali finiti non coerenti con casi, piano o fonti della guida.')
  if(!saved||saved.formatVersion!==1||saved.scopeHash!==guideHash(guide.basis)||!saved.sourceScope||saved.sourceScope.projectId!==guide.basis.projectId||!saved.nativePacket||guideHash(saved.nativePacket.ourList)!==guideHash(guide.ourList)||
    !Array.isArray(saved.plans)||!Array.isArray(saved.planningMains)||saved.plans.length!==2||saved.planningMains.length!==2||!Array.isArray(saved.nativePacket.sources)||saved.nativePacket.sources.some(source=>!guide.sources.some(s=>guideHash(s)===guideHash(source)))||saved.nativePacket.opponentLists.some(list=>!guide.opponentLists.some(l=>guideHash(l)===guideHash(list))))throw fail()
  if(saved.evidenceAnchor){
    const evidencePacket={...saved.evidenceAnchor,basis:guide.basis,ourList:guide.ourList,opponentLists:guide.opponentLists,sources:guide.sources}
    assertGuideRuntimeEvidence({scope:saved.sourceScope,packet:saved.nativePacket,evidenceAnchor:saved.evidenceAnchor,evidencePacket})
  }else if(guideHash(saved.nativePacket.basis)!==guideHash(guide.basis))throw fail()
  const options={packet:saved.nativePacket,scope:saved.sourceScope},mains=saved.planningMains as GuideSegmentJournal[]
  for(const main of mains)verifyGuideSegments(main,options.scope,options.packet)
  if(new Set(mains.map(m=>m.setup.id)).size!==2)throw fail()
  const plans=saved.plans.map((raw:any)=>{const main=mains.find(m=>m.setup.id===raw?.caseId);if(!main)throw fail();return readGuideFinitePlan(raw,main,options)})
  if(new Set(plans.map(p=>p.caseId)).size!==2)throw fail()
  const natives=readGuideScenarioOriginals(guide)
  if(natives.length!==2||natives.some(n=>!plans.some(p=>p.caseId===n.id)))throw fail()
  for(const native of natives)finiteNativeWitnesses(native.native,plans.find(p=>p.caseId===native.id)!,options)
  return {saved,plans,natives}
}
