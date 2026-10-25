/** Only user-clicked HTTPS links may leave the Electron renderer. */
export function safeThreadLink(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) return ''
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''
  } catch { return '' }
}
