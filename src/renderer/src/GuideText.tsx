import { useState } from 'react'
import { guideSegments, type GuideReference, type GuideTarget } from './guide-links'

export function GuideText({ text, references = [], cardTargets = new Map(), onOpenCatalogCard }: {
  text: string
  references?: GuideReference[]
  cardTargets?: ReadonlyMap<string, string>
  onOpenCatalogCard: (identityId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  async function open(target: GuideTarget) {
    setError(null)
    if (target.kind === 'catalog') { onOpenCatalogCard(target.identityId); return }
    try {
      const result = await (target.kind === 'limitless' ? window.projectsApi.openLimitless(target.url) : window.projectsApi.openDeckSource(target.url))
      if (!result.ok) setError(result.error)
    } catch { setError('Impossibile aprire il riferimento. Riprova.') }
  }
  return <span className="guide-body">
    {guideSegments(text, references, cardTargets).map((segment, index) => segment.target
      ? <a key={index} className="guide-link"
        href={segment.target.kind === 'catalog' ? `#catalog-card-${encodeURIComponent(segment.target.identityId)}` : segment.target.url}
        title={segment.target.kind === 'catalog' ? `Apri ${segment.text} nel Catalogo` : `Apri fonte nel browser: ${segment.target.url}`}
        onClick={(event) => { event.preventDefault(); void open(segment.target!) }}
        onAuxClick={(event) => { event.preventDefault(); if (event.button === 1) void open(segment.target!) }}>
        {segment.text}{segment.target.kind !== 'catalog' && <span className="external-link-mark" aria-hidden="true"> ↗</span>}</a> : <span key={index}>{segment.text}</span>)}
    {error && <span className="guide-link-error" role="alert">{error}</span>}
  </span>
}
