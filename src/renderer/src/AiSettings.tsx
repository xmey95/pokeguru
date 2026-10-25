import { useEffect, useRef, useState } from 'react'
import type { AiConnection, AiLoginStart, AiPreferences, CodexSetupStatus } from '../../shared/ai'
import { useNavigation, useDraftState, useBusyState, useBusyStartedAt } from './Navigation'
import { ActivityStatus, Spinner } from './Loading'

const automatic: AiPreferences = { model: null, reasoningEffort: null }
type Action = 'save' | 'test' | 'login' | 'logout'

export function AiSettings() {
  const nav = useNavigation()
  const [saved, setSaved] = useState<AiPreferences | null>(null)
  const [draftValue, setDraft] = useDraftState<AiPreferences | null>('ai.preferences', null)
  const draft = draftValue ?? saved ?? automatic
  const [connection, setConnection] = useState<AiConnection | null>(null)
  const [setup, setSetup] = useState<CodexSetupStatus | null>(null)
  const [deviceLogin, setDeviceLogin] = useState<Extract<AiLoginStart, { mode: 'device' }> | null>(null)
  const [loading, setLoading] = useState(true)
  const [preferencesLoading, setPreferencesLoading] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [preferencesError, setPreferencesError] = useState<string | null>(null)
  const [busy, setBusy] = useBusyState('ai.settings')
  const [action, setAction] = useDraftState<Action | null>('ai.action', null)
  const startedAt = useBusyStartedAt('ai.settings')
  const [loginPending, setLoginPending] = useDraftState('ai.login-pending', false)
  const [error, setError] = useDraftState<string | null>('ai.error', null)
  const [errorScope, setErrorScope] = useDraftState<'connection' | 'preferences'>('ai.error-scope', 'preferences')
  const [notice, setNotice] = useDraftState<string | null>('ai.notice', null)
  const connectionRequest = useRef(0)
  const preferencesRequest = useRef(0)

  async function refresh(): Promise<void> {
    const request = ++connectionRequest.current
    setLoading(true)
    try {
      const setupResult = await window.projectsApi.getCodexSetupStatus()
      if (request !== connectionRequest.current) return
      if (setupResult.ok) setSetup(setupResult.value)
      const result = await window.projectsApi.getAiConnection()
      if (request !== connectionRequest.current) return
      if (!result.ok) throw new Error(result.error)
      setConnection(result.value)
      setConnectionError(null)
      if (result.value.account) { setLoginPending(false); setDeviceLogin(null) }
      else if (loginPending) {
        const progress = await window.projectsApi.getAiLoginProgress()
        if (request !== connectionRequest.current) return
        if (progress.ok && progress.value.state === 'error') {
          setLoginPending(false)
          setDeviceLogin(null)
          setErrorScope('connection')
          setError(progress.value.error ?? 'Accesso Codex non riuscito. Riprova.')
        }
      }
    } catch (cause) {
      if (request !== connectionRequest.current) return
      setConnection(null)
      setConnectionError(cause instanceof Error ? cause.message : 'Impossibile controllare Codex.')
      if (loginPending) { setLoginPending(false); setDeviceLogin(null) }
    } finally { if (request === connectionRequest.current) setLoading(false) }
  }

  async function readPreferences(): Promise<void> {
    const request = ++preferencesRequest.current
    setPreferencesLoading(true)
    try {
      const result = await window.projectsApi.getAiPreferences()
      if (request !== preferencesRequest.current) return
      if (!result.ok) throw new Error(result.error)
      setSaved(result.value)
      setPreferencesError(null)
    } catch (cause) {
      if (request !== preferencesRequest.current) return
      setSaved(null)
      setPreferencesError(cause instanceof Error ? cause.message : 'Impossibile leggere le preferenze.')
    } finally { if (request === preferencesRequest.current) setPreferencesLoading(false) }
  }

  useEffect(() => {
    if (!busy) { void readPreferences(); void refresh() }
    return () => { connectionRequest.current++; preferencesRequest.current++ }
  }, [busy])

  useEffect(() => {
    if (!loginPending || busy) return
    const timer = window.setInterval(() => { if (!loading) void refresh() }, 3000)
    return () => window.clearInterval(timer)
  }, [loginPending, busy, loading])

  const selectedModel = connection?.models.find((model) => model.id === draft.model)
  const selectedEffort = selectedModel?.reasoningEfforts.find((effort) => effort.id === draft.reasoningEffort)
  const missingModel = Boolean(draft.model && !selectedModel)
  const missingEffort = Boolean(draft.reasoningEffort && !selectedEffort)
  const unavailableChoice = missingModel || missingEffort
  const dirty = Boolean(saved && (saved.model !== draft.model || saved.reasoningEffort !== draft.reasoningEffort))
  const connected = connection?.account === 'chatgpt' || connection?.account === 'apiKey'
  const ready = Boolean(saved) && !preferencesLoading && !busy
  const testReason = busy ? 'Operazione in corso…' : preferencesLoading ? 'Lettura delle preferenze…'
    : !saved ? 'Ricarica le preferenze per eseguire la prova.' : dirty ? 'Salva le modifiche prima della prova.'
    : loading ? 'Verifica di Codex in corso…' : !connection ? 'Codex deve essere disponibile per eseguire la prova.'
    : connection.account === 'other' ? 'Modalità non supportata. Gestisci la connessione in Account e accesso.'
    : !connected ? 'Accedi a Codex per eseguire la prova.'
    : unavailableChoice ? 'Scegli un modello e un livello disponibili.' : null

  function edit(value: AiPreferences) { setDraft(value); setNotice(null); setError(null) }
  function start(value: Action) {
    setAction(value); setBusy(true); setError(null); setNotice(null)
    setErrorScope(value === 'login' || value === 'logout' ? 'connection' : 'preferences')
  }
  function finish() {
    // Completion belongs to the operation, including after its view was unmounted.
    nav.drafts.set('ai.action', null)
    setBusy(false)
  }

  async function save(): Promise<void> {
    if (!ready || !dirty || unavailableChoice) return
    start('save')
    try {
      const result = await window.projectsApi.saveAiPreferences(draft)
      if (!result.ok) throw new Error(result.error)
      setSaved(result.value)
      setDraft(result.value)
      setNotice('Preferenze salvate.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Salvataggio non riuscito.') }
    finally { finish() }
  }

  async function login(mode: 'browser' | 'device'): Promise<void> {
    start('login')
    try {
      const result = await window.projectsApi.startAiLogin(mode)
      if (!result.ok) throw new Error(result.error)
      setDeviceLogin(result.value.mode === 'device' ? result.value : null)
      setLoginPending(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Accesso non avviato.') }
    finally { finish() }
  }

  async function cancelLogin(): Promise<void> {
    try {
      const result = await window.projectsApi.cancelAiLogin()
      if (!result.ok) throw new Error(result.error)
    } catch (cause) {
      setErrorScope('connection')
      setError(cause instanceof Error ? cause.message : 'Impossibile interrompere l’accesso.')
    } finally { setLoginPending(false); setDeviceLogin(null) }
  }

  async function logout(): Promise<void> {
    if (!window.confirm('Disconnettere Codex su questo computer? L’accesso è condiviso con le altre app Codex locali.')) return
    start('logout')
    try {
      const result = await window.projectsApi.logoutAi()
      if (!result.ok) throw new Error(result.error)
      setLoginPending(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Disconnessione non riuscita.') }
    finally { finish() }
  }

  async function test(): Promise<void> {
    if (testReason) return
    start('test')
    try {
      const result = await window.projectsApi.testAiConnection()
      if (!result.ok) throw new Error(result.error)
      setNotice(`Prova AI riuscita · ${selectedModel?.name ?? 'Automatico'} · ${draft.reasoningEffort ?? 'ragionamento predefinito'}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Prova non riuscita.') }
    finally { finish() }
  }

  return <section className="ai-settings" aria-label="Impostazioni AI" data-nav-loading={loading || preferencesLoading}>
    <h1>Impostazioni AI</h1>
    <p className="content-note">Configura Codex per le prossime analisi.</p>

    <section className="settings-panel ai-connection-panel" aria-labelledby="ai-connection-title">
      <div className="ai-connection-row">
        <div className="ai-connection-summary">
          <h2 id="ai-connection-title">Codex</h2>
          <span className="connection-state" role="status" data-connected={connected}>{busy && loading ? 'Operazione Codex in corso…' : loading ? 'Verifica in corso…'
            : connection?.account === 'chatgpt' ? `Connesso con ChatGPT${connection.plan ? ` · ${connection.plan}` : ''}`
            : connection?.account === 'apiKey' ? 'Connesso con chiave API'
            : connection?.account === 'other' ? 'Accesso non supportato'
            : connection ? 'Accesso richiesto' : 'Codex non disponibile'}</span>
        </div>
        <div className="ai-connection-actions">
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || busy}>{loading && !busy && <Spinner />}Aggiorna stato</button>
          {connection && !connection.account && <button type="button" className="primary-button" onClick={() => void login('browser')} disabled={busy || loading || loginPending}>{action === 'login' ? 'Apertura accesso…' : 'Accedi con ChatGPT'}</button>}
        </div>
      </div>
      {connectionError && <p className="error-banner" role="alert">{connectionError}</p>}
      {error && errorScope === 'connection' && <p className="error-banner" role="alert">{error}</p>}
      {!connected && setup && !setup.cliAvailable && <div className="ai-setup-guide">
        <h3>Codex non disponibile</h3>
        <p className="warning-banner" role="status">La CLI ufficiale non si avvia. Verifica l’installazione di Pokéguru e riprova.</p>
      </div>}
      {setup?.cliAvailable && <p className="content-note">{setup.bundled ? 'Codex incluso in Pokéguru' : 'CLI Codex disponibile'}: {setup.version}</p>}
      {connection && !connection.account && <button type="button" className="text-button" onClick={() => void login('device')} disabled={busy || loginPending}>Accedi con codice dispositivo</button>}
      {loginPending && <div>
        <ActivityStatus state="paused" title={deviceLogin ? 'Completa l’accesso con il codice' : 'Completa l’accesso nel browser'} detail="Lo stato si aggiorna automaticamente." />
        {deviceLogin && <p className="content-note">Inserisci il codice <strong>{deviceLogin.userCode}</strong> nella pagina aperta nel browser: {deviceLogin.verificationUrl}. Il codice è temporaneo e non viene salvato.</p>}
        <button type="button" className="text-button" onClick={() => void cancelLogin()}>Interrompi attesa</button>
      </div>}
      <details className="ai-account-details">
        <summary>Account e accesso</summary>
        <p className="content-note">L’accesso è condiviso con le altre app Codex su questo computer. Pokéguru non archivia password, chiavi o token.</p>
        {connection?.account && <button type="button" className="text-button" onClick={() => void logout()} disabled={busy}>{action === 'logout' ? 'Disconnessione…' : 'Disconnetti Codex'}</button>}
      </details>
    </section>

    <section className="settings-panel ai-preferences-panel" aria-labelledby="ai-preferences-title">
      <h2 id="ai-preferences-title">Modello e ragionamento</h2>
      <p className="content-note">Usati in Thread e Matchup, salvo scelte personalizzate.</p>
      {preferencesError && <div className="error-banner" role="alert">{preferencesError}
        <button type="button" className="secondary-button" disabled={busy || preferencesLoading} onClick={() => void readPreferences()}>Ricarica preferenze</button>
      </div>}
      <div className="settings-grid">
        <div className="settings-field"><label htmlFor="ai-model">Modello</label>
          <select id="ai-model" value={draft.model ?? ''} onChange={(event) => edit({ model: event.target.value || null, reasoningEffort: null })} disabled={!ready}>
            <option value="">Automatico (predefinito Codex)</option>
            {missingModel && <option value={draft.model!}>{draft.model} · disponibilità da verificare</option>}
            {connection?.models.map((model) => <option key={model.id} value={model.id}>{model.name}{model.isDefault ? ' · predefinito Codex' : ''}</option>)}
          </select>
        </div>
        <div className="settings-field"><label htmlFor="ai-effort">Livello di ragionamento</label>
          <select id="ai-effort" value={draft.reasoningEffort ?? ''} onChange={(event) => edit({ ...draft, reasoningEffort: event.target.value || null })} disabled={!ready || !selectedModel} aria-describedby={!draft.model ? 'ai-effort-help' : undefined}>
            <option value="">Predefinito del modello</option>
            {missingEffort && <option value={draft.reasoningEffort!}>{draft.reasoningEffort} · disponibilità da verificare</option>}
            {selectedModel?.reasoningEfforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.id}</option>)}
          </select>
          {!draft.model && <span className="content-note" id="ai-effort-help">Scegli un modello per personalizzare il ragionamento.</span>}
        </div>
      </div>
      {!loading && unavailableChoice && <p className="warning-banner" role="status">{!connection
        ? 'Disponibilità della scelta salvata da verificare quando Codex sarà raggiungibile.'
        : !connected ? 'Accedi a Codex per verificare la disponibilità della scelta salvata.'
        : 'La scelta attuale non è tra quelle disponibili. Scegli un’altra opzione o Automatico.'}</p>}
      <div className="ai-save-row">
        <button type="button" className="primary-button" onClick={() => void save()} disabled={!ready || !dirty || unavailableChoice}>{action === 'save' && <Spinner />}{action === 'save' ? 'Salvataggio…' : 'Salva preferenze'}</button>
        {dirty && <button type="button" className="text-button" onClick={() => edit(saved!)} disabled={!ready}>Annulla modifiche</button>}
        <span className="content-note" role="status">{preferencesLoading ? 'Lettura preferenze…' : !saved ? 'Preferenze non disponibili' : dirty ? 'Modifiche non salvate' : notice === 'Preferenze salvate.' ? notice : 'Preferenze salvate'}</span>
      </div>
      {error && errorScope === 'preferences' && <div className="error-banner" role="alert">{error}</div>}
      {action === 'test' && <ActivityStatus title="Codex sta eseguendo la prova…" startedAt={startedAt} detail="La richiesta usa la configurazione salvata." />}
      <div className="ai-test-row">
        <div>
          <h3>Prova della configurazione</h3>
          <p className="content-note">Usa i limiti Codex · nessun dato del progetto inviato.</p>
          {testReason && <p className="content-note" id="ai-test-reason">{testReason}</p>}
          {notice?.startsWith('Prova AI riuscita') && <p className="ai-feedback" role="status">{notice}</p>}
        </div>
        <button type="button" className="secondary-button" onClick={() => void test()} disabled={Boolean(testReason)} aria-describedby={testReason ? 'ai-test-reason' : undefined}>{action === 'test' && <Spinner />}{action === 'test' ? 'Prova in corso…' : 'Esegui prova AI'}</button>
      </div>
    </section>

    <div className="ai-settings-details">
      <details>
        <summary>Modelli e disponibilità</summary>
        <p className="content-note">Automatico segue il modello predefinito di Codex. L’elenco dipende dall’account; una prova verifica che la configurazione funzioni.</p>
        {selectedModel && <p className="content-note">Modello: {selectedModel.id}{selectedModel.defaultReasoningEffort ? ` · ragionamento predefinito: ${selectedModel.defaultReasoningEffort}` : ''}.</p>}
        {selectedEffort?.description && <p className="content-note">{selectedEffort.description}</p>}
      </details>
      <details>
        <summary>Dati inviati a Codex</summary>
        <p className="content-note">Thread: messaggio, conversazione, lista di riferimento, vincoli e fonti. Matchup: lista, avversario e fonti; nelle revisioni anche guida e osservazioni.</p>
        <p className="content-note">Il dettaglio dei dati è consultabile nelle rispettive sezioni, prima dell’invio.</p>
      </details>
    </div>
  </section>
}
