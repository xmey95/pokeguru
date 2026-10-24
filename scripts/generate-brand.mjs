import { _electron as electron } from 'playwright-core'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'

// Chromium rasterizes the one SVG master. No remote fonts, image service or extra dependencies.
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-brand-'))
const entry = join(temporary, 'render.cjs')
writeFileSync(entry, `const {app,BrowserWindow}=require('electron');
app.setPath('userData', ${JSON.stringify(join(temporary, 'profile'))});
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true}});
await w.loadURL('data:text/html,<html><body></body></html>');});`)
const svg = readFileSync(join(root, 'resources/brand/pokeguru.svg'), 'utf8')
let application
const save = (file, data) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), data) }
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024]
function ico(frames) {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ size, png }, i) => {
    const at = 6 + i * 16
    header[at] = size === 256 ? 0 : size; header[at + 1] = header[at]
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(png.length, at + 8); header.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...frames.map(frame => frame.png)])
}
try {
  application = await electron.launch({ executablePath: require('electron'), args: [entry], cwd: root })
  const page = await application.firstWindow()
  const encoded = await page.evaluate(async ({ svg, sizes }) => {
    const source = new Image()
    source.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await source.decode()
    return sizes.map(size => {
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
      canvas.getContext('2d').drawImage(source, 0, 0, size, size)
      return { size, png: canvas.toDataURL('image/png').split(',')[1] }
    })
  }, { svg, sizes })
  const frames = encoded.map(frame => ({ size: frame.size, png: Buffer.from(frame.png, 'base64') }))
  for (const frame of frames) save(`build/icons/${frame.size}x${frame.size}.png`, frame.png)
  save('build/icon.ico', ico(frames.filter(frame => frame.size <= 256)))
  save('resources/icon.png', frames.find(frame => frame.size === 256).png)
  save('src/renderer/public/favicon.svg', svg)
  save('src/renderer/public/favicon.ico', ico(frames.filter(frame => [16, 32, 48].includes(frame.size))))
  save('src/renderer/public/favicon-32.png', frames.find(frame => frame.size === 32).png)
  console.log('Brand assets generated: SVG, 11 PNG sizes, Windows ICO and favicon.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-brand-')) throw Error('Unexpected temporary folder')
  rmSync(temporary, { recursive: true, force: true })
}
