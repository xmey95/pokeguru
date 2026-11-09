import {it,expect} from 'vitest'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideHash,guideSource,packetHash} from '../src/main/matchup-guide-packet'
import {scopedConstructionPacket} from '../src/main/guide-causal-contract'
import {assertGuideEvidenceExtension,assertGuideRuntimeEvidence} from '../src/main/guide-evidence-extension'

const extend=(packet:ReturnType<typeof syntheticSegmentProtocol>['packet'],id='extra')=>{
 const next=structuredClone(packet);next.sources.push(guideSource('card:'+id,'card','Synthetic '+id,null,JSON.stringify({printId:id,name:'Synthetic '+id,category:'Trainer',gameplay:{effect:'Synthetic reference only.'}})));next.basis.dependencyHash=packetHash(next);return next
}
it('allows verified supplements while keeping a complete anchor and the exact native scope immutable',()=>{
 const anchor=syntheticSegmentProtocol('extension-project').packet,packet=scopedConstructionPacket(anchor,'their-list'),scope={projectId:anchor.basis.projectId,dependencyHash:anchor.basis.dependencyHash},first=extend(anchor),second=extend(first,'second'),before=guideHash(anchor)
 assertGuideEvidenceExtension(anchor,first);assertGuideRuntimeEvidence({scope,packet,evidenceAnchor:anchor,evidencePacket:second},first)
 expect(guideHash(anchor)).toBe(before);expect(packet.sources.some(s=>s.id==='card:extra')).toBe(false)
 expect(()=>assertGuideRuntimeEvidence({scope,packet,evidencePacket:first})).toThrow('fonti complete estranee')
 for(const field of ['source','list','basis','order','duplicate','hash','non-card','gaps'] as const){
  const next=extend(anchor)
  if(field==='source'){next.sources[0].content+=' changed';next.sources[0].hash=guideHash(next.sources[0].content)}
  if(field==='list')next.ourList.cards[0].count--
  if(field==='basis')next.basis.asOf='2026-11-03'
  if(field==='order')next.sources.reverse()
  if(field==='duplicate')next.sources.push(structuredClone(next.sources[0]))
  if(field==='hash')next.sources.at(-1)!.hash='bad'
  if(field==='non-card')next.sources.at(-1)!.kind='rules'
  if(field==='gaps'){const withGap=structuredClone(anchor);withGap.gaps.push('Frozen gap');expect(()=>assertGuideEvidenceExtension(withGap,next)).toThrow('estensione non valida');continue}
  next.basis.dependencyHash=packetHash(next)
  expect(()=>assertGuideEvidenceExtension(anchor,next),field).toThrow('estensione non valida')
 }
 const tampered=extend(first,'second');tampered.sources.find(s=>s.id==='card:extra')!.label='Rewritten supplement';tampered.basis.dependencyHash=packetHash(tampered)
 expect(()=>assertGuideRuntimeEvidence({scope,packet,evidenceAnchor:anchor,evidencePacket:tampered},first)).toThrow('estensione non valida')
})
