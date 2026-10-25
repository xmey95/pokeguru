import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { CatalogStore } from '../src/main/catalog'

it('resolves exact printings locally and avoids inventing artwork for ambiguous or uncached cards', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-preview-'))
  const file = join(folder, 'catalog.sqlite')
  const initial = new CatalogStore(file)
  initial.close()
  const db = new DatabaseSync(file)
  try {
    db.prepare(`INSERT INTO catalog_sets
      (id, name, source_total, sample_total, fetched_at, abbreviation) VALUES (?, ?, 1, 1, ?, ?)`)
      .run('me01', 'Mega Evolution', '2026-10-25', 'MEG')
    db.prepare(`INSERT INTO catalog_sets
      (id, name, source_total, sample_total, fetched_at, abbreviation) VALUES (?, ?, 1, 1, ?, ?)`)
      .run('alternate', 'Alternate', '2026-10-25', 'MEG')
    const print = (id: string, name: string, identityId: string, imageBase: string | null,
      thumbnail: string | null) => ({ id, setId: 'me01', setName: 'Mega Evolution',
      localId: id.split('-')[1], name, identityId, imageBase, thumbnail })
    for (const item of [
      print('me01-086', 'Mega Absol ex', 'absol', 'https://assets.tcgdex.net/absol', 'data:image/webp;base64,cached'),
      print('me01-087', 'Iono', 'iono-a', null, null),
      print('me01-088', 'Iono', 'iono-b', 'https://assets.tcgdex.net/iono', null),
      print('me01-089', 'Uncached', 'uncached', 'https://assets.tcgdex.net/uncached', 'pokeguru://cards/me01-089.webp'),
      print('me01-090', 'Remote', 'remote', 'https://assets.tcgdex.net/remote', 'https://assets.tcgdex.net/remote/low.webp')
    ]) db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
      .run(item.id, item.setId, JSON.stringify(item))
    db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
      .run('alternate-086', 'alternate', JSON.stringify({ ...print('alternate-086', 'Different', 'different', null, null),
        setId: 'alternate', setName: 'Alternate' }))
  } finally { db.close() }
  const store = new CatalogStore(file)
  try {
    expect(store.cardPreview({ name: 'Mega Absol ex', setCode: 'me01', cardNumber: '86' })).toMatchObject({
      reason: 'available', printLabel: 'Mega Evolution · 086', sample: false
    })
    expect(store.cardPreview({ name: 'Mega Absol ex', setCode: 'MEG', cardNumber: '86' }).reason)
      .toBe('ambiguous')
    expect(store.cardPreview({ name: 'Mega Absol ex', identityId: 'absol' })).toMatchObject({
      reason: 'available', sample: true
    })
    expect(store.cardPreview({ name: 'Iono' }).reason).toBe('ambiguous')
    expect(store.cardPreview({ name: 'Iono', setCode: 'MEG', cardNumber: '087' }).reason).toBe('source-missing')
    expect(store.cardPreview({ name: 'Uncached', setCode: 'MEG', cardNumber: '089' }).reason).toBe('not-cached')
    expect(store.cardPreview({ name: 'Remote', setCode: 'MEG', cardNumber: '090' })).toMatchObject({
      image: null, reason: 'not-cached'
    })
    expect(store.cardPreview({ name: 'Absent', setCode: 'MEG', cardNumber: '999' }).reason).toBe('not-in-catalog')
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }) }
})
