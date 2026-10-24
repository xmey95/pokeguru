import { useState } from 'react'
import { guideSegments, type GuideReference, type GuideTarget } from './guide-links'

export function GuideText({ text, references = [], onOpenCatalogCard }: {
  text: string
  references?: GuideReference[]
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
    {guideSegments(text, references).map((segment, index) => segment.target
      ? <a key={index} className="guide-link"
        href={segment.target.kind === 'catalog' ? `#catalog-card-${encodeURIComponent(segment.target.identityId)}` : segment.target.url}
        title={segment.target.kind === 'catalog' ? `Apri ${segment.text} nel Catalogo` : `Apri fonte nel browser: ${segment.target.url}`}
        onClick={(event) => { event.preventDefault(); void open(segment.target!) }}
        onAuxClick={(event) => { event.preventDefault(); if (event.button === 1) void open(segment.target!) }}>
        {segment.text}</a> : <span key={index}>{segment.text}</span>)}
    {error && <span className="guide-link-error" role="alert">{error}</span>}
  </span>
}
