<p align="center">
  <img src="resources/icon.png" alt="Logo Pokéguru" width="96" height="96">
</p>

<h1 align="center">Pokéguru</h1>

<p align="center"><strong>Il tuo spazio per preparare, analizzare e migliorare mazzi Pokémon TCG.</strong></p>

<p align="center">
  <a href="https://github.com/xmey95/pokeguru/releases/latest">Scarica l'app</a> ·
  <a href="#primi-passi">Primi passi</a> ·
  <a href="#sviluppo">Sviluppo</a> ·
  <a href="https://github.com/xmey95/pokeguru/issues">Segnala un problema</a>
</p>

Pokéguru è un'app desktop per lo **Standard occidentale**. Riunisce le tue liste, un catalogo di carte, dati di torneo e analisi AI in progetti locali indipendenti. Importa un mazzo, studia i matchup e confronta proposte complete: ogni modifica alla lista principale passa dalla tua decisione.

Disponibile per **Linux, Windows e macOS**, con consultazione offline dei dati già acquisiti e Codex come motore AI.

## Cosa puoi fare

| Funzione | Nel tuo percorso di gioco |
| --- | --- |
| **Organizza i mazzi** | Crea progetti separati, importa testo o file `.txt`, consulta lo storico e copia la lista negli appunti. Archivia e ripristina i progetti quando serve. |
| **Esplora le carte** | Cerca nel Catalogo condiviso, consulta effetti e immagini disponibili e confronta stampe e rarità della stessa carta di gioco. Gli aggiornamenti sono riprendibili e mostrano la copertura acquisita. |
| **Controlla la lista** | Valuta costruzione, rotazione e ammissione alla data scelta. Distingui errori certi e casi da verificare; imposta vincoli di quantità o stampa dal dettaglio delle carte nella Lista. |
| **Studia il metagame** | Consulta archetipi, tornei Play e Regional da Limitless, con liste disponibili, provenienza e copertura dei risultati. |
| **Prepara i matchup** | Genera guide con punti forti, rischi, carte chiave e piano di gioco. Discuti le analisi e conserva le revisioni legate alla versione del mazzo. |
| **Valuta alternative con l'AI** | Apri strategie indipendenti, chiedi modifiche e confronta candidate complete di 60 carte verificate dai controlli locali. Adotta manualmente l'intera lista quando sei convinto. |

La lista principale resta consultabile mentre lavori in Strategie o nelle Guide matchup. Le proposte e le conversazioni dei diversi progetti rimangono separate.

## Installazione

Scarica il pacchetto adatto dalla pagina delle [release](https://github.com/xmey95/pokeguru/releases/latest).

| Sistema | Pacchetto | Installazione |
| --- | --- | --- |
| Linux x64 | `.AppImage` | Rendi il file eseguibile e avvialo. È necessario un ambiente desktop. |
| Windows x64 | `-windows-x64-setup.exe` | Avvia l'installer e segui la procedura. |
| macOS Intel | `-macos-x64.dmg` | Apri il DMG e trascina Pokeguru in Applicazioni. |
| macOS Apple Silicon | `-macos-arm64.dmg` | Apri il DMG e trascina Pokeguru in Applicazioni. |

I pacchetti includono la CLI Codex nativa: **non servono Node.js, npm o un'installazione separata di Codex** per usare l'app. Le funzioni AI richiedono connessione e accesso Codex, configurabile in **Impostazioni AI**.

**macOS:** dalla v0.3.0 i pacchetti usano una firma ad hoc gratuita, senza certificato Developer ID né notarizzazione Apple. La CI verifica DMG, firma e avvio del binario su Mac Intel e Apple Silicon; l'apertura da Finder dopo il download su un Mac Apple Silicon esterno alla CI resta da provare. Gatekeeper può bloccarla. Nella v0.2.1 un utente ha visto «L'app è danneggiata e non può essere aperta» su Apple Silicon; il nuovo pacchetto non va considerato una correzione confermata di quel caso finché non viene provato sul suo Mac. Consulta la [guida alla distribuzione e alla prova manuale](docs/DISTRIBUTION.md). L'installer Windows è senza firma Authenticode. La release include `SHA256SUMS.txt`, manifest di provenienza e attestazioni GitHub per verificare i pacchetti.

## Primi passi

1. **Crea un progetto.** Dal selettore dei progetti scegli **Nuovo progetto**, assegna un nome e usa il circuito occidentale Standard.
2. **Importa la lista.** Nella sezione **Lista**, incolla il testo o scegli un file `.txt`. Controlla quantità e righe non riconosciute. Per esplorare l'interfaccia puoi usare la [lista dimostrativa](examples/lista-demo.txt): contiene 12 carte ed è una bozza, non un mazzo pronto da giocare.
3. **Aggiorna il Catalogo.** Usa **Aggiorna nuove carte** per acquisire schede e miniature disponibili. Torna alla Lista per consultare le carte, chiarire eventuali ambiguità e leggere l'esito Standard. Nel dettaglio di una carta puoi aggiungere i vincoli da rispettare.
4. **Prepara le analisi.** In **Impostazioni AI**, verifica l'accesso Codex e scegli modello e livello di ragionamento, oppure lascia **Automatico**. In **Eventi** aggiorna Play e Regional per rendere disponibili le relative evidenze locali.
5. **Studia e confronta.** In **Guide matchup** scegli un archetipo e genera una guida; in **Strategie** discuti la lista o chiedi una proposta. Puoi consultare i dati inviati e le fonti delle risposte. Le candidate valide restano separate finché non le adotti.
6. **Porta con te la lista.** Usa **Copia export** dalla Lista per copiarla negli appunti. Versioni, discussioni e guide restano nel progetto alla riapertura.

## Dati locali e servizi online

Progetti, liste, vincoli, conversazioni e guide vengono salvati sul computer. Catalogo ed Eventi sono condivisi tra i progetti. Puoi consultare i dati acquisiti, cercare le carte locali e preparare import/export anche offline.

La connessione serve per aggiornare le fonti, acquisire immagini mancanti e generare nuove risposte AI. All'apertura, l'app controlla la scadenza giornaliera degli aggiornamenti globali; stato, attese ed errori sono visibili. Restano disponibili aggiornamento manuale, pausa e ripresa.

Quando avvii una richiesta AI, il messaggio e il contesto pertinente — per esempio lista, vincoli, schede delle carte ed evidenze dei tornei — vengono inviati a Codex. Credenziali e token sono gestiti da Codex e non vengono copiati nel database dei progetti. L'accesso è condiviso con gli altri client Codex locali; la disconnessione dall'app interessa anche questi client.

L'archivio è in `data/pokeguru.sqlite` nella cartella dati dell'app. Prima delle migrazioni di schema viene creata una copia verificata; le immagini e le preferenze AI sono separate dal database. Per backup e ripristino consulta la [guida ai dati locali](docs/DATABASE.md).

## Copertura e limiti

- **Formato supportato:** Standard occidentale. La costruzione assistita completa da zero, il circuito giapponese e altri motori AI sono sviluppi futuri.
- **Controlli Standard:** l'esito si riferisce alle regole versionate incluse nell'app e alle stampe effettivamente coperte. I casi mancanti o ambigui restano da verificare. Aggiornare il Catalogo non aggiorna le regole: le nuove regole arrivano con una release. L'esito non è una certificazione di legalità torneo.
- **Fonti e analisi:** il Catalogo usa TCGdex; metagame ed eventi provengono da Limitless. La copertura dipende dai dati disponibili e le guide AI possono contenere errori. Quota del meta, piazzamenti e risultati contro il campo non sono il winrate del tuo mazzo.
- **Import/export:** il percorso è verificato con round trip locale e campioni in Limitless. Il formato di copia è predisposto per Pokémon TCG Live; l'importazione diretta nel client non è ancora verificata.

### Novità della v0.3.12

Nei nuovi turni Strategie, la prima chiamata AI può rispondere quando i testi originali forniti bastano oppure chiedere le ricerche necessarie. Restano i controlli su fonti, carte, candidate e vincoli, inclusa la revisione delle nuove carte citate.

Nel campione ripetuto, la mediana della domanda su Budew passa da 19,55 a 14,62 s (−25,22%); quella sulle protezioni da 15,97 a 12,63 s (−20,86%). Le sei prove puntuali passano da 12 a 6 chiamate. I lavori già avviati e le guide mantengono il proprio flusso; schema 16 invariato. [Note, verifiche e limiti](docs/RELEASE-0.3.12.md).

### Novità della v0.3.11

Le nuove analisi AI partono da statistiche complete degli Eventi e approfondiscono gli originali necessari alla richiesta. Le domande circoscritte ricevono risposte proporzionate; modello e livello di ragionamento restano quelli scelti. I controlli su carte, fonti e candidate e l'adozione manuale della lista rimangono attivi.

Nel confronto live sui cinque casi, quattro risultano più rapidi: il totale passa da 20m44s a 3m47s, con 46 → 12 chiamate. È un campione congelato di 32 partecipazioni, non una garanzia sui tempi di ogni analisi; la domanda puntuale su carta non migliora. I lavori già avviati mantengono algoritmo e checkpoint precedenti. Schema 16 invariato. [Note e limiti](docs/RELEASE-0.3.11.md).

### Correzione della v0.3.10

Le Strategie con evidenze estese non vengono più bloccate da «Evidenze del turno non valide» al salvataggio. Risposta, candidata ammissibile e fonti sono conservate integralmente, mantenendo i controlli di validità.

Per un risultato già pronto, aggiorna e riapri l’app; se necessario scegli **Completa salvataggio** nella Strategia. Non occorre scartare il risultato o rifare l’analisi AI. Recupero verificato sul caso reale con 426.754 caratteri di evidenze, senza duplicati né modifiche alla lista principale. Schema 16 invariato. [Note della release](docs/RELEASE-0.3.10.md).

### Novità della v0.3.9

Le analisi estese riutilizzano lotti e sintesi compatibili quando le prove crescono o il lavoro viene ripreso. La diagnostica distingue chiamate, riuso, tempi, dimensioni e consumo effettivamente disponibile; le schede originali necessarie alla verifica finale restano pronte senza duplicazioni esatte.

Le nuove analisi possono consultare una panoramica degli Eventi senza scegliere prima un archetipo. Partecipazioni e abbinamenti sono rappresentati da aggregati deterministici per lista esatta, evento e avversario, con denominatori e lacune espliciti; gli originali restano recuperabili. Ogni lotto riceve lista di partenza e vincoli. Modello e livello di ragionamento restano quelli scelti.

Sul campione reale verificato offline i lotti foglia passano da 872 a 344 (−60,55%). La misura non certifica la qualità tattica né una riduzione proporzionale di costi o durata. Le analisi già avviate conservano rappresentazione e checkpoint precedenti: la nuova aggregazione si applica ai nuovi workflow. Lo schema del database resta 16. [Misure e limiti](docs/AI-EVENT-AGGREGATES.md).

### Novità della v0.3.8

Le letture del database sono più leggere: indici mirati, riepiloghi compatti e pagine Eventi profonde indicizzate riducono scansioni e lavoro ripetuto. Versioni della lista, candidate, conversazioni e guide Matchup caricano lo storico a blocchi, mantenendo raggiungibile ogni elemento e la base corrente anche quando è fuori dalla prima pagina.

La raccolta delle prove AI mostra fase, avanzamento e tempi anche dopo il completamento dei lotti. I risultati salvati, gli originali e i checkpoint restano disponibili alla ripresa. Lo schema 16 conserva riferimenti e riepiloghi nella stessa transazione dei dati; prima dell'upgrade viene creato un backup verificato. Le misure locali, il costo aggiuntivo delle scritture e i limiti sono nel [rapporto sulle prestazioni](docs/DATABASE-PERFORMANCE.md).

Sono incluse anche le rifiniture già integrate in `dev`: progetti in Lista compatta, sezione Strategie, Guide matchup, suono degli avvisi configurabile, riconoscimento dell'Energia Telepatica e scorrimento delle attività. Restano i limiti di firma e della prova Finder esterna descritti sopra.

### Novità della v0.3.7

La preparazione delle analisi Codex viene eseguita in un worker separato, così puoi continuare a usare la finestra durante le operazioni sui dati. Il Catalogo integra da scansioni verificate le 19 schede incomplete individuate su Windows: 16 costi di attacco gratuiti e tre effetti Trainer omessi dalla fonte, con provenienza visibile.

Puoi eliminare un Thread con conferma, conservando le liste già adottate e la base dei Thread derivati; i lavori attivi devono prima essere fermati. I Matchup mostrano un'attesa durante il caricamento e distinguono gli errori dall'assenza di analisi. Il selettore dei progetti si apre in una modale con ricerca, progetti attivi/archiviati e sfondo sfocato.

L'aggiornamento porta l'archivio allo schema 14, con backup verificato prima della migrazione. Le integrazioni del Catalogo valgono per le stampe e i dati esatti controllati; non riparano un database già corrotto. La cancellazione locale di un Thread non elimina i backup preesistenti o la cronologia remota Codex.

### Correzione della v0.3.6

Le analisi distinguono i partecipanti dello stesso torneo anche quando condividono l'URL della lista. Questo corregge il blocco `UNIQUE constraint failed: ai_evidence_event_index.job_id, ai_evidence_event_index.key`. Dopo l'aggiornamento usa **Riprendi analisi** sul lavoro interrotto: messaggio iniziale e input già salvati vengono conservati. Non occorre annullare il Thread o azzerare il database.

### Novità della v0.3.5

La cronologia delle attività AI conserva tutte le nuove voci e sintesi, carica le precedenti quando scorri verso l'alto e mantiene navigabili Thread e Matchup durante il lavoro.

Thread e Matchup possono svolgere analisi estese in background mentre consulti l'app. Ogni ricerca locale acquisisce tutte le pagine disponibili; le liste identiche vengono raggruppate conservando occorrenze, piazzamenti e provenienza. Quando il contesto cresce, Codex analizza i dati in lotti salvati e ne costruisce una sintesi, con verifica delle carte citate prima della risposta finale.

Chiudere l'app ferma l'elaborazione; alla riapertura riprendono automaticamente i lavori prima attivi. **Pausa** conserva il lavoro e resta tale anche dopo la riapertura: usa **Riprendi analisi** quando vuoi continuare. I lotti compatibili vengono riutilizzati. **Annulla analisi** interrompe il lavoro in sospeso e libera il Thread. Attese automatiche, pause volontarie e problemi che richiedono intervento sono distinti. Una guida terminata dopo un cambio lista resta legata alla versione originale. La diagnostica esportabile include cause tecniche, tempi, dimensioni, copertura e avanzamento senza contenuti privati. Per vecchie analisi che non salvavano tutti gli input occorre una nuova richiesta sui dati attuali.

Le analisi grandi possono richiedere più chiamate e consumare più quota Codex. Non c'è una scadenza complessiva breve: il limite di dieci minuti riguarda la singola chiamata. L'archivio incrementale supera il precedente tetto di 64 MB; i lotti si dividono quando superano il contesto, senza restringere la ricerca. Errori temporanei di rete o quota hanno tentativi automatici limitati e attese visibili; la mancanza di progresso ferma il lavoro con una causa esplicita. Le sintesi sono interpretazioni AI e non sostituiscono gli originali consultabili dalla diagnostica. La copertura dipende dai dati locali e dalle ricerche scelte per la domanda.

### Novità della v0.3.3

Durante le analisi lunghe di Thread e Matchup, Pokéguru mostra le fasi del job Codex e le sintesi disponibili, conservando lo stato durante navigazione e riavvio. Da **Impostazioni AI → Assistenza e diagnostica → Esporta diagnostica…** puoi salvare un JSON per segnalare bug e rallentamenti. Il file include stati tecnici, tempi dei blocchi UI e incidenti del renderer; esclude liste, conversazioni e credenziali. Controllalo prima di condividerlo.

### Correzioni della v0.3.2

Nei Thread e nei Matchup Pokéguru recupera le schede delle carte nominate nella discussione e nelle liste Evento trovate. Se una prima risposta cita altre carte, le cerca nel Catalogo locale e rivede la risposta prima di salvarla. La diagnostica mostra quali testi sono stati consegnati, quali schede sono incomplete e quando una ricerca raggiunge un limite tecnico. Le liste del progetto vengono considerate per intero; le stampe con regole diverse restano distinte.

### Correzioni della v0.3.1

La Ricerca avanzata del Catalogo accetta domande più ampie e varianti lessicali; i risultati restano visibili anche durante l'aggiornamento del Catalogo. All'avvio l'app verifica l'integrità dell'archivio SQLite prima di aprire connessioni scrivibili: se è danneggiato, mostra un errore specifico e ferma gli aggiornamenti automatici. Questo controllo non ripara un archivio già corrotto e non elimina le possibili cause esterne di corruzione.

### Novità della v0.3.0

Questa versione include piani Matchup in prosa più scorrevole e **Ricerca avanzata AI** nel Catalogo. Puoi cercare, per esempio, «Pokémon Base con almeno 200 PS e ritirata massimo 1» oppure «carte che recuperano Energie dagli scarti».

La ricerca avanzata usa le schede locali, mostra copertura e risultati incerti e considera il mazzo solo quando la domanda lo richiede esplicitamente. Richiede Codex; i risultati sono temporanei e la qualità tattica resta da valutare su carte reali.

## Sviluppo

APP-192 è incluso nella v0.3.12: risposta o ricerca nella prima chiamata dei nuovi turni Strategie, con controlli invariati. Nelle prove ripetute, mediana Budew −25,22% e protezioni −20,86%. [Verifica e limiti](docs/AI-FOCUSED-FLOW.md).

Il flusso AI APP-191 è incluso nella v0.3.11. Contratto, confronto sui cinque compiti e limiti sono nel [rapporto di verifica](docs/AI-DECISION-FLOW.md).

La v0.3.9 aggiunge riuso delle analisi e aggregati Evento sullo schema 16 della v0.3.8. Conserva i workflow precedenti e non introduce migrazioni SQLite. Misure, contratto e limiti sono nel [rapporto sugli aggregati](docs/AI-EVENT-AGGREGATES.md); le ottimizzazioni SQLite precedenti sono documentate nel [rapporto sul database](docs/DATABASE-PERFORMANCE.md).

Servono **Node.js 24 o successivo**, npm e un ambiente grafico. Dalla radice del repository:

```sh
npm ci
npm run dev
```

| Comando | Scopo |
| --- | --- |
| `npm run typecheck` | Controllo dei tipi TypeScript. |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | Suite locale con gli stessi parametri della CI. |
| `npm run build` | Controllo dei tipi e build in `out/`. |
| `npm start` | Avvio della build locale. |
| `npm run test:e2e:offline` | Prova Electron di progetti, importazione, persistenza e migrazione con dati isolati. |
| `npm run package:linux` | AppImage x64, da eseguire su Linux. |
| `npm run package:win` | Installer NSIS x64, da eseguire su Windows. |
| `npm run package:mac` | DMG per l'architettura del Mac usato per la build. |

Su Linux i test grafici possono essere eseguiti con `xvfb-run -a npm run test:e2e:offline`. Le prove live di fonti e AI sono separate: richiedono i servizi corrispondenti e, per le generazioni, accesso Codex e disponibilità d'uso. L'elenco completo dei comandi è in [package.json](package.json).

Lo stack usa Electron, React, TypeScript e SQLite. I rami `task/*` confluiscono in `dev` tramite PR; la [CI](.github/workflows/ci.yml) verifica Linux, Windows, macOS Intel e Apple Silicon. Il merge di una nuova versione in `main` avvia il [workflow di release](.github/workflows/release.yml), con build, prove dei pacchetti e pubblicazione dopo i controlli.

## Documentazione e feedback

| Documento | Contenuto |
| --- | --- |
| [Prodotto e requisiti](docs/PRODUCT.md) | Flussi, perimetro e requisiti del prodotto. |
| [Roadmap](docs/PLAN.md) | Incrementi previsti e punto di ripresa. |
| [Backlog](docs/BACKLOG.md) | Stato delle attività e verifiche registrate. |
| [Decisioni e fonti](docs/DECISIONS.md) | Scelte tecniche e provenienza dei dati. |
| [Archivio e recupero](docs/DATABASE.md) | Persistenza, migrazioni, backup e ripristino. |
| [Design system](docs/DESIGN_SYSTEM.md) | Componenti, navigazione e criteri dell'interfaccia. |
| [Istruzioni di progetto](AGENTS.md) | Procedura per contribuire con Codex. |

Per un problema o una proposta, apri una [issue su GitHub](https://github.com/xmey95/pokeguru/issues). Indica versione dell'app, sistema operativo e passaggi per riprodurre il comportamento; allega una lista di esempio quando utile, evitando credenziali e dati personali.

Da v0.3.3, per un problema nell'app apri **Impostazioni AI → Assistenza e diagnostica → Esporta diagnostica…** e allega il JSON salvato. Il report contiene stati e misure tecniche, senza nomi dei progetti, liste, conversazioni o credenziali; controllalo prima di condividerlo. Non viene inviato automaticamente.

Le carte e le immagini consultate mantengono l'attribuzione alle rispettive fonti e ai titolari dei diritti. Gli asset delle carte acquisiti dall'app restano nella cache locale e non sono inclusi nel repository o nei pacchetti.
