import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigation, useViewState, useBusyState, useBusyStartedAt, useDraftState } from './Navigation'
import type { CatalogAdvancedMatch, CatalogAdvancedPage, CatalogAdvancedSearchSummary,
  CatalogBrowseGroup, CatalogBrowseOverview, CatalogBrowsePage,
  CatalogPrint, CatalogSyncMode, CatalogSyncStatus } from '../../shared/catalog'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'
import { CatalogCardDetail } from './CatalogCardDetail'
import { SearchEmpty } from './SearchEmpty'
import { ActivityStatus, LoadingSkeleton, Spinner } from './Loading'
import { CatalogActivity } from './CatalogActivity'
import { DailySyncNotice } from './DailySyncNotice'
import { useCardPreview } from './CardPreview'
import { westernRuleHorizon } from '../../shared/standard-rotation'
import { localCalendarDate } from '../../shared/calendar-date'

function date(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function legalDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`))
}

function isAdvancedMatch(group: CatalogBrowseGroup): group is CatalogAdvancedMatch {
  return 'assessment' in group
}

export function CatalogSection({ focusIdentityId, projectId }: {
  focusIdentityId?: string | null
  projectId?: string | null
}) {
  const preview = useCardPreview()
  const nav = useNavigation()
  const [catalog, setCatalog] = useState<CatalogBrowseOverview | null>(null)
  const [page, setPage] = useState<CatalogBrowsePage | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [detail, setDetail] = useState<{ group: CatalogBrowseGroup; prints: CatalogPrint[] } | null>(null)
  const [detailKeyLoaded, setDetailKeyLoaded] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [requesting, setRequesting] = useBusyState('catalog.sync')
  const startedAt = useBusyStartedAt('catalog.sync')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useDraftState<string | null>('catalog.error', null)
  const [query, setQuery] = useViewState('catalog.query', '')
  const [searchMode, setSearchMode] = useViewState<'quick' | 'advanced'>('catalog.searchMode', 'quick')
  const [advancedQuery, setAdvancedQuery] = useViewState('catalog.advancedQuery', '')
  const [advanced, setAdvanced] = useState<CatalogAdvancedSearchSummary | null>(null)
  const [advancedPage, setAdvancedPage] = useState<CatalogAdvancedPage | null>(null)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedPageLoading, setAdvancedPageLoading] = useState(false)
  const [advancedError, setAdvancedError] = useState<string | null>(null)
  const advancedRequest = useRef(0)
  const [setFilter, setSetFilter] = useViewState('catalog.set', 'all')
  const [offset, setOffset] = useViewState('catalog.offset', 0)
  const [selectedKey, setSelectedKey] = useViewState<string | null>('catalog.selected', null)
  const [focusConsumed, setFocusConsumed] = useViewState('catalog.focusConsumed', false)
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatus | null>(null)
  const [controlPending, setControlPending] = useState(false)
  const busy = requesting || controlPending || !!syncStatus?.running
  const recoverableJob = syncStatus?.state === 'paused' || syncStatus?.state === 'interrupted' ||
    syncStatus?.state === 'rate-limited'
  const [progressError, setProgressError] = useState<string | null>(null)
  const [ruleAudit, setRuleAudit] = useState<StandardRuleAudit | null>(null)
  const [checkingRules, setCheckingRules] = useBusyState('catalog.rules')
  const [managementOpen, setManagementOpen] = useViewState('catalog.management', false)

  async function refreshCatalog(): Promise<void> {
    const result = await window.projectsApi.getCatalogBrowseOverview()
    if (!result.ok) throw new Error(result.error)
    setCatalog(result.value)
    setRevision((value) => value + 1)
  }

  function closeManagement() {
    setManagementOpen(false)
    document.getElementById('catalog-management-trigger')?.focus()
  }

  function selectCoveredSet(id: string) {
    setSetFilter(id)
    setOffset(0)
    setManagementOpen(false)
    requestAnimationFrame(() => document.getElementById('catalog-set-filter')?.focus())
  }

  useEffect(() => {
    if (!focusIdentityId || !catalog || focusConsumed) return
    let active = true
    void window.projectsApi.getCatalogGroup(focusIdentityId).then((result) => {
      if (!active) return
      if (!result.ok || !result.value) {
        setError('Questa carta non è più disponibile nel catalogo locale. Torna indietro o cerca un’altra carta.')
        return
      }
      setQuery(result.value.group.name)
      setSearchMode('quick')
      setSetFilter('all')
      setOffset(0)
      setSelectedKey(focusIdentityId)
      setFocusConsumed(true)
      nav.entry.label = `Catalogo · ${result.value.group.name}`
    }).catch(() => { if (active) setError('Carta non disponibile nel catalogo locale.') })
    return () => { active = false }
  }, [focusIdentityId, catalog?.syncedAt])

  useEffect(() => {
    let active = true
    void window.projectsApi.getCatalogBrowseOverview().then((result) => {
      if (!active) return
      if (result.ok) { setCatalog(result.value); setRevision((value) => value + 1) }
      else setError(result.error)
    }).catch(() => { if (active) setError('Catalogo locale non disponibile.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!catalog?.syncedAt) { setPage(null); return }
    if (searchMode !== 'quick') return
    let active = true
    setPageLoading(true)
    setPage(null)
    setSearchFailed(false)
    const timer = window.setTimeout(() => {
      void window.projectsApi.searchCatalog(query, setFilter, offset).then((result) => {
        if (!active) return
        if (result.ok) setPage(result.value)
        else { setError(result.error); setSearchFailed(true) }
      }).catch(() => { if (active) { setError('Ricerca catalogo non disponibile.'); setSearchFailed(true) } })
        .finally(() => { if (active) setPageLoading(false) })
    }, query ? 120 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [catalog?.syncedAt, query, setFilter, offset, revision, searchMode])

  useEffect(() => {
    if (searchMode !== 'advanced' || !advanced) return
    let active = true
    setAdvancedPageLoading(true)
    void window.projectsApi.getCatalogAdvancedPage(advanced.id, setFilter, offset).then((result) => {
      if (!active) return
      if (result.ok) { setAdvancedPage(result.value); setAdvancedError(null) }
      else { setAdvancedPage(null); setAdvancedError(result.error) }
    }).catch(() => { if (active) { setAdvancedPage(null); setAdvancedError('Pagina della ricerca non disponibile.') } })
      .finally(() => { if (active) setAdvancedPageLoading(false) })
    return () => { active = false }
  }, [searchMode, advanced?.id, setFilter, offset])

  async function runAdvancedSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (advancedLoading || advancedQuery.trim().length < 4) return
    const request = ++advancedRequest.current
    setAdvancedLoading(true)
    setAdvancedError(null)
    setAdvanced(null)
    setAdvancedPage(null)
    setOffset(0)
    try {
      const result = await window.projectsApi.searchCatalogAdvanced({ query: advancedQuery.trim(),
        selectedKey: selectedKey ?? page?.groups[0]?.key ?? null, projectId: projectId ?? null })
      if (request !== advancedRequest.current) return
      if (!result.ok) throw new Error(result.error)
      setAdvanced(result.value)
      setAdvancedPage(result.value.page)
    } catch (cause) {
      if (request === advancedRequest.current)
        setAdvancedError(cause instanceof Error ? cause.message : 'Ricerca avanzata non riuscita.')
    } finally { if (request === advancedRequest.current) setAdvancedLoading(false) }
  }

  async function cancelAdvancedSearch(): Promise<void> {
    advancedRequest.current++
    setAdvancedLoading(false)
    await window.projectsApi.cancelCatalogAdvancedSearch().catch(() => undefined)
  }

  const activeGroups = searchMode === 'advanced' ? advancedPage?.groups : page?.groups
  const selected = activeGroups?.find((group) => group.key === selectedKey) ?? activeGroups?.[0]
  useEffect(() => {
    if (!selected) { setDetail(null); setDetailKeyLoaded(null); return }
    let active = true
    setDetail(null)
    setDetailKeyLoaded(null)
    void window.projectsApi.getCatalogGroup(selected.key).then((result) => {
      if (active && result.ok) setDetail(result.value)
      else if (active) setError('Dettaglio carta non disponibile.')
    }).catch(() => { if (active) setError('Dettaglio carta non disponibile.') })
      .finally(() => { if (active) setDetailKeyLoaded(selected.key) })
    return () => { active = false }
  }, [selected?.key, revision])

  useEffect(() => {
    let active = true
    void window.projectsApi.getStandardRuleAudit().then((result) => {
      if (active && result.ok) setRuleAudit(result.value)
    }).catch(() => undefined)
    return () => { active = false }
  }, [checkingRules])

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
      try {
        const result = await window.projectsApi.getCatalogSyncStatus()
        if (!active) return
        if (!result.ok) throw new Error(result.error)
        setProgressError(null)
        setSyncStatus(result.value)
        const progress = `${result.value.state}:${result.value.acquired}:${result.value.expected}`
        if (progress !== lastProgress && (!result.value.running || Date.now() - lastRefresh > 5_000)) {
          lastProgress = progress
          lastRefresh = Date.now()
          const current = await window.projectsApi.getCatalogBrowseOverview()
          if (active && current.ok) {
            setCatalog(current.value)
            setRevision((value) => value + 1)
          }
        }
      } catch {
        if (active) setProgressError('Avanzamento non disponibile. Nuovo controllo in corso…')
      } finally { if (active) timer = window.setTimeout(() => void poll(), 1500) }
    }
    let timer: number | undefined
    void poll()
    return () => { active = false; window.clearTimeout(timer) }
  }, [requesting])

  async function sync(): Promise<void> {
    if (busy) return
    setRequesting(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncCatalog()
      if (!result.ok) throw new Error(result.error)
      await refreshCatalog()
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Sincronizzazione non riuscita.'} I dati già acquisiti restano consultabili.`)
    } finally { setRequesting(false) }
  }

  async function syncStandard(mode: CatalogSyncMode): Promise<void> {
    if (busy || (recoverableJob && syncStatus?.mode !== mode)) return
    setRequesting(true)
    setError(null)
    try {
      const result = await window.projectsApi.syncStandardCatalog(mode)
      if (!result.ok) throw new Error(result.error)
      setSyncStatus(result.value)
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : 'Sincronizzazione non riuscita.'} I dettagli già acquisiti restano salvati.`)
      try { await refreshCatalog() } catch { /* Keep the last visible overview. */ }
    } finally { setRequesting(false) }
  }

  async function controlStandard(action: 'pause' | 'cancel'): Promise<void> {
    if (requesting || controlPending) return
    setControlPending(true)
    setError(null)
    try {
      const result = action === 'pause' ? await window.projectsApi.pauseCatalogSync()
        : await window.projectsApi.cancelCatalogSync()
      if (!result.ok) throw new Error(result.error)
      setSyncStatus(result.value)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Controllo aggiornamento non riuscito.')
    } finally { setControlPending(false) }
  }

  const visible = activeGroups ?? []
  const selectedPrints = detail && detail.group.key === selected?.key
    ? detail.prints.filter((print) => setFilter === 'all' || print.setId === setFilter) : []
  const sampled = catalog?.stats.sampled ?? 0
  const acquired = catalog?.stats.acquired ?? 0
  const missing = catalog?.stats.missing ?? 0
  const rarityCount = catalog?.stats.rarity ?? 0
  const variantCount = catalog?.stats.variants ?? 0
  const thumbnailCount = catalog?.stats.thumbnails ?? 0
  const highCount = catalog?.stats.highImages ?? 0
  const confirmedGroups = catalog?.stats.confirmedGroups ?? 0
  const standard = catalog?.scope.kind === 'standard-marks'

  const coverage = catalog?.standardCoverage
  const gaps = [
    (standard ? coverage?.missing : missing) ? `${standard ? coverage!.missing : missing} ${(standard ? coverage!.missing : missing) === 1 ? 'dettaglio mancante' : 'dettagli mancanti'}` : null,
    standard && coverage?.gameplayMissing ? `${coverage.gameplayMissing} ${coverage.gameplayMissing === 1 ? 'scheda di gioco mancante' : 'schede di gioco mancanti'}` : null,
    standard && coverage?.officialSets.missing ? `${coverage.officialSets.missing} set ${coverage.officialSets.missing === 1 ? 'assente' : 'assenti'} dall’inventario` : null
  ].filter(Boolean)
  const currentRuleAudit = ruleAudit?.packageVersion === catalog?.rulePackage?.version ? ruleAudit : null
  const ruleHorizon = catalog?.rulePackage ? westernRuleHorizon(localCalendarDate(), catalog.rulePackage) : null
  const management = <section id="catalog-management" className="catalog-management" aria-labelledby="catalog-management-heading"
    hidden={!managementOpen} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeManagement() }
    }}>
    <div className="panel-heading"><h2 id="catalog-management-heading">Gestione catalogo</h2>
      <button type="button" className="text-button" onClick={closeManagement}>Chiudi gestione</button></div>
    <div className="catalog-maintenance-actions">
      <div><button type="button" className="secondary-button" onClick={() => void syncStandard('full')} disabled={loading || busy || !syncStatus || !!progressError || (recoverableJob && syncStatus.mode !== 'full')}>
          {recoverableJob && syncStatus?.mode === 'full' ? 'Riprendi scansione completa' : 'Scansione completa'}
        </button>
        <p className="content-note">Ricontrolla anche le schede già acquisite.</p></div>
      {!standard && <div><button type="button" className="secondary-button" onClick={() => void sync()} disabled={loading || busy || recoverableJob || !syncStatus || !!progressError}>
          {busy ? 'Sincronizzazione…' : catalog?.syncedAt ? 'Aggiorna campione' : 'Sincronizza campione'}
        </button>
        <p className="content-note">Acquisisce un piccolo gruppo di carte.</p></div>}
    </div>
    {syncStatus?.phase && syncStatus.state !== 'idle' && <p className="content-note">{syncStatus.phase}</p>}
    <details className="rotation-panel" aria-label="Fonti delle regole Standard">
      <summary>Regole Standard v{catalog?.rulePackage?.version ?? '—'} · {!currentRuleAudit ? 'fonti non ricontrollate' : currentRuleAudit.status === 'matching' ? 'fonti coerenti' : currentRuleAudit.status === 'changed' ? 'revisione necessaria' : 'fonti non raggiungibili'}</summary>
      <p>{!currentRuleAudit ? 'Fonti online non ancora ricontrollate per questa versione delle regole.'
        : currentRuleAudit.status === 'matching' ? `Fonti coerenti con il pacchetto locale al ${date(currentRuleAudit.checkedAt)}.`
          : currentRuleAudit.status === 'changed' ? `Fonte cambiata o non interpretabile al ${date(currentRuleAudit.checkedAt)}: revisione delle regole necessaria.`
            : `Fonti non raggiungibili al ${date(currentRuleAudit.checkedAt)}; ultima verifica riuscita ${currentRuleAudit.verifiedAt ? date(currentRuleAudit.verifiedAt) : 'mai'}.`}</p>
      <p>Le regole e lo stato delle promo sono inclusi nella release dell’app; aggiornare le carte o controllare queste fonti non li cambia. Il controllo confronta le pagine note e non scopre nuovi annunci.</p>
      {currentRuleAudit?.sources.map((source) => <p key={source.id}>{source.id === 'rotation-2026' ? 'Rotazione 2026' : source.id === 'promo-registry' ? 'Registro promo' : 'Attesa dei prodotti'}: {source.status === 'matching' ? 'coerente' : source.status === 'changed' ? 'da rivedere' : 'non raggiungibile'} · {source.detail}{' '}
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource(source.id === 'rotation-2026' ? 'play-2026-01-09' : source.id === 'promo-registry' ? 'promo' : 'set-admission')}>Fonte ↗</button></p>)}
      <button type="button" className="secondary-button" disabled={checkingRules} onClick={() => void checkRules()}>{checkingRules && <Spinner />}{checkingRules ? 'Controllo in corso…' : 'Controlla fonti Standard'}</button>
    </details>

    {catalog?.syncedAt && <>
      <h3 className="catalog-coverage-heading">Copertura del catalogo</h3>
      <p className="content-note">{standard ? 'Inventario Standard TCGdex · marchi dal primo ammesso dalla rotazione verificata, promo ed Energie Base.' : 'Campione TCGdex condiviso fra i progetti.'}</p>
      <div className="catalog-metrics" aria-label={standard ? 'Copertura dell’inventario Standard' : 'Copertura del campione'}>
        {standard ? <>
          <div><strong>{catalog.standardCoverage?.acquired ?? 0}/{catalog.standardCoverage?.expected ?? 0}</strong><span>Stampe acquisite</span></div>
          <div><strong>{catalog.standardCoverage?.missing ?? 0}</strong><span>Dettagli mancanti</span></div>
          <div><strong>{catalog.standardCoverage?.gameplayAcquired ?? 0}/{catalog.standardCoverage?.expected ?? 0}</strong><span>Regole di gioco disponibili</span></div>
          <div><strong>{catalog.standardCoverage?.promos.acquired ?? 0}/{catalog.standardCoverage?.promos.expected ?? 0}</strong><span>Promo acquisite</span></div>
        </> : <>
        <div><strong>{catalog.sets.length}/{catalog.scope.setIds.length}</strong><span>Set acquisiti</span></div>
        <div><strong>{acquired}/{sampled}</strong><span>Stampe del campione</span></div>
        <div><strong>{catalog.stats.groups}</strong><span>Gruppi locali</span></div>
        </>}
      </div>

      <h3 className="catalog-coverage-heading">Immagini delle stampe acquisite</h3>
      <p className="content-note">Le miniature conservate sono disponibili offline. Se TCGdex non ha la scansione, l'aggiornamento cerca la stampa esatta in Limitless. Le immagini assenti da entrambe le fonti mantengono il segnaposto.</p>
      <div className="catalog-metrics" aria-label="Copertura immagini">
        <div><strong>{thumbnailCount}/{acquired}</strong><span>Miniature conservate</span></div>
        <div><strong>{catalog.stats.limitlessThumbnails}</strong><span>Miniature da Limitless</span></div>
        <div><strong>{catalog.stats.imageSourceMissing}</strong><span>URL immagine assente nelle fonti</span></div>
        <div><strong>{catalog.stats.imageCacheMissing}</strong><span>Miniature da acquisire</span></div>
      </div>

      {standard && catalog.standardCoverage && <details className="catalog-set-coverage">
        <summary>Copertura per set · {catalog.standardCoverage.bySet.filter((set) => set.missing > 0).length} con dettagli mancanti</summary>
        <p className="content-note">Espansioni presenti nel catalogo: {catalog.standardCoverage.officialSets.present}/{catalog.standardCoverage.officialSets.expected} previste dal calendario ufficiale verificato; {catalog.standardCoverage.officialSets.missing} mancanti. Calendario controllato il {legalDate(catalog.standardCoverage.releaseSource.checkedAt)}.</p>
        {catalog.standardCoverage.officialSets.missing > 0 && <div className="diagnostics" role="status"><strong>Set ufficiali non presenti nel manifest</strong><ul>{catalog.standardCoverage.officialSets.missingSets.map((set) => <li key={set.setId}>{set.product} ({set.setId})</li>)}</ul></div>}
        {!!catalog.standardCoverage.officialSets.unmappedProducts?.length && <div className="content-note" role="status"><strong>Prodotti annunciati senza ID set verificato</strong><ul>
          {catalog.standardCoverage.officialSets.unmappedProducts.map((item) => <li key={item.product}>{item.product} · uscita {legalDate(item.releaseDate)}. La data di ammissione e il mapping TCGdex restano da verificare.</li>)}
        </ul></div>}
        <p className="content-note">«Nel perimetro» indica il filtro TCGdex; «Totale set» include le altre stampe. La presenza di un set non prova la legalità.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-releases')}>Calendario prodotti Pokémon ↗</button></p>
        <div className="catalog-set-table-wrap"><table aria-label="Copertura Standard per set">
          <thead><tr><th>Set</th><th>Data set (TCGdex)</th><th>Uscita ufficiale</th><th>Nel perimetro</th><th>Acquisiti</th><th>Mancanti</th><th>Promo classificate</th><th>Totale set</th></tr></thead>
          <tbody>{catalog.standardCoverage.bySet.map((set) => <tr key={set.setId}>
            <th scope="row"><button type="button" className="text-button" onClick={() => selectCoveredSet(set.setId)}>{set.name} ({set.setId})</button></th>
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
        <p className="content-note">Perimetro: stampe TCGdex con marchio dal primo ammesso dalla rotazione verificata fino a Z ed Energie Base `sve`/`mee`. «Aggiorna nuove carte» completa anche le schede già presenti ma prive delle regole di gioco e delle miniature disponibili; «Scansione completa» ricontrolla tutti i dettagli. Le immagini grandi sono solo segnalate online.</p>
        <p className="content-note">Promo: {catalog.standardCoverage?.promos.available ?? 0} disponibili · {catalog.standardCoverage?.promos.upcoming ?? 0} future · {catalog.standardCoverage?.promos.unlisted ?? 0} non elencate · {catalog.standardCoverage?.promos.unchecked ?? 0} non verificate. Registro v{catalog.promoAudit?.packageVersion ?? '—'}, controllato il {catalog.promoAudit?.checkedAt ? date(catalog.promoAudit.checkedAt) : 'mai'}. Nuovi stati richiedono una release.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('promo')}>Registro promo ufficiale ↗</button>
        </p>
      </>
        : <p className="content-note">Set TCGdex: {catalog.sets.map((set) => `${set.id}: ${set.sourceTotal}`).join('; ')}. Rarità {rarityCount}/{sampled}, varianti {variantCount}/{sampled}, miniature {thumbnailCount}/{sampled}, immagini grandi {highCount}/{sampled}. {confirmedGroups} gruppi collegati per regole di gioco; le altre equivalenze richiedono verifica.</p>}
      </details>
      {missing > 0 && <details className="diagnostics"><summary>Dettagli mancanti ({missing})</summary><ul>{catalog.stats.missingPreview.map((print) => <li key={print.id}>{print.id}: {print.error ?? 'Non ancora acquisito'}</li>)}</ul>{missing > 12 && <p>Mostrati i primi 12; gli altri saranno ripresi al prossimo aggiornamento.</p>}</details>}

    </>}
  </section>

  return <section className="catalog-section" aria-label="Catalogo occidentale"
    data-nav-loading={loading || (!!catalog?.syncedAt && (searchMode === 'quick'
      ? ((!page && !searchFailed) || pageLoading) : advancedLoading || advancedPageLoading) ||
      (!!selected && detailKeyLoaded !== selected.key))}>
    <div className="panel-heading">
      <div><h1>Catalogo</h1><p className="content-note">{catalog?.syncedAt ? `Aggiornato ${date(catalog.syncedAt)}${standard ? '' : ' · campione di prova'}` : 'Carte condivise fra i progetti'}</p></div>
      <div className="catalog-actions">
        <button type="button" className="primary-button" onClick={() => void syncStandard('new')} disabled={loading || busy || !syncStatus || !!progressError || (recoverableJob && syncStatus.mode !== 'new')}>
          {busy && <Spinner />}
          {busy ? syncStatus?.state === 'rate-limited' ? 'In attesa TCGdex…'
            : syncStatus?.mode === 'full' ? 'Scansione in corso…' : 'Aggiornamento in corso…'
            : recoverableJob && syncStatus?.mode === 'new' ? 'Riprendi aggiornamento' : 'Aggiorna nuove carte'}
        </button>
        <button type="button" id="catalog-management-trigger" className="secondary-button"
          aria-expanded={managementOpen} aria-controls="catalog-management" onClick={() => setManagementOpen(!managementOpen)}>Gestisci catalogo</button>
      </div>
    </div>
    {catalog?.rulePackageError && <p className="diagnostics" role="alert">{catalog.rulePackageError}</p>}
    {ruleHorizon?.status === 'expiring' && <p className="diagnostics" role="status">Il pacchetto Standard occidentale copre le date fino al {legalDate(ruleHorizon.until!)}. Questa è una scadenza cautelativa dell’app, non una data di rotazione annunciata: servirà una release con regole ricontrollate prima di allora.</p>}
    {ruleHorizon?.status === 'expired' && <p className="diagnostics" role="alert">Le regole Standard occidentali incluse terminano il {legalDate(ruleHorizon.until!)}. Date successive e nuovi aggiornamenti richiedono una release con regole verificate; le liste salvate restano consultabili.</p>}
    {currentRuleAudit?.status === 'changed' && <p className="diagnostics" role="alert">Fonti Standard cambiate · verifica le regole prima di fidarti dell’esito.</p>}
    {currentRuleAudit?.status === 'unavailable' && <p className="catalog-gap-summary" role="status">Fonti Standard non raggiungibili · ultimo controllo riuscito {currentRuleAudit.verifiedAt ? date(currentRuleAudit.verifiedAt) : 'mai'}.</p>}
    <DailySyncNotice state={syncStatus?.daily} active={syncStatus?.running} />
    <CatalogActivity status={syncStatus} requesting={requesting} controlling={controlPending} startedAt={startedAt}
      onResume={() => void syncStandard(syncStatus?.mode ?? 'new')}
      onPause={() => void controlStandard('pause')} onCancel={() => void controlStandard('cancel')} />
    {progressError && <p className="warning-banner" role="status">{progressError}</p>}
    {checkingRules && <ActivityStatus title="Controllo delle fonti Standard…" />}
    {syncStatus?.error && <p className="diagnostics" role="status">{syncStatus.error}</p>}
    {syncStatus?.rotationCleanup && <p className="content-note" role="status">
      Ultima pulizia Catalogo con {syncStatus.rotationCleanup.ruleVersion}: {syncStatus.rotationCleanup.removedPrints} stampe fuori rotazione rimosse dalla ricerca; {syncStatus.rotationCleanup.retainedReferences} schede storiche conservate solo per verificare import esatti.
    </p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {catalog?.syncedAt && gaps.length > 0 && <p className="catalog-gap-summary" role="status">{gaps.join(' · ')}.</p>}
    {management}
    {loading ? <LoadingSkeleton label="Apertura catalogo…" /> : !catalog?.syncedAt ? (
      <div className="matchup-empty">Catalogo vuoto. Usa <strong>Aggiorna nuove carte</strong> per iniziare.</div>
    ) : <>
      <div className="catalog-search-modes" role="group" aria-label="Modalità di ricerca">
        <button type="button" className={searchMode === 'quick' ? 'active' : ''}
          aria-pressed={searchMode === 'quick'} onClick={() => { setSearchMode('quick'); setOffset(0) }}>Ricerca rapida</button>
        <button type="button" className={searchMode === 'advanced' ? 'active' : ''}
          aria-pressed={searchMode === 'advanced'} onClick={() => { if (selected?.key) setSelectedKey(selected.key); setSearchMode('advanced'); setOffset(0) }}>Ricerca avanzata AI</button>
      </div>
      <div className="catalog-filters">
        {searchMode === 'quick' ? <label>Cerca carta o stampa<input id="catalog-query" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder="Es. Iono o sv02-185" /></label>
          : <form className="catalog-advanced-form" onSubmit={(event) => void runAdvancedSearch(event)}>
            <label htmlFor="catalog-advanced-query">Descrivi le carte da trovare</label>
            <textarea id="catalog-advanced-query" rows={2} maxLength={500} value={advancedQuery}
              onChange={(event) => { setAdvancedQuery(event.target.value); setAdvanced(null); setAdvancedPage(null) }}
              placeholder="Es. Carte che recuperano Energie dagli scarti" />
            <div className="catalog-advanced-actions">
              <button type="submit" className="primary-button" disabled={advancedLoading || advancedQuery.trim().length < 4}>
                {advancedLoading && <Spinner />}{advancedLoading ? 'Ricerca in corso…' : 'Cerca con AI'}</button>
              {advancedLoading && <button type="button" className="secondary-button" onClick={() => void cancelAdvancedSearch()}>Annulla</button>}
            </div>
            <p className="content-note">Codex riceve la domanda, la carta selezionata e le schede candidate locali. La lista del progetto viene usata solo se la nomini nella domanda. I risultati tattici sono suggerimenti da valutare.</p>
          </form>}
        <label>Espansione<select id="catalog-set-filter" value={setFilter} onChange={(event) => { setSetFilter(event.target.value); setOffset(0) }}><option value="all">Tutte</option>{catalog.sets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.id})</option>)}</select></label>
      </div>
      {searchMode === 'advanced' && advancedError && <p className="error-banner" role="alert">{advancedError}</p>}
      {searchMode === 'advanced' && advanced && <div className="catalog-advanced-summary" role="status">
        <strong>Filtro interpretato:</strong> {advanced.interpretation}
        <p>{advancedPage?.supported ?? advanced.page.supported} corrispondenze · {advancedPage?.possible ?? advanced.page.possible} da valutare{setFilter === 'all' ? '' : ' nell’espansione selezionata'}.</p>
        <p>Inventario locale al momento della ricerca: {advanced.scope.indexedPrints}/{advanced.scope.expectedPrints} stampe; {advanced.scope.comparablePrints} schede di gioco confrontabili.
          {advanced.scope.semantic ? ' Le interazioni tattiche non hanno una completezza dimostrabile.' : ''}
          {advanced.scope.reviewLimited ? ` Codex ha valutato ${advanced.scope.reviewedGroups}/${advanced.scope.candidateGroups} gruppi candidati; gli altri restano visibili come da valutare.` : ''}</p>
        {advanced.scope.eventSources.length > 0 ? <details><summary>Liste evento consultate ({advanced.scope.eventSources.length})</summary><ul>
          {advanced.scope.eventSources.map((source) => <li key={source.url}>{source.label}</li>)}
        </ul></details> : <p>Liste evento consultate: nessuna.</p>}
      </div>}
      <div className="catalog-layout">
        {searchMode === 'advanced' ? advancedLoading ? <LoadingSkeleton label="Codex sta cercando nel catalogo…" />
          : advancedPageLoading ? <LoadingSkeleton label="Caricamento risultati…" />
            : !advanced ? <div className="matchup-empty">Scrivi una domanda e premi <strong>Cerca con AI</strong>. I risultati compariranno nella lista del Catalogo.</div>
              : advancedPage?.total === 0 ? <SearchEmpty focusId="catalog-advanced-query" onReset={setFilter !== 'all' ? () => { setSetFilter('all'); setOffset(0) } : undefined}>Non ho trovato schede compatibili nel Catalogo locale. Il filtro interpretato è mostrato sopra: puoi cambiarlo o aggiornare il Catalogo.</SearchEmpty> : null
          : searchFailed ? <div className="error-banner" role="status">Ricerca non disponibile. <button type="button" className="text-button" onClick={() => setRevision((value) => value + 1)}>Riprova</button></div>
            : !page || pageLoading ? <LoadingSkeleton label="Ricerca nel catalogo…" /> : page.total === 0 ? <SearchEmpty focusId="catalog-query" onReset={query || setFilter !== 'all' ? () => { setQuery(''); setSetFilter('all'); setOffset(0) } : undefined}>Nessuna carta locale corrisponde alla ricerca.</SearchEmpty> : null}
        {visible.length > 0 && <>
        <div className="catalog-list" aria-label="Risultati catalogo">
          <p className="content-note">{searchMode === 'advanced' ? advancedPage?.total : page?.total} risultati · {((searchMode === 'advanced' ? advancedPage?.offset : page?.offset) ?? 0) + 1}–{((searchMode === 'advanced' ? advancedPage?.offset : page?.offset) ?? 0) + visible.length}</p>{visible.map((group) => <button type="button" key={group.key} className={selected?.key === group.key ? 'active' : ''} onClick={() => searchMode === 'advanced'
            ? setSelectedKey(group.key)
            : nav.visit({ 'catalog.selected': group.key, 'catalog.focusConsumed': true }, `Catalogo · ${group.name}`, { preservePosition: true })} aria-pressed={selected?.key === group.key}
            {...preview({ name: group.name, identityId: group.key })}>
            <strong>{group.name}</strong><span>{group.printCount} {group.printCount === 1 ? 'stampa' : 'stampe'}{group.basis && group.basis !== 'unverified' ? '' : ' · equivalenza da verificare'}</span>
            {isAdvancedMatch(group) && <><span className={group.assessment === 'possible' ? 'catalog-advanced-possible' : 'catalog-advanced-supported'}>{group.assessment === 'possible' ? 'Da valutare' : 'Corrispondenza'}</span><span>{group.reason}</span>{group.conditions && <span>{group.conditions}</span>}<span>Scheda locale: {group.sourcePrintId}</span></>}
          </button>)}
          {(searchMode === 'advanced' ? advancedPage?.total ?? 0 : page?.total ?? 0) > 100 && <div className="catalog-page-controls">
            <button type="button" className="secondary-button" disabled={(searchMode === 'advanced' ? advancedPage?.offset ?? 0 : page?.offset ?? 0) === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Precedenti</button>
            <button type="button" className="secondary-button" disabled={(searchMode === 'advanced' ? advancedPage?.offset ?? 0 : page?.offset ?? 0) + 100 >= (searchMode === 'advanced' ? advancedPage?.total ?? 0 : page?.total ?? 0)} onClick={() => setOffset(offset + 100)}>Successivi</button>
          </div>}
        </div>
        <div className="catalog-detail">
          {selected && (selectedPrints.length ? <CatalogCardDetail key={selected.key} name={selected.name} basis={selected.basis} prints={selectedPrints} />
            : detailKeyLoaded === selected.key ? <p className="diagnostics" role="status">Dettaglio carta non disponibile.</p>
              : <LoadingSkeleton label="Caricamento dettaglio carta…" />)}
        </div></>}
      </div>
    </>}
  </section>
}
