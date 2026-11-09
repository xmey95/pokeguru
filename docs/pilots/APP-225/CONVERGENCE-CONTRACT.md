# Proposta APP-229 — Obiettivi, prove e avanzamento della guida

**Contratto precedente:** l'utente ha poi accettato di circoscrivere le affermazioni alle evidenze di un confronto finito. Per la nuova consegna valgono [FINITE-EVIDENCE-CONTRACT.md](FINITE-EVIDENCE-CONTRACT.md) e APP-232. Questa proposta resta storica, non impone di completare il grafo di ogni intenzione AI. Controlli fisici, fonti, riesami indipendenti e goal completo conservati.

Stato: proposta architetturale conseguente all'[audit reale](CONVERGENCE-AUDIT.md), non implementata. Nessuna nuova chiamata autorizzata da questo documento. Il generatore, i contenuti AI e i database della campagna restano invariati.

## Risultato da ottenere

APP-225 termina soltanto con le tre guide complete e valide richieste, prodotte autonomamente, verificate dopo salvataggio/riapertura e in UI, con valutazione della generalità e una build locale utilizzabile. Restano obbligatori formato approfondito, lista esatta di60 carte, singolo matchup, fonti, almeno due scenari e due esercizi e tutti i capitoli previsti.

La revisione non introduce un numero comodo di repliche o una guida meno verificata. Cambia il modo in cui il sistema decide quali prove servono e ne conserva l'esito. Non richiede un nuovo simulatore completo del TCG: riusa registro e validatori già presenti. La qualità semantica continua a richiedere critiche indipendenti e verifica reale; non può essere garantita da uno scheduler.

## 1. Distinguere quattro oggetti

| Oggetto | Significato | Autorità |
| --- | --- | --- |
| Originale | Richiesta utente, vincolo di prodotto, intenzione del piano o rilievo AI, conservato esattamente con provenienza | Non viene riscritto o cancellato |
| Obbligo | Proposizione da verificare, con condizioni, frame e legami a tutti gli originali che la richiedono | Ammissione e corrispondenza semantica verificate indipendentemente |
| Testimone | Journal AI immutabile, fatti derivati, fonti e identità della posizione; oppure confronto fra tali prove | Il controllo meccanico prova la legalità, non l'adempimento strategico |
| Certificazione | Giudizio indipendente che collega un obbligo ai testimoni correnti, o motiva perché un rilievo AI era infondato/non pertinente | Il finalizzatore controlla copertura, dipendenze e assenza di obblighi aperti |

L'hash di `goal/reason/sourceIds` resta l'identità dell'originale. Non viene usato da solo come identità semantica. Nessuna deduplicazione automatica per somiglianza del testo, eliminazione della ragione o riordino di eventi. Le equivalenze sono collegamenti espliciti e verificati; tutti gli originali mantengono una voce nell'audit finale.

Il registro deve includere anche le intenzioni dei seed, i vincoli sulla prima mossa/pescata e i rilievi critici, non soltanto gli ultimi `needs-branches`. Deve distinguere origine utente/prodotto da ipotesi e richieste generate dall'AI. Le prime non possono essere ritirate dall'AI.

Un obiettivo composto può avere più testimoni. L'eventuale scomposizione conserva condizioni e quantificatori: un confronto non diventa la prova di una sola alternativa; una congiunzione non è chiusa da un solo figlio. Una revisione indipendente verifica la corrispondenza con il testo originale. Un mapping ambiguo resta aperto.

## 2. Ammettere e risolvere un rilievo prima di imporre nuova costruzione

Un `needs-branches` del costruttore diventa una proposta da verificare. Non è già una dimostrazione che un nuovo ramo sia indispensabile.

La nuova fase indipendente deve distinguere:

- **Prova già disponibile:** identificare i testimoni esatti e le loro condizioni, anche se appartengono a un'altra unità della stessa costruzione.
- **Contesto non fornito al ruolo:** recuperare le prove immutabili pertinenti; non aggiungere un obiettivo tattico per compensare un problema di visibilità.
- **Valutazione ancora necessaria:** calcolare/verificare formule o confronti su registri già presenti.
- **Testimone da costruire o riparare:** produrre un obbligo aperto concreto con frame, condizioni e dipendenze.
- **Richiesta AI infondata o superata:** motivazione da fonti e fatti, verificata con la stessa severità del `superseded` già ammesso oggi. Il requisito originale resta archiviato e la copertura della guida deve comunque risultare completa.
- **Risposta critica non valida o ambigua:** chiarimento/retry limitato, distinto da un nuovo obbligo. Non si converte né in un pass né automaticamente in un nuovo ramo.

La fase riusa e specializza le regole di `guide-requirement-review.ts`: risoluzione con testimoni correnti; nessun pass con problemi aperti; nessuna rinuncia per risparmiare token o chiamate. Serve un contratto di input nativo dedicato, senza pretendere una guida già composta.

Non basta spostare tutto il critico prima dei metadata: alcuni giudizi richiedono valutazioni numeriche ancora da produrre. Il flusso deve essere un insieme di dipendenze esplicite. Una prova meccanica presente può attendere la propria valutazione senza obbligare a ricostruire il journal. La certificazione completa arriva soltanto quando tutte le dipendenze sono disponibili.

## 3. Stati e transizioni persistenti

| Stato | Transizione ammessa |
| --- | --- |
| Proposto | Intenzione o rilievo originale registrato, ancora da ammettere |
| Da chiarire | Mancano contesto o interpretazione affidabile; nessuna nuova costruzione automatica |
| Aperto | Un giudizio indipendente ha stabilito la prova necessaria |
| Pianificato | L'AI ha assegnato una costruzione; non è una prova |
| Registro valido | Journal controllato; non certifica il goal |
| Da valutare | Servono formule o confronti sui fatti già prodotti |
| Verificato | Obbligo coperto da certificazione indipendente e dipendenze correnti |
| Superato con prova | Rilievo AI infondato/non pertinente motivato; non autorizza a ritirare invarianti o a lasciare scoperta la guida |
| Invalidato | È cambiata una dipendenza; la vecchia certificazione resta storica |

Ogni transizione conserva originale, versione del contratto, scope, fonti, frame, identità dei testimoni, certificazione e precedente stato. Cambiare un'assegnazione non chiude un obbligo. Cambiare il testo della motivazione non crea da solo un nuovo problema tattico.

La chiusura di un requisito composto dipende dalla relazione verificata fra i figli. La chiusura di un claim comparativo richiede tutti i confronti necessari. Non si trasferisce una conclusione globale da un frammento o da un indice di prove.

## 4. Contratti di contesto per tutti i ruoli

| Ruolo | Riceve | Non può certificare |
| --- | --- | --- |
| Pianificatore | Obblighi aperti, condizioni, indice delle prove e risultati pertinenti, packet corrente | Fattibilità di turni ancora inesistenti o soddisfazione di un requisito |
| Selettore | Varianti originali, assegnazioni e riferimenti; prove complete recuperabili per ID quando necessarie | Migliore risposta globale o chiusura di un obbligo dal solo directory |
| Costruttore | Prefisso esatto, stato corrente, goal assegnati, originali pertinenti e riferimenti immutabili | Legalità o adempimento tramite la sola propria descrizione |
| Valutatore per linea/coppia | Registri completi della porzione, fonti, condizioni e scope della valutazione | Assenza di prove esterne non mostrate o copertura dell'intero caso |
| Critico di un obbligo | Testimoni completi necessari al claim e originali pertinenti, con fatti e fonti | Obblighi esterni al proprio scope |
| Scrittore | Fatti verificati, ipotesi, limiti e decisioni condizionali | Nuovi fatti, linee o percentuali senza prova |
| Finalizzatore | Copertura dell'intera guida, certificazioni correnti, prosa e fonti aggiornate | Una guida con criticità, mapping o confronti ancora aperti |

Il packet e le condizioni necessarie non vengono ridotti per far entrare una richiesta. Le proiezioni sono esplicite, gli originali integrali restano conservati e il ruolo certificante riceve le prove necessarie. Il recupero di un contesto già esistente è distinto dalla richiesta di costruire una nuova linea.

Ogni famiglia dell'audit deve avere: identità di contratto, input, output, validatore, dipendenze, strategia di partizione e limite di capienza. Una singola unità irriducibile oltre i limiti resta un blocco esplicito.

La selezione non deve ricevere sistematicamente tutti i journal. Anche lo schema di trasporto può evitare enumerazioni ripetute, ma la validazione locale deve conservare integralmente i vincoli dipendenti da ID/variante. L'esperimento dell'audit dimostra che questa sola ottimizzazione non risolve il caso corrente.

## 5. Cache e invalidazione

Le certificazioni e le dichiarazioni AI sono oggetti diversi. Si può conservare un journal valido senza riutilizzare il vecchio pass semantico.

- Una prova positiva dipende da requisito originale/normalizzato, condizioni, frame, evidenze, testimoni e versione dei validatori.
- Un confronto di massimo/minimo o preferenza dipende anche dall'insieme dei concorrenti e dai criteri. Aggiungere un concorrente ne invalida la conclusione globale pertinente.
- Una modifica della prima mossa, della pescata o delle risorse non consente di riusare come equivalente il seguito di un altro frame.
- Una fonte tardiva invalida le certificazioni che dipendono dal vecchio packet; il riesame finale usa tutte le evidenze correnti.
- La cache locale di letture/verifiche immutabili deve essere legata al contenuto e al validatore, non soltanto alla chiave mutabile dell'archivio. È distinta da una cache persistente di approvazioni.
- Una ricostruzione della prosa non può cancellare un rilievo nativo ancora aperto. Una modifica nativa invalida i testi e giudizi dipendenti.

Il costo locale del preflight e della ripresa è parte dell'accettazione. Il replay corrente di una sola fase richiede circa286 secondi e fallisce il limite240: non basta dimostrare che non invia nuove chiamate.

## 6. Misurare il progresso e riconoscere i cicli

Registrare separatamente: obblighi aperti, prove meccaniche disponibili, certificazioni valide, contesti da recuperare, criticità nuove e risultati invalidati. Il numero di JSON accettati o il cambiamento di un hash non sono un indicatore sufficiente.

Un ciclo di riparazione avanza se aggiunge una prova necessaria e valida, verifica un obbligo, corregge un'incoerenza o completa una dipendenza mancante. Un nuovo difetto dimostrato è una scoperta, da rendere visibile; non è automaticamente un miglioramento della guida.

La firma di mancato avanzamento deve considerare obblighi e condizioni normalizzate, fatti derivati e certificazioni, escludendo le sole differenze editoriali e gli ordinali di retry. Nuove equivalenze o decomposizioni sono revisioni auditate del grafo; le percentuali di avanzamento non sono confrontabili fra revisioni senza dichiararlo.

Il numero ammesso di tentativi senza progresso è una politica esplicita da verificare con replay, non una garanzia di successo. Superata la soglia, conservare il lavoro e fermare la guida con diagnosi; non aumentare automaticamente il budget, ignorare un controllo o avviare gli altri matchup dopo il fallimento del primo. I retry di trasporto, di protocollo e di contenuto hanno contatori distinti dentro lo stesso tetto cumulativo.

## 7. Compatibilità e migrazione dei job esistenti

Preferire una revisione interna dell'orchestrazione separata dal contratto del registro, con attivazione esplicita e persistita. Conservare lettori storici, identità delle richieste pagate e risultati originali. Un nuovo contratto non può leggere una vecchia approvazione come prova di una nuova garanzia.

Per il job corrente serve un manifest di migrazione verificato: packet e frame esatti, originali importati, journal riutilizzabili dopo controllo, certificazioni da invalidare, requisiti e rilievi conservati, contabilità e revisione del codice. Nessuna adozione della sonda sintetica. Un nuovo collegamento fra goal e vecchio testimone è una certificazione nuova, non una riscrittura dell'output AI.

La proposta252 e i55 risultati dei frammenti rimangono dati disponibili. Non si ricomprano automaticamente, né si trattano come approvazioni. Le nuove decisioni usano solo contratti e contesti compatibili.

255 chiamate v28 sono già consumate, incluse le3 diagnostiche;76 precedenti restano separate. I tetti più recenti sono500 per guida/1500 v28/riserva24, con245 residue sul primo e1245 nel pool. Una migrazione non azzera questi contatori. Se fosse necessario un nuovo job, il limite deve restare cumulativo sul gruppo di job collegati e richiede autorizzazione esplicita prima della rete.

## 8. Lavoro e gate di uscita

### Incremento A — Contratto eseguibile offline

Implementare un prototipo isolato del registro di obblighi/prove, dell'ammissione indipendente e dell'invalidazione. Riutilizzare le regole di risoluzione esistenti e verificare tutti gli originali. Nessun provider e nessun cambiamento del percorso attivo.

Casi minimi: prova presente in un'altra unità; requisito composto con più testimoni; stesso testo con condizioni diverse; richiesta infondata con fonte; frame/pescata diversi; goal già assegnato ma non soddisfatto; risposta critica non valida; nuova alternativa che invalida il massimo; riapertura senza perdita di dati; ciclo semantico con testo diverso. Ogni test deve rifiutare almeno una falsa chiusura, non soltanto accettare il percorso ideale.

**Gate A:** tutti gli originali sono rappresentati; nessuna chiusura senza autorità e prove correnti; nessun riuso di un pass fuori contesto; nuova costruzione richiesta solo per obblighi ancora aperti e ammessi. Nessuna affermazione di qualità AI da un prototipo sintetico.

### Incremento B — Integrazione completa e audit di capienza

Collegare insieme ruoli, migrazione, recupero del contesto, scheduler, metadata, riparazioni e pubblicazione. Applicare il contratto a tutte le famiglie dell'audit, non solo a `branch-plan-choices`. Conservare i validatori fisici/tattici e tutti i confronti necessari.

**Gate B:** replay del job corrente senza nuove chiamate e senza ricomprare piani/prove compatibili; ripresa fredda degli altri due casi; test di omissione/tampering e regressioni di compatibilità; input e output reali/stress delle varie famiglie nei limiti o arresto esplicito prima della rete; riserve e contatori verificati; costo locale misurato e assenza di riesami integrali ripetuti senza necessità. La soglia pratica di tempo/memoria deve essere fissata nel task prima dell'integrazione e non ampliata dopo un fallimento per dichiarare verde la prova.

Gli output futuri del modello restano ignoti: una previsione non garantisce né il costo finale né il successo. Vanno provate le strategie di suddivisione di ogni ruolo e le unità ancora irriducibili dichiarate, non nascoste.

### Incremento C — Un esperimento reale e la consegna

Solo dopo A/B: codice e dati congelati, budget aggiornato e consenso specifico a riaprire lo stop. Stessi tre matchup, produzione autonoma, contabilità continua, arresto appena valida ogni guida e stop globale al primo esito non valido. Nessun aumento automatico o held-out implicito.

Misurare chiamate, tempo, costo locale, obblighi realmente risolti, nuove prove e ragioni dei fallimenti. Se ricompaiono le stesse condizioni senza avanzamento, il risultato è un fallimento del nuovo ciclo; non si propone automaticamente un'altra prova più grande.

**Gate C e completamento APP-225:** tre guide effettivamente approvate con tutti i controlli; integrità, salvataggio, riapertura, isolamento e UI dei tre report reali; valutazione della generalità con casi indipendenti e nessun routing per carte/matchup, con eventuali held-out solo se autorizzati; policy numerica iniziale ed estensione/retry/arresto sostenute dalle misure; adozione verificata della policy; attivazione del nuovo percorso e build locale destinata all'utente. I test della policy v5 restano separati e non sostituiscono questi risultati.

## Decisione proposta

Completare A/B come un intervento coerente prima di altre prove reali. Il primo passo non è un altro aumento del budget o una proiezione aggiunta soltanto al selettore: è separare l'ammissione del requisito dalla costruzione del testimone e rendere verificabili le dipendenze di tutte le fasi. La proposta mantiene l'obiettivo originale e non autorizza nuove chiamate.
