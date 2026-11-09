/** Decoded ORIGINAL bytes only. No parsed objects, validator result or AI pass.
 * Callers must fingerprint every current compressed chunk before lookup. */
export class EvidenceJsonCache {
  private readonly entries = new Map<string, { json: string; bytes: number }>()
  private bytes = 0
  constructor(private readonly maximumBytes = 32 * 1024 * 1024, private readonly maximumEntries = 128) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 || !Number.isSafeInteger(maximumEntries) || maximumEntries < 1)
      throw new Error('Limiti della cache delle evidenze non validi.')
  }
  get(key: string): string | undefined {
    const prior = this.entries.get(key)
    if (!prior) return undefined
    this.entries.delete(key); this.entries.set(key, prior)
    return prior.json
  }
  put(key: string, json: string): void {
    // Conservative UTF-16 allocation estimate, including keys. Never retain an
    // oversized original merely because its compressed representation is small.
    const bytes = (key.length + json.length) * 2
    if (bytes > this.maximumBytes) return
    const previous = this.entries.get(key)
    if (previous) { this.entries.delete(key); this.bytes -= previous.bytes }
    while (this.entries.size >= this.maximumEntries || this.bytes + bytes > this.maximumBytes) {
      const oldest = this.entries.keys().next().value!
      this.bytes -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest)
    }
    this.entries.set(key, { json, bytes }); this.bytes += bytes
  }
  clear(): void { this.entries.clear(); this.bytes = 0 }
}
