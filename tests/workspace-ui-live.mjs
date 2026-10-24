import { auditDesignSystem } from './design-system-audit.mjs'
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
  assert.ok(boxes.main && boxes.sidebar)
  assert.ok(boxes.documentWidth <= width + 1, `${view} ${width}: overflow orizzontale`)
  const hasCompanion = view === 'thread' || view === 'matchup'
  if (!hasCompanion) {
    assert.equal(boxes.deck, null, `${view}: riepilogo lista duplicato`)
    assert.equal(boxes.main.right, width, `${view}: spazio destro non recuperato`)
    assert.equal(boxes.main.bottom, height, `${view}: spazio inferiore non recuperato`)
  } else if (width > 1240) {
    assert.ok(boxes.deck)
    assert.equal(boxes.deck.width, 384, `${view} ${width}: larghezza della lista`)
    assert.ok(boxes.main.right <= boxes.deck.left + 1, `${view} ${width}: lista sopra il contenuto`)
    assert.ok(boxes.sidebar.right <= boxes.main.left + 1, `${view} ${width}: barra sopra il contenuto`)
  } else {
    assert.ok(boxes.main.bottom <= boxes.deck.top + 1, `${view} ${width}: dock sopra il contenuto`)
    assert.equal(boxes.deck.bottom, height, `${view} ${width}: dock non ancorato al basso`)
  }
  if (hasCompanion) assert.ok(await page.getByTestId('deck-companion').isVisible())
  if (width === 1440 && view === 'thread') {
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
  if (hasCompanion) await page.locator('.companion-list').evaluate((element) => { element.scrollTop = 0 })
  await auditDesignSystem(page, 'Design system '+width)
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
  database.prepare('INSERT INTO matchup_discussions (id, project_id, meta_id, opponent_id, deck_hash, parent_id, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
    .run('workspace-fixture-discussion', project.id, metaId, opponent.id, report.deckHash, now)
  database.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('workspace-fixture-first', 'workspace-fixture-discussion', 0, null, now,
      JSON.stringify({ ...report, strategy: 'Piano iniziale della fixture.' }), null)
  database.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('workspace-fixture-latest', 'workspace-fixture-discussion', 1, 'Conservare una carta di ricerca.', now,
      JSON.stringify(report), 'Il piano ora conserva una carta di ricerca.')
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
  await page.getByLabel('Testo lista').waitFor()
  await checkGeometry(page, 1440, 900, 'empty')
  await checkGeometry(page, 1280, 720, 'empty')
  assert.ok(await page.locator('#project-switcher-trigger').isVisible(), 'Il selettore progetto sparisce a 1280×720')
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 580]]) {
    await page.setViewportSize({ width, height })
    await page.locator('#project-switcher-trigger').focus()
    await page.keyboard.press('Enter')
    const picker = page.getByRole('dialog', { name: 'Scegli progetto' })
    await picker.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Cerca progetti')
    const box = await picker.boundingBox()
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'Selettore fuori finestra')
    await auditDesignSystem(page, 'Selettore progetti ' + width)
    await page.screenshot({ path: join(screenshots, `workspace-project-picker-${width}.png`) })
    await page.keyboard.press('Escape')
    assert.equal(await picker.isVisible(), false)
    assert.equal(await page.locator('#project-switcher-trigger').evaluate((el) => el === document.activeElement), true, 'Escape non restituisce il focus al selettore')
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByLabel('Testo lista').fill(deck)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.locator('#deck-group-pokemon').waitFor()
  assert.equal(await page.locator('.detail-headline .status-pill').count(), 0, 'Stato progetto duplicato nella Lista')
  assert.equal(await page.locator('.standard-status').count(), 1)
  await page.locator('.standard-status').getByText('Standard: da verificare', { exact: true }).waitFor()
  assert.equal(await page.locator('.standard-details').getAttribute('open'), null)
  await page.locator('.standard-details > summary').focus()
  await page.keyboard.press('Enter')
  assert.ok(await page.getByRole('heading', { name: 'Copertura e fonti' }).isVisible())
  await page.keyboard.press('Enter')
  assert.match(await page.locator('.deck-composition').innerText(), /Pokémon\s*16\s*Allenatori\s*33\s*Energie\s*11/)
  assert.equal(await page.locator('.deck-card .card-thumbnail img').count(), 0, 'Catalogo vuoto: non inventare immagini')
  await page.locator('.deck-composition').getByRole('link', { name: 'Energie 11' }).click()
  assert.ok((await page.locator('#deck-group-energy').boundingBox()).y < 720, 'Il riepilogo non porta alla sezione Energie')
  await page.locator('.main-content').evaluate((element) => { element.scrollTop = 0 })
  const firstCard = page.locator('.deck-card').first()
  await firstCard.locator('.deck-card-toggle').click()
  assert.match(await page.locator('.deck-list-body > .diagnostics').innerText(), /Catalogo non sincronizzato/)
  assert.doesNotMatch(await firstCard.innerText(), /Stampa da identificare/)
  assert.doesNotMatch(await firstCard.innerText(), /Catalogo locale non sincronizzato\./)
  assert.ok(await firstCard.getByText('Testo di gioco non disponibile nel catalogo locale.').isVisible())
  assert.equal(await firstCard.locator('.deck-import-details').getAttribute('open'), null)
  await firstCard.locator('.deck-import-details > summary').focus()
  await page.keyboard.press('Enter')
  await firstCard.locator('.deck-source-lines summary').first().click()
  assert.match(await firstCard.innerText(), /Rotazione: Catalogo locale non sincronizzato/)
  assert.match(await firstCard.innerText(), /Ammissione: Catalogo locale non sincronizzato/)
  await firstCard.locator('.deck-card-toggle').click()
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'lista')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.workspace-nav').getByRole('button', { name: 'Thread' }).focus()
  assert.equal(await page.locator('.workspace-nav button:focus').evaluate((el) => getComputedStyle(el).outlineWidth), '3px')
  await page.keyboard.press('Enter')
  await page.getByTestId('deck-companion').waitFor()
  await page.getByRole('button', { name: 'Nuovo thread', exact: true }).click()
  await page.getByLabel('Titolo').fill('Piano più rapido')
  await page.getByLabel('Prima osservazione (facoltativa)').fill('Vorrei conservare più risorse per il finale. Osservazione di esempio UI.')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await page.locator('.manual-candidate > summary').click()
  await page.getByLabel('Lista completa proposta').fill(candidateDeck)
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.thread-candidate.featured .candidate-brief').waitFor()
  assert.equal(await page.locator('.candidate-comparison').getAttribute('open'), null)
  assert.equal(await page.locator('.thread-heading').count(), 0, 'Titolo del thread ripetuto')
  assert.ok(await page.locator('.candidate-caution').isVisible(), 'Incertezza nascosta dal confronto chiuso')
  await page.getByLabel('Scrivi nel thread').fill('Bozza conservata durante il confronto')
  await page.locator('.candidate-comparison > summary').focus()
  await page.keyboard.press('Enter')
  assert.ok(await page.locator('.comparison-list-scroll').first().isVisible())
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
  await page.locator('.companion-list').focus()
  await page.keyboard.press('PageDown')
  await page.waitForFunction(() => document.querySelector('.companion-list').scrollTop > 0)
  await page.getByRole('button', { name: 'Vista breve', exact: true }).click()
  assert.match(await page.getByTestId('deck-companion').textContent(), /60.*Pokémon/s)
  await page.getByRole('button', { name: 'Vista completa', exact: true }).click()
  assert.match(await page.locator('.thread-candidate.featured').textContent(), /Lista principale completa/)
  assert.match(await page.locator('.thread-candidate.featured').textContent(), /Lista proposta completa/)
  const reviewLabel = await page.locator('.thread-candidate.featured .thread-review details summary').textContent()
  const reviewCount = Number(/Da verificare \((\d+)\)/.exec(reviewLabel ?? '')?.[1])
  assert.ok(reviewCount > 0 && reviewCount < 10, `Le cause ripetute non sono raggruppate: ${reviewLabel}`)
  const comparisonScrolls = await page.locator('.comparison-list-scroll').evaluateAll((elements) => {
    elements.forEach((element) => { element.scrollTop = 0 })
    elements[0].scrollTop = 100
    return [elements[0].scrollTop, elements[1].scrollTop]
  })
  assert.ok(comparisonScrolls[0] > 0 && comparisonScrolls[1] === 0, 'Liste del confronto non scorrono separatamente')
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'thread')
    assert.match(await page.getByTestId('deck-companion').textContent(), /3\s*Mega Absol ex/)
    if ([1440, 1280, 640].includes(width)) await page.screenshot({ path: join(screenshots, `workspace-comparison-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Chiudi confronto', exact: true }).click()
  assert.equal(await page.locator('.candidate-comparison').getAttribute('open'), null)
  assert.ok(await page.locator('.candidate-comparison > summary').evaluate(el => el === document.activeElement))
  const focusedSummary = await page.locator('.candidate-comparison > summary').boundingBox()
  assert.ok(focusedSummary.y >= 60 && focusedSummary.y + focusedSummary.height <= 500, 'Focus fuori dal contenuto al ritorno dal confronto')
  assert.equal(await page.getByLabel('Scrivi nel thread').inputValue(), 'Bozza conservata durante il confronto')
  await page.keyboard.press('Enter')
  await page.locator('.comparison-list-scroll').first().focus()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.candidate-comparison').getAttribute('open'), null)
  assert.ok(await page.locator('.candidate-comparison > summary').evaluate(el => el === document.activeElement))
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await checkGeometry(page, width, height, 'thread')
    assert.ok(!(await page.locator('.comparison-list-scroll').first().isVisible()), 'Confronto aperto automaticamente')
    if (width >= 1280) {
      const firstMessage = await page.locator('.thread-message').first().boundingBox()
      assert.ok(firstMessage.y + 40 < height, 'La conversazione non compare nella prima schermata desktop')
    }
    await page.locator('.candidate-comparison > summary').focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const main = document.querySelector('.main-content').getBoundingClientRect()
      const content = document.querySelector('.candidate-identities').getBoundingClientRect()
      return content.top >= main.top && content.bottom <= main.bottom
    })
    await page.screenshot({ path: join(screenshots, `workspace-comparison-${width}.png`) })
    await page.keyboard.press('Escape')
  }
  await application.close()
  application = undefined

  seedMatchup()
  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.locator('#matchup-switcher-trigger').click()
  await page.getByLabel('Cerca avversario').fill('Gardevoir ex · fixture UI')
  assert.equal(await page.locator('.matchup-option').count(), 1, 'La ricerca non filtra gli archetipi')
  await page.locator('.matchup-option').filter({ hasText: 'Gardevoir ex · fixture UI' }).click({ timeout: 30000 })
  await page.getByText('Come giocare il matchup').waitFor()
  assert.equal(await page.locator('.discussion-timeline details').count(), 2)
  assert.equal(await page.locator('.discussion-timeline details').last().locator('.discussion-version').count(), 0,
    'La revisione corrente ripete la guida già visibile sopra')
  assert.match(await page.locator('.discussion-timeline details').last().textContent(), /Il piano ora conserva una carta di ricerca/)
  await page.locator('.discussion-timeline details').first().locator('summary').click()
  assert.match(await page.locator('.discussion-timeline details').first().textContent(), /Piano iniziale della fixture/)
  await page.locator('.matchup-ai-details > summary').click()
  await page.locator('.ai-data-preview > summary').click()
  const sharedData = await page.locator('.ai-data-preview').innerText()
  assert.match(sharedData, /Mega Absol ex/)
  assert.match(sharedData, /altri progetti/)
  await page.locator('.matchup-ai-details > summary').click()
  for (const [width, height] of [[1440, 900], [1280, 720], [1241, 720], [1240, 720], [1024, 768], [640, 720]]) {
    await checkGeometry(page, width, height, 'matchup')
    assert.match(await page.getByTestId('deck-companion').textContent(), /Mega Absol ex/)
    assert.ok(await page.locator('.matchup-fields').isVisible())
    if (width === 1280) {
      const plan = await page.getByText('Come giocare il matchup').boundingBox()
      assert.ok(plan && plan.y + 80 < height, 'Il testo del piano Matchup non compare nella prima schermata a 1280×720')
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
  if (process.argv.includes('--keep-profile')) console.log('Profilo di prova con fixture UI: ' + profile)
  else rmSync(profile, { recursive: true, force: true })
}
