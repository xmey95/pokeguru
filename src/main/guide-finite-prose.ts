import {isGuideDelivery,GUIDE_DELIVERY_DIMENSIONS as D} from '../shared/guide-delivery'
import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {guideChapterKinds,checkGuide,type GuideContent,type GuideChapter,type GuideExercise} from '../shared/matchup-guide'
import type {GuideFiniteFinding} from './guide-finite-review'
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),text=(maxLength:number)=>({type:'string',minLength:1,maxLength,pattern:'\\S'})
export async function writeFiniteGuideProse(facts:GuideContent,feedback:GuideFiniteFinding[],previous:GuideContent|undefined,options:GuideConstructionRuntime):Promise<GuideContent>{
  const chapters=new Map<string,GuideChapter>(),exercises=new Map<string,GuideExercise>(),packet=options.evidencePacket??options.packet,ids=[...facts.claims,...facts.scenarios].map(v=>v.id)
  const sources={type:'array',minItems:1,maxItems:30,items:{type:'string',enum:packet.sources.map(s=>s.id)}}
  const capacity={scope:options.scope,packetHash:guideHash(packet),kind:'guide-finite-prose-1'}
  const requests:{id:string;request:()=>GuideSegmentRequest<GuideChapter|GuideExercise>;accept:(value:GuideChapter|GuideExercise)=>void}[]=[]
  for(const kind of guideChapterKinds){
    const id='chapter-'+kind,schema=object({id:{type:'string',const:id},kind:{type:'string',const:kind},title:text(250),body:text(isGuideDelivery(packet.basis)?D.chapterCharacters:20000),sourceIds:sources,dependsOn:{type:'array',minItems:1,maxItems:ids.length,items:{type:'string',enum:ids}}}),own=feedback.filter(f=>f.targetId===id)
    const read=(raw:unknown):GuideChapter|GuideExercise=>{assertNativeScenarioSchema(raw,schema);const value=raw as GuideChapter;if(['development','closing','decisions'].includes(kind)&&!value.dependsOn.some(id=>facts.scenarios.some(s=>s.id===id)))throw Error('Capitolo finito: collegamento diretto al caso verificato mancante.');return structuredClone(value)}
    requests.push({id,request:()=>withGuideSegmentRetry({stage:'prose-finite-'+kind,role:'constructor',instructions:guideFiniteInstructions('prose'),task:'Scrivi soltanto il capitolo '+kind+' approfondito, con risorse, ragioni e condizioni pertinenti al matchup. Il limite non è una quota da riempire.',data:{packet,facts,requestedChapterKind:kind,...own.length?{findings:own,previous:previous?.chapters.find(c=>c.id===id)}:{}},schema,reserveCalls:options.reserveOutside,outputCapacity:capacity,read,cacheValidation:{id:'guide-finite-prose-chapter-1',validate:value=>{read(value)}}},options.scope,options.archive),accept:value=>{chapters.set(id,value as GuideChapter)}})
  }
  for(const [i,scenario]of facts.scenarios.entries()){
    const id='exercise-'+(i+1),schema=object({id:{type:'string',const:id},question:text(isGuideDelivery(packet.basis)?D.exerciseQuestionCharacters:4000),solution:text(isGuideDelivery(packet.basis)?D.exerciseSolutionCharacters:5000),sourceIds:sources,scenarioIds:{type:'array',minItems:1,maxItems:1,items:{type:'string',const:scenario.id}}}),own=feedback.filter(f=>f.targetId===id)
    const read=(raw:unknown):GuideChapter|GuideExercise=>{assertNativeScenarioSchema(raw,schema);return structuredClone(raw) as GuideExercise}
    requests.push({id,request:()=>withGuideSegmentRetry({stage:'prose-finite-exercise-'+(i+1),role:'constructor',instructions:guideFiniteInstructions('prose'),task:'Scrivi un esercizio commentato sulla decisione del caso assegnato, con soluzione motivata dalle prove e relative condizioni.',data:{packet,facts,scenarioId:scenario.id,...own.length?{findings:own,previous:previous?.exercises.find(e=>e.id===id)}:{}},schema,reserveCalls:options.reserveOutside,outputCapacity:capacity,read,cacheValidation:{id:'guide-finite-prose-exercise-1',validate:value=>{read(value)}}},options.scope,options.archive),accept:value=>{exercises.set(id,value as GuideExercise)}})
  }
  await runGuideSegmentPhase(requests,{...options,stage:'prose-finite-units'})
  const draft={...structuredClone(facts),chapters:guideChapterKinds.map(kind=>chapters.get('chapter-'+kind)!),exercises:facts.scenarios.map((_,i)=>exercises.get('exercise-'+(i+1))!)}
  const checked=checkGuide(draft,packet)
  if(checked.errors.length)throw Error(checked.errors.join('\n'))
  return draft
}
