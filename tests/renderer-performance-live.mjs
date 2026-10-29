import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-renderer-perf-'))
const renderer = join(workspace, 'out', 'renderer', 'assets')
const assets = readdirSync(renderer).filter((file) => /\.(js|css)$/.test(file)).map((file) => {
  const bytes = readFileSync(join(renderer, file))
  return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
})
const ordered = (values) => [...values].sort((a, b) => a - b)
const median = (values) => ordered(values)[Math.floor(values.length / 2)]
const startup = []
const pageLoad = []
const navigation = new Map()
let application

try {
  for (let run = 0; run < 5; run++) {
    const started = performance.now()
    application = await electron.launch({ executablePath: require('electron'), args: ['.'],
      cwd: workspace, env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, `profile-${run}`),
        POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })
    const page = await application.firstWindow()
    await page.getByRole('region', { name: 'Benvenuto' }).waitFor()
    startup.push(Math.round(performance.now() - started))
    pageLoad.push(await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0]
      return { domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
        loadEventMs: Math.round(entry.loadEventEnd) }
    }))
    if (run === 0) {
      await createProjectFromStart(page, 'Misura renderer')
      await page.getByRole('heading', { name: 'Misura renderer', exact: true }).waitFor()
      await application.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('matchups:get-meta')
        ipcMain.handle('matchups:get-meta', () => ({ ok: false, error: 'Fixture offline.' }))
      })
      for (let repeat = 0; repeat < 5; repeat++) {
        for (const section of ['Catalogo', 'Lista', 'Strategie', 'Eventi', 'Guide matchup', 'Impostazioni AI']) {
          const elapsed = await page.evaluate(async (name) => {
            const button = [...document.querySelectorAll('.sidebar button')]
              .find((item) => item.textContent?.trim() === name)
            if (!button) throw new Error(`Navigazione ${name} non trovata.`)
            const startedNavigation = performance.now()
            button.click()
            return new Promise((done, reject) => {
              const check = () => {
                const active = [...document.querySelectorAll('.sidebar button.active')]
                  .some((item) => item.textContent?.trim() === name)
                if (active && !document.querySelector('[data-nav-loading="true"]')) {
                  requestAnimationFrame(() => done(Math.round(performance.now() - startedNavigation)))
                } else if (performance.now() - startedNavigation > 5000) reject(new Error(`Navigazione ${name} scaduta.`))
                else requestAnimationFrame(check)
              }
              requestAnimationFrame(check)
            })
          }, section)
          navigation.set(section, [...(navigation.get(section) ?? []), elapsed])
        }
      }
    }
    await application.close()
    application = undefined
  }
  console.log(JSON.stringify({ kind: 'Electron renderer warm-cache process launches and offline UI navigation',
    platform: process.platform, assets, startupMs: { samples: startup, median: median(startup) },
    pageLoad,
    navigationMs: Object.fromEntries([...navigation].map(([section, values]) =>
      [section, { samples: values, median: median(values) }])) }, null, 2))
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-renderer-perf-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(temporary, { recursive: true, force: true })
}
