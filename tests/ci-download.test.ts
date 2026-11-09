import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { parseGitHubAsset, wrapDownloadArtifact } = require('../scripts/official-github-download.cjs')

it('uses only exact official release coordinates, including encoded toolset tags', () => {
  expect(parseGitHubAsset('https://github.com/electron/electron/releases/download/v45.0.0/electron-v45.0.0-win32-x64.zip'))
    .toEqual({ repository: 'electron/electron', tag: 'v45.0.0', filename: 'electron-v45.0.0-win32-x64.zip' })
  expect(parseGitHubAsset('https://github.com/electron-userland/electron-builder-binaries/releases/download/7zip%401.0.0/7zip-win-x64.tar.gz').tag).toBe('7zip@1.0.0')
})
it.each([
  'http://github.com/electron/electron/releases/download/v45.0.0/electron.zip',
  'https://github.com.attacker.test/electron/electron/releases/download/v45.0.0/electron.zip',
  'https://github.com/other/repo/releases/download/v45.0.0/electron.zip',
  'https://user:secret@github.com/electron/electron/releases/download/v45.0.0/electron.zip',
  'https://github.com/electron/electron/releases/download/v45.0.0/electron.zip?redirect=other',
  'https://github.com/electron/electron/releases/download/v45.0.0/electron.zip#other',
  'https://github.com/electron/electron/releases/download/v45.0.0/%2e%2e%2felectron.zip',
  'https://github.com/electron/electron/releases/download/v45.0.0/*.zip',
])('rejects an unapproved download coordinate: %s', url => {
  expect(() => parseGitHubAsset(url)).toThrow()
})
it('preserves all SDK integrity options and refuses disabled checksums or conflicting transports', async () => {
  const original = vi.fn(async (_options: Record<string, unknown>) => 'cached'), downloader = { download: vi.fn() }
  const wrapped = wrapDownloadArtifact(original, downloader), checksums = { 'artifact.zip': 'f'.repeat(64) }
  const options = { version: '9.9.9', checksums, cacheRoot: '/cache', isGeneric: true, cacheMode: 0 }
  expect(await wrapped(options)).toBe('cached')
  expect(original.mock.calls[0][0]).toEqual({ ...options, downloader })
  expect(original.mock.calls[0][0].checksums).toBe(checksums)
  expect(options).not.toHaveProperty('downloader')
  expect(() => wrapped({ ...options, unsafelyDisableChecksums: true })).toThrow('Unchecked')
  expect(() => wrapped({ ...options, downloader: {} })).toThrow('Conflicting')
  expect(original).toHaveBeenCalledTimes(1)
})
it('keeps the real SDK checksum gate and authenticated cache after transport substitution', async () => {
  const { downloadArtifact } = await import('@electron/get')
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ci-checksum-')), bytes = Buffer.from('verified fixture')
  const downloader = { download: vi.fn(async (_url: string, target: string) => { writeFileSync(target, bytes) }) }
  const wrapped = wrapDownloadArtifact(downloadArtifact, downloader)
  const options = { version: '9.9.9', artifactName: 'fixture.zip', isGeneric: true, cacheRoot: folder,
    mirrorOptions: { resolveAssetURL: async () => 'https://github.com/electron/electron/releases/download/v45.0.0/fixture.zip' } }
  try {
    await expect(wrapped({ ...options, checksums: { 'fixture.zip': '0'.repeat(64) } })).rejects.toThrow(/checksum/i)
    const checksums = { 'fixture.zip': createHash('sha256').update(bytes).digest('hex') }
    const file = await wrapped({ ...options, checksums })
    expect(readFileSync(file)).toEqual(bytes)
    const calls = downloader.download.mock.calls.length
    expect(await wrapped({ ...options, checksums })).toBe(file)
    expect(downloader.download).toHaveBeenCalledTimes(calls)
    await expect(wrapped({ ...options, checksums: { 'fixture.zip': '0'.repeat(64) } })).rejects.toThrow(/checksum/i)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
