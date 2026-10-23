import { useEffect, useMemo, useState } from 'react'
import type { CatalogPrint, CatalogView } from '../../shared/catalog'

function date(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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

export function CatalogSection() {
  const [catalog, setCatalog] = useState<CatalogView | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [setFilter, setSetFilter] = useState('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

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
  const selected = filtered.find((group) => group.key === selectedKey) ?? filtered[0]
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

  return <section className="catalog-section" aria-label="Catalogo occidentale">
    <div className="panel-heading">
      <div><span className="eyebrow">Catalogo condiviso · Standard occidentale</span><h2>Carte e ristampe</h2></div>
      <button type="button" className="primary-button" onClick={() => void sync()} disabled={busy}>
        {busy ? 'Sincronizzazione…' : catalog?.syncedAt ? 'Aggiorna campione' : 'Sincronizza campione'}
      </button>
    </div>
    <p className="content-note">Campione dichiarato: {catalog?.scope.setIds.join(', ') ?? 'sv01, sv02, sv04.5'}; Arven, Boss’s Orders, Iono, Mew ex, Nest Ball, Professor’s Research, Rare Candy e Ultra Ball. Fonte TCGdex in inglese (metadato tecnico), circuito occidentale. Il catalogo è identico in tutti i progetti.</p>
    {catalog?.syncedAt && <p className="content-note">Ultimo aggiornamento: {date(catalog.syncedAt)}. Ricerca e miniature già scaricate funzionano offline. Le nuove acquisizioni richiedono rete.</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="content-note">Apertura catalogo…</p> : !catalog?.syncedAt ? (
      <div className="matchup-empty">Nessun dato acquisito. Premi <strong>Sincronizza campione</strong> per scaricare le carte selezionate.</div>
    ) : <>
      <div className="catalog-metrics" aria-label="Copertura del campione">
        <div><strong>{catalog.sets.length}/3</strong><span>Set acquisiti</span></div>
        <div><strong>{acquired.length}/{sampled}</strong><span>Stampe del campione con dettaglio</span></div>
        <div><strong>{acquired.length}/{sourceTotal}</strong><span>Stampe dei set interi</span></div>
        <div><strong>{groups.length}/?</strong><span>Gruppi locali; identità della fonte non misurabili</span></div>
        <div><strong>{rarityCount}/{sampled}</strong><span>Rarità note</span></div>
        <div><strong>{variantCount}/{sampled}</strong><span>Varianti note</span></div>
        <div><strong>{thumbnailCount}/{sampled}</strong><span>Miniature verificate e salvate</span></div>
        <div><strong>{highCount}/{sampled}</strong><span>Immagini grandi verificate online</span></div>
      </div>
      <p className="content-note">Denominatori delle stampe: indice dei {catalog.sets.length} set TCGdex ({catalog.sets.map((set) => `${set.id}: ${set.sourceTotal}`).join('; ')}). {confirmedGroups} identità Trainer collegate per testo coincidente; le altre richiedono verifica. La copertura delle identità di gioco dell’intera fonte non è misurabile.</p>
      {missing.length > 0 && <div className="diagnostics" role="status"><strong>Dettagli mancanti ({missing.length})</strong><ul>{missing.map((print) => <li key={print.id}>{print.id}: {print.error ?? 'Dato non disponibile'}</li>)}</ul></div>}
      <div className="catalog-filters">
        <label>Ricerca carta, set, stampa o rarità<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Es. Iono o sv02-185" /></label>
        <label>Espansione<select value={setFilter} onChange={(event) => setSetFilter(event.target.value)}><option value="all">Tutte</option>{catalog.sets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.id})</option>)}</select></label>
      </div>
      <div className="catalog-layout">
        <div className="catalog-list" aria-label="Risultati catalogo">
          {filtered.length === 0 ? <p className="content-note">Nessuna carta nel campione corrisponde alla ricerca.</p> : filtered.map((group) => <button type="button" key={group.key} className={selected?.key === group.key ? 'active' : ''} onClick={() => setSelectedKey(group.key)}>
            <strong>{group.name}</strong><span>{group.prints.length} {group.prints.length === 1 ? 'stampa' : 'stampe'} · {group.basis === 'trainer-text' ? 'testo di gioco coincidente' : 'equivalenza da verificare'}</span>
          </button>)}
        </div>
        <div className="catalog-detail">
          {selected && <>
            <h3>{selected.name}</h3>
            <p className="content-note">{selected.category ?? 'Categoria non disponibile'} · {selected.basis === 'trainer-text' ? 'Stampe collegate perché nome, tipo e testo di gioco coincidono. Legalità e possibili errata non ancora verificate.' : 'Equivalenza competitiva non verificata: questa stampa resta separata.'}</p>
            <div className="catalog-print-grid">{selectedPrints.map((print) => <article key={print.id} className="catalog-print">
              {print.thumbnail ? <img src={print.thumbnail} alt={`Carta ${print.name}, ${print.setName} ${print.localId}`} /> : <div className="catalog-no-image">Miniatura assente</div>}
              <div><strong>{print.setName}</strong><span>{print.setId} · N. {print.localId}</span><span>Rarità: {print.rarity ?? 'non disponibile'}</span><span>Varianti: {print.variants ? Object.entries(print.variants).filter(([, yes]) => yes).map(([name]) => name).join(', ') || 'nessuna indicata' : 'non disponibili'}</span><span>Immagine grande: {print.highImageAvailable === null ? 'non verificabile' : print.highImageAvailable ? 'disponibile online' : 'non disponibile'}</span><span>Fonte aggiornata: {print.sourceUpdated ? date(print.sourceUpdated) : 'non indicata'}</span>{print.error && <span className="catalog-error">{print.error}</span>}<button type="button" className="text-button" onClick={() => void openSource(print.sourceUrl)}>Apri scheda fonte ↗</button></div>
            </article>)}</div>
          </>}
        </div>
      </div>
    </>}
  </section>
}
