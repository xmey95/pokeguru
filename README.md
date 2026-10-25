# Pokéguru

Per migrazioni dell'archivio locale, backup pre-upgrade e prova di recupero, vedi [docs/DATABASE.md](docs/DATABASE.md).

Pokéguru è un'applicazione locale pianificata per costruire e migliorare mazzi Pokémon TCG: idea, catalogo delle carte, lista importata o creata da zero, confronto con tornei pertinenti al circuito competitivo, sezione Matchup con carte chiave e guide tattiche, thread AI paralleli con proposte motivate e adozione manuale dell'intera lista. Il primo MVP usa Codex; in una fase avanzata sarà possibile scegliere il motore AI. Le carte di gioco collegano le stampe pertinenti allo Standard, incluse promo e rarità, senza trattare ogni lingua come un diverso mazzo competitivo. Le vecchie stampe fuori formato non vengono scaricate in massa; una stampa Trainer storica già in cache e importata esattamente può essere verificata tramite una stampa corrente con testo identico e data ammessa. Deve supportare archetipi diversi; Mega Absol ex / Mega Audino ex è solo un esempio.

**Stato al 24 ottobre 2026:** I1 e il primo percorso I2 (`APP-016`, `APP-022`, `APP-005`–`APP-008`) sono utilizzabili sul campione dichiarato. L'app Electron crea progetti Standard occidentali, importa ed esporta liste testuali e offre un catalogo TCGdex condiviso fra progetti: al campione si aggiunge il download riprendibile dell'inventario H/I/J, delle promo SVP/MEP con marchio e delle Energie Base (APP-031/032). La Lista corrente raggruppa automaticamente le righe con la stessa identità di gioco verificabile; aprendo una carta si vedono tutte le stampe note, con quelle indicate nel testo originale evidenziate. I vincoli del mazzo si impostano dalla lista o dal Catalogo e mostrano conflitti di quantità; la Lista corrente conferma la conformità allo snapshot Standard solo per stampe e date completamente coperte; negli altri casi mostra il motivo da verificare. Mostra automaticamente gli archetipi del Metagame Limitless nel periodo e nelle regioni selezionate; per ogni archetipo può generare una guida Matchup con Codex e conservarne le revisioni. La sezione globale **Eventi** acquisisce un primo torneo Standard online da Limitless Play e conserva partecipazioni e liste con copertura e provenienza visibili, anche offline. La prima versione di **Impostazioni AI** permette di controllare l'accesso Codex, scegliere modello e ragionamento e provare una richiesta. Ogni **Thread** conserva una sessione Codex distinta e può chiedere una proposta completa di 60 carte: la candidata e le fonti restano nel thread. Una candidata può essere confrontata e adottata manualmente come nuova versione dell'intera lista; la base superata blocca l'adozione. La CI Linux/Windows è attiva e la protezione di dev/main richiede entrambi i check; I3 è completo e la release pubblica v0.1.0 è disponibile per la prova prima di I4.

APP-033 offre due operazioni globali: **Aggiorna nuove carte** scopre i nuovi set e scarica solo i dettagli mancanti; **Scansione completa** ricontrolla anche i dettagli esistenti. Il lavoro procede a lotti persistenti e riprende dopo interruzioni. APP-035 include uno snapshot datato del registro promo Play! Pokémon: 339 promo disponibili e sette future al controllo del 23 ottobre 2026. Le promo non elencate restano non verificate; la classificazione non è un verdetto di legalità Standard e il registro non prova che TCGdex contenga ogni stampa.

APP-054–057 completano il checkpoint di qualità Matchup prima di I4. Il Catalogo conserva testi, costi, danni e abilità e aggiorna le vecchie schede quando servono all'analisi; il controllo Standard inviato a Codex è quello calcolato dalla lista alla data corrente. **Eventi** ha due schede globali: Play online con liste e abbinamenti espliciti, e Regional del database principale con piazzamenti e un campione dichiarato di liste. Ogni scheda offre **Aggiorna nuovi** e **Scansione completa** a blocchi riprendibili. Il Matchup usa più eventi e varianti quando l'archetipo è collegato con sicurezza e conserva fonti e copertura nella guida e nelle revisioni. Quota Meta, punti, piazzamenti e record dell'avversario contro il campo non sono un winrate contro il nostro mazzo. Questa versione del checkpoint non è ancora nella release v0.1.0.

APP-059 corregge un caso emerso nella prova utente: Genesect SFA 40 aveva una data Standard assente dal pacchetto e l'AI attribuiva il dubbio a Battle Cage PFL 116. La data SFA verificata è ora inclusa; gli avvisi citano la riga originale. Le guide nuove includono le schede dei Pokémon meno frequenti presenti nelle liste campione, distinguono le stampe Riolu e indicano i Premi concessi dai Pokémon ex. Le guide già salvate restano storiche: genera una nuova analisi per provare i dati aggiornati.

APP-060 corregge i falsi dubbi sulla lista Hydrapple: `Basic {G} Energy MEE 1` è Energia Base, `Bug Catching Set PRE 102` ha data di ammissione nel pacchetto e `Boss's Orders PAL 265`, già salvata nel profilo, può essere verificata tramite la stampa corrente con stesso testo. Sul profilo letto in sola lettura il controllo ora mostra tutti i controlli locali superati. Le guide Matchup precedenti restano snapshot: genera una nuova analisi per usarlo.

APP-034 aggiunge nella stessa schermata la copertura per set: stampe nel perimetro TCGdex, dettagli acquisiti e mancanti, promo classificate. Un clic sul nome del set filtra le carte. Il totale del set TCGdex è mostrato separatamente dal sottoinsieme nel manifest Standard. APP-037 mostra la data del set in TCGdex; APP-039 la confronta con la data di uscita ufficiale per 17 set occidentali e APP-042 segnala set ufficiali assenti dal manifest (nessuno al controllo del 23 ottobre 2026). La completezza di tutte le stampe fisiche non è certificata. Nella Lista corrente, APP-043/044 mostrano separatamente l'attesa dei set e lo stato temporale delle promo, con fonti e casi ignoti; APP-018 aggrega questi controlli con lo snapshot delle carte vietate, mantenendo esplicita la copertura.

Nel **Catalogo**, **Controlla fonti Standard** verifica online le affermazioni del pacchetto locale sulle date di rotazione e ammissione. Mostra separatamente fonte coerente, modificata o non raggiungibile, conservando data e ultimo controllo riuscito dopo il riavvio. Una pagina bloccata dalla fonte non viene scambiata per una modifica delle regole. L'app usa offline le regole incluse nella release installata. Un cambio delle fonti richiede revisione e una nuova release; «Aggiorna nuove carte» non cambia le regole.

Nella sezione **Thread**, apri una candidata per confrontare la lista completa con la base del thread e con la versione principale attuale. **Adotta l'intera lista candidata** crea una nuova versione principale e lascia intatte le altre candidate; richiede 60 carte senza problemi certi o vincoli mancanti e una base ancora corrente. Le verifiche incerte restano visibili e la legalità torneo non è certificata. I codici TCGdex dei set verificati sono convertiti nelle abbreviazioni ufficiali nella versione adottata, con anteprima del testo; un codice sconosciuto o una stampa ALT richiedono una candidata corretta prima dell'adozione. Il Deck Builder Limitless è stato provato direttamente solo con `me02.5` → `ASC` e `sv04.5` → `PAF`.

## Workspace in sviluppo (APP-052)

Sul ramo `task/desktop-redesign-integration`, **Lista**, **Thread** e **Matchup** sono nella navigazione laterale larga 208 px. La lista principale salvata resta visibile accanto al compito attivo: il pannello è largo **384 px** oltre 1240 px di finestra e scorre indipendentemente; a 1240 px o meno diventa un dock inferiore persistente. La finestra si apre a 1280×800 e può scendere fino a 640 px di larghezza. Con APP-074, il pannello mostra sempre l'intera lista per gruppi, con totale e stato. La creazione di altri progetti si apre da **Nuovo progetto**; quando il progetto è vuoto e la finestra è stretta, **Inizia un progetto** apre il modulo nel contenuto. Catalogo, Eventi e Impostazioni AI sono nelle risorse della stessa barra. Questo ramo non è incluso nella release v0.1.0.

In **Thread**, crea un percorso da **Nuovo thread** e usa **Incolla manualmente una candidata completa** oppure la proposta Codex. La candidata più recente mostra lista principale, lista proposta e differenze; il comando di adozione apre una conferma dell'intera lista. Una base superata impedisce l'adozione. Per provare il confronto importa `examples/workspace-principale.txt`, poi incolla `examples/workspace-proposta.txt` come candidata manuale. Sono liste di esempio per l'interfaccia, non liste competitive verificate: molte stampe non sono indicate e i controlli potrebbero impedirne l'adozione. In **Matchup**, cerca un avversario per nome: piano, limiti e carte chiave precedono la configurazione AI; la lista principale resta nel pannello fisso. `npm run test:workspace-ui` verifica le tre viste in Electron con archivio temporaneo: la guida usata da questo test è una fixture dichiarata, non una generazione Codex. La prova automatica copre 1440×900, 1280×720, la soglia responsive a 1241/1240×720, 1024×768 e 640×720, più le risorse globali a 640×580; per un controllo manuale avvia `npm run dev` con Node 24 e prova a ridimensionare la finestra.

### Testi e priorità dell'interfaccia (APP-053)

Sul ramo `task/content-hierarchy`, derivato dal workspace integrato, la Lista mostra un solo stato del catalogo e raggruppa per causa i controlli ripetuti; i risultati di rotazione e ammissione restano apribili sulla riga. Le carte senza corrispondenza non sono più dichiarate genericamente «fuori dal catalogo campione». Il Thread raggruppa le verifiche della candidata e conserva differenze, blocchi e conferma manuale. Nel Matchup la guida corrente compare una sola volta; la cronologia conserva le guide precedenti e mostra l'ultima osservazione con ciò che è cambiato. Nel Catalogo ricerca e carte precedono gli audit dettagliati, mentre lacune del manifest e fonti cambiate restano evidenti. Eventi, Vincoli, importazione, barra progetti e Impostazioni AI usano stati più brevi con dettagli accessibili. Questa revisione non è nella release v0.1.0 e non avvia I4.

L'integrazione del workspace e dei testi in `dev` è tracciata dalla [PR #4](https://github.com/xmey95/pokeguru/pull/4). `main` e la release v0.1.0 non cambiano con questa PR.

### Design system (APP-083)

La revisione condivisa APP-084 elimina il riepilogo duplicato nella vista **Lista**, che usa ora l'area disponibile. Il pannello fisso e il dock descritti sotto rimangono in **Thread** e **Matchup**.

APP-085 sostituisce l'elenco permanente dei progetti con un **selettore in alto**: clic sul progetto attivo per cercare gli altri o crearne uno nuovo. Nella barra compatta il selettore usa un pulsante dedicato.

APP-062 organizza la **Lista** in righe con miniature e sezioni **Pokémon, Allenatori ed Energie**, con conteggi delle copie e riepilogo cliccabile. Le immagini disponibili provengono dal catalogo locale; quelle mancanti hanno un segnaposto. Le categorie seguono il catalogo o, con nota, le intestazioni dell'import; i casi ignoti restano “Da classificare”.

APP-063 riunisce **totale e stato Standard** nell'intestazione della Lista, sostituendo il badge “Pronta per controllo”. **Controlli e fonti** apre gli approfondimenti; i problemi certi restano subito visibili.

APP-064 mostra nel **dettaglio della carta** immagine, abilità, attacchi o effetto, poi il vincolo. Stampe e controlli sono apribili; testi in inglese dal catalogo locale e dati mancanti espliciti.

APP-065 apre **Aggiungi vincolo** direttamente nella carta, con anteprima di esito e conflitti. Il riepilogo si aggiorna al salvataggio e consente modifica nella riga ed eliminazione. Annulla/Escape chiudono il modulo senza scritture; gli errori conservano i valori inseriti.

APP-066 mostra l'importazione su richiesta da **Importa / sostituisci**, sopra la lista, con testo precompilato e **Annulla**. Nei progetti vuoti il modulo è subito disponibile. Il salvataggio chiude il modulo; errori e letture file pendenti conservano l'isolamento fra progetti.

APP-067 riunisce i **Thread** in un selettore con ricerca, titolo e stato, accanto a **Nuovo thread**. La creazione apre un modulo nel contenuto, annullabile con il pulsante o Escape. La lista principale resta consultabile anche quando il selettore è aperto.

APP-068 mostra la candidata corrente in un **riepilogo compatto**, con stato, copie cambiate e controlli essenziali. **Apri confronto** espande liste, differenze, fonti e adozione manuale; Escape o **Chiudi confronto** riportano al riepilogo. Il titolo del thread compare nel solo selettore e la conversazione precede i dettagli AI.

APP-069 usa un unico campo per **Discuti / Proponi una lista**, conservando il testo al cambio modalità. **Salva osservazione** registra il testo senza chiamare Codex; l'anteprima dei dati è unica. Errori contestuali conservano la richiesta e le anteprime tardive vengono ignorate dopo un cambio di contesto.

APP-109 avvia Codex già con il **primo messaggio** inserito in **Nuovo thread**. Il messaggio è salvato prima dell'invio e resta nel Thread se Codex fallisce: **Riprova primo messaggio** lo riusa senza duplicarlo. La risposta conserva la sessione Codex e le evidenze locali usate. **Salva nota senza AI** crea invece il Thread senza chiamare Codex.

APP-070 riunisce gli avversari **Matchup** in un selettore con ricerca, quota meta e stato della guida. Gli avversari storici restano consultabili senza presentare una vecchia quota come attuale. Il menu lascia visibile il mazzo; frecce e Invio selezionano, Escape chiude e restituisce il focus.

APP-071 porta il **piano Matchup** in primo piano e rende punti forti, rischi e fonti dettagliate apribili. I testi della guida e delle revisioni contengono **link contestuali** a carte, eventi e fonti disponibili; lo storico conserva i propri riferimenti. Nella demo, cerca “fixture UI” e prova i link a Mega Absol ex e Mega Audino ex.

APP-072 aggiunge **Indietro / Avanti** nell'intestazione e **Alt+← / Alt+→**. Il ritorno recupera selezione, dettagli aperti, filtri, bozze, scorrimento e focus. Le bozze restano separate per progetto e contenuto; i messaggi già salvati non ricompaiono nel campo di scrittura. I link **↗** aprono il browser esterno e lasciano intatta l'app. Cronologia (fino a 80 destinazioni) e bozze durano per la sessione: chiudendo l'app vengono azzerate. `node tests/matchup-switcher-ui-live.mjs --navigation` verifica i percorsi con archivio temporaneo, guide di esempio e operazioni reali di salvataggio.

Il ramo `task/production-design-system` rifinisce tutte le viste dell'app con token condivisi, tipografia sans, icone SVG, controlli leggibili e stati coerenti. La sidebar desktop è larga **224 px**; la lista principale rimane fissa a **384 px**, con dock di 220 px sotto la soglia di 1240 px. Il primo progetto si crea nell'area centrale. Metadati e metodo precedono meno spesso carte, differenze e strategia; focus e scorrimento sono verificati anche da tastiera.

L'[audit e le regole del design system](docs/DESIGN_SYSTEM.md) descrivono le scelte e i percorsi di prova. `node tests/workspace-ui-live.mjs --keep-profile`, dopo la build, conserva e stampa un profilo dimostrativo isolato. La guida e le liste di prova sono esempi UI, non nuove generazioni Codex. La rifinitura non è ancora integrata in `dev` né nella release v0.1.0.

APP-073 rifinisce **Discussione** nelle guide Matchup: ultimo scambio sempre visibile, osservazione e risposta Codex distinte, **Aggiorna guida** come azione principale. **Revisioni precedenti (N)** raccoglie lo storico e **Leggi versione** apre le vecchie guide senza scorrimenti annidati. Attesa, errore e riprova restano accanto al commento; la guida valida resta disponibile. `node tests/matchup-switcher-ui-live.mjs --discussion --navigation` verifica questi stati e il ritorno al contesto con risposte AI simulate e archivio temporaneo.

APP-075 separa **Modifica** della configurazione AI e **Dati inviati** vicino all'azione Matchup. Una scelta locale resta visibile come **Personalizzata**. La sintesi distingue fonti salvate della revisione e archivio corrente di rigenerazione/nuova base; **Dettagli e fonti** raccoglie il contenuto tecnico. **Dati per rigenerare** descrive l'invio della nuova guida. `node tests/matchup-switcher-ui-live.mjs --ai-options --discussion --navigation` verifica il flusso con risposte controllate, senza nuove chiamate AI.

APP-076 porta ricerca e risultati del **Catalogo** subito sotto l'intestazione. **Aggiorna nuove carte** resta visibile; **Gestisci catalogo** raccoglie scansione completa, campione, copertura e regole. Avvisi e avanzamento restano visibili a pannello chiuso. Scegliere un set dalla copertura riporta ai risultati filtrati; Escape richiude la gestione. `node tests/catalog-ui-live.mjs` verifica il percorso con archivio temporaneo e risposte di sincronizzazione controllate.

APP-077 porta **immagine e testo di gioco** nel primo livello del dettaglio Catalogo, con la stessa presentazione della Lista. **Stampe e metadati** raccoglie varianti e provenienza e permette di scegliere la stampa visualizzata; immagine, testo e fonte restano coerenti con la scelta e il filtro espansione. Dati mancanti e incertezze sono espliciti; il vincolo segue il testo. `node tests/catalog-card-ui-live.mjs` verifica schede, selezione, tastiera, navigazione e layout con dati di prova isolati.

APP-078 riordina **Eventi**: **Play online / Regional** condividono intestazione, selezione del torneo e filtro giocatore/mazzo. Risultati e liste precedono gli approfondimenti, con conteggi Pokémon/Allenatori/Energie. **Copertura e fonti** mostra una sintesi con denominatori e apre provenienza/metodo; **Gestisci eventi** contiene la scansione completa. Errori e pausa restano visibili. `node tests/tournament-ui-live.mjs --offline` verifica entrambi i percorsi con dati di esempio e risposte di sincronizzazione controllate; `--keep-profile` conserva l'archivio temporaneo per una prova manuale.

APP-079 riordina **Impostazioni AI**: stato Codex compatto, modello/ragionamento, **Salva preferenze** e **Annulla modifiche**. **Esegui prova AI** usa la configurazione salvata e spiega eventuali blocchi; account, disponibilità e dati inviati sono negli approfondimenti. Errori e scelte non più disponibili restano visibili. `node tests/ai-settings-ui-live.mjs` verifica il percorso con account/richieste simulati e preferenze temporanee; `node tests/ai-settings-offline.mjs` verifica la CLI assente.

APP-080 completa la [revisione grafica finale](docs/UI_FINAL_REVIEW.md): terminologia **Lista principale**, titoli e azioni coerenti, stato del mazzo senza duplicati, ricerche vuote recuperabili e selettori AI dei Thread che conservano le scelte non disponibili. Il rapporto raccoglie la matrice delle sezioni, le schermate responsive e le verifiche eseguite su Windows. Il checkpoint resta sul ramo locale, prima di I4.

APP-081 uniforma [caricamenti e attività in corso](docs/UI_LOADING_REVIEW.md): segnaposto iniziali, avanzamento misurato del Catalogo con ripresa dalla pausa, conteggi di Play/Regional e tempo trascorso durante le richieste Codex. Carte e guide salvate restano consultabili; tornando nella sezione si ritrova lo stato dell'operazione. Nessuna percentuale AI o durata restante inventata. `node tests/loading-startup-ui.mjs` prova apertura, totale ignoto, errore e recupero del polling con ritardi controllati.

## Versione scaricabile

Scarica [Pokéguru v0.1.0](https://github.com/xmey95/pokeguru/releases/tag/v0.1.0): `Pokeguru-0.1.0-linux-x86_64.AppImage` su Linux oppure `Pokeguru-0.1.0-windows-x64-setup.exe` su Windows. Il file `SHA256SUMS.txt` permette di controllare il download. Su Linux rendi eseguibile l'AppImage (`chmod +x`) e avviala; su Windows usa l'installer. I pacchetti iniziali non sono firmati digitalmente. La [prova della validazione Standard occidentale](#prova-della-validazione-standard-occidentale) e le prove dei thread più avanti descrivono i percorsi da verificare prima di I4.

## Avvio per sviluppo

Il logo, la favicon e le icone desktop derivano da `resources/brand/pokeguru.svg`. Per rigenerare gli asset: `npm run brand:generate`; usi, formati e verifiche in [Identità visiva](docs/BRAND.md).

Servono Node.js **24 o successivo** e npm. Su Linux serve un ambiente desktop; i comandi sono gli stessi su Linux e Windows, dalla radice del repository:

```sh
npm ci
npm run dev
```

`npm run build` genera i file in `out/`; `npm start` apre la build locale. `npm test` verifica parser, persistenza, vincoli e preferenze AI; `npm run test:e2e:offline` costruisce l'app ed esercita progetti, import, riapertura e migrazione I1 in una vera finestra Electron senza chiamare TCGdex o Limitless. Richiede un display grafico; su Linux usare `xvfb-run -a npm run test:e2e:offline`. `npm run test:ai-live`, `npm run test:matchup-live` e `npm run test:codex-app-server-live` richiedono Codex CLI installato e autenticato; inviano richieste reali a Codex e possono consumare parte del limite. Il pacchetto installabile per utenti finali non è ancora disponibile.

La prova reale del catalogo è separata dai test locali: su Linux `POKEGURU_CATALOG_LIVE=1 npx vitest run tests/catalog-live.test.ts tests/standard-catalog-live.test.ts`; in PowerShell impostare prima `$env:POKEGURU_CATALOG_LIVE='1'`. `POKEGURU_PROMO_AUDIT_LIVE=1 npx vitest run tests/promo-audit-live.test.ts --reporter=verbose` confronta le promo del pacchetto con gli indici TCGdex e i marchi G esclusi; `POKEGURU_MARKLESS_AUDIT_LIVE=1 npx vitest run tests/markless-audit-live.test.ts --reporter=verbose` controlla Energie e promo senza marchio. La prova grafica `npm run test:e2e` sincronizza il campione TCGdex e carica il metagame Limitless, quindi richiede rete. Il test opzionale `POKEGURU_CATALOG_BULK_LIVE=1 npx vitest run tests/standard-catalog-live.test.ts` scarica migliaia di dettagli in un archivio temporaneo e può richiedere diversi minuti.

La CI in `.github/workflows/ci.yml` verifica ogni PR verso `dev` o `main` e i push su `task/*` e `dev`, su Ubuntu e Windows, con `npm ci`, typecheck, test locali, build, prove Electron offline di progetto, Catalogo, Eventi, Impostazioni AI e Thread AI. Su Linux prova anche l'avvio del login/logout App Server con Codex CLI pin in un profilo senza credenziali. Per sviluppare: creare un ramo `task/<nome>` da `dev`, aprire una PR verso `dev` e controllare entrambi i job **Verify**. Il repository è pubblico e dev/main richiedono entrambi i job prima del merge tramite PR, anche per gli amministratori. Le generazioni AI autenticate e le verifiche live delle fonti restano comandi manuali.

`npm run test:reconciliation-live` prova in Electron la lista integrata, le varianti, la riapertura e l'isolamento usando un catalogo locale di test, senza rete. `npm run test:reconciliation-ai-live` esegue anche una guida Codex reale e richiede Codex CLI autenticato; può consumare parte del limite.

`npm run test:export-live` prova in Electron la copia immediata negli appunti e la reimportazione della lista in un archivio isolato, senza rete.

`npm run test:threads-live` prova in Electron due thread paralleli, candidate isolate, base superata e riapertura in un archivio isolato, senza rete. `npm run test:threads-ai:offline` controlla l'errore quando Codex manca; `npm run test:threads-ai-live` richiede Codex autenticato e prova due sessioni e la ripresa reale.

`npm run test:catalog-ui` prova in Electron che il Catalogo globale e i due comandi siano disponibili anche senza progetto, usando un archivio temporaneo e senza rete.

`npm run test:tournament-ui:offline` prova in Electron la vista Evento e la riapertura di uno snapshot locale, senza rete. `npm run test:tournament-ui-live` acquisisce un evento reale dall'API Limitless Play in un archivio temporaneo; `POKEGURU_EVENT_LIVE=1 npx vitest run tests/limitless-event-live.test.ts` ripete il controllo del torneo campione del 23 ottobre 2026. L'API pubblica non richiede chiave ma applica un rate limit: non ripetere di continuo gli aggiornamenti.

## Pacchetti e release

`npm run package:linux` crea un AppImage x64 in `release/` su Linux; `npm run package:win` crea un installer NSIS x64 su Windows. `node tests/package-smoke.mjs <binario-estratto>` prova avvio, salvataggio, riapertura e migrazione usando cartelle temporanee. La CI ripete la prova anche sul contenuto dell'AppImage e dopo installazione NSIS. I pacchetti includono solo `out/`, `package.json` e dipendenze di produzione; l'archivio utente e le credenziali Codex restano nel profilo locale. La provenienza e la firma dei pacchetti sono descritte in [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md); l'installer iniziale non ha firma Authenticode.

La PR verso `dev` verifica Linux e Windows senza permessi di pubblicazione. Per una release, incrementare `version` in `package.json` nella PR da `dev` a `main`. Il push del merge su `main` ripete test, build e prove dei pacchetti; solo dopo il successo di entrambi i sistemi verifica hash e attestazioni dei file prima di creare il tag `vX.Y.Z` sul commit verificato. La GitHub Release contiene AppImage, installer, manifest di provenienza, note automatiche e `SHA256SUMS.txt`. Un tag già esistente interrompe il rilascio senza sovrascriverlo. Una pubblicazione interrotta dopo la creazione lascia una draft da esaminare manualmente. Il workflow aggiornato attende la prima prova reale su `main`.

## Prova rapida

1. Crea un progetto Standard.
2. Apri [examples/lista-demo.txt](examples/lista-demo.txt) dal pulsante **Scegli file .txt**, oppure incollane il contenuto nel campo **Testo lista**, poi scegli **Salva lista**.
3. Verifica il totale di **12 carte**, le stampe lette dalle righe, lo stato **Bozza** e il circuito **Occidentale / internazionale**. Il campione è sintetico e serve solo a provare il flusso.
4. Apri **Catalogo** e premi **Sincronizza campione**. Dovresti vedere **5/5 set acquisiti**: `sv01`, `sv02`, `sv04.5`, `me01` e `me02.5`. Cerca **Iono**: le stampe note compaiono sotto la stessa identità testuale quando hanno il medesimo effetto, con numeri e rarità distinti. Cerca **Mega Absol ex** e **Mega Audino ex**, poi **Rare Candy** e **Boss’s Orders** per confrontare le stampe precedenti con quelle Mega. Crea o apri un secondo progetto: il catalogo è lo stesso. Chiudi e riapri l'app, scollega la rete e riprova la ricerca: testo e miniature acquisite restano locali. Premere di nuovo **Aggiorna campione** non deve creare duplicati.
5. Apri **Matchup**: l'elenco arriva da Limitless (Standard, ultimo mese, Europa/Nord America/America Latina/Oceania), senza inserimento manuale. La pagina mostra la data dell'ultimo aggiornamento e la quota di ciascun archetipo.
6. Apri **Impostazioni AI** nelle risorse della barra laterale. Controlla lo stato Codex, scegli «Automatico» o un modello disponibile e, se scegli un modello, il livello di ragionamento. Salva e riapri la schermata: la scelta deve restare. **Esegui prova AI** invia una breve richiesta senza dati del mazzo. L'accesso Codex è condiviso con le altre app locali: **Disconnetti Codex** disconnette anche quelle. Se serve, **Accedi con ChatGPT** apre il browser.
7. Torna al progetto, apri **Matchup**, scegli un archetipo e apri **Opzioni AI e dati inviati**, poi **Dati inviati a Codex per questa analisi**. Puoi usare le preferenze globali oppure scegliere modello e ragionamento solo per la guida corrente. Premi **Genera analisi con Codex**. La generazione richiede rete e Codex CLI installato e autenticato (`codex login status`); può richiedere qualche minuto. Esamina punti forti, debolezze, carte chiave, strategia, fonte della lista avversaria, limiti e configurazione AI registrata. La lista demo di 12 carte è sintetica: la guida relativa è solo una prova tecnica.
8. Sotto la guida, scrivi un pensiero in **Rispondi a questa analisi** e premi **Rivedi analisi con Codex**. Prova a rispondere ancora: nella cronologia trovi ogni osservazione e ogni versione completa della guida, con la spiegazione di cosa è cambiato. In caso di errore, la guida precedente rimane leggibile e il commento può essere riprovato.
9. Riapri l'app: guida e discussione restano salvate anche se cambi le preferenze AI. Sostituisci la lista o aggiorna il meta quando lo snapshot cambia: la vecchia discussione è marcata come storica; **Continua sulla nuova base** genera una nuova guida collegata, se l'archetipo è ancora nel meta. Se l'archetipo esce dal meta, resta nell'elenco storico e la discussione rimane consultabile.
10. Crea un secondo progetto e importa una lista diversa: le guide del primo non devono comparire nel secondo. Per vedere la diagnostica della lista, aggiungi una riga libera non riconosciuta oppure cambia `Total Cards: 12` in `Total Cards: 60`, poi scegli **Sostituisci lista**.

Se hai salvato eventi in **Eventi**, una guida Matchup nuova collega gli archetipi Play per nome esatto e quelli Regional per ID del database principale. Mostra più eventi, varianti e liste complete nella finestra dello snapshot Meta, frequenza delle carte, schede di gioco disponibili e link alle fonti. I risultati V/S/P da pairings Play hanno denominatore e descrivono l'avversario contro il campo online; non sono un winrate contro il tuo mazzo. Piazzamenti, punti e quota Meta restano separati. Le revisioni conservano le evidenze della guida precedente.
**Apri nel Catalogo** mostra le stampe e rarità di una carta chiave quando la sua identità di gioco è verificata, anche per Pokémon. Per provare il percorso: aggiorna le due schede di **Eventi**, torna al progetto, apri **Matchup**, cerca Hydrapple e genera la guida con una lista propria completa. Confronta due liste Regional e le carte chiave con le pagine Limitless; verifica che il piano citi costi, danni, abilità e stato Standard della tua lista senza trasformare i piazzamenti in winrate. Rispondi alla guida con un'ipotesi tattica e controlla che la revisione la valuti senza riscrivere le fonti storiche.

## Prova degli archivi Eventi APP-055/056

Apri **Eventi** nelle risorse della barra laterale. Nella scheda **Tornei Play**, premi **Aggiorna nuovi tornei** e prosegui con **Continua blocco** finché la scansione finisce; il primo aggiornamento copre gli ultimi 90 giorni, la **Scansione completa** percorre anche l'archivio precedente. Seleziona un evento e verifica partecipazioni, liste e abbinamenti con la fonte. Nella scheda **Regional**, premi **Aggiorna nuovi Regional**; prosegui i blocchi per acquisire risultati e un campione dichiarato di liste per evento. Chiudi e riapri l'app offline: i due archivi restano globali. Dopo un 429, riprendi al termine del tempo indicato.

## Prova dell'inventario Standard APP-031

Apri **Catalogo** nelle risorse della barra laterale, anche senza progetto. **Aggiorna nuove carte** acquisisce l'indice TCGdex delle stampe con marchio H e successivi e delle Energie Base `sve`/`mee`; scarica i dettagli solo per le stampe nuove o ancora incomplete. **Scansione completa** ricontrolla ogni dettaglio e può richiedere molti minuti. L'app salva ogni lotto, mostra il progresso e riprende un lavoro interrotto al riavvio; dopo 429/503 ritenta più tardi. I dettagli precedenti restano consultabili offline. Cerca **Oshawott MEP 051** per il marchio J e lo stato nel pacchetto promo incluso. Lo snapshot copre le righe del registro osservate il 23 ottobre 2026: nuove promo non comprese sono segnalate come non verificate. Una nuova classificazione verificata delle promo arriva solo con una release dell'app; il comando aggiorna le carte, non le regole. Il filtro può includere carte non ancora ammesse e ometterne altre; la legalità Standard resta APP-030/APP-018. Le vecchie stampe fuori formato non vengono risolte automaticamente; le miniature non vengono scaricate in massa.

## Prova della validazione Standard occidentale

Nel **Catalogo** completa **Aggiorna nuove carte** e verifica che Mega Absol ex `me01-086` ed Energia Psico Base `sve-005` abbiano dettagli. Crea un progetto Standard occidentale e importa:

```text
1 Mega Absol ex MEG 086
59 Psychic Energy SVE 005
```

Imposta **Data di riferimento** al `2026-10-24`. La Lista corrente deve mostrare «controlli disponibili superati» e «conforme ai controlli Standard coperti». È un esempio strutturale, non un mazzo competitivo. Cambia la data al `2027-01-01`: l'esito deve diventare «da verificare» perché lo snapshot della rotazione finisce nel 2026. Una stampa assente, un set speciale senza data verificata o una vecchia ristampa restano da verificare. Le nuove regole richiedono una release dell'app; **Aggiorna nuove carte** modifica soltanto il Catalogo.

## Prova della riconciliazione APP-006

Dopo aver sincronizzato il campione nel tab **Catalogo**, crea un progetto e incolla questa lista di prova nella sezione **Lista**:

```text
2 Iono PAL 185
1 Iono PAL 254
1 Rare Candy PAF 089
1 Boss's Orders SWSHALT 127
1 Carta promo PR-SV 001a
1 Basic Psychic Energy SVE 5
```

In **Lista corrente** vedrai **Iono ×3** in una sola riga, senza scegliere la rarità. Aprila: mostra tutte le stampe Iono note nel campione, incluse PAL 185 e PAL 254 indicate nel testo, con numeri, rarità e varianti. Apri anche Rare Candy. Il codice ALT resta nel testo originale e richiede cautela; promo ed Energia fuori campione sono visibili come tali. Se una carta di gioco è ambigua, aprila e usa **Correggi l’identità della carta di gioco** solo quando puoi riconoscerla. Chiudi e riapri l'app: lista e correzioni restano; un secondo progetto non eredita le correzioni. Una modifica del testo rende storiche le guide Matchup precedenti.

Il totale deriva dalle quantità delle righe interpretate, non da `Total Cards`. Il testo originale resta consultabile. **Pronta per controllo** indica solo 60 copie interpretate senza righe non riconosciute o totale discordante: non attesta legalità Standard, identità delle carte o compatibilità con PTCG Live/Limitless. Salvare un testo diverso crea una nuova versione principale, consultabile nel tab **Thread**; salvare di nuovo lo stesso testo non duplica la versione. Le guide Matchup sono ipotesi AI basate sulla lista importata, sul Metagame Limitless e su una lista avversaria pubblica di esempio quando disponibile. La **quota del meta non è il winrate del matchup**. Le vecchie note personali della versione APP-021 restano nel database ma non compaiono come guide AI.

Nel percorso di prova APP-006 il campione copre soltanto i nomi selezionati nei cinque set dichiarati; APP-031 amplia l'inventario se si avvia il download Standard. Il denominatore delle identità di gioco dell'intera fonte non è disponibile. Le equivalenze Trainer derivano dal testo coincidente, non attestano legalità Standard o errata. I Pokémon sono tenuti separati finché non sono verificati. Le immagini grandi del campione sono controllate online ma non salvate localmente; nel download ampio le miniature non sono acquisite in massa. I codici di stampa importati sono conservati come provenienza, non come scelta obbligatoria. Un campione esportato è stato riconosciuto da Limitless Deck Builder e Proxy Printer; non sono provati PTCG Live diretto, promo ALT e legalità Standard.

I dati sono nel percorso `userData` di Electron, sotto `data/pokeguru.sqlite`. Nei test automatici si usa una cartella isolata tramite `POKEGURU_DATA_DIR`.

## Prova dei vincoli APP-007

Con la lista Iono dell’esempio aperta, espandi **Iono** e scegli **Aggiungi vincolo su questa carta**. Imposta **Almeno N → 3**: il vincolo risulta soddisfatto sommando PAL 185 e PAL 254. Aggiungi un secondo vincolo su Iono, limitato a **Paldea Evolved 185**, **Esattamente N → 2**. Cambia il primo vincolo a **Almeno N → 4** per vedere il requisito non soddisfatto; aggiungi **Esattamente N → 2** sulla carta di gioco per vedere un conflitto tra vincoli. Puoi eliminare il vincolo conflittuale, scegliere una carta anche dal tab **Catalogo**, chiudere e riaprire l’app e verificare che un secondo progetto non erediti i vincoli. Le copie senza stampa certa possono produrre un esito **indeterminato**. Il risultato Standard dipende dai controlli e dalle stampe coperte dallo snapshot installato.

## Prova dell'export APP-008

Nella scheda **Lista**, importa `2 Iono PAL 185`, `1 Iono PAL 254` e `1 Rare Candy PAF 089` con intestazione `Trainer: 9` e `Total Cards: 99`. Premi **Copia export** in **Lista corrente**: il testo va subito negli appunti, senza opzioni intermedie. Incollalo in Limitless oppure nel campo di importazione del progetto: deve mostrare `Trainer: 3` e `Total Cards: 4`, lasciando invariate le tre righe carte. Una riga come `? carta dubbia` impedisce la copia e lascia invariati gli appunti; un codice ALT resta testuale e viene segnalato. Il campione da 4 carte verifica formato e stampe in Limitless, non la legalità Standard.

## Prova del controllo di rotazione APP-027

In **Lista corrente** trovi ora l'**Esito Standard occidentale** per la data selezionata. Un mazzo di 59 carte mostra «errore certo nei controlli»; una vecchia stampa ruotata o una stampa senza fonte mostra «da verificare» se non ci sono errori certi. «Controlli disponibili superati» elenca i controlli conclusi senza certificare la legalità torneo: errata, carte vietate, eccezioni e completezza del catalogo restano fuori dal verdetto. Cambia la data di riferimento per vedere il ricalcolo automatico senza sostituire la lista.

Apri una lista che contiene `2 Iono PAL 185` e `1 Iono PAL 254`. Dopo **Aggiorna campione** nel Catalogo, torna alla Lista corrente: il controllo mostra il marchio G sulle stampe riconosciute. Imposta **Data di riferimento** al 9 aprile 2026, poi al 10 aprile 2026: le tre copie passano da «marchio ammesso» a «marchio ruotato» senza cambiare la lista. Premi **Torna a oggi** per usare di nuovo la data automatica. Un codice `ALT`, una stampa non presente nel campione o una cache precedente senza marchi danno «da chiarire». Il controllo riguarda soltanto il marchio e le date Play! Pokémon 2025/2026 per eventi occidentali in presenza; la conformità dell'intera lista richiede anche costruzione, ammissione e fonti coperte.

## Prova dei controlli di costruzione APP-028

Nella **Lista corrente**, sotto la rotazione, trovi tre controlli distinti. Importa `3 Iono PAL 185` e `2 Iono PAL 254`: il limite generale di quattro copie segnala **Iono ×5**, indipendentemente dalla rarità. Sostituisci con `59 Basic Psychic Energy` e `1 Mew ex PAF 216`: il totale è 60 e le Energie Base non violano il limite di quattro; il controllo del Pokémon Base resta **da chiarire** finché quella stampa non è presente con la sua fase nel catalogo locale. Aggiungi una riga non riconosciuta per vedere un esito incerto sul totale. Questi controlli non attestano legalità Standard, date di rilascio o regole speciali.

## Prova del perimetro promo APP-032

Aggiorna nuove carte e cerca **Oshawott** nel set **MEP Black Star Promos**: la stampa MEP 051 deve avere marchio J e stato disponibile nel pacchetto verificato del 23 ottobre 2026. Il contatore distingue promo disponibili, future, non elencate e non verificate. Ripeti l'aggiornamento: i dettagli già acquisiti non vengono riscaricati. Usa **Scansione completa** quando vuoi ricontrollare rarità o varianti esistenti. Se il registro ufficiale cambia, il Catalogo continua a usare lo snapshot incluso finché non viene installata una nuova release. Importa poi `1 Rare Candy SVI 191` insieme a `2 Mega Absol ex MEG 86`: la vecchia stampa SVI resta nel testo ma non viene risolta dal catalogo Standard e la legalità resta indeterminata.

## Prova dei thread APP-019

Apri un progetto con una lista, per esempio `60 Carta A MEG 1`, poi il tab **Thread**. Crea **Piano A** e **Piano B**: entrambi partono dalla stessa versione principale. In Piano A salva `60 Carta B MEG 2` come candidata; in Piano B salva `60 Carta C MEG 3`. Tornando a **Lista**, la lista principale deve ancora essere `60 Carta A MEG 1`. Salva `60 Carta D MEG 4` come nuova lista principale: i due thread mostrano **Base da confrontare**, ma mantengono le rispettive candidate. Chiudi e riapri l'app per verificare versioni, osservazioni e candidate. Puoi creare un thread anche in un progetto senza lista. Le candidate sono bozze manuali locali.

Per provare APP-040/041, con Codex autenticato scrivi una domanda in Piano A e premi **Chiedi a Codex**. Ripeti in Piano B: ciascuno conserva una sessione distinta e le risposte indicano modello e ragionamento usati. Riapri l'app e continua Piano A. Dopo aver sincronizzato il Catalogo e importato una lista completa, nel thread descrivi una modifica e premi **Genera proposta Codex**. Puoi scegliere modello e ragionamento solo per quel thread; la scelta effettiva resta associata alla risposta. La candidata compare soltanto se Codex restituisce 60 carte con stampe univoche presenti nel Catalogo e supera i controlli disponibili; puoi aprire le fonti di ogni stampa. Un esito «nessuna modifica» è un messaggio senza candidata. Se Codex manca o restituisce una lista non verificabile, la richiesta resta nel campo per riprovare. La lista principale e l'altro thread devono restare invariati. L'adozione manuale dell'intera candidata è disponibile; i casi Standard fuori dallo snapshot restano da verificare. Le prove reali eseguite finora usano una lista strutturale sintetica, non dimostrano qualità competitiva.

Per provare APP-058, aggiorna **Catalogo** ed **Eventi**, poi apri un thread con una lista. Scrivi una domanda su una carta o un archetipo presente nei dati locali e premi **Vedi dati inviati a Codex**: l'anteprima mostra le schede, i testi di gioco disponibili e le liste torneo selezionate. Premi **Chiedi a Codex**, poi apri **Dati usati** sotto la risposta per vedere il pacchetto conservato e le fonti dichiarate. Ripeti dopo un aggiornamento locale: la nuova risposta segnala le fonti cambiate, mentre la precedente conserva i propri dati. Il pulsante di anteprima è disponibile anche prima di **Genera proposta Codex**; la candidata resta nel thread finché non la adotti esplicitamente.

## Mappa dei documenti

| File | Scopo |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Procedura durevole per le sessioni Codex e definizioni Ready/Done. |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Visione, requisiti, flussi, qualità, assunzioni e rischi. |
| [docs/PLAN.md](docs/PLAN.md) | Incrementi, obiettivo corrente e ripresa. |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Unica fonte autorevole dello stato delle attività. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisioni, alternative e registro delle verifiche su fonti primarie. |

Il project management in questi file riguarda **lo sviluppo software**; i progetti di mazzo saranno dati gestiti dagli utenti nell'app.

## Lavorare con Codex

Inizia una nuova sessione indicando l'obiettivo e l'eventuale task o incremento autorizzato. Codex leggerà i documenti, controllerà il repository e aggiornerà backlog e piano alla chiusura. `Ready` significa solo che un task è definito: lo sviluppo richiede una nuova istruzione esplicita dell'utente.

Esempi di richieste:

- «Mostrami avanzamento, attività `Blocked` e prossimo task `Ready`, senza implementare.»
- «Raffina I2 e i criteri dei suoi task, senza sviluppare.»
- «Avvia APP-001 e completa le verifiche previste.»
- «Avvia l'intero incremento I1, fermandoti al suo scenario dimostrativo.»
- «Riprendi APP-001 dal punto annotato nel piano e nel backlog.»
- «Registra l'idea X nel backlog, senza implementarla.»
- «Dopo la dimostrazione di I1, rivedi priorità, ipotesi e criteri di I2.»

Per controllare lo stato dei file locali: `git status --short --branch`.
