import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck } from '../src/shared/deck-import'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { buildDeckCards, matchupDeckContext, snapshotPrint, suggestPrints } from '../src/shared/reconciliation'

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
function databasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-reconcile-'))
  folders.push(folder)
  return join(folder, 'data.sqlite')
}

function printing(id: string, name: string, identityId: string, rarity: string): CatalogPrint {
  const [setId, localId] = id.split('-')
  return {
    id, setId, localId, name, setName: setId === 'sv02' ? 'Paldea Evolved' : 'Paldean Fates',
    category: 'Trainer', rarity, variants: { normal: true, reverse: true }, identityId,
    identityBasis: 'trainer-text', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null
  }
}

const ionoA = printing('sv02-185', 'Iono', 'identity-iono', 'Uncommon')
const ionoB = printing('sv02-254', 'Iono', 'identity-iono', 'Ultra Rare')
const ionoDifferent = printing('sv04.5-080', 'Iono', 'identity-other-effect', 'Uncommon')
const candy = printing('sv04.5-089', 'Rare Candy', 'identity-candy', 'Common')
const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv02', 'sv04.5'], names: ['Iono', 'Rare Candy'] },
  syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
  prints: [ionoA, ionoB, ionoDifferent, candy]
}

describe('Riconciliazione APP-006', () => {
  it('passa al Matchup le regole della stampa e il vero esito Standard', () => {
    const baseline = {
      projectId: 'project', importedAt: '2026-10-23T00:00:00.000Z', rawText: '2 Iono PAL 185',
      source: 'paste' as const, fileName: null, ...parseDeck('2 Iono PAL 185')
    }
    const print: CatalogPrint = { ...ionoA, gameplaySchemaVersion: 1,
      gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
        effect: 'Each player shuffles their hand and draws.', trainerType: 'Supporter',
        weaknesses: [], resistances: [], retreat: null } }
    const context = matchupDeckContext(baseline, { projectId: 'project', importedAt: baseline.importedAt,
      mappings: [], identityTotals: [], resolvedLines: 0, unresolvedLines: 0,
      resolvedCopies: 0, unresolvedCopies: 0 }, { ...catalog, prints: [print],
      rulePackage: { schema: 1, version: '2026-10-24.1', circuit: 'WESTERN', checkedAt: '2026-10-24',
        standardBans: { checkedAt: '2026-10-24', sourceUrl: 'https://www.pokemon.com', cardNames: [] },
        errata: { checkedAt: '2026-10-24', sourceUrl: 'https://play.pokemon.com', lastUpdated: '2024-11-07' },
        rotations: [], setAdmissions: [] } },
    { status: 'checks-passed', legality: 'supported', asOf: '2026-10-24',
      problems: [], toReview: [], passed: ['60 carte'] })
    expect(context).toContain('Each player shuffles their hand and draws.')
    expect(context).toContain('CONTROLLO STANDARD (2026-10-24, pacchetto 2026-10-24.1): supported')
    expect(context).not.toContain('legalità Standard ed errata non sono ancora verificate')
  })

  it('mostra una sola carta di gioco per due rarità e tutte le varianti al clic, senza scelta di stampa', () => {
    const baseline = {
      projectId: 'project', importedAt: '2026-10-23T00:00:00.000Z', rawText: '2 Iono PAL 185\n1 Iono PAL 254',
      source: 'paste' as const, fileName: null, ...parseDeck('2 Iono PAL 185\n1 Iono PAL 254')
    }
    const cards = buildDeckCards(baseline, { ...catalog, prints: [ionoA, ionoB, candy] })
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ name: 'Iono', quantity: 3, status: 'recognized',
      importedPrintIds: ['sv02-185', 'sv02-254'] })
    expect(cards[0].prints.map((print) => print.id)).toEqual(['sv02-185', 'sv02-254'])
    expect(cards[0].lines.map((line) => line.raw)).toEqual(['2 Iono PAL 185', '1 Iono PAL 254'])
  })

  it('non fonde omonimi con effetto differente e lascia ALT ambiguo', () => {
    const baseline = {
      projectId: 'project', importedAt: '2026-10-23T00:00:00.000Z',
      rawText: '2 Iono PAL 185\n1 Iono PAF 080\n1 Iono SWSHALT 12A',
      source: 'paste' as const, fileName: null,
      ...parseDeck('2 Iono PAL 185\n1 Iono PAF 080\n1 Iono SWSHALT 12A')
    }
    const cards = buildDeckCards(baseline, catalog)
    expect(cards).toHaveLength(3)
    expect(cards.map((card) => card.status)).toEqual(['recognized', 'recognized', 'ambiguous'])
    expect(cards.map((card) => card.quantity)).toEqual([2, 1, 1])
    expect(cards[2].candidateIdentities).toHaveLength(2)
  })

  it('mantiene una lista pubblica Limitless senza codice stampa come proposta, non come mapping', () => {
    // Sottoinsieme delle righe pubblicate su play.limitlesstcg.com/tournament/69a8a849f39e6e70969fbeb7/player/juic3b0i/decklist
    const deck = parseDeck("2 Arven\n2 Iono\n2 Boss's Orders\n3 Ultra Ball\n7 Psychic Energy")
    expect(deck.interpretedTotal).toBe(16)
    expect(deck.lines.filter((line) => line.kind === 'card')).toHaveLength(5)
    const iono = suggestPrints(deck.lines[1], catalog)
    expect(iono).toHaveLength(3)
    expect(iono.every((candidate) => candidate.reason === 'same-name')).toBe(true)
    expect(new Set(iono.map((candidate) => candidate.print.identityId)).size).toBe(2)
    expect(suggestPrints(deck.lines[4], catalog)).toEqual([])
  })

  it('suggerisce codice+numero prima del solo nome, senza fondere omonimi o ALT', () => {
    const exact = suggestPrints({ lineNumber: 1, raw: '2 Iono PAL 185', kind: 'card', quantity: 2,
      name: 'Iono', setCode: 'PAL', cardNumber: '185' }, catalog)
    expect(exact.map((item) => item.reason)).toEqual(['same-print', 'same-name', 'same-name'])
    expect(exact[0].print.id).toBe('sv02-185')
    expect(new Set(exact.map((item) => item.print.identityId)).size).toBe(2)
    const alt = suggestPrints({ lineNumber: 2, raw: '1 Iono ALT 12A', kind: 'card', quantity: 1,
      name: 'Iono', setCode: 'ALT', cardNumber: '12A' }, catalog)
    expect(alt.every((item) => item.reason === 'same-name')).toBe(true)
    const conflicting = suggestPrints({ lineNumber: 3, raw: '1 Altro PAL 254', kind: 'card', quantity: 1,
      name: 'Altro', setCode: 'PAL', cardNumber: '254' }, catalog)
    expect(conflicting[0]).toMatchObject({ print: { id: 'sv02-254' }, reason: 'code-conflict' })
    expect(suggestPrints({ lineNumber: 4, raw: '1 Rare Candy PAF 089', kind: 'card', quantity: 1,
      name: 'Rare Candy', setCode: 'PAF', cardNumber: '089' }, catalog)[0])
      .toMatchObject({ print: { id: 'sv04.5-089' }, reason: 'same-print' })
    expect(suggestPrints({ lineNumber: 4, raw: '1 Energia Base', kind: 'card', name: 'Energia Base' }, catalog)).toEqual([])
    expect(suggestPrints({ lineNumber: 5, raw: '1 Carta promo PR-SV 001a', kind: 'card',
      name: 'Carta promo', setCode: 'PR-SV', cardNumber: '001a' }, catalog)).toEqual([])
  })

  it('riconosce i codici occidentali MEG e ASC senza selezionare una rarità', () => {
    const absol: CatalogPrint = { ...ionoA, id: 'me01-086', setId: 'me01', setName: 'Mega Evolution',
      localId: '086', name: 'Mega Absol ex', category: 'Pokemon', identityId: 'absol', identityBasis: 'unverified' }
    const audino: CatalogPrint = { ...ionoA, id: 'me02.5-172', setId: 'me02.5', setName: 'Ascended Heroes',
      localId: '172', name: 'Mega Audino ex', category: 'Pokemon', identityId: 'audino', identityBasis: 'unverified' }
    const cards = buildDeckCards({ projectId: 'project', importedAt: '2026-10-23T00:00:00.000Z',
      source: 'paste', fileName: null, rawText: '2 Mega Absol ex MEG 86\n2 Mega Audino ex ASC 172',
      ...parseDeck('2 Mega Absol ex MEG 86\n2 Mega Audino ex ASC 172') },
    { ...catalog, prints: [absol, audino] })
    expect(cards.map((card) => card.importedPrintIds)).toEqual([['me01-086'], ['me02.5-172']])
  })

  it('salva stampe distinte e aggrega copie per identità senza toccare testo o altri progetti', () => {
    const path = databasePath()
    const store = new ProjectStore(path)
    const first = store.create({ name: 'Primo', format: 'STANDARD' })
    const second = store.create({ name: 'Secondo', format: 'STANDARD' })
    const rawText = '2 Iono PAL 185\n1 Iono PAL 254\n1 Iono ALT 12A\n1 Rare Candy PAF 089\n1 Carta promo PR-SV 001a\n1 Basic Psychic Energy SVE 5'
    const baseline = store.importDeck({ projectId: first.id, rawText, source: 'paste' })
    store.importDeck({ projectId: second.id, rawText, source: 'paste' })
    const initialHash = store.getCurrentDeckHash(first.id)
    const choose = (lineNumber: number, print: CatalogPrint, sourceLanguage: string | null = null) => {
      const rawLine = baseline.lines[lineNumber - 1].raw
      return store.saveLineMapping({ projectId: first.id, importedAt: baseline.importedAt,
        lineNumber, rawLine, printId: print.id, sourceLanguage }, snapshotPrint(print))
    }
    choose(1, ionoA, 'it')
    choose(2, ionoB)
    const state = choose(4, candy)
    expect(store.getCurrentDeckHash(first.id)).not.toBe(initialHash)
    expect(store.getCurrentDeckHash(second.id)).toBe(initialHash)
    expect(state.resolvedCopies).toBe(4)
    expect(state.unresolvedCopies).toBe(3)
    expect(state.identityTotals.find((item) => item.identityId === 'identity-iono'))
      .toMatchObject({ quantity: 3, printIds: ['sv02-185', 'sv02-254'] })
    expect(state.mappings[0]).toMatchObject({ originalName: 'Iono', sourceLanguage: 'it', print: { rarity: 'Uncommon' } })
    const aiContext = matchupDeckContext(baseline, state)
    expect(aiContext).toContain('3 Iono (sv02-185, sv02-254)')
    expect(aiContext).toContain('copie ancora irrisolte')
    expect(aiContext).not.toContain('lingua del testo')
    expect(store.getBaseline(first.id)?.rawText).toBe(rawText)
    expect(store.getReconciliation(second.id).resolvedLines).toBe(0)
    store.close()

    const reopened = new ProjectStore(path)
    expect(reopened.getReconciliation(first.id).mappings.map((mapping) => mapping.print.id))
      .toEqual(['sv02-185', 'sv02-254', 'sv04.5-089'])
    expect(reopened.getReconciliation(second.id).mappings).toEqual([])
    reopened.close()
  })

  it('mantiene le scelte dopo import identico, le azzera dopo testo nuovo e rifiuta righe obsolete', () => {
    const store = new ProjectStore(databasePath())
    const project = store.create({ name: 'Lista', format: 'STANDARD' })
    const first = store.importDeck({ projectId: project.id, rawText: '2 Iono PAL 185', source: 'paste' })
    const initialHash = store.getCurrentDeckHash(project.id)
    const input = { projectId: project.id, importedAt: first.importedAt, lineNumber: 1,
      rawLine: first.lines[0].raw, printId: ionoA.id }
    store.saveLineMapping(input, snapshotPrint(ionoA))
    expect(store.getCurrentDeckHash(project.id)).not.toBe(initialHash)
    const repeated = store.importDeck({ projectId: project.id, rawText: '2 Iono PAL 185', source: 'paste' })
    expect(store.getReconciliation(project.id).resolvedLines).toBe(1)
    expect(store.getReconciliation(project.id).importedAt).toBe(repeated.importedAt)
    store.clearLineMapping({ projectId: project.id, importedAt: repeated.importedAt,
      lineNumber: 1, rawLine: repeated.lines[0].raw })
    expect(store.getReconciliation(project.id).resolvedCopies).toBe(0)
    expect(store.getCurrentDeckHash(project.id)).toBe(initialHash)
    store.saveLineMapping({ ...input, importedAt: repeated.importedAt }, snapshotPrint(ionoA))
    const changed = store.importDeck({ projectId: project.id, rawText: '2 Iono PAL 254', source: 'paste' })
    expect(store.getReconciliation(project.id).mappings).toEqual([])
    expect(() => store.saveLineMapping({ ...input, importedAt: changed.importedAt }, snapshotPrint(ionoA)))
      .toThrow('La lista è cambiata')
    expect(() => store.saveLineMapping({ ...input, importedAt: changed.importedAt,
      rawLine: changed.lines[0].raw, sourceLanguage: 'invalid language' }, snapshotPrint(ionoB)))
      .toThrow('Lingua del testo non valida')
    store.close()
  })
})
