import {it,expect} from 'vitest'
import {auditPositionFacts,auditPositionEvidenceMatches} from '../src/main/guide-audit-position-facts'

const native=()=>({id:'unrelated-case',opponentListId:'other-list',positionAnnotations:[{side:'opponent',printId:'unrelated-basic',zone:'active',copy:1,damage:0}],turns:{ours:{events:[{kind:'attack',description:'No damage effect',moves:[],decisionProof:{reason:'audit wording'}}],tactical:{comparison:'wording'}},opponent:{beforeAttack:[{kind:'evolve',moves:[{from:'active',to:'evolution'}]}],attack:{kind:'attack',description:'Target suffers damage',damage:40,moves:[]},afterAttack:[]},next:{attack:{description:'A future effect',damage:90}}}})
it('provides initial annotated damage and the exact scoped history, without inventing later damage or copying audit judgments',()=>{
 const n=native(),before=structuredClone(n),facts=auditPositionFacts(n,['turns','opponent'],{lineId:'main',turn:3})
 expect(facts[0]).toMatchObject({value:0,positionEvidenceVersion:1,annotation:n.positionAnnotations[0]})
 expect(facts[0].label).toContain('Non è automaticamente')
 expect(facts[0].positionEvidence.history).toHaveLength(2)
 expect(facts[0].positionEvidence.history[1].body.attack.damage).toBe(40)
 expect(JSON.stringify(facts)).not.toContain('future effect')
 expect(JSON.stringify(facts)).not.toContain('audit wording')
 expect(n).toEqual(before)
 expect(auditPositionFacts(n,['firstOpponentTurn'],{lineId:'setup',turn:1})).toEqual([])
})
it('invalidates the evidence binding after a changed annotation or intervening event, while preserving legacy facts',()=>{
 const n=native(),at=['turns','opponent'],group={lineId:'main',turn:3},paid=auditPositionFacts(n,at,group)
 expect(auditPositionEvidenceMatches(paid,auditPositionFacts(n,at,group))).toBe(true)
 n.positionAnnotations[0].damage=20
 expect(auditPositionEvidenceMatches(paid,auditPositionFacts(n,at,group))).toBe(false)
 n.positionAnnotations[0].damage=0;n.turns.opponent.attack.damage=70
 expect(auditPositionEvidenceMatches(paid,auditPositionFacts(n,at,group))).toBe(false)
 expect(auditPositionEvidenceMatches([{id:'legacy',value:0}],[])).toBe(true)
 expect(auditPositionEvidenceMatches([{...paid[0],positionEvidenceVersion:2}],paid)).toBe(false)
})
