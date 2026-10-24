const mainDeck = [
  ['Pokémon', 3, 'Mega Absol ex', 'Attaccante', 'MEG 086'],
  ['Pokémon', 2, 'Mega Audino ex', 'Supporto', 'ASC 172'],
  ['Pokémon', 3, 'Ralts', 'Evoluzione', 'esempio'],
  ['Pokémon', 2, 'Kirlia', 'Motore', 'esempio'],
  ['Pokémon', 1, 'Gardevoir ex', 'Accelerazione', 'esempio'],
  ['Pokémon', 2, 'Munkidori', 'Copertura', 'esempio'],
  ['Pokémon', 1, 'Fezandipiti ex', 'Pescata', 'esempio'],
  ['Pokémon', 1, 'Budew', 'Tempo', 'esempio'],
  ['Pokémon', 1, 'Manaphy', 'Protezione', 'esempio'],
  ['Allenatori', 4, 'Iono', 'Rimescola', 'esempio'],
  ['Allenatori', 4, 'Arven', 'Ricerca', 'esempio'],
  ['Allenatori', 3, "Professor’s Research", 'Pescata', 'esempio'],
  ['Allenatori', 2, "Boss’s Orders", 'Gust', 'MEG 114'],
  ['Allenatori', 4, 'Rare Candy', 'Evoluzione', 'MEG 125'],
  ['Allenatori', 4, 'Ultra Ball', 'Ricerca', 'esempio'],
  ['Allenatori', 4, 'Nest Ball', 'Ricerca', 'esempio'],
  ['Allenatori', 2, 'Earthen Vessel', 'Energia', 'esempio'],
  ['Allenatori', 2, 'Night Stretcher', 'Recupero', 'esempio'],
  ['Allenatori', 1, 'Counter Catcher', 'Gust', 'esempio'],
  ['Allenatori', 1, 'Super Rod', 'Recupero', 'esempio'],
  ['Allenatori', 1, 'Technical Machine: Evolution', 'Setup', 'esempio'],
  ['Allenatori', 1, 'Unfair Stamp', 'ACE SPEC', 'esempio'],
  ['Energie', 11, 'Psychic Energy', 'Base', 'SVE 005']
].map(([group, quantity, name, role, print]) => ({ group, quantity, name, role, print }))

const changes = new Map([
  ['Mega Absol ex', 4], ['Mega Audino ex', 1], ['Munkidori', 1],
  ['Fezandipiti ex', 2], ['Iono', 3], ['Arven', 3],
  ["Boss’s Orders", 3], ['Night Stretcher', 3]
])
const candidateDeck = mainDeck.map(card => ({ ...card, quantity: changes.get(card.name) ?? card.quantity }))
const groups = ['Pokémon', 'Allenatori', 'Energie']
const groupCounts = deck => groups.map(group => ({ group, total: deck.filter(card => card.group === group).reduce((sum, card) => sum + card.quantity, 0) }))
const total = deck => deck.reduce((sum, card) => sum + card.quantity, 0)
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

const state = {
  view: 'lista', project: 'loaded', railCompact: false,
  thread: 'tempo', threadTab: 'confronto', stale: false, candidate: true,
  matchup: 'gardevoir', revision: 2, feedback: '', adopted: false,
  listFilter: 'Tutte', search: '', showImport: false, confirmAdopt: false,
  toast: '', notes: []
}

const app = document.querySelector('#app')
const counts = groupCounts(mainDeck)

function statusChip(kind, text) { return `<span class="chip chip-${kind}">${text}</span>` }
function projectName() { return state.project === 'empty' ? 'Nuovo progetto' : 'Mega Absol / Mega Audino' }
function deckInUse() { return state.project === 'empty' ? [] : state.adopted ? candidateDeck : mainDeck }
function button(label, action, cls = '', extra = '') { return `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>` }

function rail() {
  return `<aside class="app-rail" aria-label="Navigazione principale">
    <div class="logo"><span class="logo-mark">P<span>.</span></span><div><strong>Pokéguru</strong><small>DECK INTELLIGENCE</small></div></div>
    <div class="rail-block project-block"><div class="rail-caption">PROGETTI ${button('＋', 'new-project', 'rail-add', 'aria-label="Mostra progetto vuoto"')}</div>
      <button class="project-link ${state.project === 'loaded' ? 'selected' : ''}" data-action="project-loaded"><span class="project-glyph">MA</span><span><strong>Mega Absol / Mega Audino</strong><small>Standard · v${state.adopted ? '5' : '4'}</small></span></button>
      <button class="project-link ${state.project === 'empty' ? 'selected' : ''}" data-action="project-empty"><span class="project-glyph muted">＋</span><span><strong>Nuovo progetto</strong><small>Da costruire</small></span></button>
    </div>
    <nav class="rail-block" aria-label="Aree progetto"><div class="rail-caption">AREA DI LAVORO</div>
      ${navItem('lista','01','Lista')}${navItem('thread','02','Thread')}${navItem('matchup','03','Matchup')}
    </nav>
    <nav class="rail-block utilities" aria-label="Risorse globali"><div class="rail-caption">RISORSE</div>
      ${navItem('catalogo','⌕','Catalogo')}${navItem('eventi','◷','Eventi')}${navItem('impostazioni','⚙','Impostazioni AI')}
    </nav>
    <div class="rail-footer"><span class="live-dot"></span> Archivio locale <small>Prototipo · dati illustrativi</small></div>
  </aside>`
}
function navItem(view, icon, label) {
  return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-action="view-${view}" title="${label}" ${state.view === view ? 'aria-current="page"' : ''}><span class="nav-icon">${icon}</span>${label}</button>`
}

function pageHeader() {
  const loaded = state.project === 'loaded'
  return `<header class="page-top"><div class="page-breadcrumb">PROGETTO <span>/</span> STANDARD OCCIDENTALE <span>/</span> ${escapeHtml(state.view.toUpperCase())}</div>
    <div class="page-heading"><div><h1>${escapeHtml(projectName())}</h1><p>${loaded ? `Versione principale v${state.adopted ? '5' : '4'} · esempio locale` : 'Un progetto senza lista, pronto per iniziare'}</p></div>
      <div class="page-heading-actions">${loaded ? statusChip('amber', '2 verifiche aperte') : statusChip('neutral', 'Nessuna lista')}
      <label class="scenario-label">Scenario <select id="scenario" aria-label="Scenario del prototipo"><option value="loaded" ${loaded ? 'selected' : ''}>Lista caricata</option><option value="empty" ${!loaded ? 'selected' : ''}>Progetto vuoto</option></select></label></div></div>
    <nav class="page-tabs" aria-label="Flussi del mazzo">${tab('lista','Lista')}${tab('thread','Thread')}${tab('matchup','Matchup')}</nav>
  </header>`
}
function tab(view, label) { return `<button data-action="view-${view}" class="${state.view === view ? 'active' : ''}" ${state.view === view ? 'aria-current="page"' : ''}>${label}</button>` }

function deckRows(deck, options = {}) {
  const { compact = false, compare = false } = options
  return groups.map(group => {
    const cards = deck.filter(card => card.group === group)
    if (!cards.length) return ''
    return `<section class="deck-group" aria-label="${group}"><div class="group-heading"><h3>${group}</h3><span>${cards.reduce((sum, card) => sum + card.quantity, 0)}</span></div>
      ${cards.map(card => `<div class="deck-row ${compare && changes.has(card.name) ? 'changed' : ''}" data-card="${escapeHtml(card.name)}"><strong class="qty">${card.quantity}</strong><span class="card-name">${escapeHtml(card.name)}</span>${compact ? '' : `<span class="card-print">${escapeHtml(card.print)}</span>`}</div>`).join('')}</section>`
  }).join('')
}

function companion() {
  const deck = deckInUse()
  const compact = state.railCompact
  return `<aside class="deck-companion ${compact ? 'compact' : ''}" aria-label="Lista principale persistente">
    <div class="companion-top"><div><span class="overline">RIFERIMENTO FISSO</span><h2>Lista principale</h2></div>${button(compact ? 'Vista completa' : 'Vista breve','toggle-companion','icon-button')}</div>
    <div class="companion-summary"><div class="companion-total"><strong>${total(deck)}<span>/60</span></strong>${statusChip(deck.length ? 'amber' : 'neutral', deck.length ? 'Da verificare' : 'Da costruire')}</div>
      <div class="companion-counts">${groupCounts(deck).map(item => `<div><strong>${item.total}</strong><span>${item.group}</span></div>`).join('')}</div>
      ${deck.length ? `<p class="companion-help">${compact ? 'Carte chiave sempre visibili' : 'Scorri la lista senza perdere la guida o il thread.'}</p>` : `<p class="companion-help">Nessuna carta nel progetto.</p>`}</div>
    <div class="companion-list" id="companion-list">${deck.length ? compact ? `<section class="deck-group"><div class="group-heading"><h3>Carte chiave</h3></div>${deck.filter(card => ['Mega Absol ex','Mega Audino ex','Rare Candy','Psychic Energy'].includes(card.name)).map(card => `<div class="deck-row" data-card="${escapeHtml(card.name)}"><strong class="qty">${card.quantity}</strong><span class="card-name">${escapeHtml(card.name)}</span></div>`).join('')}</section>` : deckRows(deck) : `<div class="companion-empty">La lista comparirà qui in tutti i flussi.</div>`}</div>
    <div class="companion-foot">Versione principale ${state.adopted ? 'v5' : 'v4'} · <strong>mai sostituita da una proposta senza conferma</strong></div>
  </aside>`
}

function listView() {
  if (state.project === 'empty') return `<section class="empty-view"><div class="empty-symbol">＋</div><span class="overline">IL PRIMO PASSO</span><h2>Comincia dalla tua lista</h2><p>Importa un testo PTCG Live o Limitless. La lista potrà essere incompleta: resterà visibile come bozza mentre definisci il mazzo.</p><div class="button-row">${button('Apri flusso di importazione','open-import','primary')}${button('Apri Thread da zero','view-thread','secondary')}</div><div class="empty-note">Il percorso completo da zero appartiene a I4. Qui puoi provarne lo stato iniziale, senza generazione reale.</div></section>`
  const deck = deckInUse()
  const visible = deck.filter(card => (state.listFilter === 'Tutte' || card.group === state.listFilter) && card.name.toLocaleLowerCase('it').includes(state.search.toLocaleLowerCase('it')))
  return `<section class="list-view"><div class="section-toolbar"><div><span class="overline">VERSIONE PRINCIPALE ${state.adopted ? 'V5' : 'V4'}</span><h2>La lista, prima di tutto.</h2></div><div class="button-row">${button('Copia lista','copy-list','secondary')}${button('Importa / sostituisci','open-import','primary')}</div></div>
    <div class="list-overview"><div class="list-total"><strong>${total(deck)}<span>/60</span></strong><small>carte nella lista principale</small></div><div class="overview-groups">${groupCounts(deck).map(item => `<div><strong>${item.total}</strong><span>${item.group}</span></div>`).join('')}</div><div class="overview-check">${statusChip('amber','Da verificare')}<p>Stampe di esempio e copertura Standard da confermare.</p>${button('Apri controlli e fonti','jump-checks','text-action')}</div></div>
    <div class="list-controls"><div class="filter-tabs" aria-label="Filtra la lista">${['Tutte',...groups].map(group => `<button class="${state.listFilter === group ? 'selected' : ''}" data-filter="${group}">${group}</button>`).join('')}</div><label class="search"><span>⌕</span><input id="card-search" value="${escapeHtml(state.search)}" placeholder="Cerca una carta" aria-label="Cerca una carta" /></label></div>
    <div class="main-card-list">${visible.length ? visible.map(card => `<button class="main-card" data-action="focus-${escapeHtml(card.name)}"><span class="main-card-qty">${card.quantity}×</span><span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.role)} · ${escapeHtml(card.print)}</small></span><span class="main-card-arrow">↗</span></button>`).join('') : `<p class="no-results">Nessuna carta corrisponde alla ricerca.</p>`}</div>
    <details class="secondary-details" id="checks"><summary>Controlli, provenienza e testo importato <span>2 punti da verificare</span></summary><div class="details-content"><p>Questo prototipo usa una lista illustrativa di 60 carte. I codici indicati come “esempio” non attestano stampe o legalità.</p><ul><li>Confermare le stampe delle carte non specificate.</li><li>Ricalcolare lo Standard contro il catalogo e il pacchetto di regole installati.</li></ul><p>Nel prodotto reale qui si aprono diagnostica, regole, date, fonti e testo originale. Nessuna verifica viene simulata come eseguita.</p></div></details></section>`
}

function threadSidebar() {
  return `<aside class="inner-sidebar" aria-label="Thread del progetto"><div class="inner-caption">THREAD PARALLELI <span>2</span></div>
    <button class="inner-item ${state.thread === 'tempo' ? 'selected' : ''}" data-action="thread-tempo"><strong>Variante più rapida</strong><small>1 proposta · base v4 ${state.stale ? '· superata' : ''}</small></button>
    <button class="inner-item ${state.thread === 'stabilita' ? 'selected' : ''}" data-action="thread-stabilita"><strong>Più stabilità</strong><small>Discussione · base v4</small></button>
    ${button('＋ Nuovo thread','new-thread','new-inner')}</aside>`
}

function comparison() {
  const current = deckInUse()
  const candidate = candidateDeck
  return `<div class="comparison"><div class="comparison-head"><div><span class="overline">CONFRONTO DI LISTE COMPLETE</span><h3>Che cosa cambia davvero</h3></div>${statusChip(state.adopted ? 'teal' : state.stale ? 'red' : 'teal', state.adopted ? 'Adottata' : state.stale ? 'Base superata' : 'Proposta nuova')}</div>
    <div class="compare-identities"><div><span class="identity-tag main">01 · PRINCIPALE</span><strong>v${state.adopted ? '5' : '4'} · ${total(current)}/60</strong><small>La lista usata dal progetto adesso</small></div><div class="compare-arrow">→</div><div><span class="identity-tag proposal">02 · PROPOSTA</span><strong>Candidata 1 · ${total(candidate)}/60</strong><small>Salvata solo in questo thread</small></div></div>
    ${state.adopted ? `<div class="notice info"><strong>La proposta ora coincide con la principale v5.</strong><span>Il confronto storico con la base v4 rimane nel thread; nessuna ulteriore adozione è necessaria.</span></div>` : state.stale ? `<div class="notice danger"><strong>La base v4 del thread è superata.</strong><span>La principale è cambiata. L’adozione è bloccata; confronta la candidata con la versione attuale e avvia un nuovo thread.</span></div>` : `<div class="notice info"><strong>8 quantità modificate · totale invariato</strong><span>Più pressione iniziale; meno ricerca mirata. Valuta il compromesso prima di adottare.</span></div>`}
    ${state.adopted ? '' : `<div class="diff-table" role="table" aria-label="Differenze tra lista principale e proposta"><div class="diff-row diff-header" role="row"><span>PRINCIPALE</span><span>CAMBIO</span><span>PROPOSTA</span></div>
      ${mainDeck.filter(card => changes.has(card.name)).map(card => { const next = changes.get(card.name); return `<div class="diff-row" role="row"><span><strong>${card.quantity}×</strong> ${escapeHtml(card.name)}</span><span class="delta ${next > card.quantity ? 'plus' : 'minus'}">${next > card.quantity ? '+' : ''}${next-card.quantity}</span><span><strong>${next}×</strong> ${escapeHtml(card.name)}</span></div>` }).join('')}</div>`}
    <div class="full-lists"><div><div class="full-list-title"><strong>Lista principale completa</strong><span>${total(current)} carte</span></div><div class="full-list-scroll">${deckRows(current)}</div></div><div><div class="full-list-title"><strong>Lista proposta completa</strong><span>${total(candidate)} carte</span></div><div class="full-list-scroll">${deckRows(candidate,{compare:true})}</div></div></div>
    <div class="adoption-bar"><div><strong>Decisione sul mazzo intero</strong><p>${state.stale ? 'Non disponibile finché la base resta superata.' : state.adopted ? 'Adozione simulata: la principale ora mostra v5.' : 'La proposta non cambia la lista principale senza questa conferma.'}</p></div>${button('Adotta l’intera lista proposta','confirm-adopt','primary', state.stale || state.adopted ? 'disabled' : '')}</div>
    <details class="secondary-details"><summary>Motivi, fonti e controlli della candidata</summary><div class="details-content"><p><strong>Motivo illustrativo:</strong> aumentare la pressione di Mega Absol ex e il recupero, riducendo una copia di Mega Audino ex e alcuni Supporter.</p><p><strong>Fonte:</strong> dati di esempio del prototipo; nessuna risposta Codex o fonte torneo reale. Le verifiche Standard e i vincoli non sono stati eseguiti.</p></div></details>
  </div>`
}

function conversation() {
  return `<div class="conversation"><div class="message user"><span>TU · IPOTESI</span><p>Vorrei una partenza più rapida senza perdere la capacità di chiudere le partite lunghe.</p></div><div class="message assistant"><span>CODEX · ESEMPIO SIMULATO</span><p>Proverei una quarta copia di Mega Absol ex e una copia in più di Night Stretcher. La scelta riduce una carta di ricerca e una via secondaria: controlla quanto spesso serve Mega Audino ex.</p></div>
    <button class="candidate-callout" data-action="thread-tab-confronto"><span>PROPOSTA 1 · 60/60</span><strong>Apri candidata e confronto completo →</strong><small>La lista principale rimane v${state.adopted ? '5' : '4'} finché non confermi l’adozione.</small></button>
    ${state.notes.map(note => `<div class="message user"><span>TU · OSSERVAZIONE LOCALE</span><p>${escapeHtml(note)}</p></div>`).join('')}
    <form id="thread-form" class="composer"><label for="thread-note">Continua la discussione</label><textarea id="thread-note" placeholder="Quale compromesso vuoi approfondire?"></textarea><div class="composer-foot"><small>Simulazione locale: non contatta Codex.</small><button class="primary" type="submit">Aggiungi osservazione</button></div></form></div>`
}

function threadView() {
  if (state.project === 'empty') return `<section class="empty-view"><span class="overline">THREAD DA ZERO · ANTEPRIMA I4</span><h2>Parti da un’idea, senza lista</h2><p>Il riferimento persistente mostra chiaramente 0/60. Nel prodotto futuro, il thread manterrà una proposta completa separata dalla principale fino all’adozione esplicita.</p>${button('Torna alla lista di esempio','project-loaded','primary')}</section>`
  return `<div class="split-view">${threadSidebar()}<section class="thread-main"><div class="section-heading"><div><span class="overline">BASE V4 · THREAD INDIPENDENTE</span><h2>${state.thread === 'tempo' ? 'Variante più rapida' : 'Più stabilità'}</h2><p>La discussione esplora una direzione. La lista principale resta sempre visibile.</p></div></div>
    ${state.thread === 'tempo' ? `<div class="thread-tabs" role="tablist" aria-label="Contenuti del thread"><button role="tab" aria-selected="${state.threadTab === 'confronto'}" class="${state.threadTab === 'confronto' ? 'active' : ''}" data-action="thread-tab-confronto">Confronto <span>1</span></button><button role="tab" aria-selected="${state.threadTab === 'discussione'}" class="${state.threadTab === 'discussione' ? 'active' : ''}" data-action="thread-tab-discussione">Discussione</button></div>
    ${state.threadTab === 'confronto' ? comparison() : conversation()}
    <div class="prototype-switch"><span>PROVA GLI STATI</span>${button(state.stale ? 'Ripristina base corrente' : 'Simula base superata','toggle-stale','small-button')}</div>` : `<div class="notice info"><strong>Discussione senza candidata</strong><span>Le idee restano qui. Una proposta di 60 carte comparirà nel confronto solo dopo essere stata salvata.</span></div><div class="message user"><span>TU · ESEMPIO</span><p>Come posso rendere più stabile il primo turno?</p></div>${button('Apri thread con proposta','thread-tempo','secondary')}`}
  </section></div>`
}

const archetypes = [
  { id:'gardevoir', name:'Gardevoir ex', meta:'14,2%', state:'Guida · incerta' },
  { id:'charizard', name:'Charizard ex', meta:'11,8%', state:'Analisi non disponibile' },
  { id:'dragapult', name:'Dragapult ex', meta:'8,9%', state:'Guida · da rivedere' }
]
function matchupSidebar() {
  return `<aside class="inner-sidebar matchup-picker" aria-label="Archetipi del meta"><div class="inner-caption">META D’ESEMPIO <span>3</span></div>${archetypes.map(item => `<button class="inner-item ${state.matchup === item.id ? 'selected' : ''}" data-action="matchup-${item.id}"><strong>${item.name}</strong><small>${item.meta} del meta · ${item.state}</small></button>`).join('')}<div class="side-source">Quote illustrative, non winrate.<br />Nel prodotto reale: snapshot Limitless, periodo e regioni.</div></aside>`
}
function guide() {
  if (state.matchup === 'charizard') return `<div class="guide-empty"><span class="overline">ANALISI NON DISPONIBILE</span><h3>Charizard ex</h3><p>Il metagame è presente, ma qui non c’è una guida salvata per questa lista. Nessun piano viene mostrato come se fosse verificato.</p><div class="notice danger"><strong>Serve una nuova analisi</strong><span>Nel prodotto reale, genera la guida con Codex dopo aver controllato lista e fonti. Qui l’azione mostra solo lo stato del prototipo.</span></div>${button('Mostra stato di generazione','unavailable-info','primary')}</div>`
  const dragapult = state.matchup === 'dragapult'
  return `<div class="guide"><div class="guide-head"><div><span class="overline">GUIDA MATCHUP · ${dragapult ? 'DA RIVEDERE' : `REVISIONE ${state.revision}`}</span><h3>${dragapult ? 'Dragapult ex' : 'Gardevoir ex'}</h3></div>${statusChip('amber', dragapult ? 'Base storica' : 'Confidenza limitata')}</div>
    ${dragapult ? `<div class="notice danger"><strong>La lista o lo snapshot sono cambiati.</strong><span>Questa guida resta consultabile come storico; rivalutala sulla base corrente prima di usarla.</span></div>` : `<div class="notice amber"><strong>Questa è un’ipotesi di gioco, non un winrate.</strong><span>Campione torneo non collegato nel prototipo. Verifica le scelte durante le partite.</span></div>`}
    <section class="plan-section"><div class="section-index">01 / PIANO</div><h4>Gioca per conquistare il tempo, poi chiudi con Absol.</h4><div class="plan-steps"><div><strong>APERTURA</strong><p>Trova Ralts e una linea di ricerca. Non impegnare subito tutte le Energie se la mano avversaria è ancora ignota.</p></div><div><strong>METÀ PARTITA</strong><p>Usa Mega Audino ex per assorbire un turno difficile e preparare due attaccanti. Conserva un’opzione di recupero.</p></div><div><strong>CHIUSURA</strong><p>Mega Absol ex deve prendere il bersaglio giusto. Tieni Boss’s Orders per un premio decisivo, se la situazione lo permette.</p></div></div></section>
    <div class="guide-two"><section><div class="section-index">02 / LE TUE CARTE</div><h4>Controllale nella lista</h4><div class="key-cards">${['Mega Absol ex','Mega Audino ex',"Boss’s Orders",'Night Stretcher'].map(name => `<button data-action="focus-${escapeHtml(name)}"><span>${escapeHtml(name)}</span>↗</button>`).join('')}</div></section><section><div class="section-index">03 / ATTENZIONE</div><h4>Cosa mettere alla prova</h4><p>La guida presume di poter stabilizzare il secondo turno. Se il setup avversario accelera, rivedi la sequenza di ricerca e il numero di Energie esposte.</p></section></div>
    <section class="evidence"><div class="section-index">FONTI E LIMITI VISIBILI</div><p><strong>Meta:</strong> quota illustrativa del 14,2%, non percentuale di vittoria. <strong>Lista avversaria:</strong> non allegata in questo prototipo. <strong>Origine della guida:</strong> testo dimostrativo, non generato da Codex.</p><details class="secondary-details"><summary>Apri evidenze, dati inviati e cronologia</summary><div class="details-content"><p>Nell’app reale questo livello ospiterebbe link alla fonte Limitless, snapshot, copertura delle liste osservate, modello usato e dati condivisi con Codex. Le osservazioni dell’utente rimangono separate dalle fonti.</p><p>Revisioni simulate: iniziale → osservazione sulla partenza → piano aggiornato. Nessun dato torneo o AI è stato interrogato.</p></div></details></section>
    <form id="feedback-form" class="composer"><label for="matchup-feedback">Rivedi questa guida con una tua osservazione</label><textarea id="matchup-feedback" placeholder="Per esempio: preferisco andare secondo contro questa apertura…">${escapeHtml(state.feedback)}</textarea><div class="composer-foot"><small>La revisione nel prototipo è simulata e rimane locale.</small><button class="primary" type="submit">Rivedi piano</button></div></form>
    ${state.revision > 2 ? `<div class="notice info"><strong>Revisione ${state.revision} aggiunta nel prototipo</strong><span>Osservazione: ${escapeHtml(state.feedback)}. Nel prodotto reale Codex rivaluterebbe la guida e spiegherebbe cosa è cambiato.</span></div>` : ''}
  </div>`
}
function matchupView() {
  if (state.project === 'empty') return `<section class="empty-view"><span class="overline">MATCHUP</span><h2>Importa una lista per leggere un piano pertinente</h2><p>Una guida deve essere ancorata alle tue carte. Puoi già vedere il meta, ma non attribuiamo una strategia a una lista inesistente.</p>${button('Carica lista di esempio','project-loaded','primary')}</section>`
  const current = archetypes.find(item => item.id === state.matchup)
  return `<div class="split-view">${matchupSidebar()}<section class="matchup-main"><div class="section-heading"><div><span class="overline">STANDARD OCCIDENTALE · META</span><h2>Matchup</h2><p>Leggi il piano mentre controlli le tue carte nella lista persistente.</p></div><div class="meta-period">${current.meta}<small>quota meta · esempio</small></div></div>${guide()}</section></div>`
}

function globalView() {
  const content = {
    catalogo: ['Catalogo', 'Cerca carte, stampe e copertura del catalogo condiviso.', 'Ricerca carte', 'Aggiorna nuove carte', 'Scansione completa'],
    eventi: ['Eventi', 'Esamina snapshot pubblici, partecipazioni e liste con provenienza.', 'Evento recente', 'Copertura delle liste', 'Apri fonte'],
    impostazioni: ['Impostazioni AI', 'Gestisci connessione Codex, modello e ragionamento per le nuove richieste.', 'Connessione', 'Modello', 'Dati condivisi']
  }[state.view]
  return `<section class="global-view"><span class="overline">RISORSA GLOBALE · ANTEPRIMA DI NAVIGAZIONE</span><h2>${content[0]}</h2><p>${content[1]}</p><div class="global-grid">${content.slice(2).map((item,index) => `<div><span>0${index+1}</span><strong>${item}</strong><p>Collocazione prevista. Questa vista non esegue operazioni o integrazioni.</p></div>`).join('')}</div>${button('Torna al progetto','view-lista','secondary')}</section>`
}

function modal() {
  if (state.confirmAdopt) return `<div class="modal-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="overline">CONFERMA ESPLICITA</span><h2 id="dialog-title">Adottare l’intera lista proposta?</h2><p>La simulazione sostituirà la lista principale v4 con la candidata completa di 60 carte. Nessun dato reale dell’app sarà modificato.</p><div class="dialog-stats"><span>PRINCIPALE v4 · 60</span><strong>→</strong><span>PROPOSTA · 60</span></div><div class="button-row">${button('Annulla','cancel-modal','secondary')}${button('Confermo: adotta tutte le 60 carte','adopt','primary')}</div></div></div>`
  if (state.showImport) return `<div class="modal-backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="overline">IMPORTAZIONE · SIMULAZIONE</span><h2 id="dialog-title">Aggiungi una lista</h2><p>Nel prototipo il pulsante carica una lista di esempio. Non legge file né salva nel database di Pokéguru.</p><textarea aria-label="Anteprima del testo lista" readonly>3 Mega Absol ex MEG 086\n2 Mega Audino ex ASC 172\n…\n11 Psychic Energy SVE 005\nTotal Cards: 60</textarea><div class="button-row">${button('Annulla','cancel-modal','secondary')}${button('Carica lista di esempio','load-sample','primary')}</div></div></div>`
  return ''
}

function render() {
  const main = document.querySelector('#main')
  const scroll = main?.scrollTop ?? 0
  const companionScroll = document.querySelector('#companion-list')?.scrollTop ?? 0
  app.innerHTML = `<div class="shell">${rail()}<div class="work-area"><div class="top-strip"><span>POKÉGURU <b>/</b> PROTOTIPO DESKTOP</span><span>DATI DI ESEMPIO · NESSUNA INTEGRAZIONE ATTIVA</span></div><main id="main" class="main-scroll">${pageHeader()}${state.view === 'lista' ? listView() : state.view === 'thread' ? threadView() : state.view === 'matchup' ? matchupView() : globalView()}</main></div>${companion()}</div>${modal()}${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ''}`
  document.querySelector('#main').scrollTop = scroll
  document.querySelector('#companion-list').scrollTop = companionScroll
}

function announce(text) {
  state.toast = text
  render()
  setTimeout(() => { state.toast = ''; render() }, 3500)
}
function focusCard(name) {
  const card = [...document.querySelectorAll('#companion-list [data-card]')].find(el => el.dataset.card === name)
  if (!card && state.railCompact) { state.railCompact = false; render(); return focusCard(name) }
  if (card) { card.scrollIntoView({ block:'center' }); card.classList.add('highlight'); setTimeout(() => card.classList.remove('highlight'), 1600) }
}

app.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]')
  if (filter) { state.listFilter = filter.dataset.filter; render(); return }
  const el = event.target.closest('[data-action]')
  if (!el) return
  const action = el.dataset.action
  if (action.startsWith('focus-')) { focusCard(action.slice(6)); return }
  if (action.startsWith('view-')) { state.view = action.slice(5); state.toast = ''; render(); document.querySelector('#main').scrollTop = 0; return }
  if (action.startsWith('project-')) { state.project = action.slice(8); state.view = 'lista'; state.adopted = false; render(); document.querySelector('#main').scrollTop = 0; return }
  if (action.startsWith('matchup-')) { state.matchup = action.slice(8); render(); return }
  if (action.startsWith('thread-tab-')) { state.threadTab = action.slice(11); render(); return }
  if (action.startsWith('thread-')) { state.thread = action.slice(7); render(); return }
  switch (action) {
    case 'new-project': state.project = 'empty'; state.view = 'lista'; render(); break
    case 'toggle-companion': state.railCompact = !state.railCompact; render(); document.querySelector('.deck-companion .icon-button').focus(); break
    case 'toggle-stale': state.stale = !state.stale; render(); break
    case 'confirm-adopt': state.confirmAdopt = true; render(); document.querySelector('.dialog button').focus(); break
    case 'adopt': state.adopted = true; state.confirmAdopt = false; announce('Adozione simulata: lista principale v5 aggiornata solo nel prototipo.'); break
    case 'open-import': state.showImport = true; render(); document.querySelector('.dialog button').focus(); break
    case 'load-sample': state.showImport = false; state.project = 'loaded'; state.view = 'lista'; state.adopted = false; announce('Lista di esempio caricata nel prototipo.'); break
    case 'cancel-modal': state.showImport = false; state.confirmAdopt = false; render(); break
    case 'jump-checks': document.querySelector('#checks').open = true; document.querySelector('#checks').scrollIntoView({block:'start'}); break
    case 'copy-list': navigator.clipboard?.writeText(deckInUse().map(card => `${card.quantity} ${card.name} ${card.print}`).join('\n')).then(() => announce('Lista di esempio copiata.')).catch(() => announce('Copia non disponibile nel browser.')); break
    case 'new-thread': announce('Nel prototipo prova i due thread illustrativi.'); break
    case 'unavailable-info': announce('Analisi non disponibile: nessuna richiesta AI viene inviata dal prototipo.'); break
  }
})
app.addEventListener('change', event => { if (event.target.id === 'scenario') { state.project = event.target.value; state.view = 'lista'; render() } })
app.addEventListener('input', event => { if (event.target.id === 'card-search') { const pos = event.target.selectionStart; state.search = event.target.value; render(); const input = document.querySelector('#card-search'); input.focus(); input.setSelectionRange(pos,pos) } })
app.addEventListener('submit', event => {
  event.preventDefault()
  if (event.target.id === 'thread-form') { const note = event.target.querySelector('textarea').value.trim(); if (note) { state.notes.push(note); render(); announce('Osservazione aggiunta alla discussione simulata.') } }
  if (event.target.id === 'feedback-form') { const note = event.target.querySelector('textarea').value.trim(); if (note) { state.feedback = note; state.revision += 1; render(); announce('Revisione simulata aggiunta; nessuna AI contattata.') } }
})
app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (state.showImport || state.confirmAdopt)) { state.showImport = state.confirmAdopt = false; render() }
})

render()
