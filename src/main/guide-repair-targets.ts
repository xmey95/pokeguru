import type {GuideContent} from '../shared/matchup-guide'

/** A prose finding can originate in a scenario. Follow declared dependencies
 * backwards before invalidating the dependent texts forwards. Never interpret
 * a chapter ID as evidence that its source scenario needs no native input. */
export function repairScenarioTargets(content:GuideContent,targetIds:string[]):GuideContent['scenarios']{
 const known=new Set([...content.chapters,...content.claims,...content.scenarios,...content.exercises].map(v=>v.id)),selected=new Set<string>()
 for(const target of targetIds){
  if(!known.has(target))continue
  const visited=new Set<string>(),pending=[target]
  while(pending.length){
   const id=pending.pop()!;if(visited.has(id))continue;visited.add(id)
   const chapter=content.chapters.find(c=>c.id===id),exercise=content.exercises.find(e=>e.id===id)
   pending.push(...(chapter?.dependsOn??[]),...(exercise?.scenarioIds??[]))
  }
  const related=content.scenarios.filter(s=>visited.has(s.id))
  // A known prose target without an edge still needs access to the originals.
  // Assess each finding independently, including mixed linked/unlinked targets.
  for(const scenario of related.length?related:content.scenarios)selected.add(scenario.id)
 }
 return content.scenarios.filter(s=>selected.has(s.id))
}
