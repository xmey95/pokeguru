import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const executablePath = process.argv[2] && resolve(process.argv[2])
if (!executablePath || !existsSync(executablePath)) {
  throw new Error('Indicare il percorso del binario nel pacchetto estratto.')
}

const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-package-'))
let application

async function launch(profile) {
  return electron.launch({
    executablePath,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: { ...process.env, POKEGURU_DATA_DIR: profile },
    timeout: 45000
  })
}

try {
  const profile = join(temporary, 'profile')
  application = await launch(profile)
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Pacchetto isolato')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Pacchetto isolato' }).waitFor()
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex MEG 86')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '1 carte' }).waitFor()
  await application.close()
  application = undefined

  application = await launch(profile)
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Pacchetto isolato' }).waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), '1 Mega Absol ex MEG 86')
  await application.close()
  application = undefined
  assert.ok(existsSync(join(profile, 'data', 'pokeguru.sqlite')))

  const legacy = join(temporary, 'legacy')
  mkdirSync(join(legacy, 'data'), { recursive: true })
  const database = new DatabaseSync(join(legacy, 'data', 'pokeguru.sqlite'))
  database.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT')
  database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)')
    .run('old-project', 'Archivio precedente', 'STANDARD', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  database.close()
  application = await launch(legacy)
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Archivio precedente' }).waitFor()
  assert.match(await page.locator('.migration-note').textContent(), /Profilo occidentale assegnato/)
  await application.close()
  application = undefined

  console.log('Pacchetto OK: avvio, salvataggio, riapertura e migrazione I1 con profili isolati.')
} finally {
  if (application) await application.close()
  if (temporary.startsWith(join(tmpdir(), 'pokeguru-package-'))) {
    rmSync(temporary, { recursive: true, force: true })
  }
}
