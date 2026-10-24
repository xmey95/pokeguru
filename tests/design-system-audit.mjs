import assert from 'node:assert/strict'

// Checks rendered text and controls, including content below the fold.
// Disabled controls are excluded from contrast checks; disclosure-hidden content is excluded.
export async function auditDesignSystem(page, label, minimumTexts = 11) {
  const result = await page.evaluate(() => {
    const errors = []
    let texts = 0
    let minimumContrast = Infinity
    const rgb = (value) => (value.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = (color) => color.slice(0, 3).map((n) => {
      const c = n / 255
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4
    }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
    const background = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const c = rgb(getComputedStyle(node).backgroundColor)
        if (c.length === 3 || c[3] === 1) return c
      }
      return [255, 255, 255]
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const element = node.parentElement
      if (!node.textContent.trim() || !element || !element.checkVisibility() ||
        element.closest('script, style, svg, [aria-hidden=true], :disabled, option')) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (!range.getBoundingClientRect().width) continue
      const style = getComputedStyle(element)
      const size = parseFloat(style.fontSize)
      const text = node.textContent.trim().slice(0, 65)
      if (size < 12) errors.push('Small text: ' + size + 'px · ' + text)
      const [a,b] = [luminance(rgb(style.color)), luminance(background(element))].sort((a,b) => b-a)
      const contrast = (a + .05) / (b + .05)
      const limit = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight) >= 700) ? 3 : 4.5
      if (contrast < limit) errors.push('Contrast: ' + contrast.toFixed(2) + ' · ' + text)
      minimumContrast = Math.min(minimumContrast, contrast)
      texts++
    }
    for (const control of document.querySelectorAll('button, summary, input:not([type=file]), select, textarea')) {
      if (!control.checkVisibility() || control.disabled) continue
      const rect = control.getBoundingClientRect()
      if (rect.width < 24 || rect.height < 32) errors.push('Small target: ' + control.outerHTML.slice(0,100))
      if (control.tagName === 'BUTTON' && !(control.getAttribute('aria-label') || control.textContent || control.title).trim())
        errors.push('Unnamed button')
    }
    return { errors: [...new Set(errors)], texts, minimumContrast }
  })
  assert.deepEqual(result.errors, [], label)
  assert.ok(result.texts >= minimumTexts, label + ': empty audit')
  assert.ok(Number.isFinite(result.minimumContrast), label + ': invalid contrast calculation')
  return result
}
