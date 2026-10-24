import type { ReactNode } from 'react'
import type { AiConnection } from '../../shared/ai'
import { useViewState } from './Navigation'

export function MatchupAiControls({ connection, connectionError, loading, onReload, model, effort,
  onModel, onEffort, disabled, onOpenSettings, children }: {
  connection: AiConnection | null
  connectionError: string | null
  loading: boolean
  onReload(): void
  model: string
  effort: string
  onModel(value: string): void
  onEffort(value: string): void
  disabled: boolean
  onOpenSettings(): void
  children: ReactNode
}) {
  const [panel, setPanel] = useViewState<'config' | 'data' | null>('matchup.ai-panel', null)
  const selected = connection?.models.find((item) => item.id === model)
  const summary = model ? `${selected?.name ?? model} · ${effort || 'ragionamento predefinito'}` : 'Preferenze globali'
  function close() {
    const trigger = panel === 'config' ? 'matchup-config-trigger' : 'matchup-data-trigger'
    setPanel(null)
    document.getElementById(trigger)?.focus({ preventScroll: true })
  }
  return <div className="matchup-ai-controls" onKeyDown={(event) => {
    if (event.key === 'Escape' && panel && !(event.target instanceof HTMLSelectElement)) {
      event.stopPropagation(); event.preventDefault(); close()
    }
  }}>
    <div className="matchup-ai-toolbar">
      <span className="matchup-ai-summary"><strong>AI</strong><span>{summary}</span>{model && <span className="matchup-ai-local">Personalizzata</span>}</span>
      <div className="matchup-ai-buttons">
        <button type="button" className="text-button" id="matchup-config-trigger" aria-controls="matchup-config-panel"
          aria-expanded={panel === 'config'} aria-label={panel === 'config' ? 'Chiudi configurazione AI' : 'Modifica configurazione AI'}
          onClick={() => setPanel(panel === 'config' ? null : 'config')}>{panel === 'config' ? 'Chiudi' : 'Modifica'}</button>
        <button type="button" className="text-button" id="matchup-data-trigger" aria-controls="matchup-data-panel"
          aria-expanded={panel === 'data'} onClick={() => setPanel(panel === 'data' ? null : 'data')}>Dati inviati</button>
      </div>
    </div>
    {panel === 'config' && <div id="matchup-config-panel" className="matchup-config-panel" role="region" aria-label="Configurazione AI del matchup">
      <div className="settings-grid">
        <div className="settings-field"><label htmlFor="matchup-model">Modello</label>
          <select id="matchup-model" value={model} onChange={(event) => onModel(event.target.value)} disabled={disabled || loading}>
            <option value="">Usa preferenze globali</option>
            {model && !selected && <option value={model}>{model} · disponibilità da verificare</option>}
            {connection?.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="settings-field"><label htmlFor="matchup-effort">Ragionamento</label>
          <select id="matchup-effort" value={effort} onChange={(event) => onEffort(event.target.value)} disabled={disabled || !selected}>
            <option value="">Predefinito</option>
            {effort && !selected?.reasoningEfforts.some((item) => item.id === effort) && <option value={effort}>{effort} · disponibilità da verificare</option>}
            {selected?.reasoningEfforts.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
          </select>
        </div>
      </div>
      {loading && <p className="content-note" role="status">Caricamento modelli…</p>}
      {connectionError && <div className="matchup-config-error"><p className="error-banner" role="alert">{connectionError}</p>
        <button type="button" className="text-button" onClick={onReload} disabled={disabled}>Ricarica modelli</button></div>}
      {!loading && !connectionError && connection?.models.length === 0 && <p className="content-note">Nessun modello disponibile.</p>}
      <div className="matchup-config-footer"><p className="content-note">La scelta personalizzata vale per questo matchup.</p>
        <button type="button" className="text-button" onClick={onOpenSettings}>Preferenze globali</button></div>
    </div>}
    {panel === 'data' && <div id="matchup-data-panel" role="region" aria-label="Dati inviati a Codex">{children}</div>}
  </div>
}
