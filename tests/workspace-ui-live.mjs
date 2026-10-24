import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-workspace-ui-'))
const screenshots = join(workspace, 'node_modules')
const deck = readFileSync(join(workspace, 'examples', 'workspace-principale.txt'), 'utf8').trim()
const candidateDeck = readFileSync(join(workspace, 'examples', 'workspace-proposta.txt'), 'utf8').trim()
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

async function checkGeometry(page, width, height, view) {
  await page.setViewportSize({ width, height })
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect()
      return box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width } : null
    }
    return { sidebar: rect('.sidebar'), main: rect('.main-content'), deck: rect('.deck-companion'),
      documentWidth: document.documentElement.scrollWidth }
  })
  assert.ok(boxes.deck && boxes.main && boxes.sidebar)
  assert.ok(boxes.documentWidth <= width + 1, `${view} ${width}: overflow orizzontale`)
  if (width > 1240) {
    assert.equal(boxes.deck.width, 384, `${view} ${width}: larghezza della lista`)
    assert.ok(boxes.main.right <= boxes.deck.left + 1, `${view} ${width}: lista sopra il contenuto`)
    assert.ok(boxes.sidebar.right <= boxes.main.left + 1, `${view} ${width}: barra sopra il contenuto`)
  } else {
    assert.ok(boxes.main.bottom <= boxes.deck.top + 1, `${view} ${width}: dock sopra il contenuto`)
    assert.equal(boxes.deck.bottom, height, `${view} ${width}: dock non ancorato al basso`)
  }
  assert.ok(await page.getByTestId('deck-companion').isVisible())
  if (width === 1440 && view === 'lista') {
    const ratios = await page.evaluate(() => {
      const channels = (color) => color.match(/\d+/g).slice(0, 3).map(Number)
      const luminance = (color) => channels(color).map((value) => {
        const normalized = value / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
      const ratio = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
        return (values[0] + 0.05) / (values[1] + 0.05)
      }
      const active = getComputedStyle(document.querySelector('.workspace-nav button.active'))
      const state = getComputedStyle(document.querySelector('.companion-state'))
      const row = getComputedStyle(document.querySelector('.companion-row'))
      const deckBackground = getComputedStyle(document.querySelector('.deck-companion')).backgroundColor
      return [ratio(active.color, active.backgroundColor), ratio(state.color, state.backgroundColor),
        ratio(row.color, deckBackground)]
    })
    assert.ok(ratios.every((value) => value >= 4.5), `Contrasto insufficiente: ${ratios.join(', ')}`)
  }
  await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0 })
  await page.locator('.companion-list').evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: join(screenshots, `workspace-${view}-${width}.png`) })
}

function seedMatchup() {
  const database = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const project = database.prepare("SELECT id FROM projects WHERE name = 'Mega Absol / Mega Audino'").get()
  assert.ok(project)
  const now = new Date().toISOString()
  const metaId = createHash('sha256').update('pokeguru-workspace-fixture').digest('hex')
  const opponent = { id: '999999', name: 'Gardevoir ex · fixture UI', points: 500, share: 8.2,
    url: 'https://limitlesstcg.com/decks/999999' }
  const snapshot = { id: metaId, fetchedAt: now,
    sourceUrl: 'https://limitlesstcg.com/decks?format=standard&time=1months&region=eu,na,la,oc&show=100',
    period: 'Fixture UI', circuit: 'WESTERN', format: 'STANDARD', decks: [opponent], cached: false }
  const report = { projectId: project.id, metaId, opponentId: opponent.id,
    deckHash: createHash('sha256').update(deck).digest('hex'), generatedAt: now,
    sampleDeckUrl: null, metaSourceUrl: snapshot.sourceUrl, metaPeriod: snapshot.period,
    metaFetchedAt: now, strengths: 'La lista può preparare due attaccanti e tenere un recupero per il turno finale.',
    weaknesses: 'Le prime mani dipendono dalla ricerca di base; una partenza lenta espone il mazzo.',
    ourKeyCards: 'Mega Absol ex, Mega Audino ex, Rare Candy e Night Stretcher.',
    theirKeyCards: 'Gardevoir ex e il motore di evoluzione avversario.',
    strategy: 'Apri cercando Ralts e una carta di ricerca. A metà partita conserva una via di recupero e valuta quando investire Energie su Mega Absol ex. In chiusura usa Boss’s Orders solo quando il bersaglio porta a un premio decisivo.',
    limitations: 'Fixture UI per verificare il layout: questa guida non è stata generata da Codex e non deriva da risultati di partite.' }
  database.prepare('INSERT INTO meta_snapshots (id, fetched_at, payload) VALUES (?, ?, ?)')
    .run(metaId, now, JSON.stringify(snapshot))
  database.prepare('INSERT INTO matchup_reports (project_id, meta_id, opponent_id, deck_hash, generated_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
    .run(project.id, metaId, opponent.id, report.deckHash, now, JSON.stringify(report))
  database.close()
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.setViewportSize({ width: 640, height: 720 })
  await page.getByRole('button', { name: 'Inizia un progetto' }).click()
  assert.ok(await page.locator('.compact-create-panel').isVisible(), 'Il progetto vuoto non apre la creazione a 640 px')
  await page.getByRole('button', { name: 'Chiudi' }).click()
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByLabel('Nome progetto').fill('Mega Absol / Mega Audino')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByTestId('deck-companion').waitFor()
  await checkGeometry(page, 1440, 900, 'empty')
  await checkGeometry(page, 1280, 720, 'empty')
  assert.ok(await page.locator('.project-button').isVisible(), 'Il progetto sparisce a 1280×720')
  await page.getByLabel('Testo lista').fill(deck)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  const scrolls = await page.evaluate(() => {
    const main = document.querySelector('.main-content')
    const list = document.querySelector('.companion-list')
    main.scrollTop = 0
    list.scrollTop = 0
    list.scrollTop = 120
    const afterList = [main.scrollTop, list.scrollTop]
    main.scrollTop = 120
    return { afterList, afterMain: [main.scrollTop, list.scrollTop], listScrollable: list.scrollHeight > list.clientHeight }
  })
  assert.ok(scrolls.listScrollable && scrolls.afterList[0] === 0 && scrolls.afterList[1] > 0)
  assert.ok(scrolls.afterMain[0] > 0 && scrolls.afterMain[1] === scrolls.afterList[1])
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'lista')
    assert.match(await page.getByTestId('deck-companion').textContent(), /Mega Absol ex/)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.workspace-nav').getByRole('button', { name: 'Thread' }).focus()
  await page.keyboard.press('Enter')
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Piano più rapido')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('.manual-candidate > summary').click()
  await page.getByLabel('Lista completa proposta').fill(candidateDeck)
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.thread-candidate.featured > summary').waitFor()
  assert.match(await page.locator('.thread-candidate.featured').textContent(), /Lista principale completa/)
  assert.match(await page.locator('.thread-candidate.featured').textContent(), /Lista proposta completa/)
  const comparisonScrolls = await page.locator('.comparison-list-scroll').evaluateAll((elements) => {
    elements.forEach((element) => { element.scrollTop = 0 })
    elements[0].scrollTop = 100
    return [elements[0].scrollTop, elements[1].scrollTop]
  })
  assert.ok(comparisonScrolls[0] > 0 && comparisonScrolls[1] === 0, 'Liste del confronto non scorrono separatamente')
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'thread')
    assert.match(await page.getByTestId('deck-companion').textContent(), /3\s*Mega Absol ex/)
  }
  await application.close()
  application = undefined

  seedMatchup()
  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.getByLabel('Cerca avversario').fill('Gardevoir ex · fixture UI')
  assert.equal(await page.locator('.meta-deck').count(), 1, 'La ricerca non filtra gli archetipi')
  await page.locator('.meta-deck').filter({ hasText: 'Gardevoir ex · fixture UI' }).click({ timeout: 30000 })
  await page.getByText('Come giocare il matchup').waitFor()
  await page.getByLabel('Cerca avversario').fill('')
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'matchup')
    assert.match(await page.getByTestId('deck-companion').textContent(), /Mega Absol ex/)
    assert.ok(await page.locator('.matchup-fields').isVisible())
    if (width === 1280) {
      const plan = await page.getByText('Come giocare il matchup').boundingBox()
      assert.ok(plan && plan.y < height, 'Il piano Matchup non compare nella prima schermata a 1280×720')
    }
  }
  for (const name of ['Catalogo', 'Eventi', 'Impostazioni AI']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.setViewportSize({ width: 640, height: 580 })
    assert.equal(await page.getByTestId('deck-companion').count(), 0)
    const overflow = await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1)
    assert.equal(overflow, false, `${name}: overflow orizzontale nella vista compatta`)
  }
  console.log('WORKSPACE UI OK: 1440×900, 1280×720, 1241×720, 1240×720, 1024×768, 640×720; Lista, Thread, Matchup; Catalogo, Eventi e Impostazioni AI a 640×580; tastiera, lista persistente e assenza di sovrapposizioni.')
} finally {
  await application?.close()
  rmSync(profile, { recursive: true, force: true })
}
