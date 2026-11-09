import {expect,it} from 'vitest'
import {repairScenarioTargets} from '../src/main/guide-repair-targets'
const content:any={chapters:[{id:'decision-section',dependsOn:['development-section']},{id:'development-section',dependsOn:['unrelated-case-b']},{id:'intro',dependsOn:[]}],claims:[{id:'claim-a'}],scenarios:[{id:'unrelated-case-a'},{id:'unrelated-case-b'}],exercises:[{id:'exercise-72',scenarioIds:['unrelated-case-a']}]}
it('supplies the original scenario through transitive chapter and exercise dependencies',()=>{
 expect(repairScenarioTargets(content,['decision-section']).map(s=>s.id)).toEqual(['unrelated-case-b'])
 expect(repairScenarioTargets(content,['exercise-72']).map(s=>s.id)).toEqual(['unrelated-case-a'])
 expect(repairScenarioTargets(content,['unrelated-case-b']).map(s=>s.id)).toEqual(['unrelated-case-b'])
})
it('keeps originals available for prose without edges, rejects unknown targets and terminates cycles without modifying input',()=>{
 const copy=structuredClone(content);copy.chapters[1].dependsOn.push('decision-section');const before=JSON.stringify(copy)
 expect(repairScenarioTargets(copy,['decision-section']).map(s=>s.id)).toEqual(['unrelated-case-b'])
 expect(repairScenarioTargets(copy,['intro']).map(s=>s.id)).toEqual(['unrelated-case-a','unrelated-case-b'])
 expect(repairScenarioTargets(copy,['decision-section','intro']).map(s=>s.id)).toEqual(['unrelated-case-a','unrelated-case-b'])
 expect(repairScenarioTargets(copy,['unknown'])).toEqual([]);expect(JSON.stringify(copy)).toBe(before)
})
