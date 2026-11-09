import type {GuideScenario,GuideSource} from './matchup-guide'
import {checkReplyAccess} from './guide-reply-coverage'

/** A product contract, separate from the native turn/ledger protocol. It must
 * be selected by the host in the frozen basis, never by a model's scenario. */
export const GUIDE_FINITE_ANALYSIS_CONTRACT='finite-evidence-1' as const
export const GUIDE_FINITE_REPLY_LIMIT=4
export interface GuideAnalysisScope {
  contract:typeof GUIDE_FINITE_ANALYSIS_CONTRACT
  horizon:'ours-opponent-ours'
  comparedReplyIds:string[]
  /** null means not compared, never impossible or zero damage. */
  access:{replyId:string|null;reason:string;sourceIds:string[]}
  defend:{replyId:string|null;reason:string;sourceIds:string[]}
  limits:string[]
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9:._-]{1,160}$/.test(v)
const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=4000
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).length===expected.length&&expected.every(k=>k in v)
const category=(v:unknown)=>object(v)&&keys(v,['replyId','reason','sourceIds'])&&(v.replyId===null||id(v.replyId))&&text(v.reason)&&Array.isArray(v.sourceIds)&&v.sourceIds.length>0&&v.sourceIds.length<=30&&v.sourceIds.every(id)&&new Set(v.sourceIds).size===v.sourceIds.length
export function validGuideAnalysisScope(value:unknown):value is GuideAnalysisScope {
  return object(value)&&keys(value,['contract','horizon','comparedReplyIds','access','defend','limits'])&&value.contract===GUIDE_FINITE_ANALYSIS_CONTRACT&&value.horizon==='ours-opponent-ours'&&
    Array.isArray(value.comparedReplyIds)&&value.comparedReplyIds.length>=2&&value.comparedReplyIds.length<=GUIDE_FINITE_REPLY_LIMIT&&value.comparedReplyIds.every(id)&&new Set(value.comparedReplyIds).size===value.comparedReplyIds.length&&
    category(value.access)&&category(value.defend)&&Array.isArray(value.limits)&&value.limits.length>0&&value.limits.length<=8&&value.limits.every(text)
}
/** Structural scope and actual declared-branch coverage only. The independent
 * critic still judges realism, source meaning and whether a recommendation
 * overstates these finite witnesses. This function issues no approval. */
export function checkGuideAnalysisScope(s:GuideScenario,sources:GuideSource[],enabled:boolean):string[]{
  if(!enabled)return s.analysisScope===undefined?[]:[`${s.id}: copertura finita non autorizzata dalla base della guida.`]
  if(!validGuideAnalysisScope(s.analysisScope))return [`${s.id}: copertura finita mancante o non valida.`]
  const scope=s.analysisScope,comparison=s.replyComparison,errors:string[]=[],fail=(message:string)=>errors.push(`${s.id}: ${message}`)
  if(!comparison){fail('confronto finito mancante.');return errors}
  const ids=comparison.options.map(o=>o.id)
  if(ids.length!==scope.comparedReplyIds.length||new Set(ids).size!==ids.length||ids.some(id=>!scope.comparedReplyIds.includes(id)))fail('linee confrontate diverse dalla copertura dichiarata.')
  const first=(s as any).turns?.ours
  if(!first||!Array.isArray(first.events))fail('prima mossa congelata assente dal confronto finito.')
  else for(const option of comparison.options){
    const native=option as any
    if(native.forkAtEvent!==first.events.length+1||native.turns?.ours?.draw!==null||!Array.isArray(native.turns?.ours?.events)||native.turns.ours.events.length)fail('le risposte confrontate devono condividere la stessa nostra prima mossa completa.')
  }
  if(!comparison.options.some(o=>o.intent==='attack'))fail('confronto finito senza una risposta offensiva.')
  if(comparison.omissionTests.length)fail('le prove di rimozione appartengono al contratto storico, non al confronto finito.')
  for(const [kind,item]of [['access',scope.access],['defend',scope.defend]] as const){
    if(item.sourceIds.some(id=>!sources.some(s=>s.id===id)))fail(`fonte assente nella categoria ${kind}.`)
    if(item.replyId!==null){
      const reply=comparison.options.find(o=>o.id===item.replyId)
      if(!reply)fail(`categoria ${kind} riferita a una linea non confrontata.`)
      else if(kind==='defend'&&reply.intent!=='defend')fail('categoria difensiva senza intento difensivo.')
      else if(kind==='access')errors.push(...checkReplyAccess(s,reply,sources))
    }
  }
  if(scope.access.replyId!==null&&scope.access.replyId===scope.defend.replyId)fail('accesso e difesa non possono attestare due categorie con la stessa linea.')
  if(comparison.coverage&&(comparison.coverage.access!==scope.access.replyId||comparison.coverage.defend!==scope.defend.replyId||!ids.includes(comparison.coverage.direct)))fail('copertura storica incompatibile con lo scopo finito.')
  return errors
}
