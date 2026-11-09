import {guideHash} from './matchup-guide-packet'
import {readVerifiedAtomicCoverage,type GuideAtomicCoverage,type GuideAtomicPredicate} from './guide-atomic-proofs'
import type {Context,Obligation} from './guide-obligation-registry'

/** Lossless codec, not a host paraphrase. The independent mapping critic must
 * read this exact structured predicate, policy, sources and conditions. */
export function guideAtomicObligationDescriptor(atom:GuideAtomicPredicate):Omit<Obligation,'id'|'contextHash'>{
  const {authorRequestIds,...predicate}=atom
  return {statement:JSON.stringify({protocol:'guide-atomic-statement-1',predicate}),conditions:atom.conditions,sourceIds:[...atom.sourceIds],comparisonGroupId:null}
}
export function isGuideAtomicObligation(value:Pick<Obligation,'statement'>):boolean{
  try{return JSON.parse(value.statement)?.protocol==='guide-atomic-statement-1'}catch{return false}
}
export function guideAtomicRegistryContext(input:{caseId:string;rootHash:string;nativePacketHash:string;contextHash:string;evidenceHash:string;contractHash:string;sourceIds:string[]},mappingFrameHash?:string):Context{
  if(mappingFrameHash!==undefined&&!/^[a-f0-9]{64}$/.test(mappingFrameHash))throw new Error('Frame del mapping non valido.')
  return {packetHash:input.evidenceHash,frameHash:guideHash({caseId:input.caseId,rootHash:input.rootHash,nativePacketHash:input.nativePacketHash,atomicContextHash:input.contextHash})+(mappingFrameHash?':'+mappingFrameHash:''),
    validatorVersion:'guide-atomic-proof-1:'+input.contractHash,sourceIds:[...input.sourceIds]}
}
/** Mapping semantics may depend on the selected main line. Local conditional
 * facts depend on their own complete bodies, not that selection. A fresh
 * independent mapping can reuse them under another pinned main-line frame. */
export function matchesGuideAtomicRegistryContext(actual:Context,base:Context):boolean{
  const frame=actual.frameHash===base.frameHash||actual.frameHash.startsWith(base.frameHash+':')&&/^[a-f0-9]{64}$/.test(actual.frameHash.slice(base.frameHash.length+1))
  return frame&&actual.packetHash===base.packetHash&&actual.validatorVersion===base.validatorVersion&&guideHash(actual.sourceIds)===guideHash(base.sourceIds)
}
/** Rechecks the opaque capability each time. New competitors and conflicts
 * invalidate it through its source store; cloning JSON cannot create a pass. */
export function authenticatedGuideAtomicBinding(proof:GuideAtomicCoverage){
  const value=readVerifiedAtomicCoverage(proof)
  return {scope:value.scope,context:guideAtomicRegistryContext({...value,caseId:value.scope.caseId}),
    descriptor:guideAtomicObligationDescriptor(value.predicate),reviewerRequestIds:value.reviewerRequestIds,receiptHashes:value.receiptHashes}
}
