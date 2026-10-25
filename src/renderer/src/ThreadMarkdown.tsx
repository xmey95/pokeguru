import { useState } from 'react'
import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { safeThreadLink } from '../../shared/thread-links'

const elements = ['a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul']

export function ThreadMarkdown({ text }: { text: string }) {
  const [linkError, setLinkError] = useState<string | null>(null)
  return <div className="thread-markdown">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} allowedElements={elements}
      urlTransform={(url, key) => key === 'href' ? safeThreadLink(url) : ''}
      components={{ a: ({ href, children }) => href ? <a href={href} onClick={(event) => {
        event.preventDefault()
        setLinkError(null)
        void window.projectsApi.openThreadLink(href).then((result) => {
          if (!result.ok) setLinkError(result.error)
        }).catch(() => setLinkError('Impossibile aprire il link.'))
      }}>{children}<span aria-hidden="true"> ↗</span></a> : <span>{children}</span> }}>
      {text}
    </Markdown>
    {linkError && <p role="alert" className="thread-link-error">{linkError}</p>}
  </div>
}
