import { AiFailure, aiFailureCode } from './ai-failure'

/** Used only to classify a failed child process. Raw provider messages can contain
 * private input and must never be persisted or displayed in diagnostics. */
export function codexErrorEvent(line: string): string {
  try {
    const event = JSON.parse(line) as { type?: string; message?: unknown; error?: unknown }
    if (event.type !== 'error' && event.type !== 'turn.failed') return ''
    return JSON.stringify(event.error ?? event.message ?? '').slice(-4000)
  } catch { return '' }
}

export function codexFailure(output: string): AiFailure {
  const code = aiFailureCode(new Error(output))
  const messages: Partial<Record<typeof code, string>> = {
    'context-limit': 'Codex segnala che questo input supera il contesto disponibile.',
    'quota': 'Codex ha raggiunto un limite temporaneo di utilizzo.',
    'network': 'La connessione con Codex si è interrotta.',
    'timeout': 'Codex non ha completato la chiamata nel tempo disponibile.',
    'auth': 'Accedi a Codex prima di riprendere l’analisi.',
    'storage-full': 'Lo spazio su disco è esaurito. Libera spazio e riprendi il lavoro salvato.'
  }
  const seconds = /retry[_ -]?after["\s:=]+(\d+(?:\.\d+)?)/i.exec(output)?.[1]
  return new AiFailure(code, messages[code] ?? 'Codex non ha completato la richiesta. Verifica accesso, connessione e modello.',
    code === 'quota' && seconds ? Number(seconds) * 1000 : undefined)
}
