import {guideSource} from '../../src/main/matchup-guide-packet'
const source=(id:string,data:any)=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,...data}))
export function segmentFixture(){
  const sources=[source('p',{name:'Synthetic Basic',category:'Pokemon',stage:'Basic',gameplay:{hp:120,retreat:1,attacks:[{name:'Synthetic attack',cost:[]}]}}),source('e',{name:'Basic Grass Energy',category:'Energy'}),guideSource('rules','rules','Rules',null,'Synthetic fixture rules')]
  const list={id:'our-list',cards:[{printId:'p',name:'Synthetic Basic',count:4},{printId:'e',name:'Basic Grass Energy',count:56}]}
  const packet={ourList:list,opponentLists:[{...list,id:'their-list'}],sources,basis:{promptVersion:'matchup-guide-27',projectId:'project-a',dependencyHash:'dependency-a'}}
  const opening={active:'p',bench:[],hand:Array(6).fill('e'),prizes:Array(6).fill('e')}
  const tactical={attacks:[{printId:'p',attackName:'Synthetic attack'}],cards:['p','e'],promotions:[],comparison:'All synthetic candidates considered; no attack on the first turn.'}
  const ours={draw:'e',events:[],tactical},opponent=structuredClone(ours)
  const scenario={id:'case-a',opponentListId:'their-list',decision:'Synthetic resource line',assumptions:['Synthetic fixture'],sourceIds:['card:p','card:e'],positionAnnotations:[{side:"ours",printId:"p",zone:"active",copy:1,damage:0,condition:null,hpAdjustment:{amount:0,sourceIds:[]}},{side:"opponent",printId:"p",zone:"active",copy:1,damage:0,condition:null,hpAdjustment:{amount:0,sourceIds:[]}}],opening:{ours:opening,opponent:structuredClone(opening)},firstOpponentTurn:null,setupRounds:[],benchLimit:{ours:5,opponent:5},developmentPlan:{ours:{reason:'Draw only',pivot:'Keep board'},opponent:{reason:'Draw only',pivot:'Keep board'}},turns:{ours}}
  return {packet,scenario,opponent}
}
