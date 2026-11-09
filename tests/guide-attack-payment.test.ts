import {it,expect} from 'vitest'
import {verifyAttackPayment} from '../src/shared/guide-attack-payment'
import {guideSource} from '../src/main/matchup-guide-packet'
const card=(id:string,data:any)=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,...data}))
const fixtures=(cost:string[])=>[card('actor',{name:'Actor',category:'Pokemon',gameplay:{attacks:[{name:'Attack',cost}]}}),card('g',{name:'Basic Grass Energy',category:'Energy'}),card('p',{name:'Basic Psychic Energy',category:'Energy'}),card('wild',{name:'Synthetic Prism Energy',category:'Energy',gameplay:{effect:'Provides one Energy of any type.'}}),card('grant',{name:'Synthetic Grant',category:'Pokemon',gameplay:{abilities:[{effect:'Synthetic conditional Energy grant.'}]}})]
const event=(p:any={energy:[],costAdjustments:[]})=>({side:'ours',turn:3,attack:{printId:'actor',attackName:'Attack'},attackPayment:p})
const board=(attached:any[])=>({groups:[{id:1,side:'ours',printId:'actor',zone:'active',attached}],unknown:[]})
const contribution=(copy:number,types:string[])=>({printId:'wild',copy,units:[{types}],sourceIds:['card:wild'],reason:'Explicit synthetic conditional contribution; source conditions require criticism.'})
it('rejects two Grass plus Psychic for three Grass and accepts three real Grass without changing assignments',()=>{
 const b=board([{printId:'g',count:2},{printId:'p',count:1}]),raw=JSON.stringify(b);expect(()=>verifyAttackPayment(event(),b,fixtures(['Grass','Grass','Grass']),new Set())).toThrow('non pagabile');expect(JSON.stringify(b)).toBe(raw)
 expect(verifyAttackPayment(event(),board([{printId:'g',count:3}]),fixtures(['Grass','Grass','Grass']),new Set())!.payment).toHaveLength(3)
})
it('does not borrow Energy from a Benched Pokémon or an unresolved owner',()=>{
 const b=board([]);b.groups.push({id:2,side:'ours',printId:'actor',zone:'bench',attached:[{printId:'g',count:3}]})
 expect(()=>verifyAttackPayment(event(),b,fixtures(['Grass']),new Set())).toThrow('non pagabile')
 const unknown:any=board([]);unknown.unknown=[{side:'ours',printId:'g',count:1,candidates:[1]}];expect(()=>verifyAttackPayment(event(),unknown,fixtures(['Grass']),new Set())).toThrow('ambiguo')
})
it('matches each flexible unit once, with a polynomial augmenting-path matcher',()=>{
 const p={energy:[contribution(1,['Grass','Psychic'])],costAdjustments:[]},s=fixtures(['Grass','Psychic']),present=new Set(['card:wild'])
 expect(()=>verifyAttackPayment(event(p),board([{printId:'wild',count:1}]),s,present)).toThrow('non pagabile')
 p.energy.push(contribution(2,['Grass']));expect(verifyAttackPayment(event(p),board([{printId:'wild',count:2}]),s,present)!.payment).toHaveLength(2)
 const many={energy:Array.from({length:30},(_,i)=>contribution(i+1,['Grass','Psychic'])),costAdjustments:[]};expect(verifyAttackPayment(event(many),board([{printId:'wild',count:30}]),fixtures(Array(30).fill('Grass')),present)!.payment).toHaveLength(30)
})
it('rejects duplicate or nonexistent contributions, unsupported grants and wrong reduction types',()=>{
 const c=contribution(1,['Grass']),b=board([{printId:'wild',count:1}]),s=fixtures(['Grass']),present=new Set(['card:wild'])
 expect(()=>verifyAttackPayment(event({energy:[c,c],costAdjustments:[]}),b,s,present)).toThrow('duplicato')
 expect(()=>verifyAttackPayment(event({energy:[contribution(2,['Grass'])],costAdjustments:[]}),b,s,present)).toThrow('non disponibile')
 expect(()=>verifyAttackPayment(event({energy:[c],costAdjustments:[]}),b,s,new Set())).toThrow('non presente')
 const reduction={type:'Colorless',amount:-1,sourceIds:['card:grant'],reason:'Synthetic conditional reduction.'}
 expect(()=>verifyAttackPayment(event({energy:[],costAdjustments:[reduction]}),board([{printId:'g',count:1}]),fixtures(['Grass','Grass']),new Set(['card:grant']))).toThrow('non pagabile')
 reduction.type='Grass';expect(verifyAttackPayment(event({energy:[],costAdjustments:[reduction]}),board([{printId:'g',count:1}]),fixtures(['Grass','Grass']),new Set(['card:grant']))!.effectiveCost).toEqual(['Grass'])
})
