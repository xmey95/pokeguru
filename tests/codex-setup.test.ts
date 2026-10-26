import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CodexSetup, codexLauncher } from '../src/main/codex-setup'

const folders: string[] = []
function temporary(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-codex-setup-test-'))
  folders.push(directory)
  return directory
}
function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
}
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

it('prefers the packaged native CLI on Windows, Linux and both macOS architectures without Node or npm on PATH', () => {
  const resources = temporary()
  const project = temporary()
  touch(join(resources, 'app.asar'))
  for (const [platform, arch, binaryName] of [
    ['win32', 'x64', 'codex.exe'], ['linux', 'x64', 'codex'],
    ['darwin', 'x64', 'codex'], ['darwin', 'arm64', 'codex']
  ] as const) {
    const binary = join(resources, 'codex', 'bin', binaryName)
    touch(binary)
    expect(codexLauncher(temporary(), { PATH: '' }, platform, arch, resources, project))
      .toEqual({ command: binary, prefix: [], source: 'included' })
  }
})

it('uses the official optional native package in development and preserves an explicit test override', () => {
  const project = temporary()
  const binary = join(project, 'node_modules', '@openai', 'codex-win32-x64',
    'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
  touch(binary)
  expect(codexLauncher(temporary(), { PATH: '' }, 'win32', 'x64', '', project))
    .toEqual({ command: binary, prefix: [], source: 'included' })
  expect(codexLauncher(temporary(), { PATH: '', POKEGURU_CODEX_BIN: 'test-codex' },
    'win32', 'x64', '', project))
    .toEqual({ command: 'test-codex', prefix: [], source: 'override' })
})

it('selects the matching optional native Codex package on macOS', () => {
  const project = temporary()
  for (const [arch, packageName, triple] of [
    ['x64', 'codex-darwin-x64', 'x86_64-apple-darwin'],
    ['arm64', 'codex-darwin-arm64', 'aarch64-apple-darwin']
  ] as const) {
    const binary = join(project, 'node_modules', '@openai', packageName,
      'vendor', triple, 'bin', 'codex')
    touch(binary)
    expect(codexLauncher(temporary(), { PATH: '' }, 'darwin', arch, '', project))
      .toEqual({ command: binary, prefix: [], source: 'included' })
  }
})

it('keeps a previous local native installation available when the package resource is missing', () => {
  const profile = temporary()
  const resources = temporary()
  touch(join(resources, 'app.asar'))
  const binary = join(profile, 'codex-cli', 'node_modules', '@openai', 'codex-win32-x64',
    'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
  touch(binary)
  expect(codexLauncher(profile, { PATH: '' }, 'win32', 'x64', resources, temporary()))
    .toEqual({ command: binary, prefix: [], source: 'local' })
})

it('verifies the actual official native package installed by npm ci', async () => {
  const setup = new CodexSetup(() => temporary())
  const status = await setup.status()
  expect(status.cliAvailable).toBe(true)
  expect(status.bundled).toBe(true)
  expect(status.version).toMatch(/^codex-cli 0\.164\.0/)
})

it('reports an unavailable CLI when the selected executable cannot start', async () => {
  const setup = new CodexSetup(() => temporary(), async () => { throw new Error('missing') })
  expect(await setup.status()).toEqual({ cliAvailable: false, version: null, bundled: false })
  expect(existsSync(join(folders.at(-1)!, 'codex-cli'))).toBe(false)
})
