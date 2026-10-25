import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createManifest, verifyAll } from '../scripts/release-provenance.mjs'

const sha = 'a'.repeat(40)
const version = '0.1.0'

test('provenance verifies both exact release files and rejects tampering or another run', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-provenance-'))
  try {
    const linux = join(folder, `Pokeguru-${version}-linux-x86_64.AppImage`)
    const windows = join(folder, `Pokeguru-${version}-windows-x64-setup.exe`)
    writeFileSync(linux, 'AppImage fixture')
    writeFileSync(windows, 'NSIS fixture')
    await createManifest(folder, 'linux', version, sha, '123')
    await createManifest(folder, 'windows', version, sha, '123')
    assert.equal((await verifyAll(folder, version, sha, '123')).length, 2)
    await assert.rejects(verifyAll(folder, version, sha, '124'), /windows|linux/)
    writeFileSync(windows, 'Altered NSIS fixture')
    await assert.rejects(verifyAll(folder, version, sha, '123'), /windows/)
    writeFileSync(windows, 'NSIS fixture')
    writeFileSync(join(folder, 'unexpected.txt'), 'extra file')
    await assert.rejects(verifyAll(folder, version, sha, '123'), /file di release/)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
