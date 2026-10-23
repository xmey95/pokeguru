import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CatalogStore } from '../src/main/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import type { CatalogPrint } from '../src/shared/catalog'
import { evaluateWesternRotation } from '../src/shared/standard-rotation'
import { evaluateSetAdmission } from '../src/shared/standard-admission'
import { BUNDLED_WESTERN_RULE_PACKAGE, parseWesternRulePackage } from '../src/shared/western-rule-package'

function futurePackage() {
  const candidate = structuredClone(BUNDLED_WESTERN_RULE_PACKAGE)
  candidate.version = '2026-11-01.1'
  candidate.checkedAt = '2026-11-01'
  candidate.rotations.push({ version: 'play-2026-11-01', effectiveFrom: '2027-01-01',
    effectiveUntil: '2027-12-31', firstAllowedMark: 'I', lastConfirmedMark: 'K',
    sourceUrl: 'https://www.pokemon.com/us/pokemon-news/2026-pokemon-tcg-standard-format-rotation-announcement' })
  candidate.setAdmissions.push({ setId: 'future', legalDate: '2027-01-15', method: 'explicit',
    sourceUrl: 'https://community.pokemon.com/en-us/discussion/22216/pokemon-tcg-product-legality-update' })
  return candidate
}

function deck(rawText: string): DeckBaseline {
  return { projectId: 'p', importedAt: '2026-10-23T00:00:00.000Z', rawText,
    source: 'paste', fileName: null, ...parseDeck(rawText) }
}

function print(): CatalogPrint {
  return { id: 'future-001', setId: 'future', setName: 'Future', localId: '001', name: 'Future Card',
    category: 'Trainer', rarity: 'Common', regulationMark: 'K', isPromo: false, variants: null,
    identityId: 'future-card', identityBasis: 'unverified', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null, sourceUrl: 'https://api.tcgdex.net/v2/en/cards/future-001',
    detailAt: '2027-01-01T00:00:00.000Z', error: null }
}

it('accetta solo intervalli, date e fonti coerenti del circuito occidentale', () => {
  const good = parseWesternRulePackage(futurePackage())
  expect(good.version).toBe('2026-11-01.1')
  const overlapping = futurePackage()
  overlapping.rotations[2].effectiveFrom = '2026-12-31'
  expect(() => parseWesternRulePackage(overlapping)).toThrow(/sovrapposti/)
  const foreignSource = futurePackage()
  foreignSource.rotations[2].sourceUrl = 'https://example.com/rules'
  expect(() => parseWesternRulePackage(foreignSource)).toThrow(/rotazione/)
  const duplicate = futurePackage()
  duplicate.setAdmissions.push({ ...duplicate.setAdmissions[0] })
  expect(() => parseWesternRulePackage(duplicate)).toThrow(/duplicata/)
  const invalidBanSource = futurePackage()
  invalidBanSource.standardBans.sourceUrl = 'https://example.com/banned'
  expect(() => parseWesternRulePackage(invalidBanSource)).toThrow(/carte vietate/)
})

it('usa sempre le regole incluse nella release anche con un pacchetto sperimentale salvato', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-rules-'))
  const path = join(directory, 'pokeguru.sqlite')
  try {
    let store = new CatalogStore(path)
    const before = store.view()
    const candidate = futurePackage()
    store.close()
    const database = new DatabaseSync(path)
    database.prepare('INSERT INTO catalog_rule_package VALUES (1, ?, ?)')
      .run(JSON.stringify(candidate), '2026-11-01T00:00:00.000Z')
    database.close()
    store = new CatalogStore(path)
    const after = store.view()
    expect(before.rulePackage?.version).toBe('2026-10-24.1')
    expect(after.rulePackage?.version).toBe(before.rulePackage?.version)
    const withPrint = { ...after, syncedAt: '2027-01-01T00:00:00.000Z', prints: [print()] }
    const baseline = deck('1 Future Card FUTURE 001')
    expect(evaluateWesternRotation(baseline, withPrint, '2027-01-15').lines[0].status).toBe('indeterminate')
    expect(evaluateSetAdmission(baseline, withPrint, '2027-01-15').lines[0].status).toBe('indeterminate')
    const nextRelease = { ...withPrint, rulePackage: parseWesternRulePackage(candidate) }
    expect(evaluateWesternRotation(baseline, nextRelease, '2027-01-15').lines[0].status).toBe('mark-accepted')
    expect(evaluateSetAdmission(baseline, nextRelease, '2027-01-14').lines[0].status).toBe('waiting')
    expect(evaluateSetAdmission(baseline, nextRelease, '2027-01-15').lines[0].status).toBe('admitted')
    expect(baseline.rawText).toBe('1 Future Card FUTURE 001')
    store.close()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
