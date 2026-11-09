import {it,expect} from 'vitest'
import {readAuditCalculation} from '../src/main/guide-audit-calculation'
import {guideSource} from '../src/main/matchup-guide-packet'
const operand=(kind:string,fields:Record<string,any>):any=>({kind,quantity:null,measureId:null,contextId:null,source:null,resultIndex:null,...fields})
const measure=()=>operand('measure',{measureId:'printed'}),context=()=>operand('context',{contextId:'factor'}),source=()=>operand('source',{source:{id:'rule',quote:'Add 5.',value:5}}),result=(index:number)=>operand('result',{resultIndex:index})
const calculation=(operation:string,left:any,right:any)=>({steps:[{operation,left,right}]})
function fixture(){return {packet:{sources:[guideSource('rule','rules','Independent synthetic scalar',null,'Add 5.')]},contextFacts:[{id:'factor',label:'Independent contextual factor',value:3},{id:'zero',label:'Independent zero',value:0}],context:{version:1,caseId:'independent',opponentListId:'other',cards:[{side:'ours',printId:'p',name:'Synthetic card',total:3}],windows:[{id:'before',lineId:'main',turn:1,side:'ours',when:'before',path:['events',0],balances:[{side:'ours',printId:'p',zone:'deck',count:2}],hosts:[],unknownAttachments:[]}],measures:[{id:'printed',label:'Printed base',value:'7'},{id:'two',label:'Printed scalar',value:'2'}]}} as any}
it('calculates from exact printed, source and contextual operands, including earlier computed results',()=>{
 const proof=calculation('add',measure(),source());proof.steps.push({operation:'multiply',left:result(0),right:context()});expect(readAuditCalculation(proof,fixture(),['before'])).toBe(36)
})
it.each(['add','subtract','multiply','divide','minimum','maximum'])('evaluates the bounded %s operation',operation=>{const right=operand('measure',{measureId:'two'}),left=operand('context',{contextId:'factor'}),expected={add:5,subtract:1,multiply:6,divide:1.5,minimum:2,maximum:3}[operation];if(operation==='divide')expect(()=>readAuditCalculation(calculation(operation,left,right),fixture(),['before'])).toThrow('non intero');else expect(readAuditCalculation(calculation(operation,left,right),fixture(),['before'])).toBe(expected)})
it('grounds inventory operands in the exact allowed window and keeps ownership and balance checks',()=>{
 const inventory=operand('inventory',{quantity:{windowId:'before',side:'ours',printId:'p',zone:'deck',host:null,count:2}}),proof=calculation('multiply',inventory,context());expect(readAuditCalculation(proof,fixture(),['before'])).toBe(6)
 inventory.quantity.count=3;expect(()=>readAuditCalculation(proof,fixture(),['before'])).toThrow('ha 2 copie');inventory.quantity.count=2;expect(()=>readAuditCalculation(proof,fixture(),[])).toThrow('finestra');inventory.quantity.side='opponent';expect(()=>readAuditCalculation(proof,fixture(),['before'])).toThrow('carta estranea')
})
it('represents a signed printed reduction with subtraction of its original magnitude and reports a forged operand precisely',()=>{
 const data=fixture();data.context.measures[0].value='130';data.packet.sources=[guideSource('rule','card','Synthetic negative modifier',null,{modifier:'-30'})]
 const magnitude=operand('source',{source:{id:'rule',quote:'-30',value:30}}),proof=calculation('subtract',measure(),magnitude)
 expect(readAuditCalculation(proof,data,['before'])).toBe(100)
 magnitude.source.value=228;expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('"declaredValue":228');expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('"availableValues":[30]');expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('steps[0].right')
 magnitude.source.value=-30;proof.steps[0].operation='add';expect(()=>readAuditCalculation(proof,data,['before'])).toThrow()
 magnitude.source.value=30;magnitude.source.quote='-40';expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('"exactQuote":false');expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('"availableValues":[]')
})
it('rejects fabricated numeric constants, quotes and values, instead of treating arithmetic as evidence',()=>{
 expect(()=>readAuditCalculation(calculation('add',operand('constant',{value:5}),measure()),fixture(),['before'])).toThrow()
 const value=source(),proof=calculation('add',measure(),value);value.source.quote='Add 8.';expect(()=>readAuditCalculation(proof,fixture(),['before'])).toThrow('citazione');value.source.quote='Add 5.';value.source.value=8;expect(()=>readAuditCalculation(proof,fixture(),['before'])).toThrow('citazione')
})
it('rejects future results, zero divisors, nonintegers, negative final values and excessive programs',()=>{
 expect(()=>readAuditCalculation(calculation('add',result(0),measure()),fixture(),['before'])).toThrow('futuro')
 expect(()=>readAuditCalculation(calculation('divide',measure(),operand('context',{contextId:'zero'})),fixture(),['before'])).toThrow('zero')
 expect(()=>readAuditCalculation(calculation('subtract',context(),measure()),fixture(),['before'])).toThrow('fuori intervallo')
 const data=fixture();data.contextFacts[0].value=1_000_000;expect(()=>readAuditCalculation(calculation('multiply',context(),context()),data,['before'])).toThrow('limite')
 expect(()=>readAuditCalculation({steps:Array(9).fill({operation:'add',left:measure(),right:source()})},fixture(),['before'])).toThrow()
})

it('reads an exact escaped JSON field only in the new reader and preserves historical rejection',()=>{
 const data=fixture(),quote='Original line.\n\nAdd 5.';data.packet.sources=[guideSource('rule','rules','Synthetic JSON evidence',null,{nested:[{effect:quote}]})];const leaf=source();leaf.source.quote=quote;const proof=calculation('add',measure(),leaf);expect(readAuditCalculation(proof,data,['before'])).toBe(12);expect(()=>readAuditCalculation(proof,data,['before'],false)).toThrow('citazione');leaf.source.quote='Original line. Add 5.';expect(()=>readAuditCalculation(proof,data,['before'])).toThrow('citazione')
})
