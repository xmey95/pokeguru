import {it,expect} from 'vitest'
import {finiteReviewEvidence,assertFiniteEvidenceProjection} from '../src/main/guide-finite-evidence'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideSource} from '../src/main/matchup-guide-packet'
import type {GuideContent} from '../src/shared/matchup-guide'
import type {GuideFiniteReview} from '../src/main/guide-finite-review'

it('retains complete cited-variant and historical sources, while excluding only unneeded card texts',()=>{
  const packet=syntheticSegmentProtocol('projection-only').packet
  const variant={id:'variant',label:'Synthetic variant',url:null,cards:[{printId:'variant-energy',name:'Synthetic Energy',count:60}]}
  packet.opponentLists.push(variant)
  packet.sources.push(guideSource(variant.id,'list',variant.label,null,variant),guideSource('card:variant-energy','card','Variant Energy',null,{printId:'variant-energy',category:'Energy',effect:'Complete synthetic variant source.'}),guideSource('card:unused','card','Uncited source',null,{printId:'unused',category:'Energy',effect:'Complete synthetic unused source.'}))
  const draft={chapters:[],claims:[],scenarios:[{id:'case',opponentListId:'their-list',sourceIds:['card:p']}],exercises:[],limitations:[],changeSummary:''} as unknown as GuideContent
  const one=finiteReviewEvidence(packet,draft,[],false)
  expect(one.sources.some(s=>s.id==='card:p')).toBe(true);expect(one.sources.some(s=>s.id==='card:e')).toBe(true)
  expect(one.sources.some(s=>s.id==='card:variant-energy')).toBe(false)
  draft.chapters=[{id:'variants',kind:'variants',title:'Variant',body:'Synthetic source-closure test, not a guide.',sourceIds:['variant'],dependsOn:['case']}]
  const history=[{contextHash:'synthetic-history',verdict:'revise',findings:[{severity:'minor',targetId:'variants',message:'Review the source.',correction:'Preserve it.',sourceIds:['card:unused'],repair:{kind:'text',targetId:'variants'},proposedActions:[],counterlines:[]}],checks:['Synthetic'],resolutions:[]}] as GuideFiniteReview[]
  const selected=finiteReviewEvidence(packet,draft,history,true)
  expect(selected.opponentLists.map(l=>l.id)).toEqual(['their-list','variant'])
  expect(selected.sources.find(s=>s.id==='card:variant-energy')).toEqual(packet.sources.find(s=>s.id==='card:variant-energy'))
  expect(selected.sources.find(s=>s.id==='card:unused')).toEqual(packet.sources.find(s=>s.id==='card:unused'))
  expect(()=>assertFiniteEvidenceProjection(selected,packet)).not.toThrow()
  const omitted=structuredClone(selected);omitted.sources=omitted.sources.filter(s=>s.id!=='card:variant-energy')
  expect(()=>assertFiniteEvidenceProjection(omitted,packet)).toThrow('fonte necessaria')
  const changed=structuredClone(selected);changed.sources[0].content+=' changed'
  expect(()=>assertFiniteEvidenceProjection(changed,packet)).toThrow('fonte estranea')
  expect(packet.sources.some(s=>s.id==='card:unused')).toBe(true)
})
