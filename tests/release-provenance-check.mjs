import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createManifest, verifyAll } from '../scripts/release-provenance.mjs'

const sha = 'a'.repeat(40)
const version = '0.2.0'

test('provenance verifies all four exact release files and rejects tampering or another run', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-provenance-'))
  try {
    const linux = join(folder, `Pokeguru-${version}-linux-x86_64.AppImage`)
    const windows = join(folder, `Pokeguru-${version}-windows-x64-setup.exe`)
    const macIntel = join(folder, `Pokeguru-${version}-macos-x64.dmg`)
    const macArm = join(folder, `Pokeguru-${version}-macos-arm64.dmg`)
    writeFileSync(linux, 'AppImage fixture')
    writeFileSync(windows, 'NSIS fixture')
    writeFileSync(macIntel, 'Intel DMG fixture')
    writeFileSync(macArm, 'Apple Silicon DMG fixture')
    await createManifest(folder, 'linux', version, sha, '123')
    await createManifest(folder, 'windows', version, sha, '123')
    await createManifest(folder, 'macos-x64', version, sha, '123')
    await createManifest(folder, 'macos-arm64', version, sha, '123')
    assert.equal((await verifyAll(folder, version, sha, '123')).length, 4)
    await assert.rejects(verifyAll(folder, version, sha, '124'), /windows|linux|macos/)
    writeFileSync(macArm, 'Altered Apple Silicon DMG fixture')
    await assert.rejects(verifyAll(folder, version, sha, '123'), /macos-arm64/)
    writeFileSync(macArm, 'Apple Silicon DMG fixture')
    writeFileSync(join(folder, 'unexpected.txt'), 'extra file')
    await assert.rejects(verifyAll(folder, version, sha, '123'), /file di release/)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
