import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

const elements = ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li']

/** Compact display of Codex's summary. Links remain text; remote images and HTML are excluded. */
export function AiActivitySummary({ text }: { text: string }) {
  return <div className="ai-activity-summary-text">
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}
      allowedElements={elements} unwrapDisallowed skipHtml>{text}</Markdown>
  </div>
}
