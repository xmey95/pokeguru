import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck } from '../src/shared/deck-import'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { matchupDeckContext, snapshotPrint, suggestPrints } from '../src/shared/reconciliation'

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
    expect(suggestPrints({ lineNumber: 4, raw: '1 Energia Base', kind: 'card', name: 'Energia Base' }, catalog)).toEqual([])
    expect(suggestPrints({ lineNumber: 5, raw: '1 Carta promo PR-SV 001a', kind: 'card',
      name: 'Carta promo', setCode: 'PR-SV', cardNumber: '001a' }, catalog)).toEqual([])
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
