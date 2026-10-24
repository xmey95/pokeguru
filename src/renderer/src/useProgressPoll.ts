import { useEffect, useState } from 'react'

/** Only one status request at a time; late responses cannot update another view. */
export function useProgressPoll<T>(enabled: boolean, read: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, onValue: (value: T) => void) {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) { setError(null); return }
    let active = true
    let timer: number | undefined
    async function poll() {
      try {
        const result = await read()
        if (!active) return
        if (!result.ok) throw new Error(result.error)
        onValue(result.value)
        setError(null)
      } catch {
        if (active) setError('Avanzamento non disponibile. Nuovo controllo in corso…')
      } finally { if (active) timer = window.setTimeout(() => void poll(), 1500) }
    }
    void poll()
    return () => { active = false; window.clearTimeout(timer) }
  }, [enabled, read, onValue])
  return error
}
