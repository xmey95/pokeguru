import { useEffect, useMemo, useState } from 'react'
import type { CatalogPrint, CatalogSyncMode, CatalogSyncStatus, CatalogView } from '../../shared/catalog'
import type { StandardRuleAudit } from '../../shared/standard-rule-audit'

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
  const sourceTotal = catalog?.sets.reduce((sum, set) => sum + set.sourceTotal, 0) ?? 0
  const acquired = catalog?.prints.filter((print) => print.detailAt !== null) ?? []
  const missing = catalog?.prints.filter((print) => print.detailAt === null) ?? []
  const rarityCount = acquired.filter((print) => print.rarity !== null).length
  const variantCount = acquired.filter((print) => print.variants !== null).length
  const thumbnailCount = acquired.filter((print) => print.thumbnail !== null).length
  const highCount = acquired.filter((print) => print.highImageAvailable === true).length
  const confirmedGroups = groups.filter((group) => group.basis === 'trainer-text').length
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
    {standard ? <p className="content-note">Inventario TCGdex occidentale con marchi H e successivi, serie promo individuate dinamicamente ed Energie Base. I marchi successivi a J sono candidati di catalogo: richiedono regole di legalità aggiornate. I dati sono condivisi fra progetti.</p>
      : <p className="content-note">Campione dichiarato: {catalog?.scope.setIds.join(', ') ?? 'sv01, sv02, sv04.5, me01, me02.5'}; Arven, Boss’s Orders, Iono, Mew ex, Nest Ball, Professor’s Research, Rare Candy, Ultra Ball, Mega Absol ex e Mega Audino ex. Fonte TCGdex in inglese (metadato tecnico), circuito occidentale. Il catalogo è identico in tutti i progetti.</p>}
    <section className="rotation-panel" aria-label="Fonti delle regole Standard">
      <strong>Regole Standard occidentali · pacchetto {catalog?.rulePackage?.version ?? 'in caricamento'}</strong>
      {catalog?.rulePackageError && <p role="alert">{catalog.rulePackageError}</p>}
      <p>{!ruleAudit ? 'Fonti online non ancora ricontrollate da questa installazione.'
        : ruleAudit.status === 'matching' ? `Fonti coerenti con il pacchetto locale al ${date(ruleAudit.checkedAt)}.`
          : ruleAudit.status === 'changed' ? `Fonte cambiata o non interpretabile al ${date(ruleAudit.checkedAt)}: revisione delle regole necessaria.`
            : `Fonti non raggiungibili al ${date(ruleAudit.checkedAt)}; ultima verifica riuscita ${ruleAudit.verifiedAt ? date(ruleAudit.verifiedAt) : 'mai'}.`}</p>
      <p>Rotazione e ammissione dei set sono controllate sulle pagine ufficiali; le promo si aggiornano con il registro del Catalogo. Una variazione non modifica automaticamente il pacchetto locale.</p>
      {ruleAudit?.sources.map((source) => <p key={source.id}>{source.id === 'rotation-2026' ? 'Rotazione 2026' : 'Attesa dei prodotti'}: {source.status === 'matching' ? 'coerente' : source.status === 'changed' ? 'da rivedere' : 'non raggiungibile'} · {source.detail}{' '}
        <button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource(source.id === 'rotation-2026' ? 'play-2026-01-09' : 'set-admission')}>Fonte ↗</button></p>)}
      <button type="button" className="secondary-button" disabled={checkingRules} onClick={() => void checkRules()}>{checkingRules ? 'Controllo in corso…' : 'Controlla fonti Standard'}</button>
    </section>
    {catalog?.syncedAt && <p className="content-note">Ultimo aggiornamento: {date(catalog.syncedAt)}. Ricerca e miniature già scaricate funzionano offline. Le nuove acquisizioni richiedono rete.</p>}
    {syncStatus && syncStatus.state !== 'idle' && <p className="content-note" role="status">{syncStatus.phase}: {syncStatus.acquired}/{syncStatus.expected || '?'} dettagli controllati. {syncStatus.running ? 'Puoi usare le altre sezioni mentre il lavoro prosegue.' : syncStatus.state === 'paused' ? 'Il lavoro riprenderà senza riscaricare i lotti completati.' : ''}</p>}
    {syncStatus?.error && <p className="diagnostics" role="status">{syncStatus.error}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Apertura catalogo…</p> : !catalog?.syncedAt ? (
      <div className="matchup-empty">Nessun dato acquisito. Premi <strong>Aggiorna nuove carte</strong> per avviare l'acquisizione oppure <strong>Sincronizza campione</strong> per la prova rapida.</div>
    ) : <>
      <div className="catalog-metrics" aria-label={standard ? 'Copertura dell’inventario Standard' : 'Copertura del campione'}>
        {standard ? <>
          <div><strong>{catalog.standardCoverage?.acquired ?? 0}/{catalog.standardCoverage?.expected ?? 0}</strong><span>Dettagli dell’inventario con marchio acquisiti</span></div>
          <div><strong>{catalog.standardCoverage?.missing ?? 0}</strong><span>Dettagli ancora mancanti</span></div>
          <div><strong>{catalog.standardCoverage?.promos.acquired ?? 0}/{catalog.standardCoverage?.promos.expected ?? 0}</strong><span>Promo con marchio, dettagli acquisiti</span></div>
          <div><strong>{catalog.standardCoverage?.promos.series ?? 0}</strong><span>Serie promo riconosciute</span></div>
          <div><strong>{catalog.scope.setIds.length}</strong><span>Set con stampe nell’inventario</span></div>
          <div><strong>{catalog.standardCoverage?.officialSets.present ?? 0}/{catalog.standardCoverage?.officialSets.expected ?? 0}</strong><span>Set rilasciati nel calendario ufficiale presenti nel manifest</span></div>
          <div><strong>{groups.length}</strong><span>Gruppi locali, equivalenza da verificare</span></div>
        </> : <>
        <div><strong>{catalog.sets.length}/{catalog.scope.setIds.length}</strong><span>Set acquisiti</span></div>
        <div><strong>{acquired.length}/{sampled}</strong><span>Stampe del campione con dettaglio</span></div>
        <div><strong>{acquired.length}/{sourceTotal}</strong><span>Stampe dei set interi</span></div>
        <div><strong>{groups.length}/?</strong><span>Gruppi locali; identità della fonte non misurabili</span></div>
        <div><strong>{rarityCount}/{sampled}</strong><span>Rarità note</span></div>
        <div><strong>{variantCount}/{sampled}</strong><span>Varianti note</span></div>
        <div><strong>{thumbnailCount}/{sampled}</strong><span>Miniature verificate e salvate</span></div>
        <div><strong>{highCount}/{sampled}</strong><span>Immagini grandi verificate online</span></div>
        </>}
      </div>
      {standard && catalog.standardCoverage && <details className="catalog-set-coverage" open>
        <summary>Copertura per set · {catalog.standardCoverage.bySet.filter((set) => set.missing > 0).length} con dettagli mancanti</summary>
        <p className="content-note">Audit dei set ufficiali: {catalog.standardCoverage.officialSets.present}/{catalog.standardCoverage.officialSets.expected} presenti nel manifest, {catalog.standardCoverage.officialSets.missing} mancanti. Il calendario è uno snapshot controllato il {legalDate(catalog.standardCoverage.releaseSource.checkedAt)}; la presenza di un set non certifica tutte le sue stampe né la legalità.</p>
        {catalog.standardCoverage.officialSets.missing > 0 && <div className="diagnostics" role="status"><strong>Set ufficiali non presenti nel manifest</strong><ul>{catalog.standardCoverage.officialSets.missingSets.map((set) => <li key={set.setId}>{set.product} ({set.setId})</li>)}</ul></div>}
        <p className="content-note">«Nel perimetro» conta le stampe presenti nel manifest TCGdex; «Totale set» include anche stampe fuori dal filtro. Date di uscita ufficiali: pacchetto v{catalog.standardCoverage.releaseSource.version}, controllato il {legalDate(catalog.standardCoverage.releaseSource.checkedAt)}.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('set-releases')}>Calendario prodotti Pokémon ↗</button> Le date di uscita non sono date di ammissione ai tornei.</p>
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
      {standard ? <>
        <p className="content-note">Denominatore: stampe TCGdex con marchio H–Z (anche minuscolo) più Energie Base `sve`/`mee`, rilevate il {catalog.syncedAt ? date(catalog.syncedAt) : '—'}. Aggiorna nuove carte scarica soltanto i dettagli mancanti; Scansione completa ricontrolla tutti i dettagli. I dati validi restano conservati se una richiesta fallisce. Miniature non scaricate in massa.</p>
        <p className="content-note">Promo: {catalog.standardCoverage?.promos.available ?? 0} disponibili nel pacchetto verificato · {catalog.standardCoverage?.promos.upcoming ?? 0} future · {catalog.standardCoverage?.promos.unlisted ?? 0} non elencate · {catalog.standardCoverage?.promos.unchecked ?? 0} non verificate. Pacchetto v{catalog.promoAudit?.packageVersion ?? '—'} {catalog.promoAudit?.complete ? 'con tutte le righe del registro osservato' : 'parziale'}, controllato il {catalog.promoAudit?.checkedAt ? date(catalog.promoAudit.checkedAt) : 'mai'}.
          {' '}<button type="button" className="text-button" onClick={() => void window.projectsApi.openStandardSource('promo')}>Registro promo ufficiale ↗</button>
        </p>
        {catalog.promoAudit?.error && <p className="diagnostics" role="status">Pacchetto promo online non aggiornato: {catalog.promoAudit.error}. Resta disponibile la versione locale datata; le promo non coperte rimangono da verificare.</p>}
      </>
        : <p className="content-note">Denominatori delle stampe: indice dei {catalog.sets.length} set TCGdex ({catalog.sets.map((set) => `${set.id}: ${set.sourceTotal}`).join('; ')}). {confirmedGroups} identità Trainer collegate per testo coincidente; le altre richiedono verifica. La copertura delle identità di gioco dell’intera fonte non è misurabile.</p>}
      {missing.length > 0 && <div className="diagnostics" role="status"><strong>Dettagli mancanti ({missing.length})</strong><ul>{missing.slice(0, 12).map((print) => <li key={print.id}>{print.id}: {print.error ?? 'Non ancora acquisito'}</li>)}</ul>{missing.length > 12 && <p>Mostrati i primi 12; gli altri saranno ripresi al prossimo aggiornamento.</p>}</div>}
      <div className="catalog-filters">
        <label>Ricerca carta, set, stampa o rarità<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Iono o sv02-185" /></label>
        <label>Espansione<select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}><option value="all">Tutte</option>{catalog.sets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.id})</option>)}</select></label>
      </div>
      <div className="catalog-layout">
        <div className="catalog-list" aria-label="Risultati catalogo">
          {filtered.length === 0 ? <p className="content-note">Nessuna carta locale corrisponde alla ricerca.</p> : <>{filtered.length > 100 && <p className="content-note">{filtered.length} risultati; mostrati i primi 100. Restringi la ricerca per trovare altre carte.</p>}{visible.map((group) => <button type="button" key={group.key} className={selected?.key === group.key ? 'active' : ''} onClick={() => setSelectedKey(group.key)}>
            <strong>{group.name}</strong><span>{group.prints.length} {group.prints.length === 1 ? 'stampa' : 'stampe'} · {group.basis === 'trainer-text' ? 'testo di gioco coincidente' : 'equivalenza da verificare'}</span>
          </button>)}</>}
        </div>
        <div className="catalog-detail">
          {selected && <>
            <h3>{selected.name}</h3>
            {onConstrain && selected.prints.some((print) => print.detailAt && print.identityId) &&
              <button type="button" className="secondary-button" onClick={() => onConstrain(selected.key)}>Aggiungi vincolo su questa carta</button>}
            <p className="content-note">{selected.category ?? 'Categoria non disponibile'} · {selected.basis === 'trainer-text' ? 'Stampe collegate perché nome, tipo e testo di gioco coincidono. Legalità e possibili errata non ancora verificate.' : 'Equivalenza competitiva non verificata: questa stampa resta separata.'}</p>
            <div className="catalog-print-grid">{selectedPrints.map((print) => <article key={print.id} className="catalog-print">
              {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
              <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span><span>Rarità: {print.rarity ?? 'non disponibile'}</span><span>Marchio: {print.regulationMark ?? 'non disponibile'}</span>
                {print.isPromo && <span>Registro promo: {print.promoStatus?.state === 'available' ? 'disponibile alla data del controllo' :
                  print.promoStatus?.state === 'upcoming' ? `futura · ${print.promoStatus.legalDate ? `dal ${legalDate(print.promoStatus.legalDate)}` : print.promoStatus.dateNote ?? 'data da verificare'}` :
                    print.promoStatus?.state === 'unlisted' ? 'non elencata · da verificare' : 'non verificata'}
                  {print.promoStatus && ` · controllo ${date(print.promoStatus.checkedAt)}`}</span>}
                <span>Varianti: {print.variants ? Object.entries(print.variants).filter(([, yes]) => yes).map(([name]) => name).join(', ') || 'nessuna indicata' : 'non disponibili'}</span><span>Immagine grande: {print.highImageAvailable === null ? 'non verificabile' : print.highImageAvailable ? 'disponibile online' : 'non disponibile'}</span><span>Fonte aggiornata: {print.sourceUpdated ? date(print.sourceUpdated) : 'non indicata'}</span>{print.error && <span className="catalog-error">{print.error}</span>}<button type="button" className="text-button" onClick={() => void openSource(print.sourceUrl)}>Apri scheda fonte ↗</button></div>
            </article>)}</div>
          </>}
        </div>
      </div>
    </>}
  </section>
}
