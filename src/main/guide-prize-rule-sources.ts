import rules from './guide-prize-rules.json'
import {guideHash,guideSource,packetHash,type GuidePacket} from './matchup-guide-packet'
import type {GuideSource} from '../shared/matchup-guide'

/** Curated, versioned excerpts, not model output or a computed Prize award. */
export function guidePrizeRuleSources(asOf:string):GuideSource[]{
 if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(asOf)||asOf.slice(0,10)<rules.availableFrom)return []
 return rules.entries.map(({id,label,url,...entry})=>guideSource(id,'rules',label,url,{version:rules.version,checkedAt:rules.checkedAt,availableFrom:rules.availableFrom,scope:rules.scope,...entry}))
}
export function isGuidePrizeRuleSource(source:GuideSource,asOf:string):boolean{
 return guidePrizeRuleSources(asOf).some(s=>s.id===source.id&&guideHash(s)===guideHash(source))
}
export function extendGuidePrizeRules(packet:GuidePacket):GuidePacket{
 const next=structuredClone(packet)
 for(const source of guidePrizeRuleSources(packet.basis.asOf)){
  const old=next.sources.find(s=>s.id===source.id)
  if(old&&guideHash(old)!==guideHash(source))throw Error('Regole Premi: identificativo riservato con fonte diversa.')
  if(!old)next.sources.push(source)
 }
 next.basis.dependencyHash=packetHash(next);return next
}
