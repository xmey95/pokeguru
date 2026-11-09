import {guideHash} from './matchup-guide-packet'
import {guideAuditAt} from '../shared/guide-audit-candidates'

/** These are annotated damage values at the end of setup, NOT inferred damage
 * in a later window. The critic must follow the exact intervening declarations
 * and card effects before using one as a calculation operand in that window. */
export function auditPositionFacts(native:any,locationPath:(string|number)[],group:{lineId:string;turn:number}){
 if(group.lineId!=='main'||locationPath[0]!=='turns'||!Array.isArray(native.positionAnnotations))return []
 const phase=['ours','opponent','next'].indexOf(String(locationPath[1]))
 if(phase<0)return []
 const history=['ours','opponent','next'].slice(0,phase+1).map(key=>{
  const body=structuredClone(guideAuditAt(native,['turns',key]));if(!body)throw Error('Fatti di posizione: prefisso del turno mancante.')
  delete body.tactical
  for(const event of [...body.events??[],...body.beforeAttack??[],...body.attack?[body.attack]:[],...body.afterAttack??[]])delete event.decisionProof
  return {path:['turns',key],body}
 })
 const evidence={version:1,caseId:native.id,opponentListId:native.opponentListId,annotations:structuredClone(native.positionAnnotations),at:'after-setup-before-main',through:{path:locationPath,turn:group.turn},history}
 const evidenceHash=guideHash(evidence)
 return native.positionAnnotations.map((annotation:any,i:number)=>{
  if(!Number.isSafeInteger(annotation.damage)||annotation.damage<0)throw Error('Fatti di posizione: danni annotati non validi.')
  return {id:'position-opening-'+i+'-damage',label:`Danni annotati DOPO il setup, prima della linea: ${annotation.side}/${annotation.printId}/${annotation.zone}/copia ${annotation.copy}. Non è automaticamente il danno in una finestra successiva.`,value:annotation.damage,positionEvidenceVersion:1,evidenceHash,annotation:structuredClone(annotation),...i===0?{positionEvidence:evidence}:{}}
 })
}

export function auditPositionEvidenceMatches(facts:any[],expected:any[]){
 const positions=facts.filter(f=>f.positionEvidenceVersion!==undefined)
 return !positions.length||guideHash(positions)===guideHash(expected)
}
