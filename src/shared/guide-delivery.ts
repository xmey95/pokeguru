/** Host-selected orchestration contract; never selected by generated content. */
export const GUIDE_DELIVERY_CONTRACT='bounded-delivery-1' as const
export const GUIDE_DELIVERY_DIMENSIONS=Object.freeze({cases:2,setupTurns:5,eventsPerTurn:6,movesPerEvent:12,energyRoutesPerEvent:8,auditTargetsPerTurn:17,auditSpansPerTarget:8,auditTextCharacters:600,chapterCharacters:3000,exerciseQuestionCharacters:1200,exerciseSolutionCharacters:2400})
export function isGuideDelivery(basis:{deliveryContract?:unknown;promptVersion?:string;analysisContract?:string}){
 if(basis.deliveryContract===undefined)return false
 if(basis.deliveryContract!==GUIDE_DELIVERY_CONTRACT||basis.promptVersion!=='matchup-guide-28'||basis.analysisContract!=='finite-evidence-1')throw Error('Contratto di consegna non valido.')
 return true
}
/** Conservative serial admission, independent of batching or paid history. */
export function guideDeliveryBudget(replies=2){
 if(![2,3,4].includes(replies))throw Error('Numero di repliche non valido.')
 // One native declaration, one separate audit declaration built from host
 // candidates, and at most four independent semantic review groups per turn.
 const base=28+2*(5+1+2*replies)*6
 return {base,repairCredits:16,maximum:base+16,replies}
}
export function guideDeliveryEvents(body:any):any[]{return [...body.events??[],...body.beforeAttack??[],...body.attack?[body.attack]:[],...body.afterAttack??[]]}
export function assertGuideDeliveryTurn(body:any,path='turn'){
 const d=GUIDE_DELIVERY_DIMENSIONS,events=guideDeliveryEvents(body)
 const locations=[...(body.events??[]).map((_:any,i:number)=>`${path}.events[${i}]`),...(body.beforeAttack??[]).map((_:any,i:number)=>`${path}.beforeAttack[${i}]`),...body.attack?[`${path}.attack`]:[],...(body.afterAttack??[]).map((_:any,i:number)=>`${path}.afterAttack[${i}]`)]
 const violations=[...events.length>d.eventsPerTurn?[`${path}: ${events.length} eventi, massimo ${d.eventsPerTurn}`]:[],...events.flatMap((e,i)=>[...(e.moves??[]).length>d.movesPerEvent?[`${locations[i]}.moves: ${e.moves.length} movimenti, massimo ${d.movesPerEvent}`]:[],...(e.energyRoutes??[]).length>d.energyRoutesPerEvent?[`${locations[i]}.energyRoutes: ${e.energyRoutes.length} percorsi, massimo ${d.energyRoutesPerEvent}`]:[]])]
 if(violations.length)throw Error('Turno oltre il profilo di consegna: nessuna azione viene eliminata. '+violations.join('; ')+'. Rappresenta tutte le azioni e risorse entro lo stesso profilo, senza omettere effetti, costi o conseguenze; più eventi della stessa risoluzione non sono nuove giocate.')
}
export function assertGuideDeliveryNative(native:any){
 if((native.setupRounds??[]).length>2)throw Error('Preparazione oltre il profilo di consegna.')
 const bodies=[{path:'firstOpponentTurn',body:native.firstOpponentTurn},...(native.setupRounds??[]).flatMap((r:any,i:number)=>[{path:`setupRounds[${i}].ours`,body:r.ours},{path:`setupRounds[${i}].opponent`,body:r.opponent}]),...Object.entries(native.turns??{}).map(([key,body])=>({path:`turns.${key}`,body})),...(native.replyComparison?.options??[]).flatMap((o:any,i:number)=>[{path:`replyComparison.options[${i}].turns.opponent`,body:o.turns?.opponent},{path:`replyComparison.options[${i}].turns.next`,body:o.turns?.next}])].filter(v=>v.body)
 bodies.forEach(v=>assertGuideDeliveryTurn(v.body,`${native.id}.${v.path}`))
 for(const {path,body:b} of bodies){
  const events=[...(b.events??[]).map((event:any,i:number)=>({path:`events[${i}]`,event})),...(b.beforeAttack??[]).map((event:any,i:number)=>({path:`beforeAttack[${i}]`,event})),...b.attack?[{path:'attack',event:b.attack}]:[],...(b.afterAttack??[]).map((event:any,i:number)=>({path:`afterAttack[${i}]`,event}))]
  const texts=[{path:'tactical.comparison',text:b.tactical?.comparison},...(b.tactical?.promotions??[]).map((p:any,i:number)=>({path:`tactical.promotions[${i}].reason`,text:p.reason})),...events.map(({path,event})=>({path:path+'.decisionProof.reason',text:event.decisionProof?.reason}))].filter(v=>v.text!==undefined)
  if(texts.length>GUIDE_DELIVERY_DIMENSIONS.auditTargetsPerTurn)throw Error(`Motivazioni oltre il profilo di consegna: ${native.id}.${path}, ${texts.length} target; massimo ${GUIDE_DELIVERY_DIMENSIONS.auditTargetsPerTurn}.`)
  for(const {path:field,text} of texts){
   if(typeof text!=='string')throw Error(`Motivazione non testuale: ${native.id}.${path}.${field}.`)
   if(text.length>GUIDE_DELIVERY_DIMENSIONS.auditTextCharacters)throw Error(`Motivazione oltre il profilo di consegna: ${native.id}.${path}.${field}, ${text.length} caratteri; massimo ${GUIDE_DELIVERY_DIMENSIONS.auditTextCharacters}. Riscrivi questo testo entro il limite, preservando tutti i fatti e le condizioni; nessun taglio automatico.`)
  }
 }
}
