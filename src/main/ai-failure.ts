import type { AiFailureCode } from '../shared/ai-diagnostics'
import type {AiBudgetSnapshot} from '../shared/ai-limits'

export interface ProviderFailureDetails {
  reason:'enum-limit'|'schema-size'|'invalid-schema'|'invalid-request'|'output-limit'|'server'|'process-terminated'|'other'
  httpStatus:number|null
  exitCode:number|null
}
export interface AiExecutionDetails {
  timeoutMs:number;elapsedMs:number;stdoutBytes:number;lastEventType:string|null;lastEventAt:string|null
  completedTurns:number;completedItems:number;resultFilePresent:boolean
  stderrBytes?:number;providerErrorEvents?:number;providerErrorCharacters?:number;unparsedStdoutEvents?:number
  finalStdoutEventWithoutNewline?:boolean;providerErrorHash?:string
  /** Allowlisted structured provider fields only, never free-form error text. */
  providerErrorCodes?:string[];providerErrorParameters?:string[]
}
export class AiFailure extends Error {
  constructor(readonly code: AiFailureCode, message: string, readonly retryAfterMs?: number,readonly providerDetails?:ProviderFailureDetails,readonly budget?:AiBudgetSnapshot,readonly executionDetails?:AiExecutionDetails) { super(message); this.name = 'AiFailure' }
}

export function aiFailureCode(error: unknown): AiFailureCode {
  if (error instanceof AiFailure) return error.code
  const message = error instanceof Error ? error.message : ''
  if (/context.{0,30}(limit|length|window|exceed)|too many (input )?tokens|input.{0,20}too (long|large)|maximum context/i.test(message)) return 'context-limit'
  if (/ENOSPC|SQLITE_FULL|disk.{0,10}full|spazio.{0,20}esaurito/i.test(message)) return 'storage-full'
  if (/\b429\b|rate.?limit|usage[ _-]limit|quota|insufficient_quota|credit[ _-](?:balance[ _-])?(?:exhausted|depleted)|credits[ _-]depleted/i.test(message)) return 'quota'
  if (/annullat/i.test(message)) return 'cancelled'
  if (/timeout|tempo massimo|entro quattro minuti/i.test(message)) return 'timeout'
  if (/Accedi a Codex|Not logged in/i.test(message)) return 'auth'
  if (/Codex non disponibile|ENOENT/i.test(message)) return 'cli-unavailable'
  if (/SQLITE|EPERM|ENOSPC|EACCES|archivio|salvataggio/i.test(message)) return 'storage'
  if (/fetch|network|ECONN|rete|connessione/i.test(message)) return 'network'
  if (/Piano delle query/i.test(message)) return 'invalid-plan'
  if (/schede nominate|Prove locali non consegnate/i.test(message)) return 'evidence-incomplete'
  if (/ha introdotto altre carte/i.test(message)) return 'draft-limit'
  if (/JSON|risposta.*valid|analisi incompleta|fonti.*valid/i.test(message)) return 'invalid-response'
  return 'unknown'
}
