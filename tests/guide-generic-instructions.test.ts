import {expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {causalInstructions,guideSegmentEvaluationRules,guideSegmentFullReviewRules} from '../src/main/guide-causal-contract'
import {genericGuideInstructions} from '../src/main/guide-generic-instructions'
const baseline=JSON.parse(readFileSync(new URL('./fixtures/guide-legacy-instruction-hashes.json',import.meta.url),'utf8'))
const pilotNames=/Toucannon|Dragapult|Hydrapple|Festival|Dreepy|Meganium|Ogerpon|Moltres|Legacy Energy|Briar/
const stages=['plan','scenarios-1','scenarios-2','scenarios-1-rebuild','review-scenarios-1','repair-scenarios-delta','repair-scenarios-rebuild-scenario-1','prose','prose-part-1','review-1','repair-final-delta','revision']
it('carries the established omission, physical-copy and derived-field semantics into the new protocols without historical examples',()=>{
 const common=guideSegmentEvaluationRules(),critic=guideSegmentFullReviewRules()
 for(const rules of [common,critic]){
  expect(rules).toContain('non cancella una copia dal mazzo')
  expect(rules).toContain('requiredCards, attachments e retreatEnergy sono derivati')
  expect(rules).toContain('copie della stessa stampa')
  expect(rules).toContain('marker terminale')
  expect(rules).not.toContain('NON esiste terminal:true')
  expect(pilotNames.test(rules)).toBe(false)
 }
 expect(critic).toContain('reviewFacts.tacticalIndex')
 expect(critic).toContain('hash, repair e controlinee')
})
it('preserves all measured v26 instruction paths after adding staged construction',()=>{
 const rows=JSON.parse(readFileSync(new URL('./fixtures/guide-v26-instruction-hashes.json',import.meta.url),'utf8')).rows
 for(const row of rows)expect(createHash('sha256').update(causalInstructions(row.stage,true,true,true,true,true,true,true,true,true,true,true,true,true,true,true)).digest('hex'),row.stage).toBe(row.sha256)
})
it('preserves the twelve v25 instruction paths measured before introducing non-KO departures',()=>{
 const rows=JSON.parse(readFileSync(new URL('./fixtures/guide-v25-instruction-hashes.json',import.meta.url),'utf8')).rows
 expect(rows).toHaveLength(12)
 for(const row of rows)expect(createHash('sha256').update(causalInstructions(row.stage,true,true,true,true,true,true,true,true,true,true,true,true,true,true)).digest('hex'),row.stage).toBe(row.sha256)
})
it('preserves all 168 measured historical instruction paths byte for byte',()=>{
 expect(baseline.rows).toHaveLength(168)
 for(const row of baseline.rows){const flags=Array.from({length:13},(_,i)=>row.version>=12+i),text=causalInstructions(row.stage,...flags)
  expect(createHash('sha256').update(text).digest('hex'),`${row.version}/${row.stage}`).toBe(row.sha256)
 }
})
it('replaces named examples in real instruction paths while preserving every other historical rule',()=>{
 for(const stage of stages){
  const historical=causalInstructions(stage,true,true,true,true,true,true,true,true,true,true,true,true,true),generic=causalInstructions(stage,true,true,true,true,true,true,true,true,true,true,true,true,true,true)
  expect(generic).toBe(genericGuideInstructions(historical))
  expect(generic,stage).not.toMatch(pilotNames)
  for(const line of historical.split('\n').filter(line=>line&&!line.startsWith('Controlli del pilota:')))expect(generic,stage).toContain(line)
  expect(generic).toContain('SCELTA DELLE COPIE');expect(generic).toContain('TUTTI i filtri del testo');expect(generic).toContain('non inventare stati individuali')
 }
})
