import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it } from 'vitest'
import { CodexControl } from '../src/main/codex-control'
import type { AiRunConfig } from '../src/shared/ai'

const live = process.env.POKEGURU_CODEX_DECK_LIVE === '1' ? it : it.skip
const schema = { type: 'object', properties: { reply: { type: 'string' } },
  required: ['reply'], additionalProperties: false }
const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }

live('mantiene due sessioni Codex distinte e riprende una dopo il riavvio App Server', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-codex-decks-'))
  let control = new CodexControl()
  try {
    const [first, second] = await Promise.all([
      control.jsonTurn(null, directory, 'Non usare strumenti. Rispondi in JSON con reply uguale a POKEGURU_A.', config, schema),
      control.jsonTurn(null, directory, 'Non usare strumenti. Rispondi in JSON con reply uguale a POKEGURU_B.', config, schema)
    ])
    expect(first.sessionId).not.toBe(second.sessionId)
    expect(first.value).toEqual({ reply: 'POKEGURU_A' })
    expect(second.value).toEqual({ reply: 'POKEGURU_B' })
    expect(first.turnId).not.toBe(second.turnId)
    await control.stop()
    control = new CodexControl()
    const resumed = await control.jsonTurn(first.sessionId, directory,
      'Continua questa sessione. Non usare strumenti. Rispondi in JSON con reply uguale a POKEGURU_A2.', config, schema)
    expect(resumed.value).toEqual({ reply: 'POKEGURU_A2' })
    console.log('Codex deck sessions OK: due thread isolati e ripresa del primo dopo nuovo processo.')
  } finally {
    await control.stop()
    if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) ||
      !basename(directory).startsWith('pokeguru-codex-decks-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(directory, { recursive: true, force: true })
  }
}, 180_000)
