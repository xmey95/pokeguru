import {guideHash,packetHash,type GuidePacket} from './matchup-guide-packet'
import {scopedConstructionPacket} from './guide-causal-contract'
import {isGuidePrizeRuleSource} from './guide-prize-rule-sources'

type Binding={scope:{projectId:string;dependencyHash:string};packet:GuidePacket;evidencePacket?:GuidePacket;evidenceAnchor?:GuidePacket}
const invalid=()=>new Error('Evidenze per segmenti: estensione non valida; liste, contesto e fonti originali devono restare immutati.')
/** Supplemental card sheets do not rewrite the native stock or its sources.
 * Both the initial and extended complete packets keep their own verified hash. */
export function assertGuideEvidenceExtension(before:GuidePacket,after:GuidePacket):void{
 const core=(p:GuidePacket)=>{const {sources,gaps,basis,...rest}=p;const {dependencyHash,...base}=basis;return {...rest,basis:base}}
 for(const p of [before,after])if(packetHash(p)!==p.basis.dependencyHash||new Set(p.sources.map(s=>s.id)).size!==p.sources.length||p.sources.some(s=>guideHash(s.content)!==s.hash))throw invalid()
 if(guideHash(core(before))!==guideHash(core(after))||after.sources.length<before.sources.length||guideHash(after.sources.slice(0,before.sources.length))!==guideHash(before.sources)||after.gaps.length<before.gaps.length||guideHash(after.gaps.slice(0,before.gaps.length))!==guideHash(before.gaps)||after.sources.slice(before.sources.length).some(s=>!(s.kind==='card'&&s.id.startsWith('card:'))&&!isGuidePrizeRuleSource(s,before.basis.asOf)))throw invalid()
}
/** The anchor is the complete pre-construction packet. Native journals stay
 * bound to it; current/historical critics may receive verified additions. */
export function assertGuideRuntimeEvidence(options:Binding,historical?:GuidePacket):void{
 const {scope,packet,evidenceAnchor:anchor}=options,current=options.evidencePacket??packet
 if(anchor){
  if(anchor.basis.projectId!==scope.projectId||anchor.basis.dependencyHash!==scope.dependencyHash||packet.basis.dependencyHash!==scope.dependencyHash||packet.opponentLists.length!==1||guideHash(scopedConstructionPacket(anchor,packet.opponentLists[0].id))!==guideHash(packet))throw invalid()
  assertGuideEvidenceExtension(anchor,current)
  if(historical){assertGuideEvidenceExtension(anchor,historical);assertGuideEvidenceExtension(historical,current)}
 }else{
  // Existing local journal fixtures use deliberately partial packet bases.
  // Without a complete anchor they retain the original equal-hash contract;
  // no extension is permitted through this compatibility path.
  for(const evidence of historical?[current,historical]:[current])if(evidence.basis.projectId!==scope.projectId||evidence.basis.dependencyHash!==scope.dependencyHash||guideHash(evidence.ourList)!==guideHash(packet.ourList)||packet.sources.some(s=>!evidence.sources.some(e=>e.id===s.id&&guideHash(e)===guideHash(s))))throw new Error('Critica per segmenti: fonti complete estranee al contesto nativo.')
 }
}
export function restoreGuideEvidenceExtensions(options:Binding&{scope:Binding['scope']&{jobId:string};archive:{values:<T>(role:string)=>Iterable<{key:string;value:T}>}}):GuidePacket{
 const anchor=options.evidenceAnchor
 if(!anchor)return options.evidencePacket??options.packet
 const rows=[...options.archive.values<{anchorHash:string;beforeHash:string;after:GuidePacket;nativePacketHash:string;nativeScope:unknown}>('guide-segment-evidence-extension-v1')]
 let current=anchor;const seen=new Set<string>()
 for(const row of rows)if(row.value.anchorHash!==guideHash(anchor)||row.value.nativePacketHash!==guideHash(options.packet)||guideHash(row.value.nativeScope)!==guideHash(options.scope))throw invalid()
 while(seen.size<rows.length){
  const next=rows.filter(r=>!seen.has(r.key)&&r.value.beforeHash===guideHash(current))
  if(next.length!==1)throw new Error('Evidenze per segmenti: catena di estensioni incompleta o ambigua.')
  const row=next[0]
  if(row.key!==guideHash([current,row.value.after]))throw invalid()
  assertGuideEvidenceExtension(current,row.value.after);current=row.value.after;seen.add(row.key)
 }
 assertGuideRuntimeEvidence({...options,evidencePacket:current})
 return structuredClone(current)
}
