export const STANDARD_RULE_PACKAGE_VERSION = 'western-2026-10-23-v1'

export type RuleSourceStatus = 'matching' | 'changed' | 'unavailable'

export interface RuleSourceAudit {
  id: 'rotation-2026' | 'set-admission-2026'
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
