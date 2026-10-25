/** Read at most maxBytes after decompression, even if Content-Length is absent or false. */
export async function readLimitedBytes(response: Response, maxBytes: number, message: string): Promise<Uint8Array> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new Error(message)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error(message)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readLimitedText(response: Response, maxBytes: number, message: string): Promise<string> {
  return new TextDecoder().decode(await readLimitedBytes(response, maxBytes, message))
}
