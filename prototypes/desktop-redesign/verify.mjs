import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(import.meta.dirname, '../..')
const shots = join(root, '.verify/desktop-prototype')
const prototypeUrl = pathToFileURL(join(import.meta.dirname, 'index.html')).href
await mkdir(shots, { recursive: true })
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}
for (const [name, foreground, background] of [
  ['testo principale', '#173537', '#edf1ed'], ['navigazione', '#d0ded7', '#142f34'],
  ['azione primaria', '#ffffff', '#106d65'], ['avviso', '#84550d', '#fff0d3'],
  ['righe lista', '#274542', '#f8faf6'], ['metadati lista', '#587267', '#f8faf6']
]) assert(contrast(foreground, background) >= 4.5, `Contrasto insufficiente: ${name}`)
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
})

try {
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(prototypeUrl, { waitUntil: 'load' })
    assert.equal(await page.title(), 'Pokéguru — prototipo desktop')
    await page.screenshot({ path: join(shots, `lista-${width}x${height}.png`) })
    await page.getByRole('button', { name: 'Thread', exact: true }).first().click()
    await page.screenshot({ path: join(shots, `thread-${width}x${height}.png`) })
    assert(await page.getByRole('heading', { name: 'Lista principale' }).isVisible())
    assert(await page.getByText('Lista proposta completa').isVisible())
    const main = await page.locator('#main').boundingBox()
    const companion = await page.locator('.deck-companion').boundingBox()
    assert(main.x + main.width <= companion.x, `Sovrapposizione Thread ${width}`)
    assert(main.width >= 500, `Area lavoro troppo stretta ${width}`)
    const independentScroll = await page.evaluate(() => {
      const content = document.querySelector('#main')
      const deckList = document.querySelector('#companion-list')
      content.scrollTop = 150
      deckList.scrollTop = 190
      return [content.scrollTop, deckList.scrollTop]
    })
    assert(independentScroll[0] > 0 && independentScroll[1] > 0, `Scorrimento indipendente ${width}`)
    await page.getByRole('button', { name: 'Matchup', exact: true }).first().click()
    await page.screenshot({ path: join(shots, `matchup-${width}x${height}.png`) })
    assert(await page.getByRole('heading', { name: 'Lista principale' }).isVisible())
    assert(await page.getByText('Gioca per conquistare il tempo, poi chiudi con Absol.').isVisible())
    const matchup = await page.locator('#main').boundingBox()
    const deck = await page.locator('.deck-companion').boundingBox()
    assert(matchup.x + matchup.width <= deck.x, `Sovrapposizione Matchup ${width}`)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    assert.equal(bodyWidth, width, `Scroll orizzontale ${width}`)
    await page.locator('.resize-handle').focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.locator('.resize-handle').getAttribute('aria-valuenow'), '360')
    await page.getByRole('button', { name: 'Compatta' }).click()
    assert(await page.getByText('Carte chiave sempre visibili').isVisible())
    assert(await page.locator('.deck-companion').getByText('Mega Absol ex').isVisible())
    assert(await page.locator('.deck-companion').getByText('60').first().isVisible())
    assert.deepEqual(errors, [], `Errori JS ${width}`)
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(prototypeUrl, { waitUntil: 'load' })
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Vai al contenuto')
  await page.getByRole('button', { name: 'Thread', exact: true }).first().focus()
  await page.keyboard.press('Enter')
  assert(await page.getByText('Che cosa cambia davvero').isVisible())
  await page.getByRole('button', { name: 'Simula base superata' }).click()
  assert(await page.getByText('La base v4 del thread è superata.').isVisible())
  assert(await page.getByRole('button', { name: 'Adotta l’intera lista proposta' }).isDisabled())
  await page.getByRole('button', { name: 'Ripristina base corrente' }).click()
  await page.getByRole('button', { name: 'Adotta l’intera lista proposta' }).click()
  assert(await page.getByRole('dialog').getByText('Adottare l’intera lista proposta?').isVisible())
  await page.getByRole('button', { name: 'Annulla' }).click()
  assert(await page.locator('.deck-companion').getByText('Versione principale v4').isVisible())
  await page.getByRole('button', { name: 'Adotta l’intera lista proposta' }).click()
  await page.getByRole('button', { name: 'Confermo: adotta tutte le 60 carte' }).click()
  assert(await page.locator('.deck-companion').getByText('Versione principale v5').isVisible())
  await page.getByRole('button', { name: 'Matchup', exact: true }).first().click()
  await page.getByRole('textbox', { name: 'Rivedi questa guida con una tua osservazione' }).fill('Conservo Boss’s Orders per il finale.')
  await page.getByRole('button', { name: 'Rivedi piano' }).click()
  assert(await page.getByText('Revisione 3 aggiunta nel prototipo').isVisible())
  await page.getByRole('button', { name: /Charizard ex/ }).click()
  assert(await page.getByText('Serve una nuova analisi').isVisible())
  await page.locator('#scenario').selectOption('empty')
  assert(await page.getByRole('heading', { name: 'Comincia dalla tua lista' }).isVisible())
  assert(await page.locator('.deck-companion').getByText('0').first().isVisible())
  await page.close()
  console.log('Prototipo verificato: 1440×900, 1280×720, lista persistente, navigazione da tastiera, stati essenziali.')
} finally { await browser.close() }
