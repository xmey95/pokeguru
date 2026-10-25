import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CodexSetup, codexLauncher, localCodexScript, CODEX_PACKAGE } from '../src/main/codex-setup'

const folders: string[] = []
function profile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-codex-setup-test-'))
  folders.push(directory)
  return directory
}
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('installs the pinned CLI under a user profile and verifies its executable', async () => {
  const directory = profile()
  const calls: Array<{ command: string; args: string[]; cwd?: string; shell?: boolean }> = []
  const runner = async (command: string, args: string[], options: { cwd?: string; shell?: boolean } = {}) => {
    calls.push({ command, args, cwd: options.cwd, shell: options.shell })
    if (args[0] === 'install') {
      expect(options.cwd).toBe(join(directory, 'codex-cli'))
      expect(args).toContain(CODEX_PACKAGE)
      expect(args).toContain('--ignore-scripts')
      const script = localCodexScript(directory)
      mkdirSync(dirname(script), { recursive: true })
      writeFileSync(script, '// simulated package')
      return ''
    }
    if (args.at(-1) === '--version' && args[0] === localCodexScript(directory)) return 'codex-cli 0.164.0'
    if (args[0] === '--version' && (command === 'node' || command.includes('npm'))) return '24.0.0'
    throw new Error('missing Codex')
  }
  const setup = new CodexSetup(() => directory, runner)
  expect((await setup.status()).cliAvailable).toBe(false)
  const installed = await setup.install()
  expect(installed.cliAvailable).toBe(true)
  expect(existsSync(localCodexScript(directory))).toBe(true)
  expect(codexLauncher(directory)).toEqual({ command: 'node', prefix: [localCodexScript(directory)] })
  expect(calls.filter((call) => call.args[0] === 'install')).toHaveLength(1)
  await setup.install()
  expect(calls.filter((call) => call.args[0] === 'install')).toHaveLength(1)
})

it('reports missing prerequisites without starting an install', async () => {
  const directory = profile()
  const calls: string[][] = []
  const setup = new CodexSetup(() => directory, async (_command, args) => {
    calls.push(args)
    throw new Error('missing')
  })
  await expect(setup.install()).rejects.toThrow('Node.js con npm')
  expect(calls.some((args) => args[0] === 'install')).toBe(false)
  expect(existsSync(join(directory, 'codex-cli'))).toBe(false)
})

it('honors the explicit test binary over an installed CLI', () => {
  const directory = profile()
  mkdirSync(dirname(localCodexScript(directory)), { recursive: true })
  writeFileSync(localCodexScript(directory), '// simulated package')
  expect(codexLauncher(directory, { POKEGURU_CODEX_BIN: join(directory, 'missing') }))
    .toEqual({ command: join(directory, 'missing'), prefix: [] })
})

it('uses an existing Windows native executable or npm package without a shell', () => {
  const directory = profile()
  const binary = join(directory, 'codex.exe')
  writeFileSync(binary, '')
  expect(codexLauncher('', { PATH: directory }, 'win32')).toEqual({ command: binary, prefix: [] })
  rmSync(binary)
  const script = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  mkdirSync(dirname(script), { recursive: true })
  writeFileSync(script, '')
  expect(codexLauncher('', { PATH: directory }, 'win32')).toEqual({ command: 'node', prefix: [script] })
})
