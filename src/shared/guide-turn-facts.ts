import type {GuideContent,GuideScenario,GuideReview} from './matchup-guide'
export function scenarioTurnFacts(s:GuideScenario){
 const paths=[...(s.setupLedger?.events??[]),...((s as any).lineEvents??[]),...(s.replyComparison?.options??[]).flatMap(o=>(o as any).expandedLineEvents??[])]
 const first=paths.find(e=>e.turn>0),firstPlayer=first?.side??null
 if(!firstPlayer)return {scenarioId:s.id,firstPlayer:null,firstTurns:null,turns:[]}
 const firstTurns={ours:firstPlayer==='ours'?1:2,opponent:firstPlayer==='opponent'?1:2}
 return {scenarioId:s.id,firstPlayer,firstTurns,turns:[...new Map(paths.filter(e=>e.turn>0).map(e=>[e.turn,{globalTurn:e.turn,side:e.side,playerTurn:Math.floor((e.turn-firstTurns[e.side as 'ours'|'opponent'])/2)+1,isFirstTurn:e.turn===firstTurns[e.side as 'ours'|'opponent'],ordinaryEvolutionAllowed:e.turn>firstTurns[e.side as 'ours'|'opponent'],firstPlayerSupporterOrAttackAllowed:e.turn!==1}])).values()],note:'Il setup iniziale non è un turno precedente del giocatore. Nel proprio primo turno non si evolve ordinariamente, anche un Base collocato nel setup; eccezioni da effetto richiedono prova distinta. Global 2 è il primo turno del secondo giocatore.'}
}
export function checkReviewAlternatives(review:GuideReview,draft:GuideContent):void{
 for(const [i,f] of review.findings.entries()){
  const actions=(f as any).proposedActions
  if(!Array.isArray(actions)||actions.length>8)throw new Error(`Revisione critica non valida: findings[${i}].proposedActions richiesto.`)
  for(const a of actions){
   const s=draft.scenarios.find(s=>s.id===a.scenarioId),facts=s&&scenarioTurnFacts(s)
   if(!s||!facts?.firstPlayer||!['ours','opponent'].includes(a.side)||!Number.isSafeInteger(a.turn)||a.turn<1||!['ordinary-evolution','other'].includes(a.action)||typeof a.reason!=='string'||!a.reason.trim())throw new Error(`Revisione critica non valida: alternativa ${i} senza caso/turno/lato/motivo verificabili.`)
   const first=facts.firstTurns![a.side as 'ours'|'opponent']
   if((a.turn-first)%2!==0)throw new Error(`Revisione critica non valida: alternativa ${i}, turno ${a.turn} non appartiene a ${a.side}.`)
   if(a.action==='ordinary-evolution'&&a.turn<=first)throw new Error(`Revisione critica non valida: alternativa ${i} propone evoluzione ordinaria al PRIMO TURNO di ${a.side} (globale ${a.turn}); firstPlayer=${facts.firstPlayer}. Il Base dal setup non costituisce un turno precedente. Rivalutare il finding, senza promuovere la guida o eliminare altri rilievi.`)
  }
 }
}
