import {expect,it} from 'vitest'
import {packGuideDataV3,packGuideDataV4,unpackGuideDataV3} from '../src/main/guide-wire-dense'
import {unpackGuideData,planGuideRequest} from '../src/main/guide-request-budget'
const rows=Array.from({length:20},(_,i)=>({lineId:'foreign-branch-'+i,turn:i,printId:'independent-card',comparison:'All costs and access conditions remain present. '.repeat(4),moves:[{from:'deck',to:'hand',count:1}]}))
it('preserves entire diagnostics with embedded canonical JSON, Unicode, quotes and marker collisions',()=>{
 const json=JSON.stringify(rows),text='Foreign error 🐦 [note] before '+json+'. Complete conditions remain here.\nSecond '+json+' end',value={rows,text,negative:-2,literals:[['+','literal'],['!','+'],['?',json],['=',-7]],noncanonical:'prefix '+JSON.stringify(rows,null,2)+' suffix',broken:'["unterminated',escaped:JSON.stringify({quoted:'brackets [ ] and \\" quote',rows})}
 const before=JSON.stringify(value),v3=packGuideDataV3(value),v4:any=packGuideDataV4(value)
 expect(JSON.stringify(unpackGuideData(v4))).toBe(before);expect(JSON.stringify(unpackGuideData(v3))).toBe(before);expect(JSON.stringify(value)).toBe(before)
 expect(JSON.stringify(v4).length).toBeLessThan(JSON.stringify(v3).length)
 expect(JSON.stringify(unpackGuideDataV3(packGuideDataV4(value,8,false)))).toBe(before)
 const forged=structuredClone(v4);forged.root=['+','literal',1];expect(()=>unpackGuideDataV3(forged)).toThrow('Frammenti')
 const corrupt=structuredClone(v4);corrupt.expandedHash='different';expect(()=>unpackGuideDataV3(corrupt)).toThrow('Hash')
})
it('selects the smallest measured complete request while keeping the same policy and full failed response',()=>{
 const data={rows,previousInvalid:{raw:{rows},message:'Full failure: '+JSON.stringify(rows)+'. Correct every branch.'}},schema={type:'object'},plan=planGuideRequest('repair-final-delta','All controls remain.',data,schema,[],3,1,1,true,true,true,true)
 expect(plan.budget.fits).toBe(true);expect(plan.budget.encoding).toBe('shared-v4');expect(unpackGuideData(plan.data)).toEqual(data);expect(plan.budget.reservedCalls).toBe(1)
})
