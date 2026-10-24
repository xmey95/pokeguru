/** Create a project through the visible desktop or compact entry point. */
export async function createProjectFromStart(page, name) {
  const compactStart = page.getByRole('button', { name: 'Inizia un progetto' })
  if (await compactStart.isVisible()) await compactStart.click()
  await page.getByLabel('Nome progetto').fill(name)
  await page.getByRole('button', { name: 'Crea progetto' }).click()
}
