import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const platforms = ['linux', 'windows']

function expectedName(platform, version) {
  if (platform === 'linux') return `Pokeguru-${version}-linux-x86_64.AppImage`
  if (platform === 'windows') return `Pokeguru-${version}-windows-x64-setup.exe`
  throw new Error(`Piattaforma non supportata: ${platform}`)
}

async function digest(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

function validSource(sourceSha, runId) {
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw new Error('Commit SHA non valido.')
  if (!/^[1-9]\d*$/.test(runId)) throw new Error('ID esecuzione non valido.')
}

export async function createManifest(directory, platform, version, sourceSha, runId) {
  validSource(sourceSha, runId)
  const artifact = expectedName(platform, version)
  const file = join(directory, artifact)
  if (!statSync(file).isFile()) throw new Error(`Pacchetto non trovato: ${artifact}`)
  const manifest = { schemaVersion: 1, platform, artifact, version, sourceSha,
    workflowRunId: runId, bytes: statSync(file).size, sha256: await digest(file) }
  writeFileSync(join(directory, `provenance-${platform}.json`), `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' })
  return manifest
}

export async function verifyAll(directory, version, sourceSha, runId) {
  validSource(sourceSha, runId)
  const expected = new Set(platforms.flatMap((platform) => [expectedName(platform, version),
    `provenance-${platform}.json`]))
  const actual = readdirSync(directory, { withFileTypes: true })
  if (actual.length !== expected.size || actual.some((entry) =>
    !entry.isFile() || !expected.has(entry.name)))
    throw new Error('I file di release non corrispondono ai due pacchetti e ai manifest attesi.')
  const manifests = []
  for (const platform of platforms) {
    const manifest = JSON.parse(readFileSync(join(directory, `provenance-${platform}.json`), 'utf8'))
    const artifact = expectedName(platform, version)
    const file = join(directory, artifact)
    if (manifest.schemaVersion !== 1 || manifest.platform !== platform ||
      manifest.artifact !== artifact || manifest.version !== version ||
      manifest.sourceSha !== sourceSha || manifest.workflowRunId !== runId ||
      manifest.bytes !== statSync(file).size || manifest.sha256 !== await digest(file))
      throw new Error(`Provenienza del pacchetto ${platform} non verificata.`)
    manifests.push(manifest)
  }
  return manifests
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, platform] = process.argv.slice(2)
  const directory = resolve('release')
  const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version
  const sourceSha = process.env.GITHUB_SHA ?? ''
  const runId = process.env.GITHUB_RUN_ID ?? ''
  try {
    if (command === 'create') {
      const manifest = await createManifest(directory, platform, version, sourceSha, runId)
      console.log(`${manifest.artifact}: sha256 ${manifest.sha256}`)
    } else if (command === 'verify-all') {
      for (const manifest of await verifyAll(directory, version, sourceSha, runId))
        console.log(`${basename(manifest.artifact)}: sha256 ${manifest.sha256}`)
    } else throw new Error('Uso: create <linux|windows> oppure verify-all')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
