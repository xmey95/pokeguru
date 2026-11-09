import {expect,it} from 'vitest'
import {developmentCandidates} from '../src/main/guide-decision-context'
import {guideSource,type GuidePacket} from '../src/main/matchup-guide-packet'

it('supplies complete printed evolution chains and timing sources from each exact list without asserting legality',()=>{
  const cards=[{printId:'basic',name:'Basic',stage:'Basic',category:'Pokemon',gameplay:{attacks:[{name:'Small attack',cost:['Colorless'],damage:'10'}]}},{printId:'middle',name:'Middle',stage:'Stage1',category:'Pokemon',gameplay:{evolveFrom:'Basic',attacks:[{name:'Middle KO',cost:['Fire'],damage:'70'}]}},{printId:'final',name:'Final',stage:'Stage2',category:'Pokemon',gameplay:{evolveFrom:'Middle',attacks:[{name:'Final KO',cost:['Grass','Grass'],damage:'140'}],abilities:[{name:'Energy units',effect:'Synthetic source text'}]}},{printId:'trainer',name:'Trainer',category:'Trainer',gameplay:{effect:'Exact unmodified source condition.'}}]
  const p={ourList:{id:'ours',cards:cards.map(c=>({printId:c.printId,count:1}))},opponentLists:[{id:'selected',cards:[{printId:'basic',count:4},{printId:'middle',count:2}]},{id:'other',cards:[{printId:'final',count:2}]}],sources:cards.map(c=>guideSource('card:'+c.printId,'card',c.name,null,c))} as GuidePacket
  const before=JSON.stringify(p),result=developmentCandidates(p,'selected'),ours=result[0],opponent=result[1]
  expect(result.map(r=>r.listId)).toEqual(['ours','selected'])
  expect(ours.routes.some(r=>JSON.stringify(r.printIds)===JSON.stringify(['basic','middle','final']))).toBe(true)
  expect(ours.routes.find(r=>r.printIds.length===3).stages[1].attacks[0].name).toBe('Middle KO')
  expect(opponent.routes.some(r=>r.printIds.includes('final'))).toBe(false)
  expect(ours.accessAndTimingSources[0]).toMatchObject({sourceId:'card:trainer',effect:'Exact unmodified source condition.'})
  expect(result.every(r=>r.candidateOnly)).toBe(true);expect(JSON.stringify(p)).toBe(before)
})
