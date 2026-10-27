import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const required = [
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_API_KEY_P8_BASE64',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'RUNNER_TEMP',
  'GITHUB_ENV'
]
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  throw new Error(`Credenziali release macOS mancanti: ${missing.join(', ')}`)
}

const encoded = process.env.APPLE_API_KEY_P8_BASE64.replace(/\s+/g, '')
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
  throw new Error('La chiave API Apple non è codificata in base64.')
}
const key = Buffer.from(encoded, 'base64')
const pem = key.toString('utf8').trim()
if (!pem.startsWith('-----BEGIN PRIVATE KEY-----') || !pem.endsWith('-----END PRIVATE KEY-----')) {
  throw new Error('La chiave API Apple non è un file .p8 valido.')
}

const keyPath = join(process.env.RUNNER_TEMP, 'pokeguru-apple-notary.p8')
writeFileSync(keyPath, key, { mode: 0o600 })
appendFileSync(process.env.GITHUB_ENV, `APPLE_API_KEY=${keyPath}\n`)
console.log('Credenziali macOS presenti; chiave notarizzazione preparata.')
