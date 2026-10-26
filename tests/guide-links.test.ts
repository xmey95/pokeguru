import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuideText } from '../src/renderer/src/GuideText'
import { catalogCardTargets, externalGuideTarget, guideSegments, reportGuideReferences, type GuideReference } from '../src/renderer/src/guide-links'
import { guideBlocks, guideListBlocks } from '../src/renderer/src/guide-markdown'
import type { MatchupReport } from '../src/shared/meta-matchups'
import type { CatalogView } from '../src/shared/catalog'

const url = 'https://api.tcgdex.net/v2/en/cards/sv01-086'
const cardTargets = catalogCardTargets({ prints: [{ id: 'sv01-086', sourceUrl: url, identityId: 'pokemon:1' }],
  referencePrints: [] } as unknown as CatalogView)
const reference: GuideReference = { label: 'Gardevoir ex', target: { kind: 'catalog', identityId: 'pokemon:1' } }

describe('guide references', () => {
  it('shows saved prose as list items without changing names, numbers, emphasis or references', () => {
    const items = ['Mr. Mime: prima linea con 2.5 risorse, dato di prova.',
      `**Gardevoir ex**: consulta [la scheda](${url}).`,
      'Fonte https://limitlesstcg.com/decks/list/12345.']
    const source = items.join(' ')
    expect(guideListBlocks(source)).toEqual([{ kind: 'unordered', items }])
    const html = renderToStaticMarkup(createElement(GuideText, { text: source, list: true,
      references: [reference], cardTargets, onOpenCatalogCard: () => undefined }))
    expect(html.match(/<li>/g)).toHaveLength(3)
    expect(html).toContain('Mr. Mime')
    expect(html).toContain('<strong>')
    expect(html.match(/href="#catalog-card-pokemon%3A1"/g)).toHaveLength(2)
    expect(html).toContain('href="https://limitlesstcg.com/decks/list/12345"')
  })
  it('preserves existing lists, connected sentences and headings in list sections', () => {
    const source = '## Risorse\n- Ricerca iniziale. Conserva una carta per dopo.\n- Secondo attaccante.\n\n1. Osserva.\n2. Decidi.'
    expect(guideListBlocks(source)).toEqual(guideBlocks(source))
    expect(guideListBlocks('Non determinabile.')).toEqual([{ kind: 'unordered', items: ['Non determinabile.'] }])
  })
  it('uses existing supported source routes and rejects executable or misleading URLs', () => {
    expect(externalGuideTarget(url)).toBeUndefined()
    expect(externalGuideTarget('https://limitlesstcg.com/decks?format=standard')?.kind).toBe('limitless')
    expect(externalGuideTarget('https://limitlesstcg.com/decks/list/12345')?.kind).toBe('limitless')
    expect(externalGuideTarget('https://limitlesstcg.com/tournaments/582')?.kind).toBe('source')
    expect(externalGuideTarget('https://play.limitlesstcg.com/tournament/0123456789abcdef01234567/player/abc/decklist')?.kind).toBe('source')
    for (const unsafe of ['javascript:alert(1)', 'file:///C:/data', 'http://limitlesstcg.com/decks',
      'https://limitlesstcg.com.evil.test/decks', 'https://user:pass@limitlesstcg.com/decks',
      'https://api.tcgdex.net:444/v2/en/cards/sv01-086', 'https://api.tcgdex.net/v2/en/cards/sv01-086?x=1']) {
      expect(externalGuideTarget(unsafe), unsafe).toBeUndefined()
    }
    expect(catalogCardTargets({ prints: [], referencePrints: [{ id: 'sv01-086', sourceUrl: url,
      identityId: 'archived-only' }] } as unknown as CatalogView).size).toBe(0)
  })
  it('preserves prose and punctuation around named, Markdown and bare references', () => {
    const text = 'Gardevoir ex: [scheda](' + url + ').\nFonte ' + url + '.'
    const segments = guideSegments(text, [reference], cardTargets)
    expect(segments.filter((item) => item.target).map((item) => item.text)).toEqual(['Gardevoir ex', 'scheda', 'Gardevoir ex'])
    expect(segments.map((item) => item.text).join('')).toBe('Gardevoir ex: scheda.\nFonte Gardevoir ex.')
    expect(segments.filter((item) => item.target).every((item) => item.target?.kind === 'catalog')).toBe(true)
    expect(guideSegments(`[scheda](${url})`, [], new Map())[0]).toEqual({ text: `scheda (${url})` })
    const staleReference: GuideReference = { label: 'Gardevoir ex', target: { kind: 'source', url } }
    expect(guideSegments('Gardevoir ex', [staleReference])).toEqual([{ text: 'Gardevoir ex' }])
    expect(guideSegments('Gardevoir ex', [staleReference], cardTargets)[0].target?.kind).toBe('catalog')
    expect(guideSegments('https://limitlesstcg.com/decks?format=standard', [])[0].text).toBe('Meta Limitless')
  })
  it('matches whole names, longest first, with typographic apostrophes', () => {
    const refs = ['Mew', 'Mew ex', "Boss's Orders"].map((label) => ({ ...reference, label }))
    const links = guideSegments('Mew ex, Mewtwo, Mew e Boss’s Orders.', refs).filter((item) => item.target)
    expect(links.map((item) => item.text)).toEqual(['Mew ex', 'Mew', 'Boss’s Orders'])
    expect(guideSegments('Mew VMAX', [refs[0]]).some((item) => item.target)).toBe(false)
  })
  it('does not arbitrarily resolve ambiguous destinations or unknown names', () => {
    expect(guideSegments('Gardevoir ex e Iono', [reference, { ...reference, target: { kind: 'catalog', identityId: 'other' } }])
      .some((item) => item.target)).toBe(false)
    expect(guideSegments('Gardevoir ex', [reference, reference]).filter((item) => item.target)).toHaveLength(1)
  })
  it('links each historical report to its own saved mechanics and event', () => {
    const report = { sampleDeckMechanics: [{ name: 'Gardevoir ex', sourceUrl: url }],
      tournamentEvidence: { events: [{ name: 'Regional di prova', url: 'https://limitlesstcg.com/tournaments/582' }] }
    } as MatchupReport
    expect(reportGuideReferences(report, cardTargets)).toEqual([reference, { label: 'Regional di prova',
      target: { kind: 'source', url: 'https://limitlesstcg.com/tournaments/582' } }])
    expect(reportGuideReferences({} as MatchupReport)).toEqual([])
  })
  it('keeps unsupported links readable and does not execute HTML', () => {
    const html = renderToStaticMarkup(createElement(GuideText, {
      text: '<img src=x onerror=alert(1)> [x](javascript:alert) [web](https://example.org)',
      onOpenCatalogCard: () => undefined
    }))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a ')
    expect(html).toContain('&lt;img')
    expect(html).toContain('web (https://example.org)')
  })
  it('renders a semantic keyboard link to a recognized local card', () => {
    const html = renderToStaticMarkup(createElement(GuideText, { text: 'Gardevoir ex',
      references: [{ label: 'Gardevoir ex', target: { kind: 'catalog', identityId: 'pokemon:1' } }],
      onOpenCatalogCard: () => undefined }))
    expect(html).toContain('href="#catalog-card-pokemon%3A1"')
    expect(html).toContain('Apri Gardevoir ex nel Catalogo')
  })
  it('keeps inline source references routed to the local Catalog', () => {
    const html = renderToStaticMarkup(createElement(GuideText, {
      text: `[Gardevoir ex](${url})`, inline: true, cardTargets, onOpenCatalogCard: () => undefined
    }))
    expect(html).toContain('href="#catalog-card-pokemon%3A1"')
    expect(html).not.toContain('href="' + url + '"')
  })
  it('renders long guide phases, bullets and numbered steps as safe structured content', () => {
    const text = '## Avvio\n- Prepara **Gardevoir ex**.\n- Conserva una ricerca.\n\nSviluppo: controlla i Premi.\n\n1. Verifica la lista.\n2. Pianifica il turno.\n\n<img src=x onerror=alert(1)>'
    expect(guideBlocks(text).map((block) => block.kind)).toEqual(['heading', 'unordered', 'paragraph', 'ordered', 'paragraph'])
    const html = renderToStaticMarkup(createElement(GuideText, { text, references: [reference], cardTargets,
      onOpenCatalogCard: () => undefined }))
    expect(html).toMatch(/<h4>.*Avvio.*<\/h4>/)
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<strong>')
    expect(html).toContain('href="#catalog-card-pokemon%3A1"')
    expect(html).not.toContain('<img')
  })
})
