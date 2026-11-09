import {GUIDE_DELIVERY_DIMENSIONS as D} from '../shared/guide-delivery'
import {auditNarrativeSchema,renderAuditNarrative,type AuditQuantityContext} from './guide-audit-quantities'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'

/** Complete text is visible to model and transport; typed facts remain intact. */
export function boundedAuditTextSchema(context:AuditQuantityContext){
 const parts=auditNarrativeSchema(context)
 parts.items.properties.text.anyOf[0].maxLength=D.auditTextCharacters
 return {type:'object',properties:{text:{type:'string',minLength:1,maxLength:D.auditTextCharacters},parts},required:['text','parts'],additionalProperties:false}
}
export function readBoundedAuditText(raw:unknown,context:AuditQuantityContext,allowedWindows?:string[]){
 assertNativeScenarioSchema(raw,boundedAuditTextSchema(context))
 const value=raw as {text:string;parts:any[]}
 const text=renderAuditNarrative(value.parts,context,D.auditTextCharacters,allowedWindows,3)
 if(value.text.length>D.auditTextCharacters)throw Error(`Audit bounded: testo di ${value.text.length} unità UTF-16, limite ${D.auditTextCharacters}.`)
 if(value.text!==text)throw Error('Audit bounded: text non coincide esattamente con il testo completo dei parts, inclusi nomi, quantità e misure. Nessuna correzione o troncatura applicata.')
 return {text,parts:structuredClone(value.parts)}
}
export const BOUNDED_AUDIT_TEXT_INSTRUCTIONS=`CONTRATTO TESTO BOUNDED: ogni dN, comparison e pN è {text,parts}. text è l’intera motivazione finale, non un riassunto, con massimo ${D.auditTextCharacters} unità UTF-16, inclusi spazi, punteggiatura, nomi e quantità espansi. Anche i testi in parts hanno al massimo ${D.auditTextCharacters}; conserva il limite originario di 24 frammenti. Il riesame semantico mantiene separatamente il limite di ${D.auditSpansPerTarget} span per testo. Per caratteri supplementari conta due unità. La concatenazione delle espansioni di parts deve coincidere ESATTAMENTE con text: card produce il nome della carta; measureId produce "label: value"; quantity produce l’espressione completa del renderer, incluse zona, lato, eventuale copia destinataria e finestra temporale. Conserva queste informazioni nel conteggio: un riferimento corto non accorcia il testo finale. Puoi usare un solo frammento text quando non sono necessari atomi; tutte le sue affermazioni restano soggette al riesame semantico. Formula una motivazione completa e concisa, senza eliminare candidati, condizioni, fonti o limiti e senza inventare uno zero. Non viene tagliato o completato alcun testo. Gli audit dimensionalmente conformi richiedono comunque tutti i controlli quantitativi, fisici e semantici.`
/** Both full text and parts consume output, even though only one text is shown. */
export function boundedAuditOutputCharacters(context:AuditQuantityContext,targets:number){
 if(!Number.isSafeInteger(targets)||targets<1||targets>D.auditTargetsPerTurn)throw Error('Numero di destinazioni audit fuori dal profilo bounded.')
 const longest=(values:string[])=>values.sort((a,b)=>JSON.stringify(b).length-JSON.stringify(a).length)[0]??''
 const printId=longest(context.cards.map(c=>c.printId)),windowId=longest(context.windows.map(w=>w.id))
 const atom=(quantity:unknown,card:unknown=null,measureId:unknown=null)=>JSON.stringify({text:null,quantity,card,measureId}).length
 const minimumName=Math.min(...context.cards.map(c=>c.name.length)),plain=atom(null),base={windowId,side:'opponent',printId,zone:'evolution',host:null,count:60}
 // Expansion costs include the side, zone, timing and host labels. A long
 // reference does not imply equally long free prose: all parts share 600.
 const overhead=Math.max(plain,atom(base)-2*(minimumName+57),atom({...base,windowId:'list',zone:'list'})-2*(minimumName+37),atom({...base,host:{printId,copy:8}})-2*(2*minimumName+74),...context.cards.map(c=>atom(null,{side:c.side,printId:c.printId})-2*c.name.length),...context.measures.map(m=>atom(null,null,m.id)-2*(m.label+': '+m.value).length))
 // Estimate escaping for ordinary prose as well as both copies of its text.
 // The unchanged hard byte/output gates still reject an unexpectedly larger wire.
 return 1024+targets*(4*D.auditTextCharacters+auditNarrativeSchema(context).maxItems*overhead)
}
/** One existing turn unit reserves 15k response characters, not 6k. The
 * token reservation/calibration for that unit remains the planner's job. */
export function boundedAuditOutputUnits(context:AuditQuantityContext,targets:number){
 return Math.max(2,Math.ceil(boundedAuditOutputCharacters(context,targets)/15000))
}
