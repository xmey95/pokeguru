import { useEffect, useMemo, useState } from 'react'
import type { CatalogPrint, CatalogSyncMode, CatalogSyncStatus, CatalogView } from '../../shared/catalog'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'
import { gameplaySummary } from '../../shared/card-gameplay'

function date(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function legalDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`))
}

type Group = { key: string; name: string; category: string | null; basis: CatalogPrint['identityBasis']; prints: CatalogPrint[] }

function groupPrints(prints: CatalogPrint[]): Group[] {
  const groups = new Map<string, Group>()
  for (const print of prints) {
    const key = print.identityId ?? `pending-${print.id}`
    const group = groups.get(key) ?? { key, name: print.name, category: print.category, basis: print.identityBasis, prints: [] }
    group.prints.push(print)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
}

export function CatalogSection({ onConstrain, focusIdentityId }: {
  onConstrain?: (identityId: string) => void
  focusIdentityId?: string | null
}) {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [setFilter, setSetFilter] = useState('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatus | null>(null)
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [checkingRules, setCheckingRules] = useState(false)

  useEffect(() => {
    if (!focusIdentityId || !catalog) return
    const print = catalog.prints.find((item) => item.identityId === focusIdentityId)
    if (!print) return
    setQuery(print.name)
    setSetFilter('all')
    setSelectedKey(focusIdentityId)
  }, [focusIdentityId, catalog?.syncedAt])

  useEffect(() => {
    let active = true
    void window.projectsApi.getCatalog().then((result) => {
      if (!active) return
      if (result.ok) setCatalog(result.value)
      else setError(result.error)
    }).catch(() => { if (active) setError('Catalogo locale non disponibile.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void window.projectsApi.getStandardRuleAudit().then((result) => {
      if (active && result.ok) setRuleAudit(result.value)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  async function checkRules(): Promise<void> {
    if (checkingRules) return
    setCheckingRules(true)
    setError(null)
    try {
      const result = await window.projectsApi.checkStandardRuleSources()
      if (!result.ok) throw new Error(result.error)
      setRuleAudit(result.value)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Controllo delle fonti non riuscito.') }
    finally { setCheckingRules(false) }
  }

  useEffect(() => {
    let active = true
    let lastProgress = ''
    let lastRefresh = 0
    async function poll(): Promise<void> {
      const result = await window.projectsApi.getCatalogSyncStatus()
      if (!active || !result.ok) return
      setSyncStatus(result.value)
      setBusy(result.value.running)
      const progress = `${result.value.state}:${result.value.acquired}:${result.value.expected}`
      if (progress !== lastProgress && (!result.value.running || Date.now() - lastRefresh > 5_000)) {
        lastProgress = progress
        lastRefresh = Date.now()
        const current = await window.projectsApi.getCatalog()
        if (active && current.ok) setCatalog(current.value)
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 1500)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  async function sync(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncCatalog()
      if (!result.ok) throw new Error(result.error)
      setCatalog(result.value)
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Sincronizzazione non riuscita.'} I dati già acquisiti restano consultabili.`)
    } finally { setBusy(false) }
  }

  async function syncStandard(mode: CatalogSyncMode): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncStandardCatalog(mode)
      if (!result.ok) throw new Error(result.error)
      setSyncStatus(result.value)
      setBusy(result.value.running)
    } catch (cause) {
      setBusy(false)
      setError(`${cause instanceof Error ? cause.message : 'Sincronizzazione non riuscita.'} I dettagli già acquisiti restano salvati.`)
      const current = await window.projectsApi.getCatalog()
      if (current.ok) setCatalog(current.value)
    }
  }

  async function openSource(url: string): Promise<void> {
    const result = await window.projectsApi.openCatalogSource(url)
    if (!result.ok) setError(result.error)
  }

  const groups = useMemo(() => groupPrints(catalog?.prints ?? []), [catalog])
  const filtered = groups.filter((group) => {
    const text = query.trim().toLocaleLowerCase()
    return (!text || group.name.toLocaleLowerCase().includes(text) || group.prints.some((print) =>
      `${print.id} ${print.setName} ${print.rarity ?? ''}`.toLocaleLowerCase().includes(text))) &&
      (setFilter === 'all' || group.prints.some((print) => print.setId === setFilter))
  })
  const visible = filtered.slice(0, 100)
  const selected = visible.find((group) => group.key === selectedKey) ?? visible[0]
  const selectedPrints = selected?.prints.filter((print) => setFilter === 'all' || print.setId === setFilter) ?? []
  const sampled = catalog?.sets.reduce((sum, set) => sum + set.sampleTotal, 0) ?? 0
  const acquired = catalog?.prints.filter((print) => print.detailAt !== null) ?? []
  const missing = catalog?.prints.filter((print) => print.detailAt === null) ?? []
  const rarityCount = acquired.filter((print) => print.rarity !== null).length
  const variantCount = acquired.filter((print) => print.variants !== null).length
  const thumbnailCount = acquired.filter((print) => print.thumbnail !== null).length
  const highCount = acquired.filter((print) => print.highImageAvailable === true).length
  const confirmedGroups = groups.filter((group) => group.basis &&
    group.basis !== 'unverified').length
  const standard = catalog?.scope.kind === 'standard-marks'

  return <section className="catalog-section" aria-label="Catalogo occidentale">
    <div className="panel-heading">
      <div><span className="eyebrow">Catalogo condiviso · Standard occidentale</span><h2>Carte e ristampe</h2></div>
      <div className="catalog-actions">
        {!standard && <button type="button" className="secondary-button" onClick={() => void sync()} disabled={busy}>
          {busy ? 'Sincronizzazione…' : catalog?.syncedAt ? 'Aggiorna campione' : 'Sincronizza campione'}
        </button>}
        <button type="button" className="primary-button" onClick={() => void syncStandard('new')} disabled={busy}>
          {busy ? 'Aggiornamento in corso…' : syncStatus?.state === 'paused' && syncStatus.mode === 'new' ? 'Riprendi aggiornamento' : 'Aggiorna nuove carte'}
        </button>
        <button type="button" className="secondary-button" onClick={() => void syncStandard('full')} disabled={busy}>
          {syncStatus?.state === 'paused' && syncStatus.mode === 'full' ? 'Riprendi scansione completa' : 'Scansione completa'}
        </button>
      </div>
    </div>
    <p className="content-note">{standard ? 'Inventario Standard TCGdex · marchi H e successivi, promo ed Energie Base.' : 'Campione TCGdex condiviso fra i progetti.'}</p>
    {catalog?.rulePackageError && <p className="diagnostics" role="alert">{catalog.rulePackageError}</p>}
    {ruleAudit?.status === 'changed' && ruleAudit.packageVersion === catalog?.rulePackage?.version && <p className="diagnostics" role="alert">Fonti Standard cambiate · verifica le regole prima di fidarti dell’esito.</p>}
    <details className="rotation-panel" aria-label="Fonti delle regole Standard">
      <summary>Regole Standard v{catalog?.rulePackage?.version ?? '—'} · {!ruleAudit || ruleAudit.packageVersion !== catalog?.rulePackage?.version ? 'fonti non ricontrollate' : ruleAudit.status === 'matching' ? 'fonti coerenti' : ruleAudit.status === 'changed' ? 'revisione necessaria' : 'fonti non raggiungibili'}</summary>
      <p>{!ruleAudit || ruleAudit.packageVersion !== catalog?.rulePackage?.version ? 'Fonti online non ancora ricontrollate per questa versione delle regole.'
        : ruleAudit.status === 'matching' ? `Fonti coerenti con il pacchetto locale al ${date(ruleAudit.checkedAt)}.`
          : ruleAudit.status === 'changed' ? `Fonte cambiata o non interpretabile al ${date(ruleAudit.checkedAt)}: revisione delle regole necessaria.`
            : `Fonti non raggiungibili al ${date(ruleAudit.checkedAt)}; ultima verifica riuscita ${ruleAudit.verifiedAt ? date(ruleAudit.verifiedAt) : 'mai'}.`}</p>
      <p>Le regole sono incluse nella release dell’app; aggiornare le carte non le cambia. Le promo usano il registro locale.</p>
      {ruleAudit?.sources.map((source) => <p key={source.id}>{source.id === 'rotation-2026' ? 'Rotazione 2026' : 'Attesa dei prodotti'}: {source.status === 'matching' ? 'coerente' : source.status === 'changed' ? 'da rivedere' : 'non raggiungibile'} · {source.detail}{' '}
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource(source.id === 'rotation-2026' ? 'play-2026-01-09' : 'set-admission')}>Fonte ↗</button></p>)}
      <button type="button" className="secondary-button" disabled={checkingRules} onClick={() => void checkRules()}>{checkingRules ? 'Controllo in corso…' : 'Controlla fonti Standard'}</button>
    </details>
    {catalog?.syncedAt && <p className="content-note">Aggiornato {date(catalog.syncedAt)} · dati acquisiti disponibili offline.</p>}
    {syncStatus && syncStatus.state !== 'idle' && <p className="content-note" role="status">{syncStatus.phase}: {syncStatus.acquired}/{syncStatus.expected || '?'} dettagli{syncStatus.state === 'paused' ? ' · in pausa, riprendibile' : ''}.</p>}
    {syncStatus?.error && <p className="diagnostics" role="status">{syncStatus.error}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Apertura catalogo…</p> : !catalog?.syncedAt ? (
      <div className="matchup-empty">Catalogo vuoto. Usa <strong>Aggiorna nuove carte</strong>{!standard && <> oppure <strong>Sincronizza campione</strong> per una prova rapida</>}.</div>
    ) : <>
      <div className="catalog-metrics" aria-label={standard ? 'Copertura dell’inventario Standard' : 'Copertura del campione'}>
        {standard ? <>
          <div><strong>{catalog.standardCoverage?.acquired ?? 0}/{catalog.standardCoverage?.expected ?? 0}</strong><span>Stampe acquisite</span></div>
          <div><strong>{catalog.standardCoverage?.missing ?? 0}</strong><span>Dettagli mancanti</span></div>
          <div><strong>{catalog.standardCoverage?.gameplayAcquired ?? 0}/{catalog.standardCoverage?.expected ?? 0}</strong><span>Regole di gioco disponibili</span></div>
          <div><strong>{catalog.standardCoverage?.promos.acquired ?? 0}/{catalog.standardCoverage?.promos.expected ?? 0}</strong><span>Promo acquisite</span></div>
        </> : <>
        <div><strong>{catalog.sets.length}/{catalog.scope.setIds.length}</strong><span>Set acquisiti</span></div>
        <div><strong>{acquired.length}/{sampled}</strong><span>Stampe del campione</span></div>
        <div><strong>{groups.length}</strong><span>Gruppi locali</span></div>
        </>}
      </div>
      {standard && (catalog.standardCoverage?.officialSets.missing ?? 0) > 0 &&
        <p className="diagnostics" role="alert">{catalog.standardCoverage!.officialSets.missing} set ufficiali assenti dal manifest · copertura Standard incompleta.</p>}
      <div className="catalog-filters">
        <label>Cerca carta o stampa<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Iono o sv02-185" /></label>
        <label>Espansione<select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}><option value="all">Tutte</option>{catalog.sets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.id})</option>)}</select></label>
      </div>
      <div className="catalog-layout">
        <div className="catalog-list" aria-label="Risultati catalogo">
          {filtered.length === 0 ? <p className="content-note">Nessuna carta locale corrisponde alla ricerca.</p> : <>{filtered.length > 100 && <p className="content-note">{filtered.length} risultati; mostrati i primi 100. Restringi la ricerca per trovare altre carte.</p>}{visible.map((group) => <button type="button" key={group.key} className={selected?.key === group.key ? 'active' : ''} onClick={() => setSelectedKey(group.key)}>
            <strong>{group.name}</strong><span>{group.prints.length} {group.prints.length === 1 ? 'stampa' : 'stampe'}{group.basis && group.basis !== 'unverified' ? '' : ' · equivalenza da verificare'}</span>
          </button>)}</>}
        </div>
        <div className="catalog-detail">
          {selected && <>
            <h3>{selected.name}</h3>
            {onConstrain && selected.prints.some((print) => print.detailAt && print.identityId) &&
              <button type="button" className="secondary-button" onClick={() => onConstrain(selected.key)}>Aggiungi vincolo su questa carta</button>}
            {selected.basis && selected.basis !== 'unverified' && <p className="content-note">Stampe collegate per regole di gioco coincidenti.</p>}
            <div className="catalog-print-grid">{selectedPrints.map((print) => <article key={print.id} className="catalog-print">
              {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
              <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span>{print.rarity && <span>Rarità: {print.rarity}</span>}<span>Marchio: {print.regulationMark ?? 'non indicato'}</span>
                {print.isPromo && <span>Registro promo: {print.promoStatus?.state === 'available' ? 'disponibile alla data del controllo' :
                  print.promoStatus?.state === 'upcoming' ? `futura · ${print.promoStatus.legalDate ? `dal ${legalDate(print.promoStatus.legalDate)}` : print.promoStatus.dateNote ?? 'data da verificare'}` :
                    print.promoStatus?.state === 'unlisted' ? 'non elencata · da verificare' : 'non verificata'}
                  {print.promoStatus && ` · controllo ${date(print.promoStatus.checkedAt)}`}</span>}
                {print.variants && <span>Varianti: {Object.entries(print.variants).filter(([, yes]) => yes).map(([name]) => name).join(', ') || 'nessuna indicata'}</span>}{print.highImageAvailable && <span>Immagine grande disponibile online</span>}{print.sourceUpdated && <span>Fonte aggiornata: {date(print.sourceUpdated)}</span>}{print.error && <span className="catalog-error">{print.error}</span>}
                {print.gameplay ? <details><summary>Regole di gioco</summary><p>{gameplaySummary(print.gameplay)}</p></details>
                  : <span>Regole di gioco non ancora acquisite</span>}
                <button type="button" className="text-button" onClick={() => void openSource(print.sourceUrl)}>Apri scheda fonte ↗</button></div>
            </article>)}</div>
          </>}
        </div>
      </div>
      {standard && catalog.standardCoverage && <details className="catalog-set-coverage">
        <summary>Copertura per set · {catalog.standardCoverage.bySet.filter((set) => set.missing > 0).length} con dettagli mancanti</summary>
        <p className="content-note">Set ufficiali nel manifest: {catalog.standardCoverage.officialSets.present}/{catalog.standardCoverage.officialSets.expected}; {catalog.standardCoverage.officialSets.missing} mancanti. Calendario controllato il {legalDate(catalog.standardCoverage.releaseSource.checkedAt)}.</p>
        {catalog.standardCoverage.officialSets.missing > 0 && <div className="diagnostics" role="status"><strong>Set ufficiali non presenti nel manifest</strong><ul>{catalog.standardCoverage.officialSets.missingSets.map((set) => <li key={set.setId}>{set.product} ({set.setId})</li>)}</ul></div>}
        <p className="content-note">«Nel perimetro» indica il filtro TCGdex; «Totale set» include le altre stampe. La presenza di un set non prova la legalità.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-releases')}>Calendario prodotti Pokémon ↗</button></p>
        <div className="catalog-set-table-wrap"><table aria-label="Copertura Standard per set">
          <thead><tr><th>Set</th><th>Data set (TCGdex)</th><th>Uscita ufficiale</th><th>Nel perimetro</th><th>Acquisiti</th><th>Mancanti</th><th>Promo classificate</th><th>Totale set</th></tr></thead>
          <tbody>{catalog.standardCoverage.bySet.map((set) => <tr key={set.setId}>
            <th scope="row"><button type="button" className="text-button" onClick={() => setSetFilter(set.setId)}>{set.name} ({set.setId})</button></th>
            <td>{set.releaseDate ? legalDate(set.releaseDate) : '—'}</td>
            <td>{set.officialReleaseDate ? legalDate(set.officialReleaseDate)
              : set.promo || set.setId === 'sve' || set.setId === 'mee' ? '—' : 'Da verificare'}
              {set.officialReleaseDate && set.releaseDate && set.officialReleaseDate !== set.releaseDate ? ' · Date diverse' : ''}
              {set.officialReleaseDate && !set.releaseDate ? ' · Data TCGdex assente' : ''}</td>
            <td>{set.expected}</td><td>{set.acquired}</td><td>{set.missing}</td>
            <td>{set.promo ? `${set.promoVerified}/${set.promoVerified + set.promoUnchecked}` : '—'}</td>
            <td>{set.sourceTotal}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
      <details className="catalog-set-coverage"><summary>Metodo, promo e dati delle stampe</summary>
      {standard ? <>
        <p className="content-note">Perimetro: stampe TCGdex con marchio H–Z ed Energie Base `sve`/`mee`. «Aggiorna nuove carte» completa anche le schede già presenti ma prive delle regole di gioco; «Scansione completa» ricontrolla tutti i dettagli. Miniature non scaricate in massa.</p>
        <p className="content-note">Promo: {catalog.standardCoverage?.promos.available ?? 0} disponibili · {catalog.standardCoverage?.promos.upcoming ?? 0} future · {catalog.standardCoverage?.promos.unlisted ?? 0} non elencate · {catalog.standardCoverage?.promos.unchecked ?? 0} non verificate. Registro v{catalog.promoAudit?.packageVersion ?? '—'}, controllato il {catalog.promoAudit?.checkedAt ? date(catalog.promoAudit.checkedAt) : 'mai'}. Nuovi stati richiedono una release.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('promo')}>Registro promo ufficiale ↗</button>
        </p>
      </>
        : <p className="content-note">Set TCGdex: {catalog.sets.map((set) => `${set.id}: ${set.sourceTotal}`).join('; ')}. Rarità {rarityCount}/{sampled}, varianti {variantCount}/{sampled}, miniature {thumbnailCount}/{sampled}, immagini grandi {highCount}/{sampled}. {confirmedGroups} gruppi collegati per regole di gioco; le altre equivalenze richiedono verifica.</p>}
      </details>
      {missing.length > 0 && <details className="diagnostics"><summary>Dettagli mancanti ({missing.length})</summary><ul>{missing.slice(0, 12).map((print) => <li key={print.id}>{print.id}: {print.error ?? 'Non ancora acquisito'}</li>)}</ul>{missing.length > 12 && <p>Mostrati i primi 12; gli altri saranno ripresi al prossimo aggiornamento.</p>}</details>}
    </>}
  </section>
}
