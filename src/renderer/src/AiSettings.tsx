import { useEffect, useState } from 'react'
import type { AiConnection, AiPreferences } from '../../shared/ai'
import { useDraftState, useBusyState } from './Navigation'

const automatic: AiPreferences = { model: null, reasoningEffort: null }

export function AiSettings() {
  const [saved, setSaved] = useState<AiPreferences>(automatic)
  const [draftValue, setDraft] = useDraftState<AiPreferences | null>('ai.preferences', null)
  const draft = draftValue ?? saved
  const [connection, setConnection] = useState<AiConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useBusyState('ai.settings')
  const [loginPending, setLoginPending] = useState(false)
  const [error, setError] = useDraftState<string | null>('ai.error', null)
  const [notice, setNotice] = useDraftState<string | null>('ai.notice', null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const result = await window.projectsApi.getAiConnection()
      if (!result.ok) throw new Error(result.error)
      setConnection(result.value)
      if (result.value.account) setLoginPending(false)
    } catch (cause) {
      setConnection(null)
      setError(cause instanceof Error ? cause.message : 'Impossibile controllare Codex.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    void window.projectsApi.getAiPreferences().then((result) => {
      if (!active) return
      if (result.ok) setSaved(result.value)
      else setError(result.error)
    })
    void refresh()
    return () => { active = false }
  }, [busy])

  useEffect(() => {
    if (!loginPending) return
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [loginPending])

  const selectedModel = connection?.models.find((model) => model.id === draft.model)
  const dirty = saved.model !== draft.model || saved.reasoningEffort !== draft.reasoningEffort

  async function save(): Promise<void> {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.projectsApi.saveAiPreferences(draft)
      if (!result.ok) throw new Error(result.error)
      setSaved(result.value)
      setDraft(result.value)
      setNotice('Preferenze salvate.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Salvataggio non riuscito.') }
    finally { setBusy(false) }
  }

  async function login(): Promise<void> {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.projectsApi.startAiLogin()
      if (!result.ok) throw new Error(result.error)
      setLoginPending(true)
      setNotice('Completa l’accesso nel browser; lo stato si aggiornerà qui.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Accesso non avviato.') }
    finally { setBusy(false) }
  }

  async function logout(): Promise<void> {
    if (!window.confirm('Disconnettere Codex su questo computer? L’accesso è condiviso con le altre app Codex locali.')) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.projectsApi.logoutAi()
      if (!result.ok) throw new Error(result.error)
      setLoginPending(false)
      await refresh()
      setNotice('Codex disconnesso su questo computer.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Disconnessione non riuscita.') }
    finally { setBusy(false) }
  }

  async function test(): Promise<void> {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.projectsApi.testAiConnection()
      if (!result.ok) throw new Error(result.error)
      setNotice('Prova AI riuscita · nessun dato del progetto inviato.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Prova non riuscita.') }
    finally { setBusy(false) }
  }

  return <section className="ai-settings" aria-label="Impostazioni AI" data-nav-loading={loading}>
    <span className="detail-kicker">Impostazioni</span>
    <h1>AI per Pokéguru</h1>
    <p className="content-note">Le preferenze valgono dalle prossime analisi.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {notice && <div className="success-banner" role="status">{notice}</div>}

    <div className="settings-panel">
      <div className="panel-heading"><h2>Codex</h2>
        <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || busy}>Aggiorna stato</button></div>
      <p className="connection-state" role="status" data-connected={connection?.account === 'chatgpt' || connection?.account === 'apiKey'}>{loading ? 'Verifica in corso…' : connection?.account === 'chatgpt' ? `Connesso con ChatGPT${connection.plan ? ` · piano ${connection.plan}` : ''}` : connection?.account === 'apiKey' ? 'Connesso con chiave API Codex' : connection?.account === 'other' ? 'Modalità di accesso non supportata da questa versione' : connection ? 'Accesso richiesto' : 'Codex non disponibile'}</p>
      <details><summary>Gestione delle credenziali</summary><p className="content-note">L’accesso è gestito da Codex sul computer. Pokéguru non salva password, chiavi o token nel proprio archivio.</p></details>
      <div className="settings-actions">
        {!connection?.account && <button type="button" className="secondary-button" onClick={() => void login()} disabled={busy || loading}>Accedi con ChatGPT</button>}
        {connection?.account && <button type="button" className="text-button" onClick={() => void logout()} disabled={busy}>Disconnetti Codex</button>}
      </div>
    </div>

    <div className="settings-panel">
      <div className="panel-heading"><h2>Modello e ragionamento</h2></div>
      <div className="settings-grid">
        <div className="settings-field"><label htmlFor="ai-model">Modello</label>
          <select id="ai-model" value={draft.model ?? ''} onChange={(event) => setDraft({ model: event.target.value || null, reasoningEffort: null })} disabled={busy}>
            <option value="">Automatico (predefinito Codex)</option>
            {draft.model && !connection?.models.some((model) => model.id === draft.model) && <option value={draft.model}>{draft.model} · non disponibile</option>}
            {connection?.models.map((model) => <option key={model.id} value={model.id}>{model.name}{model.isDefault ? ' · consigliato' : ''}</option>)}
          </select>
        </div>
        <div className="settings-field"><label htmlFor="ai-effort">Livello di ragionamento</label>
          <select id="ai-effort" value={draft.reasoningEffort ?? ''} onChange={(event) => setDraft({ ...draft, reasoningEffort: event.target.value || null })} disabled={busy || !selectedModel}>
            <option value="">Predefinito del modello</option>
            {selectedModel?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.id}</option>)}
          </select>
        </div>
      </div>
      <p className="content-note">«Automatico» usa il modello predefinito. La disponibilità degli altri modelli si verifica con una generazione.</p>
      <div className="settings-actions">
        <button type="button" className="primary-button" onClick={() => void save()} disabled={!dirty || busy}>Salva preferenze</button>
        <button type="button" className="secondary-button" onClick={() => void test()} disabled={busy || dirty || (connection?.account !== 'chatgpt' && connection?.account !== 'apiKey')}>Esegui prova AI</button>
      </div>
      <p className="content-note">La prova usa il limite Codex; non invia dati del progetto.</p>
    </div>

    <div className="settings-panel">
      <div className="panel-heading"><h2>Dati inviati nelle analisi</h2></div>
      <p className="content-note">Il Matchup invia la lista interpretata, l’avversario, periodo e fonti Limitless e, se disponibile, una lista avversaria pubblica. Il dettaglio compare prima della generazione.</p>
    </div>
  </section>
}
