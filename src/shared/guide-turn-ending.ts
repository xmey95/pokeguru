/** A completed turn without an attack is neither a missing continuation nor
 * the end of the game. Its event cannot perform a hidden game action. */
export function assertGuideTurnEnding(next:any,allow:boolean,label:string):boolean{
 const event=next?.attack
 if(event?.action!=='end-turn'){
  if(!event?.attack?.attackName)throw new Error(`${label}: attacco successivo esplicito mancante.`)
  return false
 }
 const empty=(value:unknown)=>Array.isArray(value)&&value.length===0
 if(!allow||event.kind!=='effect'||event.affectedSide!=='ours'||event.attack!==null||event.attackPayment!==null||event.trainer!==null||event.retreat!==null||
  !['moves','energyRoutes','deckObservations','boardExitProofs','attachmentTargets'].every(key=>empty(event[key]))||!empty(next.afterAttack)||
  typeof event.description!=='string'||!event.description.trim()||!event.decisionProof||!Array.isArray(event.decisionProof.cards)||typeof event.decisionProof.reason!=='string'||!event.decisionProof.reason.trim())
  throw new Error(`${label}: fine turno senza attacco non valida. Richiede v28, action=end-turn, nessun attacco/pagamento/effetto/movimento o azione successiva e decisionProof completo; pescata, sviluppo e audit restano obbligatori.`)
 return true
}

export const GUIDE_TURN_ENDING_INSTRUCTIONS='\nFINE TURNO v28: il seguito è completo anche quando scegli di non attaccare. Nel campo attack del turno dichiara allora un evento kind=effect, action=end-turn, affectedSide=ours, attack=null, attackPayment=null, trainer=null, retreat=null, moves/energyRoutes/deckObservations/boardExitProofs/attachmentTargets vuoti e afterAttack=[]. Motiva la scelta con description e decisionProof completo delle alternative disponibili; tactical, pescata, sviluppo e ogni azione precedente restano obbligatori. Non associare un attacco fittizio a una descrizione di rinuncia. end-turn non è terminal=true, non prende Premi e non dimostra di aver eseguito un attacco richiesto dal goal: conserva e segnala gli obiettivi non realizzati perché il riesame possa richiedere un nuovo piano.'
