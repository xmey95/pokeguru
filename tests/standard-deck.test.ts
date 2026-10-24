import { describe, expect, it } from 'vitest'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluateStandardDeck } from '../src/shared/standard-deck'
import type { StandardRuleAudit } from '../src/shared/standard-rule-audit'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../src/shared/western-rule-package'
import { buildDeckCards } from '../src/shared/reconciliation'

function print(id: string, name: string, options: Partial<CatalogPrint> = {}): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category: 'Trainer', rarity: 'Common',
    regulationMark: 'I', variants: null, identityId: id, identityBasis: 'unverified',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null, ...options }
}

const prints = [print('me01-001', 'Base One', { category: 'Pokemon', stage: 'Basic' }),
  ...Array.from({ length: 59 }, (_, index) => print(`me01-${String(index + 2).padStart(3, '0')}`, `Trainer ${index + 1}`)),
  print('me03-200', 'Future Trainer'), print('sv05-154', 'Maximum Belt', { rarity: 'ACE SPEC Rare', regulationMark: 'H' }),
  print('sv05-157', 'Prime Catcher', { rarity: 'ACE SPEC Rare', regulationMark: 'H' }),
  print('sv02-185', 'Iono', { regulationMark: 'G' }),
  print('sv06.5-040', 'Genesect', { category: 'Pokemon', stage: 'Basic', regulationMark: 'H' }),
  print('me02-116', 'Battle Cage'),
  print('30th-001', 'Special Card'),
  print('mep-051', 'Promo Waiting', { isPromo: true, promoStatus: {
    state: 'upcoming', legalDate: '2026-11-01', dateNote: null, checkedAt: '2026-10-23T00:00:00.000Z'
  } })]
const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: [], names: [] }, syncedAt: '2026-10-23T00:00:00.000Z', sets: [], prints }
const raw = ['1 Base One ME01 001', ...Array.from({ length: 59 }, (_, index) =>
  `1 Trainer ${index + 1} ME01 ${String(index + 2).padStart(3, '0')}`)]

function baseline(lines: string[]): DeckBaseline {
  const rawText = lines.join('\n')
  return { projectId: 'p', importedAt: '2026-10-23T00:00:00.000Z', rawText,
    source: 'paste', fileName: null, ...parseDeck(rawText) }
}

describe('Esito Standard aggregato, senza certificazione torneo', () => {
  it('conferma una lista coperta dallo snapshot anche con Energia Base senza marchio', () => {
    const energy = print('sve-005', 'Psychic Energy', { category: 'Energy',
      energyType: 'normal', regulationMark: null })
    const coveredCatalog: CatalogView = { ...catalog,
      scope: { ...catalog.scope, kind: 'standard-marks' }, prints: [...prints, energy],
      rulePackage: BUNDLED_WESTERN_RULE_PACKAGE }
    const deck = baseline([...raw.slice(0, 59), '1 Psychic Energy SVE 005'])
    const result = evaluateStandardDeck(deck, coveredCatalog, '2026-10-24')
    expect(result.status).toBe('checks-passed')
    expect(result.legality).toBe('supported')
    expect(result.passed).toContain('Date di ammissione delle stampe identificate')
    expect(evaluateStandardDeck(deck, coveredCatalog, '2026-10-22').legality).toBe('indeterminate')
    const withBan: CatalogView = { ...coveredCatalog, rulePackage: {
      ...coveredCatalog.rulePackage!, standardBans: { ...coveredCatalog.rulePackage!.standardBans,
        cardNames: ['Trainer 1'] }
    } }
    expect(evaluateStandardDeck(deck, withBan, '2026-10-24').legality).toBe('invalid')
  })

  it('conferma solo promo disponibili nel registro incluso e lascia incerte quelle non elencate', () => {
    const promo = print('mep-051', 'Promo Included', { isPromo: true,
      regulationMark: 'J', promoStatus: { state: 'available', legalDate: null,
        dateNote: null, checkedAt: '2026-10-23T00:00:00.000Z' } })
    const coveredCatalog: CatalogView = { ...catalog,
      scope: { ...catalog.scope, kind: 'standard-marks' },
      rulePackage: BUNDLED_WESTERN_RULE_PACKAGE, prints: [...prints, promo] }
    const deck = baseline([...raw.slice(0, 59), '1 Promo Included MEP 051'])
    expect(evaluateStandardDeck(deck, coveredCatalog, '2026-10-24').legality).toBe('supported')
    const unlisted: CatalogView = { ...coveredCatalog, prints: [...prints, { ...promo,
      promoStatus: { ...promo.promoStatus!, state: 'unlisted' as const } }] }
    expect(evaluateStandardDeck(deck, unlisted, '2026-10-24').legality).toBe('indeterminate')
  })

  it('elenca esattamente i controlli superati e conserva i limiti', () => {
    const result = evaluateStandardDeck(baseline(raw), catalog, '2026-10-24')
    expect(result.status).toBe('checks-passed')
    expect(result.problems).toEqual([])
    expect(result.toReview).toEqual([])
    expect(result.passed).toContain('Date di ammissione delle stampe identificate')
    expect(result.legality).toBe('indeterminate')
  })

  it('non attribuisce a Battle Cage una lacuna della riga Genesect SFA', () => {
    const coveredCatalog: CatalogView = { ...catalog,
      scope: { ...catalog.scope, kind: 'standard-marks' }, rulePackage: BUNDLED_WESTERN_RULE_PACKAGE }
    const deck = baseline([...raw.slice(0, 58), '1 Genesect SFA 40', '1 Battle Cage PFL 116'])
    const staleAudit: StandardRuleAudit = { packageVersion: '2026-10-24.1',
      checkedAt: '2026-10-24T12:00:00.000Z', verifiedAt: null, status: 'unavailable', sources: [] }
    const result = evaluateStandardDeck(deck, coveredCatalog, '2026-10-24', staleAudit)
    expect(result.legality).toBe('supported')
    expect(result.toReview).toEqual([])
  })

  it('copre PRE, Energia {G} e Boss PAL quando una ristampa corrente identica è ammessa', () => {
    const bossIdentity = 'boss-orders-text'
    const oldBoss = print('sv02-265', "Boss's Orders", { regulationMark: 'G',
      identityId: bossIdentity, identityBasis: 'trainer-text' })
    const newBoss = print('me01-114', "Boss's Orders", { identityId: bossIdentity,
      identityBasis: 'trainer-text' })
    const energy = print('mee-001', 'Grass Energy', { category: 'Energy', energyType: 'Normal',
      regulationMark: null })
    const coveredCatalog: CatalogView = { ...catalog,
      scope: { ...catalog.scope, kind: 'standard-marks' }, rulePackage: BUNDLED_WESTERN_RULE_PACKAGE,
      prints: [...prints, newBoss, energy,
        print('sv08.5-102', 'Bug Catching Set', { regulationMark: 'H' }),
        print('sv06-165', 'Unfair Stamp', { regulationMark: 'H', rarity: 'ACE SPEC Rare' })],
      referencePrints: [oldBoss] }
    const deck = baseline([...raw.slice(0, 39), '4 Bug Catching Set PRE 102',
      "2 Boss's Orders PAL 265", '14 Basic {G} Energy MEE 1', '1 Unfair Stamp TWM 165'])
    const result = evaluateStandardDeck(deck, coveredCatalog, '2026-10-24')
    expect(result.problems).toEqual([])
    expect(result.toReview).toEqual([])
    expect(result.legality).toBe('supported')
    expect(buildDeckCards(deck, coveredCatalog).find((card) => card.name === "Boss's Orders")
      ?.importedPrintIds).toEqual(['sv02-265'])
  })

  it('segnala come certi 59 carte, due ACE SPEC e ammissione futura', () => {
    const short = evaluateStandardDeck(baseline(raw.slice(0, 59)), catalog, '2026-10-23')
    expect(short.status).toBe('problem')
    expect(short.problems.some((item) => item.includes('59 copie'))).toBe(true)
    const ace = evaluateStandardDeck(baseline([...raw.slice(0, 58),
      '1 Maximum Belt SV05 154', '1 Prime Catcher SV05 157']), catalog, '2026-10-23')
    expect(ace.status).toBe('problem')
    expect(ace.problems.some((item) => item.includes('2 copie ACE SPEC'))).toBe(true)
    const waitingSet = evaluateStandardDeck(baseline([...raw.slice(0, 59), '1 Future Trainer ME03 200']), catalog, '2026-04-09')
    expect(waitingSet.problems.some((item) => item.includes('2026-04-10'))).toBe(true)
    const waitingPromo = evaluateStandardDeck(baseline([...raw.slice(0, 59), '1 Promo Waiting MEP 051']), catalog, '2026-10-23')
    expect(waitingPromo.problems.some((item) => item.includes('2026-11-01'))).toBe(true)
  })

  it('mantiene da verificare ristampa storica, set speciale, stampa ignota e data fuori regole', () => {
    for (const replacement of ['1 Iono PAL 185', '1 Special Card 30TH 001', '1 Unknown ME01 999']) {
      const result = evaluateStandardDeck(baseline([...raw.slice(0, 59), replacement]), catalog, '2026-10-23')
      expect(result.status).toBe('review')
      expect(result.problems).toEqual([])
      expect(result.toReview.length).toBeGreaterThan(0)
    }
    expect(evaluateStandardDeck(baseline(raw), catalog, '2027-01-01').status).toBe('review')
    expect(evaluateStandardDeck(baseline(raw), null, '2026-10-23').status).toBe('review')
  })

  it('ricalcola l’ammissione quando la data supera il confine', () => {
    const deck = baseline([...raw.slice(0, 59), '1 Future Trainer ME03 200'])
    expect(evaluateStandardDeck(deck, catalog, '2026-04-09').status).toBe('problem')
    expect(evaluateStandardDeck(deck, catalog, '2026-04-10').problems).toEqual([])
    expect(evaluateStandardDeck(deck, catalog, '2026-04-10').toReview.some((item) =>
      item.includes('data storica'))).toBe(true)
    expect(deck.rawText).toContain('Future Trainer')
  })

  it('riporta da verificare una fonte ufficiale cambiata', () => {
    const audit: StandardRuleAudit = { packageVersion: BUNDLED_WESTERN_RULE_PACKAGE.version, checkedAt: '2026-10-23T12:00:00.000Z',
      verifiedAt: null, status: 'changed', sources: [] }
    const result = evaluateStandardDeck(baseline(raw), catalog, '2026-10-23', audit)
    expect(result.status).toBe('review')
    expect(result.toReview[0]).toContain('fonti ufficiali')
  })
})
