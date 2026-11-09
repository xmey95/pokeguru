import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { DatabaseSync, backup } from 'node:sqlite'

export const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const pilotCases = ['toucannon-dragapult', 'toucannon-festival', 'dragapult-hydrapple']
const titles = ['Toucannon–Dragapult', 'Toucannon–Festival', 'Dragapult–Hydrapple']
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const quote = (name) => '"' + name.replaceAll('"', '""') + '"'

/** Read-only sources; a fresh destination for every launch. No generated text,
 * card counts, approvals, job IDs or historical call records are rewritten. */
export async function prepareGuideDemo(parent = join(workspace, '.verify', 'guide-demo')) {
  const profile = join(resolve(parent), 'session-' + randomUUID())
  mkdirSync(join(profile, 'data'), { recursive: true })
  const database = join(profile, 'data', 'pokeguru.sqlite')
  const evidence = [], guides = []
  let destination
  try {
    for (const [index, id] of pilotCases.entries()) {
      const folder = join(workspace, '.verify', 'app217-autonomous-20261031', id)
      const sourcePath = join(folder, 'data.sqlite'), generatedPath = join(folder, 'generated.json')
      const sourceHash = hash(readFileSync(sourcePath)), reportBytes = readFileSync(generatedPath)
      const report = JSON.parse(reportBytes), outcome = JSON.parse(readFileSync(join(folder, 'outcome.json'), 'utf8'))
      assert.equal(outcome.passed, true, 'Only the validated historical pilot can be shown')
      assert.equal(report.guide.review.verdict, 'pass')
      const source = new DatabaseSync(sourcePath, { readOnly: true })
      try {
        const stored = source.prepare('SELECT payload FROM matchup_reports WHERE project_id = ? AND opponent_id = ?')
          .get(report.projectId, report.opponentId)
        assert.deepEqual(JSON.parse(stored.payload), report, 'Original report must match the stored report')
        if (!destination) {
          await backup(source, database)
          destination = new DatabaseSync(database)
        } else {
          // Merge original rows, never a hand-edited reconstruction. Duplicate
          // content-addressed rows must be byte-identical. Only the local
          // activity autoincrement key is newly assigned; job linkage is intact.
          destination.exec('PRAGMA foreign_keys=OFF; BEGIN')
          try {
            for (const { name } of source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
              const columns = source.prepare(`PRAGMA table_info(${quote(name)})`).all()
                .map((c) => c.name).filter((c) => !(name === 'ai_job_activity' && c === 'id'))
              const keys = source.prepare(`PRAGMA table_info(${quote(name)})`).all().filter((c) => c.pk).map((c) => c.name)
              const insert = destination.prepare(`INSERT OR IGNORE INTO ${quote(name)} (${columns.map(quote)}) VALUES (${columns.map(() => '?')})`)
              for (const row of source.prepare(`SELECT * FROM ${quote(name)}`).all()) {
                const result = insert.run(...columns.map((c) => row[c]))
                if (!result.changes) {
                  assert.ok(keys.length, 'Cannot compare a conflicting unkeyed row')
                  const existing = destination.prepare(`SELECT * FROM ${quote(name)} WHERE ${keys.map((k) => quote(k) + ' IS ?').join(' AND ')}`).get(...keys.map((k) => row[k]))
                  assert.deepEqual(existing, row, `Conflicting historical row in ${name}`)
                }
              }
            }
            assert.deepEqual(destination.prepare('PRAGMA foreign_key_check').all(), [])
            destination.exec('COMMIT; PRAGMA foreign_keys=ON')
          } catch (error) { destination.exec('ROLLBACK'); throw error }
        }
      } finally { source.close() }
      assert.equal(hash(readFileSync(sourcePath)), sourceHash, 'Source database changed')
      guides.push({ projectId: report.projectId, opponentId: report.opponentId, metaId: report.metaId,
        title: titles[index], promptVersion: report.guide.basis.promptVersion, generatedAt: report.generatedAt })
      evidence.push({ id, sourcePath, sourceHash, reportHash: hash(reportBytes), guideHash: hash(JSON.stringify(report.guide)) })
    }
    assert.equal(destination.prepare('SELECT count(*) n FROM projects').get().n, 3)
    assert.equal(destination.prepare('SELECT count(*) n FROM matchup_reports').get().n, 3)
    assert.equal(destination.prepare('PRAGMA quick_check').get().quick_check, 'ok')
  } finally { destination?.close() }
  const manifest = { formatVersion: 1, mode: 'pilot-readonly', guides }
  writeFileSync(join(profile, 'demo-profile.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(join(profile, 'provenance.json'), JSON.stringify({ task: 'APP-258', realCalls: 0, evidence }, null, 2))
  return { profile, manifest, evidence }
}

export function demoEnvironment(profile) {
  const env = { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_DEMO: '1', POKEGURU_AUTO_SYNC: '0' }
  delete env.ELECTRON_RENDERER_URL
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

export function demoElectronExecutable() {
  const executable = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin'
    ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  const candidates = [process.env.POKEGURU_TEST_ELECTRON, join(workspace, 'node_modules', 'electron', 'dist', executable),
    join(workspace, '.verify', 'node_modules', 'electron', 'dist', executable)]
  const found = candidates.find((path) => path && existsSync(path))
  assert.ok(found, 'Runtime Electron locale assente. La demo non scarica dipendenze automaticamente.')
  return found
}

async function main() {
  assert.ok(existsSync(join(workspace, 'out', 'main', 'index.js')), 'Compila prima l’app con npm run build.')
  const { profile } = await prepareGuideDemo()
  console.log(`Demo offline del pilota. Profilo separato: ${profile}`)
  // This child is the interactive app; only its launcher console is hidden.
  const child = spawn(demoElectronExecutable(), ['.'], { cwd: workspace, env: demoEnvironment(profile), stdio: 'inherit', windowsHide: false })
  child.on('spawn', () => writeFileSync(join(workspace, '.verify', 'guide-demo', 'latest-session.json'),
    JSON.stringify({ profile, pid: child.pid, startedAt: new Date().toISOString(), mode: 'pilot-readonly', realCalls: 0 }, null, 2)))
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
