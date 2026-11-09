import { guideHash, type GuidePacket } from './matchup-guide-packet'
import type { AiEvidenceArchive } from './ai-evidence-archive'
import type { AiRunConfig } from '../shared/ai'
import { isGuideDelivery } from '../shared/guide-delivery'

type Archive = Pick<AiEvidenceArchive, 'id' | 'projectId' | 'values'>
const role = 'guide-until-valid-authority-v1'
export interface GuideUntilValidAuthority {
  version: 1
  mode: 'until-valid'
  jobId: string
  projectId: string
  packetHash: string
  configHash: string
  callCeiling: null
  repairCeiling: null
  authorityReference: string
  approvedAt: string
}

// Internal numeric representation used by the existing request/token planner.
// The persisted authority has null ceilings; this is the JS integer boundary,
// not a configured allowance or an amount of calls to consume.
export const GUIDE_UNLIMITED_CAPACITY = Number.MAX_SAFE_INTEGER

export function guideUntilValidAuthority(archive: Archive): GuideUntilValidAuthority | undefined {
  const rows = [...archive.values<GuideUntilValidAuthority>(role)]
  if (!rows.length) return undefined
  if (rows.length !== 1) throw Error('Autorità di convergenza ambigua.')
  const { key, value } = rows[0]
  if (key !== 'authority' || !value || value.version !== 1 || value.mode !== 'until-valid' ||
      value.jobId !== archive.id || value.projectId !== archive.projectId || value.callCeiling !== null ||
      value.repairCeiling !== null || !/^[a-f0-9]{64}$/.test(value.packetHash) ||
      !/^[a-f0-9]{64}$/.test(value.configHash) || typeof value.authorityReference !== 'string' || !/^[a-z0-9:._-]{1,160}$/.test(value.authorityReference) ||
      typeof value.approvedAt !== 'string' || !Number.isFinite(Date.parse(value.approvedAt)) || Object.keys(value).length !== 10)
    throw Error('Autorità di convergenza alterata o estranea.')
  return value
}

/** Host-only authorization before a new job's first request. Never upgrades
 * an existing stopped job or reinterprets its negative opinions/receipts. */
export function authorizeGuideUntilValid(archive: Archive & Pick<AiEvidenceArchive, 'saveValue'>,
  packet: GuidePacket, config: AiRunConfig, authorityReference: string, approvedAt: string) {
  const authority: GuideUntilValidAuthority = { version: 1, mode: 'until-valid', jobId: archive.id,
    projectId: archive.projectId, packetHash: guideHash(packet), configHash: guideHash(config),
    callCeiling: null, repairCeiling: null, authorityReference, approvedAt }
  if (!isGuideDelivery(packet.basis)) throw Error('La nuova autorità richiede il percorso di consegna corrente.')
  if (packet.basis.projectId !== archive.projectId) throw Error('Autorità della lista di un altro progetto.')
  const prior = guideUntilValidAuthority(archive)
  if (prior) {
    if (guideHash(prior) !== guideHash(authority)) throw Error('Il job conserva un’autorità diversa.')
    return prior
  }
  if ([...archive.values('guide-attempt-start')].length || [...archive.values('guide-delivery-dispatch-v1')].length)
    throw Error('Un job storico non può acquisire la nuova politica di convergenza.')
  const view = new Proxy(archive, { get(target, name) {
    if (name === 'values') return function* (requested: string) {
      yield* target.values(requested)
      if (requested === role) yield { key: 'authority', value: authority }
    }
    const result = Reflect.get(target, name, target)
    return typeof result === 'function' ? result.bind(target) : result
  } })
  guideUntilValidAuthority(view)
  archive.saveValue(role, 'authority', authority)
  return authority
}

export function guideSemanticRetryAllowed(archive: Archive, completed: number, historicalLimit = 2): boolean {
  return !!guideUntilValidAuthority(archive) || completed < historicalLimit
}
