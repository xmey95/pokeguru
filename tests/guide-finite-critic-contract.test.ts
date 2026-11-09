import {it,expect} from 'vitest'
import {finiteCriticContract,pinFiniteCriticContract} from '../src/main/guide-finite-critic-contract'
import {guideHash} from '../src/main/matchup-guide-packet'

it('pins new critic semantics to the exact scope and retains completed historical protocol selection',()=>{
 const rows=new Map<string,Map<string,any>>(),scope={jobId:'job',projectId:'project',dependencyHash:'dependency',configHash:'config'}
 const archive:any={id:'job',projectId:'project',values:(role:string)=>[...rows.get(role)??[]].map(([key,value])=>({key,value})),value:(role:string,key:string)=>rows.get(role)?.get(key),saveValue:(role:string,key:string,value:any)=>{if(!rows.has(role))rows.set(role,new Map());rows.get(role)!.set(key,structuredClone(value))}}
 const context:any={scope,archive}
 expect(finiteCriticContract(context)).toBe(2)
 archive.saveValue('guide-until-valid-authority-v1','authority',{version:1,mode:'until-valid',jobId:'job',projectId:'project',packetHash:'a'.repeat(64),configHash:'b'.repeat(64),callCeiling:null,repairCeiling:null,authorityReference:'user:synthetic',approvedAt:'2026-11-08T00:00:00.000Z'})
 expect(finiteCriticContract(context)).toBe(3)
 // The selector is not an approval reader. This marker models only the
 // existence of an older completed binding, whose full reader is separate.
 archive.saveValue('guide-finite-final-approval-v1','validated',{version:2})
 expect(finiteCriticContract(context)).toBe(2);pinFiniteCriticContract(context)
 expect(archive.value('guide-finite-critic-contract-v1','contract')).toBeUndefined()
 rows.delete('guide-finite-final-approval-v1');pinFiniteCriticContract(context)
 expect(archive.value('guide-finite-critic-contract-v1','contract')).toEqual({version:3,scopeHash:guideHash(scope)})
 archive.saveValue('guide-finite-final-approval-v1','validated',{version:2})
 expect(finiteCriticContract(context)).toBe(3)
 expect(()=>finiteCriticContract({...context,scope:{...scope,jobId:'other'}})).toThrow('alterato')
 rows.delete('guide-until-valid-authority-v1')
 expect(()=>finiteCriticContract(context)).toThrow('alterato')
})
