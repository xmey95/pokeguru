import {expect,it} from 'vitest'
import {createBoardExitTracker,checkBoardExitStep} from '../src/shared/guide-board-exits'
import {guideSource} from '../src/main/matchup-guide-packet'
const card=(id:string,category='Pokemon',extra:any={})=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,name:id,category,gameplay:{abilities:category==='Pokemon'?[{name:'Return Cycle',effect:'Shuffle this Pokémon and all attached cards into your deck.'}]:[],...extra}}))
const sources=[card('root'),card('grown'),card('pivot'),card('enemy'),card('power','Energy'),card('gear','Trainer',{trainerType:'Tool',effect:'The Pokémon this card is attached to has more HP.'}),card('bounce','Trainer',{effect:'Return a Pokémon and all attached cards to your hand.'}),card('banish','Trainer',{effect:'Put a Pokémon and all attached cards in the Lost Zone.'}),card('discard','Trainer',{effect:'Discard a Pokémon and all attached cards.'}),card('draw','Trainer',{effect:'Draw 3 cards.'})]
const move=(id:string,from:string,to:string,side='ours',count=1)=>({side,printId:id,from,to,count})
const event=(moves:any[],extra:any={}):any=>({side:'ours',turn:3,kind:'effect',description:'Return Cycle',moves,action:'other',energyRoutes:[],...extra})
function setup(){const t=createBoardExitTracker(sources);t.advance(event([move('pivot','hand','active'),move('root','hand','bench'),move('enemy','hand','active','opponent')],{description:'Setup'}));t.advance(event([move('root','bench','evolution'),move('grown','hand','bench')],{kind:'evolve',description:'Evolve'}));t.advance(event([move('power','hand','attached')],{description:'Attach',energyRoutes:[{side:'ours',printId:'power',path:['hand','attached'],hostPrintId:'grown'}]}));t.advance(event([move('gear','hand','attached')],{description:'Attach gear to grown'}));return t}
const exit=(to='deck',extra:any={})=>event([move('grown','bench',to),move('root','evolution',to),move('power','attached',to),move('gear','attached',to)],extra)
it('keeps distinct Energy route owners and can reuse cards after a proved return to the deck',()=>{
 const t=createBoardExitTracker(sources);t.advance(event([move('root','hand','active'),move('grown','hand','bench')],{description:'Setup'}))
 t.advance(event([move('power','hand','attached'),move('power','hand','attached')],{description:'Attach both',energyRoutes:['root','grown'].map(hostPrintId=>({side:'ours',printId:'power',count:1,path:['hand','attached'],hostPrintId}))}))
 expect(t.advance(event([move('grown','bench','deck'),move('power','attached','deck')],{energyRoutes:[{side:'ours',printId:'power',count:1,path:['attached','deck'],hostPrintId:'grown'}]}))[0].attached).toEqual([{printId:'power',count:1,to:'deck'}])
 t.advance(event([move('grown','deck','hand')],{description:'Draw returned card'}));t.advance(event([move('grown','hand','bench')],{description:'Play again'}))
 expect(t.advance(event([move('grown','bench','deck')]))[0].attached).toEqual([])
 t.advance(event([move('power','attached','discard')],{description:'Discard from root',energyRoutes:[{side:'ours',printId:'power',count:1,path:['attached','discard'],hostPrintId:'root'}]}))
})
it('derives a complete evolved Pokémon departure and explicit attachment destinations, with zero prizes',()=>{
 const t=setup(),e=exit(),before=JSON.stringify(e),exits=t.advance(e);expect(JSON.stringify(e)).toBe(before);expect(exits).toHaveLength(1);expect(exits[0]).toMatchObject({printId:'grown',from:'bench',to:'deck',stack:[{printId:'root',count:1,to:'deck'}]});expect(exits[0].attached.map(c=>c.printId)).toEqual(['power','gear'])
 expect(checkBoardExitStep({action:'board-exit',side:'ours',description:'Verified',prizesTaken:0,boardExits:exits,before:{ourBench:1,opponentBench:0,ourPrizes:6,opponentPrizes:6},after:{ourBench:0,opponentBench:0,ourPrizes:6,opponentPrizes:6}})).toEqual([])
})
it.each([['hand','bounce'],['lost','banish'],['discard','discard']])('supports %s departures using a declared effect without special card rules',(to,trainer)=>{
 const t=setup();expect(t.advance(exit(to,{description:'Apply effect',trainer}))[0].to).toBe(to)
})
it('rejects omitted stack cards, missing Energy or Tools, fake prizes and absent/unrelated effect sources',()=>{
 for(const id of ['root','power','gear']){const t=setup(),e=exit();e.moves=e.moves.filter((m:any)=>m.printId!==id);expect(()=>t.advance(e)).toThrow('lasciate sul campo')}
 expect(()=>setup().advance(event([...exit().moves,move('power','prizes','hand')]))).toThrow('Premio')
 expect(()=>setup().advance(exit('deck',{description:'No effect'}))).toThrow('fonte')
 expect(()=>setup().advance(exit('deck',{description:'Draw only',trainer:'draw'}))).toThrow('fonte')
 expect(()=>setup().advance(exit('deck',{energyRoutes:[{side:'ours',printId:'power',count:1,path:['attached','deck'],hostPrintId:'pivot'}]}))).toThrow('lasciate sul campo')
 expect(()=>setup().advance(exit('deck',{description:'Invented',boardExitProofs:[{side:'ours',printId:'grown',copy:null,sourceIds:['missing'],reason:'Claim'}]}))).toThrow('fonte')
 expect(()=>setup().advance(exit('deck',{description:'Draw',boardExitProofs:[{side:'ours',printId:'grown',copy:null,sourceIds:['card:draw'],reason:'Claim'}]}))).toThrow('priva')
})
it('requires an explicit replacement after an Active departure, with no invented promotion',()=>{
 const t=createBoardExitTracker(sources);t.advance(event([move('root','hand','active'),move('pivot','hand','bench')],{description:'Setup'}));const e=event([move('root','active','deck')]);expect(t.advance(e)).toHaveLength(1)
 expect(()=>t.advance(event([move('power','deck','hand')],{kind:'turn-draw'}))).toThrow('sostituzione')
 const t2=createBoardExitTracker(sources);t2.advance(event([move('root','hand','active'),move('pivot','hand','bench')],{description:'Setup'}));t2.advance(e);expect(t2.advance(event([move('pivot','bench','active')],{action:'promote'}))).toEqual([])
})
it('allows separate explicit promotions when an effect removes both Active Pokémon',()=>{
 const t=createBoardExitTracker(sources);t.advance(event([move('root','hand','active'),move('pivot','hand','bench'),move('enemy','hand','active','opponent'),move('grown','hand','bench','opponent')]))
 expect(t.advance(event([move('root','active','hand'),move('enemy','active','hand','opponent')],{trainer:'bounce',description:'Return both Actives'}))).toHaveLength(2)
 t.advance(event([move('grown','bench','active','opponent')],{action:'promote'}));t.advance(event([move('pivot','bench','active')],{action:'promote'}))
 expect(t.advance(event([move('power','deck','hand')],{description:'Draw'}))).toEqual([])
})
it('restores ownership separately for mutually exclusive branches and refuses ambiguous attachment owners',()=>{
 const t=setup(),state=t.snapshot(),a=t.advance(exit());t.restore(state);expect(t.advance(exit())).toEqual(a)
 const u=createBoardExitTracker(sources);u.advance(event([move('root','hand','active'),move('grown','hand','bench')]));u.advance(event([move('gear','hand','attached')],{description:'Attach gear'}));expect(()=>u.advance(event([move('grown','bench','deck')]))).toThrow('ambiguo')
 const v=createBoardExitTracker(sources);v.advance(event([move('root','hand','active'),move('grown','hand','bench')]));v.advance(event([move('gear','hand','attached')],{description:'Attach gear',attachmentTargets:[{side:'ours',printId:'gear',hostPrintId:'root',copy:null}]}));expect(v.advance(event([move('grown','bench','deck')]))).toHaveLength(1)
})
it('handles both players, simultaneous departures and duplicate printed copies without summing alternative branches',()=>{
 const t=createBoardExitTracker(sources);t.advance(event([move('root','hand','active'),move('pivot','hand','bench'),move('enemy','hand','active','opponent'),move('grown','hand','bench','opponent',2)]))
 const exits=t.advance(event([move('pivot','bench','hand'),move('grown','bench','hand','opponent',2)],{description:'Return effect',trainer:'bounce'}));expect(exits).toHaveLength(3);expect(exits.filter(e=>e.side==='opponent')).toHaveLength(2)
 const u=createBoardExitTracker(sources);u.advance(event([move('root','hand','active'),move('grown','hand','bench','ours',2)]));expect(()=>u.advance(event([move('grown','bench','deck')]))).toThrow('ambigua')
 const v=createBoardExitTracker(sources);v.advance(event([move('root','hand','active'),move('grown','hand','bench','ours',2)]));expect(v.advance(event([move('grown','bench','hand')],{description:'Return effect',boardExitProofs:[{side:'ours',printId:'grown',copy:2,sourceIds:['card:bounce'],reason:'Declared effect.'}]}))).toHaveLength(1)
})
it('rejects forged derived prizes and counters, fake promotion/KO labels and extra companion removals',()=>{
 const exits=setup().advance(exit()),step:any={action:'board-exit',side:'ours',description:'Verified',prizesTaken:1,boardExits:exits,before:{ourBench:1,opponentBench:0,ourPrizes:6,opponentPrizes:6},after:{ourBench:1,opponentBench:0,ourPrizes:5,opponentPrizes:6}}
 expect(checkBoardExitStep(step)).toHaveLength(3)
 expect(()=>setup().advance(exit('deck',{action:'promote'}))).toThrow('mascherare')
 expect(()=>setup().advance(event([...exit().moves,move('root','evolution','deck')]))).toThrow('non appartenenti')
})

it.each(['ours','opponent'] as const)('preserves different Energy counts and Tools on the surviving %s copy after a KO',side=>{
 const sources=[{printId:'unit',category:'Pokemon',gameplay:{abilities:[{name:'Cycle',effect:'Shuffle this Pokémon and all attached cards into your deck.'}]}},{printId:'power',category:'Energy',gameplay:{}},{printId:'tool',category:'Trainer',gameplay:{trainerType:'Tool'}}].map(c=>guideSource('card:'+c.printId,'card',c.printId,null,JSON.stringify({...c,name:c.printId})))
 const m=(printId:string,from:string,to:string,count=1)=>({side,printId,from,to,count}),e=(moves:any[],extra:any={}):any=>({side,turn:3,kind:'effect',description:'Cycle',action:'other',energyRoutes:[],moves,...extra}),t=createBoardExitTracker(sources)
 t.advance(e([m('unit','hand','active'),m('unit','hand','bench')]))
 for(const copy of [1,2])t.advance(e([m('power','hand','attached',copy),m('tool','hand','attached')],{description:'Explicit owners',energyRoutes:[{side,printId:'power',count:copy,path:['hand','attached'],hostPrintId:'unit'}],attachmentTargets:['power','tool'].map(printId=>({side,printId,hostPrintId:'unit',copy}))}))
 t.advance(e([m('unit','active','discard'),m('power','attached','discard'),m('tool','attached','discard')],{kind:'knockout',action:'active-ko',energyRoutes:[{side,printId:'power',count:1,path:['attached','discard'],hostPrintId:'unit'}],attachmentTargets:['power','tool'].map(printId=>({side,printId,hostPrintId:'unit',copy:1}))}))
 t.advance(e([m('unit','bench','active')],{action:'promote'}))
 const exits=t.advance(e([m('unit','active','deck'),m('power','attached','deck',2),m('tool','attached','deck')],{energyRoutes:[{side,printId:'power',count:2,path:['attached','deck'],hostPrintId:'unit'}]}))
 expect(exits[0].attached).toEqual([{printId:'power',count:2,to:'deck'},{printId:'tool',count:1,to:'deck'}])
})
it('uses distinct instances in an atomic swap between identically printed Pokémon before a return',()=>{
 const sources=[{printId:'unit',category:'Pokemon',gameplay:{abilities:[{name:'Cycle',effect:'Shuffle this Pokémon and all attached cards into your deck.'}]}},{printId:'power',category:'Energy',gameplay:{}}].map(c=>guideSource('card:'+c.printId,'card',c.printId,null,JSON.stringify({...c,name:c.printId})))
 const m=(printId:string,from:string,to:string,count=1)=>({side:'ours',printId,from,to,count}),e=(moves:any[],extra:any={}):any=>({side:'ours',turn:3,kind:'effect',description:'Cycle',action:'other',energyRoutes:[],moves,...extra}),t=createBoardExitTracker(sources)
 t.advance(e([m('unit','hand','active'),m('unit','hand','bench')]))
 for(const copy of [1,2])t.advance(e([m('power','hand','attached',copy)],{description:'Explicit owner',energyRoutes:[{side:'ours',printId:'power',count:copy,path:['hand','attached'],hostPrintId:'unit'}],attachmentTargets:[{side:'ours',printId:'power',hostPrintId:'unit',copy}]}))
 t.advance(e([m('unit','active','bench'),m('unit','bench','active')],{action:'gust'}))
 expect(t.advance(e([m('unit','active','deck'),m('power','attached','deck',2)],{energyRoutes:[{side:'ours',printId:'power',count:2,path:['attached','deck'],hostPrintId:'unit'}]}))[0].attached).toEqual([{printId:'power',count:2,to:'deck'}])
})
it('rejects a late ownership declaration for a Pokémon absent when the Tool was attached',()=>{
 const sources=['unit','other','later','tool'].map(id=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,name:id,category:id==='tool'?'Trainer':'Pokemon',gameplay:id==='tool'?{trainerType:'Tool'}:{abilities:[{name:'Cycle',effect:'Shuffle this Pokémon and all attached cards into your deck.'}]}})))
 const m=(printId:string,from:string,to:string)=>({side:'ours',printId,from,to,count:1}),e=(moves:any[],extra:any={}):any=>({side:'ours',turn:3,kind:'effect',description:'Cycle',action:'other',energyRoutes:[],moves,...extra}),t=createBoardExitTracker(sources)
 t.advance(e([m('unit','hand','active'),m('other','hand','bench')]))
 t.advance(e([m('tool','hand','attached')],{description:'Unknown owner'}));t.advance(e([m('later','hand','bench')]))
 expect(()=>t.advance(e([m('other','bench','deck')],{attachmentTargets:[{side:'ours',printId:'tool',hostPrintId:'later',copy:null}]}))).toThrow('non presente al momento')
})
it('rejects conflicting Energy route and explicit host declarations during removal',()=>{
 const sources=['unit','other','power'].map(id=>guideSource('card:'+id,'card',id,null,JSON.stringify({printId:id,name:id,category:id==='power'?'Energy':'Pokemon',gameplay:{}})))
 const m=(printId:string,from:string,to:string)=>({side:'ours',printId,from,to,count:1}),e=(moves:any[],extra:any={}):any=>({side:'ours',turn:3,kind:'effect',description:'Explicit transfer',action:'other',energyRoutes:[],moves,...extra}),t=createBoardExitTracker(sources)
 t.advance(e([m('unit','hand','active'),m('other','hand','bench')]))
 t.advance(e([m('power','hand','attached')],{energyRoutes:[{side:'ours',printId:'power',count:1,path:['hand','attached'],hostPrintId:'unit'}]}))
 expect(()=>t.advance(e([m('power','attached','discard')],{energyRoutes:[{side:'ours',printId:'power',count:1,path:['attached','discard'],hostPrintId:'other'}],attachmentTargets:[{side:'ours',printId:'power',hostPrintId:'unit',copy:1}]}))).toThrow('incompatibile con energyRoutes')
})
