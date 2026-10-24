/** Create a project through the visible desktop or compact entry point. */
export async function createProjectFromStart(page, name) {
  // The startup skeleton precedes both entry points. Decide only once welcome is rendered.
  await page.getByRole('region', { name: 'Benvenuto', exact: true }).waitFor()
  const compactStart = page.getByRole('button', { name: 'Inizia un progetto' })
  if (await compactStart.isVisible()) await compactStart.click()
  await page.getByLabel('Nome progetto').fill(name)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
}

export async function openProjectPicker(page) {
  await page.locator('#project-switcher-trigger').click()
  await page.getByRole('dialog', { name: 'Scegli progetto' }).waitFor()
}

export async function startNewProject(page) {
  await openProjectPicker(page)
  await page.getByRole('button', { name: 'Nuovo progetto', exact: true }).click()
}

export async function switchProject(page, name) {
  await openProjectPicker(page)
  await page.getByRole('dialog', { name: 'Scegli progetto' }).getByRole('button', { name }).click()
  await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
}

export async function switchThread(page, name) {
  await page.locator('#thread-switcher-trigger').click()
  await page.getByRole('dialog', { name: 'Scegli thread' }).getByRole('button', { name }).click()
  await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
}

/** Loaded decks expose import on request; empty projects expose it immediately. */
export async function openDeckImport(page) {
  const trigger = page.getByRole('button', { name: 'Importa / sostituisci', exact: true })
  if (await trigger.count()) await trigger.click()
  await page.getByLabel('Testo lista').waitFor()
}
