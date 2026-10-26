import { useState } from 'react'
import { guideSegments, type GuideReference, type GuideTarget } from './guide-links'
import { guideBlocks, guideListBlocks } from './guide-markdown'

export function GuideText({ text, references = [], cardTargets = new Map(), onOpenCatalogCard, inline = false, list = false }: {
  text: string
  references?: GuideReference[]
  cardTargets?: ReadonlyMap<string, string>
  onOpenCatalogCard: (identityId: string) => void
  inline?: boolean
  list?: boolean
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
  const content = (value: string) => value.split(/(\*\*[^*\n]+\*\*)/g).map((part, partIndex) => {
    const strong = part.startsWith('**') && part.endsWith('**')
    const nodes = guideSegments(strong ? part.slice(2, -2) : part, references, cardTargets).map((segment, index) => segment.target
      ? <a key={index} className="guide-link"
        href={segment.target.kind === 'catalog' ? `#catalog-card-${encodeURIComponent(segment.target.identityId)}` : segment.target.url}
        title={segment.target.kind === 'catalog' ? `Apri ${segment.text} nel Catalogo` : `Apri fonte nel browser: ${segment.target.url}`}
        onClick={(event) => { event.preventDefault(); void open(segment.target!) }}
        onAuxClick={(event) => { event.preventDefault(); if (event.button === 1) void open(segment.target!) }}>
        {segment.text}{segment.target.kind !== 'catalog' && <span className="external-link-mark" aria-hidden="true"> ↗</span>}</a> : <span key={index}>{segment.text}</span>)
    return strong ? <strong key={partIndex}>{nodes}</strong> : <span key={partIndex}>{nodes}</span>
  })
  if (inline) return <span className="guide-inline">{content(text)}{error && <span className="guide-link-error" role="alert">{error}</span>}</span>
  return <div className={`guide-body${list ? ' guide-list' : ''}`}>
    {(list ? guideListBlocks(text) : guideBlocks(text)).map((block, index) => block.kind === 'heading'
      ? <h4 key={index}>{content(block.text)}</h4>
      : block.kind === 'paragraph' ? <p key={index}>{content(block.text)}</p>
        : block.kind === 'unordered' ? <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{content(item)}</li>)}</ul>
          : <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{content(item)}</li>)}</ol>)}
    {error && <div className="guide-link-error" role="alert">{error}</div>}
  </div>
}
