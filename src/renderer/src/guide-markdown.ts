export type GuideBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'unordered'; items: string[] }
  | { kind: 'ordered'; items: string[] }

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
