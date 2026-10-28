/** Only Codex's user-facing reasoning summary is eligible for the activity panel. */
export function codexReasoningSummary(line: string): string | null {
  try {
    const event = JSON.parse(line) as { type?: unknown; item?: { type?: unknown; text?: unknown } }
    if (event.type !== 'item.completed' || event.item?.type !== 'reasoning' ||
      typeof event.item.text !== 'string') return null
    const text = event.item.text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').trim()
    return text ? text.slice(0, 900) : null
  } catch { return null }
}
