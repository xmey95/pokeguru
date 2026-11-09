import {expect,it} from 'vitest'
import {hasFiniteRepairTargets,pinFiniteRepairTargets,assertFiniteProseRepairQuotes} from '../src/main/guide-finite-repair-targets'
import {guideHash} from '../src/main/matchup-guide-packet'

it('binds the new repair contract only to explicit until-valid authority and retains absent historical policies',()=>{
 const rows=new Map<string,Map<string,any>>(),scope={jobId:'job',projectId:'project',dependencyHash:'dependency',configHash:'config'}
 const archive:any={id:'job',projectId:'project',values:(role:string)=>[...rows.get(role)??[]].map(([key,value])=>({key,value})),value:(role:string,key:string)=>rows.get(role)?.get(key),saveValue:(role:string,key:string,value:any)=>{if(!rows.has(role))rows.set(role,new Map());rows.get(role)!.set(key,structuredClone(value))}},context:any={scope,archive}
 expect(hasFiniteRepairTargets(context)).toBe(false);pinFiniteRepairTargets(context);expect(hasFiniteRepairTargets(context)).toBe(false)
 archive.saveValue('guide-until-valid-authority-v1','authority',{version:1,mode:'until-valid',jobId:'job',projectId:'project',packetHash:'a'.repeat(64),configHash:'b'.repeat(64),callCeiling:null,repairCeiling:null,authorityReference:'user:synthetic',approvedAt:'2026-11-08T00:00:00.000Z'})
 pinFiniteRepairTargets(context);expect(hasFiniteRepairTargets(context)).toBe(true)
 expect(archive.value('guide-finite-repair-target-policy-v1','policy')).toEqual({version:1,scopeHash:guideHash(scope)})
 expect(()=>hasFiniteRepairTargets({...context,scope:{...scope,projectId:'foreign'}})).toThrow('estranee')
 rows.delete('guide-until-valid-authority-v1');expect(()=>hasFiniteRepairTargets(context)).toThrow('estranee')
})
it('rejects a real-shaped global/native limitation quoted as a prose-only repair, without relabeling the finding',()=>{
 const draft:any={chapters:[{id:'chapter-introduction',title:'Two independent cases',body:'The complete guide contains two cases.'}],exercises:[{id:'exercise-foreign',question:'Choose a line.',solution:'Under the stated conditions.\nPokémon 🐦'}],limitations:['Only one case is compared.'],scenarios:[{analysisScope:{limits:['The continuation remains to be built.']}}]},before=JSON.stringify(draft)
 const make=(quote:string,targetId='chapter-introduction')=>[{repair:{kind:'text',targetId,quote}}]
 for(const quote of ['Only one case is compared.','The continuation remains to be built.','invented','   '])expect(()=>assertFiniteProseRepairQuotes(make(quote),draft)).toThrow('repair.kind=case')
 expect(()=>assertFiniteProseRepairQuotes(make('Choose a line.','chapter-introduction'),draft)).toThrow('capitolo/esercizio')
 expect(()=>assertFiniteProseRepairQuotes(make('two cases'),draft)).not.toThrow()
 expect(()=>assertFiniteProseRepairQuotes(make('conditions.\nPokémon 🐦','exercise-foreign'),draft)).not.toThrow()
 expect(()=>assertFiniteProseRepairQuotes([{repair:{kind:'case'}}],draft)).not.toThrow()
 expect(JSON.stringify(draft)).toBe(before)
})
