import { useState } from 'react'
import { Icon } from './Icon'

/** The same local image may represent several physical copies; each copy stays a separate button. */
export function CardImageTile({ name, print, src, copy, total, selected, onClick }: {
  name: string; print?: string; src: string | null; copy: number; total: number
  selected: boolean; onClick(): void
}) {
  const [failed, setFailed] = useState(false)
  const available = Boolean(src && (src.startsWith('pokeguru://cards/') || src.startsWith('data:image/')) && !failed)
  return <button type="button" className="card-image-tile" aria-pressed={selected}
    aria-label={`${name}${print ? `, ${print}` : ''}, copia ${copy} di ${total}`}
    onClick={onClick}>
    <span className="card-image-art" aria-hidden="true">
      {available ? <img src={src!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : <span className="card-image-placeholder"><Icon name="deck" /><span>{name}</span></span>}
    </span>
    <span className="card-image-tile-label" aria-hidden="true">{name}</span>
  </button>
}
