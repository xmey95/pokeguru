import type { CatalogPrint } from '../../shared/catalog'
import { hasComparableGameplay } from '../../shared/card-gameplay'
import { CardFace } from './CardOverview'
import { CardThumbnail } from './CardThumbnail'
import { useNavigation, useViewState } from './Navigation'

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function legalDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
function promoStatus(print: CatalogPrint) {
  const promo = print.promoStatus
  return promo?.state === 'available' ? 'Disponibile nel registro alla data del controllo'
    : promo?.state === 'upcoming' ? `Promo futura nel registro${promo.legalDate ? ` · dal ${legalDate(promo.legalDate)}` : ` · ${promo.dateNote ?? 'data da verificare'}`}`
      : promo?.state === 'unlisted' ? 'Promo non elencata · ammissione da verificare' : 'Promo da verificare'
}

export function CatalogCardDetail({ name, basis, prints }: {
  name: string
  basis: CatalogPrint['identityBasis']
  prints: CatalogPrint[]
}) {
  const nav = useNavigation()
  const [printId, setPrintId] = useViewState<string | null>('catalog.print', null)
  const complete = prints.filter((print) => hasComparableGameplay(print.category, print.stage ?? null, print.energyType ?? null, print.gameplay ?? null))
  const withText = complete.length ? complete : prints.filter((print) => print.gameplay)
  const preferred = withText.find((print) => print.thumbnail) ?? withText[0] ?? prints.find((print) => print.thumbnail) ?? prints[0]
  const current = prints.find((print) => print.id === printId) ?? preferred
  if (!current) return null
  function showPrint(id: string) {
    setPrintId(id)
    requestAnimationFrame(() => { if (nav.isCurrent()) document.getElementById('catalog-card-heading')?.focus() })
  }
  return <>
    <h2 id="catalog-card-heading" tabIndex={-1}>{name}</h2>
    {(!basis || basis === 'unverified') && <p className="content-note catalog-card-notice">Equivalenza delle stampe da verificare.</p>}
    {current.isPromo && current.promoStatus?.state !== 'available' && <p className="catalog-card-notice diagnostics" role="status">{promoStatus(current)}</p>}
    {current.error && <p className="catalog-card-notice diagnostics" role="status">{current.error}</p>}
    <CardFace print={current} imagePrint={current} />
    <details className="catalog-card-prints" id="catalog-card-prints">
      <summary>Stampe e metadati ({prints.length})</summary>
      {basis && basis !== 'unverified' && <p className="content-note">Stampe collegate per regole di gioco coincidenti.</p>}
      <div className="catalog-print-grid">{prints.map((print) => <article key={print.id} className="catalog-print">
        <CardThumbnail key={print.thumbnail ?? print.id} src={print.thumbnail} />
        <div><strong>{print.setName} · {print.localId}</strong>
          <span>{print.setId}{print.rarity ? ` · ${print.rarity}` : ''} · Marchio {print.regulationMark ?? 'non indicato'}</span>
          {print.isPromo && <span>{promoStatus(print)}{print.promoStatus ? ` · controllo ${date(print.promoStatus.checkedAt)}` : ''}</span>}
          {print.variants && <span>Varianti: {Object.entries(print.variants).filter(([, yes]) => yes).map(([name]) => name).join(', ') || 'nessuna indicata'}</span>}
          {print.highImageAvailable && <span>Immagine grande disponibile online</span>}
          {print.thumbnail && <span>Immagine: {print.imageBase?.startsWith('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/') ? 'Limitless' : 'TCGdex'}</span>}
          {print.sourceUpdated && <span>Fonte aggiornata: {date(print.sourceUpdated)}</span>}
          {print.error && <span className="catalog-error">{print.error}</span>}
          {!print.gameplay && <span>Testo di gioco non acquisito</span>}
          <div className="catalog-print-actions">
            <button type="button" className="text-button" aria-pressed={print.id === current.id}
              aria-label={`Mostra stampa ${print.setId} ${print.localId}`} onClick={() => showPrint(print.id)}>
              {print.id === current.id ? 'Stampa visualizzata' : 'Mostra questa stampa'}</button>
          </div>
        </div>
      </article>)}</div>
    </details>
  </>
}
