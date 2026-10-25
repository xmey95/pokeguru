import { useState } from 'react'
import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { safeThreadLink } from '../../shared/thread-links'
import { guideSourceTarget } from './guide-links'

const elements = ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']

export function ThreadMarkdown({ text, cardTargets, onOpenCatalogCard }: {
  text: string
  cardTargets: ReadonlyMap<string, string>
  onOpenCatalogCard(identityId: string): void
}) {
  const [linkError, setLinkError] = useState<string | null>(null)
  return <div className="thread-markdown">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} allowedElements={elements}
      urlTransform={(url, key) => key === 'href' ? safeThreadLink(url) : ''}
      components={{ a: ({ href, children }) => {
        if (!href) return <span>{children}</span>
        // APP-107: a card URL from TCGdex must lead to the local card, never its raw JSON.
        if (new URL(href).hostname === 'api.tcgdex.net') {
          const target = guideSourceTarget(href, cardTargets)
          return target?.kind === 'catalog' ? <button type="button" className="text-button"
            onClick={() => onOpenCatalogCard(target.identityId)}>{children} · Catalogo</button>
            : <span>{children} · scheda non disponibile nel Catalogo locale</span>
        }
        return <a href={href} onClick={(event) => {
          event.preventDefault()
          setLinkError(null)
          void window.projectsApi.openThreadLink(href).then((result) => {
            if (!result.ok) setLinkError(result.error)
          }).catch(() => setLinkError('Impossibile aprire il link.'))
        }}>{children}<span aria-hidden="true"> ↗</span></a>
      } }}>
      {text}
    </Markdown>
    {linkError && <p role="alert" className="thread-link-error">{linkError}</p>}
  </div>
}
