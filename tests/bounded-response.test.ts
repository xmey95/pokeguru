import { describe, expect, it } from 'vitest'
import { readLimitedBytes, readLimitedText } from '../src/main/bounded-response'

function streamingResponse(chunks: Uint8Array[], headers?: HeadersInit): { response: Response; cancelled: () => boolean; read: () => number } {
  let index = 0
  let stopped = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) controller.close()
      else controller.enqueue(chunks[index++])
    },
    cancel() { stopped = true }
  }, { highWaterMark: 0 })
  return { response: new Response(body, { headers }), cancelled: () => stopped, read: () => index }
}

describe('APP-091 bounded remote responses', () => {
  it('preserves UTF-8 content at the byte limit', async () => {
    const response = streamingResponse([new TextEncoder().encode('Poké'), new TextEncoder().encode('mon')])
    expect(await readLimitedText(response.response, 8, 'too large')).toBe('Pokémon')
    expect(response.cancelled()).toBe(false)
  })

  it('stops reading an oversized stream without Content-Length', async () => {
    const response = streamingResponse([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)])
    await expect(readLimitedBytes(response.response, 6, 'too large')).rejects.toThrow('too large')
    expect(response.cancelled()).toBe(true)
    expect(response.read()).toBeLessThan(3)
  })

  it('stops reading when Content-Length understates the body', async () => {
    const response = streamingResponse([new Uint8Array(4), new Uint8Array(4)], { 'content-length': '1' })
    await expect(readLimitedBytes(response.response, 6, 'too large')).rejects.toThrow('too large')
    expect(response.cancelled()).toBe(true)
  })

  it('rejects an oversized declared length before reading', async () => {
    const response = streamingResponse([new Uint8Array(4)], { 'content-length': '100' })
    await expect(readLimitedBytes(response.response, 6, 'too large')).rejects.toThrow('too large')
    expect(response.cancelled()).toBe(true)
    expect(response.read()).toBe(0)
  })
})
