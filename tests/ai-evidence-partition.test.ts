import { expect, it } from 'vitest'
import { evidenceBatches, partitionEvidenceRecord } from '../src/main/ai-evidence-partition'

it('preserves all fields, escape characters and Unicode through repeated smaller partitions', () => {
  const record = { key: 'original', sourceIds: ['card:original'], data: {
    name: 'Pokémon 🪄', text: '中文 🐉 "\\\n\t'.repeat(15_000), lastField: { count: 17, unknown: null }
  } }
  const parts = [...partitionEvidenceRecord(record, 60_000)].flatMap((part) => [...partitionEvidenceRecord(part, 4096)])
  expect(parts.length).toBeGreaterThan(50)
  let offset = 0
  const strings = parts.map((part) => {
    const fragment = part.data as { start: number; end: number; total: number; text: string; recordKey: string }
    expect(Buffer.byteLength(JSON.stringify(part))).toBeLessThanOrEqual(4096)
    expect(part.sourceIds).toEqual(record.sourceIds)
    expect(fragment.recordKey).toBe('original')
    expect(fragment.start).toBe(offset)
    expect(Buffer.from(fragment.text, 'utf8').toString('utf8')).toBe(fragment.text)
    offset = fragment.end
    return fragment.text
  })
  expect(JSON.parse(strings.join(''))).toEqual(record.data)
  expect(offset).toBe(JSON.stringify(record.data).length)
  expect(new Set(parts.map((part) => part.key)).size).toBe(parts.length)
})

it('bounds the entire batch including separators while keeping small records exact', () => {
  const records = Array.from({ length: 110 }, (_, i) => ({ key: String(i), sourceIds: [], data: { i, text: 'a'.repeat(200) } }))
  const batches = [...evidenceBatches(records, 4096)]
  expect(batches.length).toBeGreaterThan(1)
  for (const batch of batches) expect(Buffer.byteLength(JSON.stringify(batch))).toBeLessThanOrEqual(4096)
  expect(batches.flat()).toEqual(records)
})
