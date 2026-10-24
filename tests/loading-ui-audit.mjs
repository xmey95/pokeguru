import assert from 'node:assert/strict'
import { join } from 'node:path'
import { auditDesignSystem } from './design-system-audit.mjs'

export async function auditLoading(page, workspace, name, selector = '.activity-status') {
  const activity = page.locator(selector).first()
  await activity.waitFor()
  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await activity.scrollIntoViewIfNeeded()
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.main-content'), deck = document.querySelector('.deck-companion')
      const a = main.getBoundingClientRect(), b = deck?.getBoundingClientRect()
      return { overflow: main.scrollWidth > main.clientWidth + 1,
        overlap: b ? a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top : false }
    })
    assert.deepEqual(layout, { overflow: false, overlap: false }, name + ' ' + width)
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, name + ' ' + width, selector === '.loading-skeleton' ? 3 : 11)).minimumContrast)
    await page.screenshot({ path: join(workspace, 'node_modules', `loading-${name}-${width}.png`) })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.ok(await page.locator('.loading-spinner').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none')))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 720 })
  console.log(`LOADING ${name}: 1440/1280/640, motion reduced, contrast ${minimumContrast.toFixed(2)}`)
}
