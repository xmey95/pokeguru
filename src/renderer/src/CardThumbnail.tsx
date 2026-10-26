import { useState } from 'react'
import { Icon } from './Icon'

/** The adjacent card name labels the row; artwork is decorative, with a stable fallback. */
export function CardThumbnail({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  const available = src && !failed
  return <span className="card-thumbnail" aria-hidden="true" title={available ? 'Immagine della carta' : 'Miniatura non disponibile'}>
    {available ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Icon name="deck" />}
  </span>
}
