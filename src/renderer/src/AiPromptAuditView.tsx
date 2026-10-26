import type { AiPromptAudit } from '../../shared/ai-evidence'

export function AiPromptAuditView({ audit }: { audit: AiPromptAudit }) {
  return <details className="ai-prompt-audit"><summary>Prompt effettivo · {audit.utf8Bytes.toLocaleString('it-IT')} byte</summary>
    <p>Impronta SHA-256: <code>{audit.sha256}</code>.
      {audit.durationMs !== null ? ` Risposta Codex in ${Math.round(audit.durationMs / 1000)} s.` : ' Durata non recuperabile.'}
      {audit.usage ? ` Token: ${audit.usage.inputTokens} input (${audit.usage.cachedInputTokens} dalla cache), ${audit.usage.outputTokens} output.` : ' Uso token non disponibile.'}</p>
    <pre>{audit.text}</pre>
  </details>
}
