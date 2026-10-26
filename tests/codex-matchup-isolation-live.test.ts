import { expect, it } from 'vitest'
import { testCodex } from '../src/main/codex-matchup'
import type { AiRunConfig } from '../src/shared/ai'

const live = process.env.POKEGURU_CODEX_MATCHUP_LIVE === '1' ? it : it.skip

live('runs the Matchup connection check with isolated Codex tools', async () => {
  const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  await expect(testCodex(config)).resolves.toBeUndefined()
}, 180_000)
