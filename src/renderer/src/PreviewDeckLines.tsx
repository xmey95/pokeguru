import { useMemo, useState } from 'react'
import { parseDeck } from '../../shared/deck-import'
import { useCardPreview } from './CardPreview'

export function PreviewDeckLines({ lines }: { lines: string[] }) {
  const preview = useCardPreview()
  const parsed = useMemo(() => parseDeck(lines.join('\n')).lines, [lines])
  return <ul className="preview-deck-lines">{parsed.map((line) => <li key={line.lineNumber}
    tabIndex={line.kind === 'card' ? 0 : undefined}
    {...(line.kind === 'card' ? preview({ name: line.name ?? line.raw, setCode: line.setCode,
      cardNumber: line.cardNumber }) : {})}>
    {line.kind === 'card' ? <><strong>{line.quantity}×</strong><span>{line.name}</span>
      <small>{line.setCode ? `${line.setCode} ${line.cardNumber}` : 'Stampa non indicata'}</small></> : line.raw}
  </li>)}</ul>
}

export function ExpandablePreviewDeck({ summary, lines }: { summary: string; lines: string[] }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{summary}</summary>
    {open && <PreviewDeckLines lines={lines} />}</details>
}
