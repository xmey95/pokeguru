export type GuideBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'unordered'; items: string[] }
  | { kind: 'ordered'; items: string[] }

const sentences = new Intl.Segmenter('it', { granularity: 'sentence' })

/** Presentation-only fallback for guides saved before list formatting was requested. */
export function guideListBlocks(source: string): GuideBlock[] {
  return guideBlocks(source).map((block) => {
    if (block.kind !== 'paragraph') return block
    // Keep inline Markdown, URLs and common abbreviations intact. Masking preserves
    // offsets, so each item is sliced from the original text, never rewritten.
    const masked = block.text.replace(/\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|https?:\/\/[^\s<>\]]+|\b(?:Mr|Mrs|Ms|Dr|Prof|Sig|es|ecc|pag|cfr)\./giu,
      (token) => {
        const tail = /^https?:/i.test(token) ? token.match(/[.,;:!?)}]+$/)?.[0] ?? '' : ''
        return token.slice(0, token.length - tail.length).replace(/[.!?]/g, 'x') + tail
      })
    const items = [...sentences.segment(masked)].map(({ index, segment }) =>
      block.text.slice(index, index + segment.length).trim()).filter(Boolean)
    return { kind: 'unordered', items }
  })
}

// A deliberately small, safe subset of Markdown used by saved Codex guides.
export function guideBlocks(source: string): GuideBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: GuideBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() })
    paragraph = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const heading = line.match(/^#{1,4}\s+(.+)$/)
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (heading) { flush(); blocks.push({ kind: 'heading', text: heading[1] }); continue }
    if (bullet || numbered) {
      flush()
      const kind = bullet ? 'unordered' : 'ordered'
      const last = blocks.at(-1)
      if (last?.kind === kind) last.items.push((bullet ?? numbered)![1])
      else blocks.push({ kind, items: [(bullet ?? numbered)![1]] })
      continue
    }
    if (/^(?:Avvio|Sviluppo|Chiusura|Primi turni|Metà partita|Finale)\s*:/i.test(line) && paragraph.length) flush()
    paragraph.push(line)
  }
  flush()
  return blocks
}
