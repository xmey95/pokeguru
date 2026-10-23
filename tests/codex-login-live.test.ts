import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { expect, it } from 'vitest'
import { CodexControl } from '../src/main/codex-control'

const live = process.env.POKEGURU_CODEX_LOGIN_LIVE === '1' ? it : it.skip

live('avvia il login ChatGPT e disconnette soltanto un profilo Codex isolato', async () => {
  const directory = mkdtempSync(join(process.cwd(), '.pokeguru-codex-login-'))
  const previous = process.env.CODEX_HOME
  const control = new CodexControl()
  try {
    process.env.CODEX_HOME = directory
    expect((await control.connection()).account).toBeNull()
    const loginUrl = new URL(await control.startLogin())
    expect(loginUrl.protocol).toBe('https:')
    expect(loginUrl.hostname === 'openai.com' || loginUrl.hostname.endsWith('.openai.com') ||
      loginUrl.hostname === 'chatgpt.com' || loginUrl.hostname.endsWith('.chatgpt.com')).toBe(true)
    await control.logout()
    expect((await control.connection()).account).toBeNull()
  } finally {
    await control.stop()
    if (previous === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previous
    if (!realpathSync(directory).startsWith(`${realpathSync(process.cwd())}${sep}`) ||
      !basename(directory).startsWith('.pokeguru-codex-login-')) throw new Error('Percorso temporaneo inatteso.')
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 })
  }
}, 60_000)
