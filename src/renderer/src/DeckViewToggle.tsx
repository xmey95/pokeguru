export type DeckView = 'list' | 'images'

export function DeckViewToggle({ value, onChange, label }: {
  value: DeckView; onChange(view: DeckView): void; label: string
}) {
  return <div className="deck-view-toggle" role="group" aria-label={label}>
    <button type="button" aria-label="Vista Lista" aria-pressed={value === 'list'} onClick={() => onChange('list')}>Lista</button>
    <button type="button" aria-label="Vista Immagini" aria-pressed={value === 'images'} onClick={() => onChange('images')}>Immagini</button>
  </div>
}
