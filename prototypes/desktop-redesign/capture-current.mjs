import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

const root = resolve(import.meta.dirname, '../..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-design-inspection-'))
const app = await electron.launch({ executablePath: join(root, 'release/win-unpacked/Pokeguru.exe'), args: [], cwd: root,
  env: { ...process.env, POKEGURU_DATA_DIR: profile } })

try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByLabel('Nome progetto').fill('Mega Absol / Mega Audino')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByLabel('Testo lista').fill('2 Mega Absol ex MEG 086\n2 Mega Audino ex ASC 172\n4 Rare Candy MEG 125\n4 Boss’s Orders MEG 114\n48 Psychic Energy SVE 005\nTotal Cards: 60')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(root, 'prototypes/desktop-redesign/current-list.png') })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Variante più rapida')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.getByLabel('Lista completa proposta').fill('3 Mega Absol ex MEG 086\n2 Mega Audino ex ASC 172\n4 Rare Candy MEG 125\n3 Boss’s Orders MEG 114\n48 Psychic Energy SVE 005\nTotal Cards: 60')
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(root, 'prototypes/desktop-redesign/current-thread.png') })
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.screenshot({ path: join(root, 'prototypes/desktop-redesign/current-matchup.png') })
} finally {
  await app.close()
  if (realpathSync(dirname(profile)) !== realpathSync(tmpdir()) ||
    !basename(profile).startsWith('pokeguru-design-inspection-')) throw new Error('Profilo temporaneo inatteso.')
  rmSync(profile, { recursive: true, force: true })
}
