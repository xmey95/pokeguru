import {guideHash} from './matchup-guide-packet'
import {guideUntilValidAuthority} from './guide-run-policy'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideContent} from '../shared/matchup-guide'

type Context=Pick<GuideConstructionRuntime,'scope'|'archive'>
const role='guide-finite-repair-target-policy-v1'
/** A versioned repair contract, never a finding, pass or manual content edit. */
export function hasFiniteRepairTargets(o:Context):boolean{
 const rows=[...o.archive.values<any>(role)];if(!rows.length)return false
 if(rows.length!==1||rows[0].key!=='policy'||rows[0].value.version!==1||rows[0].value.scopeHash!==guideHash(o.scope)||!guideUntilValidAuthority(o.archive))throw Error('Destinazioni di riparazione del critico alterate o estranee.')
 return true
}
export function pinFiniteRepairTargets(o:Context){
 if(guideUntilValidAuthority(o.archive)&&!hasFiniteRepairTargets(o))o.archive.saveValue(role,'policy',{version:1,scopeHash:guideHash(o.scope)})
}
/** The quote must exist in an actual scalar of the editable text. Quoting a
 * native/global limitation cannot authorize a prose-only repair of it. */
export function assertFiniteProseRepairQuotes(findings:{repair:{kind:string;targetId?:string;quote?:string}}[],draft:GuideContent){
 for(const {repair}of findings)if(repair.kind==='text'){
  const target=[...draft.chapters,...draft.exercises].find(t=>t.id===repair.targetId) as any
  const quote=repair.quote
  if(!target||typeof quote!=='string'||!quote.trim()||!['title','body','question','solution'].some(k=>typeof target[k]==='string'&&target[k].includes(quote)))throw Error('Riparazione di solo testo: quote deve citare esattamente il capitolo/esercizio modificabile, non limitations o analysisScope. Per correggere limiti globali, campi nativi o analysisScope usa repair.kind=case con il caso assegnato; la transazione case può aggiornare anche limitations globali. Non chiedere alla prosa di cambiare campi congelati.')
 }
}
export const finiteRepairTargetRules=' DESTINAZIONE ESEGUIBILE DEI RILIEVI: repair.kind=text può modificare soltanto il titolo/corpo del capitolo o domanda/soluzione dell’esercizio targetId; quote deve essere una citazione esatta di uno di questi campi JSON decodificati. NON può modificare draft.limitations, claims, scenari, natives o analysisScope. Se una correzione richiede uno di questi campi, usa repair.kind=case con il caso assegnato e targetId del caso: la transazione nativa può correggere anche limitations globali. Le limitations globali non appartengono al capitolo introduttivo. Per una frase obsoleta in analysisScope serve una riparazione case anche se il riepilogo la cita. Non riproporre una riscrittura di un campo che non contiene il difetto. Una delimitazione non risolve illegalità; registri, fonti, alternative e tutti i riesami restano obbligatori.'
