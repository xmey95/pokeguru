import { AiFailure, aiFailureCode } from './ai-failure'

/** Used only to classify a failed child process. Raw provider messages can contain
 * private input and must never be persisted or displayed in diagnostics. */
export function codexErrorEvent(line: string): string {
  try {
    const event = JSON.parse(line) as { type?: string; message?: unknown; error?: unknown }
    if (event.type !== 'error' && event.type !== 'turn.failed') return ''
    return JSON.stringify(event.error ?? event.message ?? '').slice(0,4000)
  } catch { return '' }
}

/** Extract actual structured discriminants without retaining arbitrary codes,
 * parameter values, messages, prompt fragments or nested user input. */
export function codexErrorMetadata(line:string):{codes:string[];parameters:string[]}{
  const codes=new Set(['invalid_json_schema','invalid_request_error','unsupported_parameter','context_length_exceeded','max_output_tokens','rate_limit_exceeded','insufficient_quota','server_error'])
  const parameters=new Set(['max_output_tokens','max_completion_tokens','response_format','text.format','json_schema'])
  try{
    const event=JSON.parse(line)
    if(!['error','turn.failed'].includes(event?.type))return {codes:[],parameters:[]}
    const error=event.error
    if(!error||typeof error!=='object'||Array.isArray(error))return {codes:[],parameters:[]}
    return {codes:[...new Set([error.code,error.type].filter((v):v is string=>typeof v==='string'&&codes.has(v)))],parameters:typeof error.param==='string'&&parameters.has(error.param)?[error.param]:[]}
  }catch{return {codes:[],parameters:[]}}
}

export function codexFailure(output: string,exitCode:number|null=null): AiFailure {
  const status=/\b(?:HTTP(?:\/\d(?:\.\d)?)?\s*|status(?:_code)?["\s:=]+)([45]\d\d)\b/i.exec(output)?.[1]
  const httpStatus=status?Number(status):null
  const outputLimit=/max[_ -]output[_ -]tokens|max(?:imum)?[_ -]completion[_ -]tokens/i.test(output)
  const explicitInvalidSchema=/invalid[_ -]?(?:json[_ -]?)?schema/i.test(output)
  if(explicitInvalidSchema||!(outputLimit&&/\bincomplete\b|incomplete_details/i.test(output))&&/schema.{0,100}(?:too (?:many|large)|exceed|limit|unsupported)|(?:too many|maximum).{0,50}enum|grammar.{0,60}(?:large|limit|complex)/i.test(output)){
    const reason=/enum/i.test(output)?'enum-limit':/too (?:many|large)|exceed|limit|complex/i.test(output)?'schema-size':'invalid-schema'
    const detail=reason==='enum-limit'?'limite dei valori ammessi nello schema':reason==='schema-size'?'dimensione o complessità dello schema':'schema di risposta non supportato'
    return new AiFailure('invalid-schema',`Codex ha rifiutato il formato della risposta: ${detail}.`,undefined,{reason,httpStatus,exitCode})
  }
  if(httpStatus===400||httpStatus===422)return new AiFailure('provider',`Codex ha rifiutato la richiesta (HTTP ${httpStatus}).`,undefined,{reason:'invalid-request',httpStatus,exitCode})
  if(httpStatus!==null&&httpStatus>=500)return new AiFailure('network',`Il servizio Codex ha restituito un errore temporaneo (HTTP ${httpStatus}).`,undefined,{reason:'server',httpStatus,exitCode})
  if(/unsupported_parameter|unsupported\s+(?:parameter|field)|(?:max_output_tokens|max_completion_tokens).{0,60}(?:not supported|unsupported|not allowed)/i.test(output))return new AiFailure('provider',
    'Codex ha rifiutato un parametro della richiesta. Nessun contenuto è stato applicato.',undefined,{reason:'invalid-request',httpStatus,exitCode})
  if(outputLimit)return new AiFailure('output-limit',
    'Codex ha interrotto la risposta per il limite dei token di output. Nessun contenuto incompleto è stato applicato.',undefined,{reason:'output-limit',httpStatus,exitCode})
  const code = aiFailureCode(new Error(output))
  // An identified provider failure keeps its existing classification. A
  // Windows termination alone does not prove who interrupted the process.
  if(code==='unknown'&&httpStatus===null&&exitCode!==null&&[0x40010004,0xc000013a].includes(exitCode>>>0))return new AiFailure('process-interrupted',
    'Il processo Codex è stato interrotto prima di completare la richiesta. Il lavoro salvato è conservato; serve una ripresa esplicita.',undefined,{reason:'process-terminated',httpStatus:null,exitCode})
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
    code === 'quota' && seconds ? Number(seconds) * 1000 : undefined,{reason:'other',httpStatus,exitCode})
}
