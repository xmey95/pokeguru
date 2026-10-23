import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluateConstraints, type DeckConstraint } from '../src/shared/constraints'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
function path(): string {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-constraints-'))
  folders.push(folder)
  return join(folder, 'data.sqlite')
}

function print(id: string, name: string, identityId: string): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, setName: setId === 'sv02' ? 'Paldea Evolved' : 'Paldean Fates',
    localId, name, category: 'Trainer', rarity: 'Uncommon', variants: null,
    identityId, identityBasis: 'trainer-text', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}
const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv02', 'sv04.5'], names: ['Iono', 'Rare Candy'] },
  syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
  prints: [print('sv02-185', 'Iono', 'iono'), print('sv02-254', 'Iono', 'iono'),
    print('sv04.5-080', 'Iono', 'different-effect'), print('sv04.5-089', 'Rare Candy', 'candy')]
}
function baseline(rawText: string): DeckBaseline {
  return { projectId: 'p', rawText, importedAt: '2026-10-23T00:00:00.000Z',
    source: 'paste', fileName: null, ...parseDeck(rawText) }
}
function constraint(id: string, identityId: string, kind: DeckConstraint['kind'], quantity: number,
  printId: string | null = null): DeckConstraint {
  return { id, projectId: 'p', identityId, identityName: identityId === 'candy' ? 'Rare Candy' : 'Iono',
    printId, kind, quantity, createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z' }
}

describe('Vincoli APP-007', () => {
  it('conta le ristampe per identità e le stampe solo quando sono presenti nel testo', () => {
    const list = baseline('2 Iono PAL 185\n1 Iono PAL 254\n1 Rare Candy PAF 089')
    const rules = [
      constraint('min', 'iono', 'minimum', 3),
      constraint('exact', 'iono', 'exact', 3),
      constraint('print', 'iono', 'exact', 2, 'sv02-185')
    ]
    const result = evaluateConstraints(rules, list, catalog)
    expect(result.results.map((item) => item.status)).toEqual(['met', 'met', 'met'])
    expect(result.results[2]).toMatchObject({ certainCopies: 2, possibleCopies: 2 })
    expect(evaluateConstraints([constraint('wrong', 'iono', 'minimum', 3, 'sv02-185')], list, catalog)
      .results[0].status).toBe('unmet')
    const candidate = baseline('1 Iono PAL 185\n1 Rare Candy PAF 089')
    expect(evaluateConstraints(rules, candidate, catalog).results[0].status).toBe('unmet')
    expect(result.legality).toBe('indeterminate')
  })

  it('segnala stampa e identità incerte senza sceglierle automaticamente', () => {
    const list = baseline('2 Iono PAL 185\n1 Iono\n1 Iono SWSHALT 12A')
    const result = evaluateConstraints([
      constraint('exact-print', 'iono', 'exact', 2, 'sv02-185'),
      constraint('min-identity', 'iono', 'minimum', 4)
    ], list, catalog)
    expect(result.results.map((item) => item.status)).toEqual(['indeterminate', 'indeterminate'])
    expect(result.results[0]).toMatchObject({ certainCopies: 2, possibleCopies: 4 })
    expect(result.results[1]).toMatchObject({ certainCopies: 2, possibleCopies: 4 })
    const incomplete = evaluateConstraints([constraint('need-three', 'iono', 'minimum', 3)],
      baseline('2 Iono PAL 185\nIono extra'), catalog)
    expect(incomplete.results[0].status).toBe('indeterminate')
  })

  it('rileva minimi ed esatti incompatibili e il superamento di 60 carte', () => {
    const rules = [constraint('min', 'iono', 'minimum', 4), constraint('exact', 'iono', 'exact', 2),
      constraint('print', 'iono', 'minimum', 3, 'sv02-185')]
    const result = evaluateConstraints(rules, baseline('2 Iono PAL 185'), catalog)
    expect(result.conflicts).toHaveLength(2)
    expect(result.results.every((item) => item.status === 'conflict')).toBe(true)
    const over = evaluateConstraints([
      constraint('a', 'iono', 'minimum', 40), constraint('b', 'candy', 'minimum', 21)
    ], baseline('1 Iono PAL 185'), catalog)
    expect(over.conflicts).toContain('I minimi richiedono 61 carte: un mazzo contiene 60 carte.')
  })

  it('persiste vincoli per progetto, consente modifica e impedisce accesso incrociato', () => {
    const file = path()
    const store = new ProjectStore(file)
    const first = store.create({ name: 'Primo', format: 'STANDARD' })
    const second = store.create({ name: 'Secondo', format: 'STANDARD' })
    const saved = store.saveConstraint({ projectId: first.id, identityId: 'iono',
      kind: 'minimum', quantity: 2 }, 'Iono')
    expect(store.listConstraints(first.id)).toHaveLength(1)
    expect(store.listConstraints(second.id)).toEqual([])
    expect(() => store.saveConstraint({ projectId: second.id, id: saved.id, identityId: 'iono',
      kind: 'exact', quantity: 3 }, 'Iono')).toThrow('Vincolo non trovato')
    expect(() => store.deleteConstraint({ projectId: second.id, id: saved.id })).toThrow('Vincolo non trovato')
    const changed = store.saveConstraint({ projectId: first.id, id: saved.id, identityId: 'iono',
      kind: 'exact', quantity: 3 }, 'Iono')
    expect(changed).toMatchObject({ id: saved.id, kind: 'exact', quantity: 3 })
    store.importDeck({ projectId: first.id, rawText: '3 Iono PAL 185', source: 'paste' })
    expect(store.listConstraints(first.id)).toHaveLength(1)
    expect(() => store.saveConstraint({ projectId: first.id, identityId: 'iono',
      kind: 'exact', quantity: 61 }, 'Iono')).toThrow('Vincolo non valido')
    store.close()
    const reopened = new ProjectStore(file)
    expect(reopened.listConstraints(first.id)).toMatchObject([{ id: saved.id, quantity: 3 }])
    expect(reopened.listConstraints(second.id)).toEqual([])
    expect(reopened.deleteConstraint({ projectId: first.id, id: saved.id })).toEqual([])
    reopened.close()
  })
})
