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
  // Creation can finish after the click returns. Do not select the previous
  // project's import trigger while the new empty project is still being saved.
  await page.locator('.compact-create-panel, .create-form').waitFor({ state: 'hidden' })
  await page.locator('#main-content[data-nav-loading="false"]').waitFor()
  const trigger = page.getByRole('button', { name: 'Importa / sostituisci', exact: true })
  if (await trigger.count()) await trigger.click()
  await page.getByLabel('Testo lista').waitFor()
}

/** Seed a candidate through the legacy store API for UI regressions; the Thread has no manual entry. */
export async function seedStoredCandidate(page, rawText, note = '', threadTitle = null) {
  await page.evaluate(async ({ rawText, note, threadTitle }) => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const projectId = projects.value[0].id
    const threads = await window.projectsApi.listDeckThreadSummaries(projectId)
    if (!threads.ok) throw new Error(threads.error)
    const thread = threadTitle ? threads.value.find((item) => item.title === threadTitle) : threads.value[0]
    if (!thread) throw new Error(`Thread fixture non trovato: ${threadTitle ?? 'ultimo'}`)
    const result = await window.projectsApi.saveDeckCandidate({ projectId, threadId: thread.id, rawText, note })
    if (!result.ok) throw new Error(result.error)
  }, { rawText, note, threadTitle })
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.thread-candidate.featured').waitFor()
}
