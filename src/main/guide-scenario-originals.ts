import type {MatchupGuide} from '../shared/matchup-guide'
import {projectGuideLedger} from '../shared/guide-ledger-projection'
import {compileGuideTactics} from '../shared/guide-tactical-checks'
import {assertConstructedScenarios} from '../shared/guide-scenario-output'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {nativeRepairCase,type NativeRepairCase} from './guide-native-repair'
import {singleScenarioSchemaV21,singleScenarioSchemaV26,singleScenarioSchemaV27,singleScenarioSchemaV28,singleFiniteScenarioSchema} from './matchup-guide-schema'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'
import {boundGuideSchema} from './guide-bound-schema'
import {scopedConstructionPacket} from './guide-causal-contract'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'

/** Preserve the AI declarations with the saved guide. A future job must not
 * reconstruct them by guessing backwards from compiled states or prose. */
export function readGuideScenarioOriginals(guide:MatchupGuide):NativeRepairCase[]{
 const originals=guide.generation?.scenarioOriginals
 if(originals===undefined)return [] // Historical guides keep their read contract.
 const invalid=()=>new Error('Originali degli scenari non coerenti con la guida e le fonti salvate.')
 if(!originals||originals.formatVersion!==1||!['matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(guide.basis.promptVersion)||originals.scopeHash!==guideHash(guide.basis)||
  !Array.isArray(originals.cases)||originals.cases.length!==guide.scenarios.length||new Set(originals.cases.map(c=>c?.id)).size!==originals.cases.length)throw invalid()
 const packet:GuidePacket={basis:guide.basis,ourList:guide.ourList,opponentLists:guide.opponentLists,sources:guide.sources,matchup:'',deckContext:'',gaps:[]}
 return originals.cases.map(c=>{
  const scenario=guide.scenarios.find(s=>s.id===c?.id)
  if(!scenario||!c.native||typeof c.native!=='object'||Array.isArray(c.native)||c.native.id!==c.id||c.scopeHash!==originals.scopeHash||
   c.baseHash!==guideHash({scopeHash:c.scopeHash,native:c.native}))throw invalid()
  const raw={chapters:[],claims:[],scenarios:[c.native],exercises:[],limitations:[],changeSummary:''}
  assertNativeScenarioSchema(raw,boundGuideSchema((guide.basis.analysisContract===GUIDE_FINITE_ANALYSIS_CONTRACT?singleFiniteScenarioSchema:guide.basis.promptVersion==='matchup-guide-28'?singleScenarioSchemaV28:guide.basis.promptVersion==='matchup-guide-27'?singleScenarioSchemaV27:guide.basis.promptVersion==='matchup-guide-26'?singleScenarioSchemaV26:singleScenarioSchemaV21)(c.id),scopedConstructionPacket(packet,scenario.opponentListId),scenario.opponentListId))
  assertConstructedScenarios(raw)
  const projected=compileGuideTactics(projectGuideLedger(raw,packet)).scenarios[0]
  if(guideHash(projected)!==guideHash(scenario))throw invalid()
  return nativeRepairCase(c.native,c.scopeHash)
 })
}
