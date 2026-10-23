import { useEffect, useState } from 'react'
import type { AiConnection, AiPreferences } from '../../shared/ai'

const automatic: AiPreferences = { model: null, reasoningEffort: null }

export function AiSettings() {
  const [saved, setSaved] = useState<AiPreferences>(automatic)
  const [draft, setDraft] = useState<AiPreferences>(automatic)
  const [connection, setConnection] = useState<AiConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loginPending, setLoginPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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
      if (result.ok) { setSaved(result.value); setDraft(result.value) }
      else setError(result.error)
    })
    void refresh()
    return () => { active = false }
  }, [])

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
      setNotice('Preferenze salvate. Saranno usate dalle prossime analisi.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Salvataggio non riuscito.') }
    finally { setBusy(false) }
  }

  async function login(): Promise<void> {
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.projectsApi.startAiLogin()
      if (!result.ok) throw new Error(result.error)
      setLoginPending(true)
      setNotice('Completa l’accesso nel browser. Pokéguru aggiornerà lo stato automaticamente.')
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
      setNotice('Prova riuscita: Codex ha completato una breve richiesta senza dati dei tuoi mazzi.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Prova non riuscita.') }
    finally { setBusy(false) }
  }

  return <section className="ai-settings" aria-label="Impostazioni AI">
    <span className="detail-kicker">Impostazioni</span>
    <h1>AI per Pokéguru</h1>
    <p className="content-note">Configura Codex per le analisi. Le preferenze valgono per le nuove generazioni; le guide già salvate conservano il modello con cui sono state create.</p>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {notice && <div className="success-banner" role="status">{notice}</div>}

    <div className="settings-panel">
      <div className="panel-heading"><div><span className="eyebrow">Motore iniziale</span><h2>Codex</h2></div>
        <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading || busy}>Aggiorna stato</button></div>
      <p className="connection-state">{loading ? 'Verifica in corso…' : connection?.account === 'chatgpt' ? `Connesso con ChatGPT${connection.plan ? ` · piano ${connection.plan}` : ''}` : connection?.account === 'apiKey' ? 'Connesso con chiave API Codex' : connection?.account === 'other' ? 'Modalità di accesso non supportata da questa versione' : connection ? 'Accesso richiesto' : 'Codex non disponibile'}</p>
      <p className="content-note">L’accesso è gestito da Codex sul computer. Pokéguru non salva password, chiavi o token nel proprio archivio.</p>
      <div className="settings-actions">
        {!connection?.account && <button type="button" className="secondary-button" onClick={() => void login()} disabled={busy || loading}>Accedi con ChatGPT</button>}
        {connection?.account && <button type="button" className="text-button" onClick={() => void logout()} disabled={busy}>Disconnetti Codex</button>}
      </div>
    </div>

    <div className="settings-panel">
      <div className="panel-heading"><div><span className="eyebrow">Preferenze globali</span><h2>Modello e ragionamento</h2></div></div>
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
      <p className="content-note">Modelli e livelli sono proposti dal catalogo Codex; l’accesso effettivo a un modello si conferma con una generazione riuscita. «Automatico» segue il modello predefinito al momento della prossima analisi.</p>
      <div className="settings-actions">
        <button type="button" className="primary-button" onClick={() => void save()} disabled={!dirty || busy}>Salva preferenze</button>
        <button type="button" className="secondary-button" onClick={() => void test()} disabled={busy || dirty || (connection?.account !== 'chatgpt' && connection?.account !== 'apiKey')}>Esegui prova AI</button>
      </div>
      <p className="content-note">La prova invia una breve richiesta a Codex e può usare parte del tuo limite. Non include dati di progetto.</p>
    </div>

    <div className="settings-panel">
      <div className="panel-heading"><div><span className="eyebrow">Trasparenza</span><h2>Dati inviati nelle analisi</h2></div></div>
      <p className="content-note">Quando generi un Matchup, Pokéguru invia a Codex i nomi e le quantità delle carte interpretate, l’archetipo scelto, periodo e fonte del metagame Limitless e, se disponibile, una lista avversaria pubblica di esempio. Il dettaglio compare prima della generazione. L’AI non modifica automaticamente la lista del progetto.</p>
    </div>
  </section>
}
