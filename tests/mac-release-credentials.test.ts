import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'vitest'

const script = resolve('scripts/check-mac-release-credentials.mjs')
const secret = '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n'

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: resolve('.'),
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8'
  })
}

test('macOS release fails before packaging when signing credentials are absent', () => {
  const result = run({})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /MAC_CSC_LINK/)
  assert.match(result.stderr, /APPLE_API_KEY_P8_BASE64/)
})

test('macOS release prepares a private notarization key without logging it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pokeguru-mac-credentials-'))
  try {
    const githubEnv = join(dir, 'github-env')
    writeFileSync(githubEnv, '')
    const env = {
      MAC_CSC_LINK: 'test-certificate',
      MAC_CSC_KEY_PASSWORD: 'test-password',
      APPLE_API_KEY_P8_BASE64: Buffer.from(secret).toString('base64'),
      APPLE_API_KEY_ID: 'TESTKEY123',
      APPLE_API_ISSUER: 'test-issuer',
      RUNNER_TEMP: dir,
      GITHUB_ENV: githubEnv
    }
    const result = run(env)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(dir, 'pokeguru-apple-notary.p8'), 'utf8'), secret)
    assert.equal(readFileSync(githubEnv, 'utf8'), `APPLE_API_KEY=${join(dir, 'pokeguru-apple-notary.p8')}\n`)
    assert.doesNotMatch(result.stdout + result.stderr, /test-password|test-certificate|fixture/)

    const invalid = run({ ...env, APPLE_API_KEY_P8_BASE64: 'not-a-key' })
    assert.notEqual(invalid.status, 0)
    assert.doesNotMatch(invalid.stdout + invalid.stderr, /test-password|test-certificate/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
