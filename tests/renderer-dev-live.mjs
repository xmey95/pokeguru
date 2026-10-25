import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import electronViteConfig from '../electron.vite.config.ts'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-dev-renderer-'))
const vite = await createServer({ ...electronViteConfig.renderer,
  root: join(workspace, 'src/renderer'),
  server: { ...electronViteConfig.renderer.server, host: '127.0.0.1', port: 0, strictPort: false } })
let application

try {
  await vite.listen()
  const address = vite.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/`
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile'), ELECTRON_RENDERER_URL: url }, timeout: 30000 })
  const page = await application.firstWindow()
  assert.equal(page.url(), url)
  await page.getByRole('region', { name: 'Benvenuto', exact: true }).waitFor()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  const response = page.waitForResponse((item) => item.url() === url)
  await page.reload()
  const loaded = await response
  assert.match(await loaded.headerValue('content-security-policy'), /script-src 'self'/)
  await page.getByRole('region', { name: 'Benvenuto', exact: true }).waitFor()
  console.log('Renderer dev OK: server Vite reale su loopback, UI e CSP HTTP.')
} finally {
  if (application) await application.close()
  await vite.close()
  if (temporary.startsWith(join(tmpdir(), 'pokeguru-dev-renderer-')))
    rmSync(temporary, { recursive: true, force: true })
}
