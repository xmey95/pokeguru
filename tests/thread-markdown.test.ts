import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThreadMarkdown } from '../src/renderer/src/ThreadMarkdown'
import { safeThreadLink } from '../src/shared/thread-links'

const render = (text: string, cardTargets: ReadonlyMap<string, string> = new Map()) =>
  renderToStaticMarkup(createElement(ThreadMarkdown, { text, cardTargets, onOpenCatalogCard: () => {} }))

describe('Thread Markdown', () => {
  it('renders saved prose with headings, lists, emphasis and code without changing its source', () => {
    const source = '# Piano\n\nPrima **difendi** e poi *attacca*.\n\n- Una carta\n- Due carte\n\n```text\nA < B\n```'
    const html = render(source)
    expect(html).toContain('<h1>Piano</h1>')
    expect(html).toContain('<strong>difendi</strong>')
    expect(html).toContain('<em>attacca</em>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<pre><code')
    expect(html).toContain('A &lt; B')
    expect(source).toContain('**difendi**')
  })

  it('does not execute raw HTML, load images or expose unsafe links', () => {
    const html = render('<script>alert(1)</script>\n\n![image](https://evil.test/pixel)\n\n' +
      '[unsafe](javascript:alert(1)) [local](file:///C:/secret) [safe](https://example.org/x)')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('file:///')
    expect(html).toContain('href="https://example.org/x"')
  })

  it('restricts link targets to absolute HTTPS URLs without credentials or control characters', () => {
    expect(safeThreadLink('https://example.org/path')).toBe('https://example.org/path')
    for (const target of ['http://example.org', '//example.org', '/relative', 'javascript:alert(1)',
      'file:///tmp/a', 'https://user:pass@example.org', 'https://example.org/\npath', 'x'.repeat(2049)]) {
      expect(safeThreadLink(target), target).toBe('')
    }
  })

  it('routes TCGdex card links to the local Catalogo and leaves missing cards unlinked', () => {
    const cardUrl = 'https://api.tcgdex.net/v2/en/cards/sv01-086'
    const source = `[Gardevoir](${cardUrl})`
    const local = render(source, new Map([[cardUrl, 'pokemon:1']]))
    expect(local).toContain('<button type="button"')
    expect(local).toContain('Gardevoir · Catalogo')
    expect(local).not.toContain('href=')
    const missing = render(source)
    expect(missing).toContain('scheda non disponibile nel Catalogo locale')
    expect(missing).not.toContain('href=')
  })
})
