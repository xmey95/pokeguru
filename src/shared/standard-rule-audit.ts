import { BUNDLED_WESTERN_RULE_PACKAGE } from './western-rule-package'

export const STANDARD_RULE_PACKAGE_VERSION = BUNDLED_WESTERN_RULE_PACKAGE.version

export type RuleSourceStatus = 'matching' | 'changed' | 'unavailable'

export interface RuleSourceAudit {
  id: 'rotation-2026' | 'set-admission-2026' | 'promo-registry'
  url: string
  status: RuleSourceStatus
  detail: string
}

export interface StandardRuleAudit {
  packageVersion: string
  checkedAt: string
  verifiedAt: string | null
  status: RuleSourceStatus
  sources: RuleSourceAudit[]
}
