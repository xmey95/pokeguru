import { expect, it } from 'vitest'
import { auditStandardRuleSources } from '../src/main/standard-rule-audit'

const live = process.env.POKEGURU_RULE_AUDIT_LIVE === '1' ? it : it.skip

live('legge le due fonti ufficiali e confronta il pacchetto corrente', async () => {
  const audit = await auditStandardRuleSources(null)
  expect(audit.sources).toHaveLength(2)
  expect(audit.sources[0].status).toMatch(/^(matching|unavailable)$/)
  expect(audit.sources[1].status).toBe('matching')
  expect(audit.sources.map((source) => `${source.id}: ${source.status} ${source.detail}`)).toHaveLength(2)
}, 35_000)
