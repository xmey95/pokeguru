const deck = [
  ['Pokémon', 3, 'Mega Absol ex', 'MEG 086'],
  ['Pokémon', 2, 'Mega Audino ex', 'ASC 172'],
  ['Pokémon', 3, 'Ralts', 'Esempio'],
  ['Pokémon', 2, 'Kirlia', 'Esempio'],
  ['Pokémon', 1, 'Gardevoir ex', 'Esempio'],
  ['Pokémon', 2, 'Munkidori', 'Esempio'],
  ['Pokémon', 1, 'Fezandipiti ex', 'Esempio'],
  ['Pokémon', 1, 'Budew', 'Esempio'],
  ['Pokémon', 1, 'Manaphy', 'Esempio'],
  ['Allenatori', 4, 'Iono', 'Esempio'],
  ['Allenatori', 4, 'Arven', 'Esempio'],
  ['Allenatori', 3, 'Professor’s Research', 'Esempio'],
  ['Allenatori', 2, 'Boss’s Orders', 'Esempio'],
  ['Allenatori', 4, 'Rare Candy', 'Esempio'],
  ['Allenatori', 4, 'Ultra Ball', 'Esempio'],
  ['Allenatori', 4, 'Nest Ball', 'Esempio'],
  ['Allenatori', 2, 'Earthen Vessel', 'Esempio'],
  ['Allenatori', 2, 'Night Stretcher', 'Esempio'],
  ['Allenatori', 1, 'Counter Catcher', 'Esempio'],
  ['Allenatori', 1, 'Super Rod', 'Esempio'],
  ['Allenatori', 1, 'Technical Machine: Evolution', 'Esempio'],
  ['Allenatori', 1, 'Unfair Stamp', 'Esempio'],
  ['Energie', 11, 'Psychic Energy', 'Esempio']
].map(([group, quantity, name, print]) => ({ group, quantity, name, print }))

const groups = ['Pokémon', 'Allenatori', 'Energie']
const themes = {
  tactical: { name: 'Banco tattico', number: '01', note: 'Concentrazione · ritmo · decisione' },
  editorial: { name: 'Archivio editoriale', number: '02', note: 'Carte · lettura · provenienza' },
  arena: { name: 'Arena analitica', number: '03', note: 'Densità · confronto · energia' }
}
const viewLabels = { list: 'Lista', thread: 'Thread', matchup: 'Matchup' }
const scenarioLabels = { loaded: 'Lista caricata', empty: 'Vuoto', loading: 'Caricamento', error: 'Errore', long: 'Contenuto lungo' }
const params = new URLSearchParams(location.search)
if (params.has('capture')) document.body.classList.add('capture')
const state = {
  theme: themes[params.get('theme')] ? params.get('theme') : 'tactical',
  view: viewLabels[params.get('view')] ? params.get('view') : 'thread',
  scenario: scenarioLabels[params.get('state')] ? params.get('state') : 'loaded',
  selectedCard: null,
  comparison: false
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const groupCount = (group) => deck.filter((card) => card.group === group).reduce((sum, card) => sum + card.quantity, 0)
const icon = (name) => {
  const paths = {
    list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    thread: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>',
    matchup: '<path d="m4 4 16 16M20 4 4 20M9 5 5 9M15 5l4 4M5 15l4 4M19 15l-4 4"/>',
    catalog: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    event: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5M12 14v5M8 20h8"/>',
    settings: '<path d="M4 7h16M4 17h16M4 12h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="11" cy="17" r="2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>'
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

function updateUrl() {
  const url = new URL(location.href)
  url.searchParams.set('theme', state.theme)
  url.searchParams.set('view', state.view)
  url.searchParams.set('state', state.scenario)
  history.replaceState(null, '', url)
}

function toolbar() {
  return `<div class="preview-toolbar" aria-label="Controlli del mockup">
    <div class="preview-intro"><span class="preview-kicker">POKÉGURU / ESPLORAZIONE VISIVA</span><strong>Tre direzioni, stessi dati</strong></div>
    <div class="theme-switcher" role="group" aria-label="Direzione visiva">
      ${Object.entries(themes).map(([key, theme]) => `<button type="button" data-theme-choice="${key}" aria-pressed="${state.theme === key}"><span>${theme.number}</span>${theme.name}</button>`).join('')}
    </div>
    <label class="scenario-control">Scenario <select id="scenario">${Object.entries(scenarioLabels).map(([key, label]) => `<option value="${key}" ${state.scenario === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <span class="fixture-note">Fixture UI · nessuna fonte o AI live</span>
  </div>`
}

function navButton(view, label, iconName) {
  return `<button type="button" class="nav-button ${state.view === view ? 'active' : ''}" data-view-choice="${view}" ${state.view === view ? 'aria-current="page"' : ''} title="${label}">${icon(iconName)}<span>${label}</span></button>`
}

function sidebar() {
  return `<aside class="sidebar" aria-label="Navigazione Pokéguru">
    <div class="brand"><img src="../../resources/brand/pokeguru.svg" alt="" /><div><strong>Pokéguru</strong><span>Analisi competitiva</span></div></div>
    <button type="button" class="project-switch" title="Progetto: Mega Absol / Mega Audino"><span class="project-overline">PROGETTO ATTIVO</span><strong>Mega Absol /<br/> Mega Audino</strong>${icon('chevron')}</button>
    <nav class="nav-group" aria-label="Area di lavoro"><p class="nav-caption">AREA DI LAVORO</p>${navButton('list', 'Lista', 'list')}${navButton('thread', 'Thread', 'thread')}${navButton('matchup', 'Matchup', 'matchup')}</nav>
    <nav class="nav-group resource-group" aria-label="Risorse globali"><p class="nav-caption">RISORSE</p><span class="resource-item">${icon('catalog')}<span>Catalogo</span></span><span class="resource-item">${icon('event')}<span>Eventi</span></span><span class="resource-item">${icon('settings')}<span>Impostazioni AI</span></span></nav>
    <div class="sidebar-foot"><span class="online-dot"></span> Archivio locale</div>
  </aside>`
}

function topbar() {
  return `<div class="topbar"><span class="breadcrumb">Pokéguru <b>/</b> ${viewLabels[state.view]}</span><span class="topbar-meta">STANDARD OCCIDENTALE · v1</span></div>`
}

function statusBanner() {
  if (state.scenario !== 'error') return ''
  return `<div class="notice error-notice" role="alert"><div><strong>Operazione non completata</strong><p>La fonte non è raggiungibile. I dati salvati restano disponibili; riprova quando la connessione torna attiva.</p></div><button type="button" data-action="retry" class="quiet-button">Riprova</button></div>`
}

function pageIntro(kicker, title, subtitle) {
  return `<div class="page-intro"><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>`
}

function skeleton() {
  return `<div class="skeleton-wrap" role="status" aria-label="Caricamento dimostrativo"><div class="skeleton skeleton-wide"></div><div class="skeleton skeleton-short"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><p>Caricamento del contenuto…</p></div>`
}

function cardRows(items, compact = false) {
  return items.map((card, index) => `<button type="button" class="card-row ${compact ? 'compact' : ''}" data-card="${escapeHtml(card.name)}">
      <span class="quantity">${card.quantity}</span>${compact ? '' : `<span class="card-thumb" aria-hidden="true"><i>${index % 3 === 0 ? '✦' : '◆'}</i></span>`}
      <span class="card-name">${escapeHtml(card.name)}</span><span class="card-print">${escapeHtml(card.print)}</span>
    </button>`).join('')
}

function deckSections(compact = false) {
  return groups.map((group) => `<section class="deck-group"><h3><span>${group}</span><b>${groupCount(group)}</b></h3>${cardRows(deck.filter((card) => card.group === group), compact)}</section>`).join('')
}

function listView() {
  if (state.scenario === 'empty') return `${pageIntro('MAZZO / VERSIONE PRINCIPALE', 'Inizia dalla tua lista', 'Importa il testo di Pokémon TCG Live o Limitless. Potrai rivedere le carte prima di usare l’AI.')}
    <section class="surface empty-state"><span class="empty-symbol">＋</span><h2>Aggiungi una lista</h2><p>Incolla il testo oppure scegli un file .txt. Il progetto resta disponibile anche senza carte.</p><textarea aria-label="Testo della lista" placeholder="Pokémon: 16&#10;3 Mega Absol ex MEG 86&#10;…"></textarea><div class="button-row"><button class="secondary-button">Scegli file .txt</button><button class="primary-button">Salva lista</button></div></section>`
  return `${pageIntro('MAZZO / VERSIONE PRINCIPALE', 'Lista principale', 'Mega Absol / Mega Audino · v1')}
    ${statusBanner()}
    <section class="surface list-head"><div class="list-head-main"><strong class="big-total">60<span>/60</span></strong><div><h2>Carte del mazzo</h2><p><span class="status-chip caution">Standard: da verificare</span> <span class="muted-inline">3 controlli aperti</span></p></div></div><div class="button-row"><button class="secondary-button">Copia export</button><button class="primary-button">Importa / sostituisci</button></div></section>
    <div class="category-summary">${groups.map((group) => `<span><b>${groupCount(group)}</b>${group}</span>`).join('')}</div>
    <div class="content-grid ${state.selectedCard ? 'has-detail' : ''}"><section class="surface list-surface">${deckSections()}</section>${state.selectedCard ? cardDetail() : ''}</div>`
}

function cardDetail() {
  return `<aside class="surface card-detail"><button type="button" class="quiet-button close-detail" data-action="close-card">Chiudi</button><div class="card-portrait"><span>${escapeHtml(state.selectedCard?.slice(0, 1) ?? 'M')}</span><small>IMMAGINE DI ESEMPIO</small></div><span class="eyebrow">DETTAGLIO CARTA</span><h2>${escapeHtml(state.selectedCard)}</h2><p class="card-meta">3 copie · Stampa da verificare</p><p>Testo di gioco e vincoli sono mostrati qui nella vista reale. Questo mockup usa contenuto illustrativo.</p><details><summary>Stampe e varianti</summary><p>Le stampe note sono collegate all’identità di gioco.</p></details><details><summary>Testo importato e controlli</summary><p>La riga originale resta disponibile senza occupare il primo livello.</p></details></aside>`
}

function threadMessages() {
  const entries = [
    ['Tu', 'Vorrei conservare più risorse per il finale. Quale variante proveresti?'],
    ['Codex', 'Proverei una distribuzione diversa delle copie e confronterei l’avvio con la lista principale. La candidata resta da verificare prima dell’adozione.']
  ]
  if (state.scenario === 'long') for (let i = 0; i < 12; i++) entries.push([i % 2 ? 'Codex' : 'Tu', i % 2 ? 'Rivediamo la curva delle risorse e il ruolo delle carte di ricerca. Le fonti del turno restano associate a questa risposta.' : 'Osservazione di prova: confronto il piano con le partite giocate e tengo distinta l’ipotesi dai risultati.'])
  return entries.map(([author, message], index) => `<article class="message ${author === 'Codex' ? 'assistant-message' : 'user-message'}"><div class="message-meta"><strong>${author}</strong><span>${index < 2 ? '26 ott · 12:53' : 'Turno ' + (index + 1)}</span></div><p>${message}</p>${author === 'Codex' ? '<details><summary>Fonti e dati del turno</summary><p>Fixture UI: nessuna interrogazione reale eseguita.</p></details>' : ''}</article>`).join('')
}

function threadView() {
  if (state.scenario === 'empty') return `${pageIntro('PERCORSI / AI', 'Thread', 'Ogni conversazione segue una versione della lista e conserva le proposte separatamente.')}
    <section class="surface empty-state"><span class="empty-symbol">✦</span><h2>Apri un percorso</h2><p>Scrivi un obiettivo o una domanda. La prima richiesta avvierà il Thread; la lista principale rimane accanto al lavoro.</p><textarea aria-label="Primo messaggio" placeholder="Quale piano miglioreresti contro…"></textarea><div class="button-row"><button class="secondary-button">Salva nota senza AI</button><button class="primary-button">Crea e chiedi a Codex</button></div></section>`
  return `${pageIntro('PERCORSI / AI', 'Thread', 'Discuti varianti e valuta una lista completa prima di adottarla.')}
    ${statusBanner()}
    <div class="view-actions"><button class="selector-button"><span><strong>Piano più rapido</strong><small>Base v1 · Proposta nuova</small></span>${icon('chevron')}</button><button class="secondary-button">＋ Nuovo thread</button></div>
    <section class="surface candidate"><div class="candidate-top"><div><span class="eyebrow">CANDIDATA 1 / LISTA COMPLETA</span><h2>Una variante da confrontare</h2></div><span class="candidate-marker">60 / 60</span></div>
      <p>+1 / −1 copie rispetto alla lista principale v1. Tre verifiche aperte; la legalità torneo resta da controllare.</p>
      <div class="diff-preview"><span><b>4×</b> Iono</span><strong>−1</strong><span><b>3×</b> Iono</span><span><b>3×</b> Mega Absol ex</span><strong>+1</strong><span><b>4×</b> Mega Absol ex</span></div>
      <button class="candidate-open" type="button" data-action="toggle-comparison">${state.comparison ? 'Chiudi confronto' : 'Apri confronto'} ${icon('arrow')}</button>
      ${state.comparison ? `<div class="comparison-detail"><div class="comparison-columns"><section><span class="eyebrow">LISTA PRINCIPALE</span><h3>v1 · 60 carte</h3>${cardRows(deck.slice(0, 6), true)}</section><section><span class="eyebrow">LISTA PROPOSTA</span><h3>Candidata 1 · 60 carte</h3>${cardRows(deck.slice(0, 6).map((card) => ({ ...card, quantity: card.name === 'Iono' ? 3 : card.name === 'Mega Absol ex' ? 4 : card.quantity })), true)}</section></div><details><summary>Motivi, fonti e controlli</summary><p>La proposta e i controlli sono simulati; nella UI reale restano associati alla candidata.</p></details><button class="primary-button" type="button">Adotta l’intera lista candidata</button></div>` : ''}
    </section>
    <section class="conversation"><div class="section-heading"><div><span class="eyebrow">CONVERSAZIONE</span><h2>Ipotesi e risposte</h2></div><span class="message-count">${state.scenario === 'long' ? '14 messaggi' : '2 messaggi'}</span></div>${threadMessages()}</section>
    <section class="composer surface"><label for="message">Continua il Thread</label><textarea id="message" placeholder="Scrivi una domanda o chiedi una modifica alla lista…"></textarea><div class="composer-actions"><span>Invio per inviare · Maiuscole+Invio per andare a capo</span><button class="primary-button" type="button">Invia a Codex ${icon('arrow')}</button></div></section>`
}

function matchupView() {
  if (state.scenario === 'empty') return `${pageIntro('ANALISI / AVVERSARI', 'Matchup', 'Studia il piano per un archetipo del metagame corrente.')}
    <section class="surface empty-state"><span class="empty-symbol">◇</span><h2>Nessuna guida disponibile</h2><p>Quando il metagame è disponibile, scegli un avversario. Le guide sono legate alla versione della tua lista e alle fonti usate.</p><button class="primary-button">Aggiorna Limitless</button></section>`
  return `${pageIntro('ANALISI / AVVERSARI', 'Matchup', 'Piano, carte chiave e limiti della guida nella stessa vista del tuo mazzo.')}
    ${statusBanner()}
    <div class="view-actions"><button class="selector-button"><span><strong>Gardevoir ex · fixture UI</strong><small>Quota meta illustrativa 8,2% · Guida da verificare</small></span>${icon('chevron')}</button><button class="secondary-button">Aggiorna Limitless</button></div>
    <section class="surface guide"><div class="guide-top"><div><span class="eyebrow">GUIDA / LISTA PRINCIPALE v1</span><h2>Un piano di gioco leggibile</h2></div><span class="guide-version">Revisione 2</span></div>
      <div class="plan-grid"><article class="plan-step"><span>01 / APERTURA</span><h3>Prepara la ricerca</h3><p>Identifica una linea iniziale affidabile e conserva le risorse che potrebbero servire più avanti.</p></article><article class="plan-step"><span>02 / SVILUPPO</span><h3>Valuta gli scambi</h3><p>Confronta i tuoi attaccanti con la lista avversaria osservata, distinguendo dati e ipotesi.</p></article><article class="plan-step"><span>03 / FINALE</span><h3>Chiudi con criterio</h3><p>Tieni un’opzione di recupero e scegli il bersaglio solo quando i Premi necessari sono chiari.</p></article></div>
      ${state.scenario === 'long' ? `<div class="long-guide"><h3>Osservazioni della revisione</h3>${Array.from({ length: 8 }, (_, index) => `<p><b>Scenario ${index + 1}.</b> Questa nota illustrativa rende visibile il ritmo di una guida lunga. La fonte, il campione e la data restano associati al passaggio; nessuna percentuale descrive il risultato contro il nostro mazzo.</p>`).join('')}</div>` : ''}
      <div class="key-card-grid"><div><span class="eyebrow">LE NOSTRE CARTE CHIAVE</span><strong>Mega Absol ex · Mega Audino ex · Rare Candy</strong></div><div><span class="eyebrow">CARTE AVVERSARIE</span><strong>Gardevoir ex · motore di evoluzione</strong></div></div>
      <div class="notice caution-notice"><strong>Incertezza visibile</strong><p>Questa guida è una fixture di presentazione: non deriva da partite o da una generazione Codex.</p></div>
      <details><summary>Fonti, copertura e dati della guida</summary><p>Il prodotto collega eventi, liste campione e schede di gioco quando disponibili. Questo mockup non interroga fonti reali.</p></details>
    </section>
    <section class="surface revision"><div class="section-heading"><div><span class="eyebrow">DISCUSSIONE</span><h2>Rivedi il piano</h2></div><span class="guide-version">2 revisioni</span></div><p>Scrivi un’osservazione sulle partite e confronta la guida aggiornata con la precedente.</p><textarea aria-label="Osservazione Matchup" placeholder="Nelle mie partite ho notato che…"></textarea><div class="button-row"><button class="secondary-button">Revisioni precedenti</button><button class="primary-button">Aggiorna guida</button></div></section>`
}

function companion() {
  if (state.view === 'list') return ''
  return `<aside class="deck-companion" aria-label="Lista principale persistente"><div class="companion-heading"><span class="eyebrow">IL TUO MAZZO</span><h2>Lista principale · v1</h2></div>
    <div class="companion-summary"><div class="companion-total"><strong>60<span>/60</span></strong><span class="status-chip neutral">Pronta per controllo</span></div><div class="companion-counts">${groups.map((group) => `<div><strong>${groupCount(group)}</strong><span>${group}</span></div>`).join('')}</div></div>
    <div class="companion-scroll" role="region" aria-label="Carte della lista principale" tabindex="0">${deckSections(true)}</div></aside>`
}

function render() {
  document.body.dataset.theme = state.theme
  document.title = `Pokéguru · ${themes[state.theme].name}`
  const content = state.scenario === 'loading' ? `${pageIntro('CARICAMENTO / MOCKUP', viewLabels[state.view], 'I dati già salvati restano consultabili quando disponibili.')}${skeleton()}`
    : state.view === 'list' ? listView() : state.view === 'thread' ? threadView() : matchupView()
  document.querySelector('#app').innerHTML = `${toolbar()}<div class="app-shell ${state.view === 'list' ? 'without-deck' : 'with-deck'}">${sidebar()}${topbar()}<main id="workspace" class="workspace" tabindex="-1">${content}</main>${companion()}</div>`
  updateUrl()
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-theme-choice], [data-view-choice], [data-action], [data-card]')
  if (!target) return
  if (target.dataset.themeChoice) { state.theme = target.dataset.themeChoice; render(); return }
  if (target.dataset.viewChoice) { state.view = target.dataset.viewChoice; state.selectedCard = null; state.comparison = false; render(); return }
  if (target.dataset.card) { state.selectedCard = target.dataset.card; if (state.view === 'list') render(); return }
  if (target.dataset.action === 'toggle-comparison') { state.comparison = !state.comparison; render(); return }
  if (target.dataset.action === 'close-card') { state.selectedCard = null; render(); return }
  if (target.dataset.action === 'retry') { state.scenario = 'loading'; render() }
})

document.addEventListener('change', (event) => {
  if (event.target.id === 'scenario') { state.scenario = event.target.value; state.selectedCard = null; state.comparison = false; render() }
})

render()
