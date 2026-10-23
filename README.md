# Pokéguru

Pokéguru è un'applicazione locale pianificata per costruire e migliorare mazzi Pokémon TCG: idea, catalogo delle carte, lista importata o creata da zero, confronto con tornei pertinenti al circuito competitivo, sezione Matchup con carte chiave e guide tattiche, thread AI paralleli con proposte motivate e adozione manuale dell'intera lista. Il primo MVP usa Codex; in una fase avanzata sarà possibile scegliere il motore AI. Le carte di gioco collegano le stampe pertinenti allo Standard, incluse promo e rarità, senza trattare ogni lingua come un diverso mazzo competitivo. Le vecchie stampe fuori formato non vengono gestite come ristampe ammesse. Deve supportare archetipi diversi; Mega Absol ex / Mega Audino ex è solo un esempio.

**Stato al 23 ottobre 2026:** I1 e il primo percorso I2 (`APP-016`, `APP-022`, `APP-005`–`APP-008`) sono utilizzabili sul campione dichiarato. L'app Electron crea progetti Standard occidentali, importa ed esporta liste testuali e offre un catalogo TCGdex condiviso fra progetti: al campione si aggiunge il download riprendibile dell'inventario H/I/J, delle promo SVP/MEP con marchio e delle Energie Base (APP-031/032). La Lista corrente raggruppa automaticamente le righe con la stessa identità di gioco verificabile; aprendo una carta si vedono tutte le stampe note, con quelle indicate nel testo originale evidenziate. I vincoli del mazzo si impostano dalla lista o dal Catalogo e mostrano conflitti di quantità; la legalità Standard resta indeterminata. Mostra automaticamente gli archetipi del Metagame Limitless nel periodo e nelle regioni selezionate; per ogni archetipo può generare una guida Matchup con Codex e conservarne le revisioni. La prima versione di **Impostazioni AI** permette di controllare l'accesso Codex, scegliere modello e ragionamento e provare una richiesta; su Windows è stata verificata con Codex reale, mentre la verifica Linux resta aperta. Verifica di legalità, dati di match dei tornei e thread Codex paralleli per modificare il mazzo sono attività successive. La CI Linux/Windows è attiva sul ramo di lavoro; release GitHub e protezione dei branch restano da completare in I3.

APP-033 offre due operazioni globali: **Aggiorna nuove carte** scopre i nuovi set e scarica solo i dettagli mancanti; **Scansione completa** ricontrolla anche i dettagli esistenti. Il lavoro procede a lotti persistenti e riprende dopo interruzioni. APP-035 include uno snapshot datato del registro promo Play! Pokémon: 339 promo disponibili e sette future al controllo del 23 ottobre 2026. Le promo non elencate restano non verificate; la classificazione non è un verdetto di legalità Standard e il registro non prova che TCGdex contenga ogni stampa.

APP-034 aggiunge nella stessa schermata la copertura per set: stampe nel perimetro TCGdex, dettagli acquisiti e mancanti, promo classificate. Un clic sul nome del set filtra le carte. Il totale del set TCGdex è mostrato separatamente dal sottoinsieme nel manifest Standard.

## Avvio per sviluppo

Servono Node.js **24 o successivo** e npm. Su Linux serve un ambiente desktop; i comandi sono gli stessi su Linux e Windows, dalla radice del repository:

```sh
npm ci
npm run dev
```

`npm run build` genera i file in `out/`; `npm start` apre la build locale. `npm test` verifica parser, persistenza, vincoli e preferenze AI; `npm run test:e2e:offline` costruisce l'app ed esercita progetti, import, riapertura e migrazione I1 in una vera finestra Electron senza chiamare TCGdex o Limitless. Richiede un display grafico; su Linux usare `xvfb-run -a npm run test:e2e:offline`. `npm run test:ai-live`, `npm run test:matchup-live` e `npm run test:codex-app-server-live` richiedono Codex CLI installato e autenticato; inviano richieste reali a Codex e possono consumare parte del limite. Il pacchetto installabile per utenti finali non è ancora disponibile.

La prova reale del catalogo è separata dai test locali: su Linux `POKEGURU_CATALOG_LIVE=1 npx vitest run tests/catalog-live.test.ts tests/standard-catalog-live.test.ts`; in PowerShell impostare prima `$env:POKEGURU_CATALOG_LIVE='1'`. `POKEGURU_PROMO_AUDIT_LIVE=1 npx vitest run tests/promo-audit-live.test.ts --reporter=verbose` confronta le promo del pacchetto con gli indici TCGdex e i marchi G esclusi. La prova grafica `npm run test:e2e` sincronizza il campione TCGdex e carica il metagame Limitless, quindi richiede rete. Il test opzionale `POKEGURU_CATALOG_BULK_LIVE=1 npx vitest run tests/standard-catalog-live.test.ts` scarica migliaia di dettagli in un archivio temporaneo e può richiedere diversi minuti.

La CI in `.github/workflows/ci.yml` verifica ogni PR verso `dev` o `main` e i push su `task/*` e `dev`, su Ubuntu e Windows, con `npm ci`, typecheck, test locali, build e prova Electron offline. Per sviluppare: creare un ramo `task/<nome>` da `dev`, aprire una PR verso `dev` e controllare entrambi i job **Verify**. La protezione dei branch deve richiedere quei job prima del merge; il workflow da solo non imposta la regola su GitHub. Le prove live restano comandi manuali perché richiedono rete e/o accesso Codex personale.

`npm run test:reconciliation-live` prova in Electron la lista integrata, le varianti, la riapertura e l'isolamento usando un catalogo locale di test, senza rete. `npm run test:reconciliation-ai-live` esegue anche una guida Codex reale e richiede Codex CLI autenticato; può consumare parte del limite.

`npm run test:export-live` prova in Electron la copia immediata negli appunti e la reimportazione della lista in un archivio isolato, senza rete.

`npm run test:threads-live` prova in Electron due thread paralleli, candidate isolate, base superata e riapertura in un archivio isolato, senza rete.

`npm run test:catalog-ui` prova in Electron che il Catalogo globale e i due comandi siano disponibili anche senza progetto, usando un archivio temporaneo e senza rete.

## Prova rapida

1. Crea un progetto Standard.
2. Apri [examples/lista-demo.txt](examples/lista-demo.txt) dal pulsante **Scegli file .txt**, oppure incollane il contenuto nel campo **Testo lista**, poi scegli **Salva lista**.
3. Verifica il totale di **12 carte**, le stampe lette dalle righe, lo stato **Bozza** e il circuito **Occidentale / internazionale**. Il campione è sintetico e serve solo a provare il flusso.
4. Apri **Catalogo** e premi **Sincronizza campione**. Dovresti vedere **5/5 set acquisiti**: `sv01`, `sv02`, `sv04.5`, `me01` e `me02.5`. Cerca **Iono**: le stampe note compaiono sotto la stessa identità testuale quando hanno il medesimo effetto, con numeri e rarità distinti. Cerca **Mega Absol ex** e **Mega Audino ex**, poi **Rare Candy** e **Boss’s Orders** per confrontare le stampe precedenti con quelle Mega. Crea o apri un secondo progetto: il catalogo è lo stesso. Chiudi e riapri l'app, scollega la rete e riprova la ricerca: testo e miniature acquisite restano locali. Premere di nuovo **Aggiorna campione** non deve creare duplicati.
5. Apri **Matchup**: l'elenco arriva da Limitless (Standard, ultimo mese, Europa/Nord America/America Latina/Oceania), senza inserimento manuale. La pagina mostra la data dell'ultimo aggiornamento e la quota di ciascun archetipo.
6. Apri **Impostazioni AI** in alto a destra. Controlla lo stato Codex, scegli «Automatico» o un modello disponibile e, se scegli un modello, il livello di ragionamento. Salva e riapri la schermata: la scelta deve restare. **Esegui prova AI** invia una breve richiesta senza dati del mazzo. L'accesso Codex è condiviso con le altre app locali: **Disconnetti Codex** disconnette anche quelle. Se serve, **Accedi con ChatGPT** apre il browser.
7. Torna al progetto, apri **Matchup**, scegli un archetipo e leggi **Dati inviati a Codex per questa analisi**. Puoi usare le preferenze globali oppure scegliere modello e ragionamento solo per la guida corrente. Premi **Genera analisi con Codex**. La generazione richiede rete e Codex CLI installato e autenticato (`codex login status`); può richiedere qualche minuto. Esamina punti forti, debolezze, carte chiave, strategia, fonte della lista avversaria, limiti e configurazione AI registrata. La lista demo di 12 carte è sintetica: la guida relativa è solo una prova tecnica.
8. Sotto la guida, scrivi un pensiero in **Rispondi a questa analisi** e premi **Rivedi analisi con Codex**. Prova a rispondere ancora: nella cronologia trovi ogni osservazione e ogni versione completa della guida, con la spiegazione di cosa è cambiato. In caso di errore, la guida precedente rimane leggibile e il commento può essere riprovato.
9. Riapri l'app: guida e discussione restano salvate anche se cambi le preferenze AI. Sostituisci la lista o aggiorna il meta quando lo snapshot cambia: la vecchia discussione è marcata come storica; **Continua sulla nuova base** genera una nuova guida collegata, se l'archetipo è ancora nel meta. Se l'archetipo esce dal meta, resta nell'elenco storico e la discussione rimane consultabile.
10. Crea un secondo progetto e importa una lista diversa: le guide del primo non devono comparire nel secondo. Per vedere la diagnostica della lista, aggiungi una riga libera non riconosciuta oppure cambia `Total Cards: 12` in `Total Cards: 60`, poi scegli **Sostituisci lista**.

## Prova dell'inventario Standard APP-031

Apri **Catalogo** dalla barra in alto, anche senza progetto. **Aggiorna nuove carte** acquisisce l'indice TCGdex delle stampe con marchio H e successivi e delle Energie Base `sve`/`mee`; scarica i dettagli solo per le stampe nuove o ancora incomplete. **Scansione completa** ricontrolla ogni dettaglio e può richiedere molti minuti. L'app salva ogni lotto, mostra il progresso e riprende un lavoro interrotto al riavvio; dopo 429/503 ritenta più tardi. I dettagli precedenti restano consultabili offline. Cerca **Oshawott MEP 051** per il marchio J e lo stato nel pacchetto promo incluso. Lo snapshot copre le righe del registro osservate il 23 ottobre 2026: nuove promo non comprese sono segnalate come non verificate. Quando una versione verificata più recente viene pubblicata sul repository, il comando la scarica e la conserva in locale. Il filtro può includere carte non ancora ammesse e ometterne altre; la legalità Standard resta APP-030/APP-018. Le vecchie stampe fuori formato non vengono risolte automaticamente; le miniature non vengono scaricate in massa.

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

Con la lista Iono dell’esempio aperta, espandi **Iono** e scegli **Aggiungi vincolo su questa carta**. Imposta **Almeno N → 3**: il vincolo risulta soddisfatto sommando PAL 185 e PAL 254. Aggiungi un secondo vincolo su Iono, limitato a **Paldea Evolved 185**, **Esattamente N → 2**. Cambia il primo vincolo a **Almeno N → 4** per vedere il requisito non soddisfatto; aggiungi **Esattamente N → 2** sulla carta di gioco per vedere un conflitto tra vincoli. Puoi eliminare il vincolo conflittuale, scegliere una carta anche dal tab **Catalogo**, chiudere e riaprire l’app e verificare che un secondo progetto non erediti i vincoli. Le copie senza stampa certa possono produrre un esito **indeterminato**. La legalità Standard occidentale resta indeterminata fino ad APP-018.

## Prova dell'export APP-008

Nella scheda **Lista**, importa `2 Iono PAL 185`, `1 Iono PAL 254` e `1 Rare Candy PAF 089` con intestazione `Trainer: 9` e `Total Cards: 99`. Premi **Copia export** in **Lista corrente**: il testo va subito negli appunti, senza opzioni intermedie. Incollalo in Limitless oppure nel campo di importazione del progetto: deve mostrare `Trainer: 3` e `Total Cards: 4`, lasciando invariate le tre righe carte. Una riga come `? carta dubbia` impedisce la copia e lascia invariati gli appunti; un codice ALT resta testuale e viene segnalato. Il campione da 4 carte verifica formato e stampe in Limitless, non la legalità Standard.

## Prova del controllo di rotazione APP-027

Apri una lista che contiene `2 Iono PAL 185` e `1 Iono PAL 254`. Dopo **Aggiorna campione** nel Catalogo, torna alla Lista corrente: il controllo mostra il marchio G sulle stampe riconosciute. Imposta **Data di riferimento** al 9 aprile 2026, poi al 10 aprile 2026: le tre copie passano da «marchio ammesso» a «marchio ruotato» senza cambiare la lista. Premi **Torna a oggi** per usare di nuovo la data automatica. Un codice `ALT`, una stampa non presente nel campione o una cache precedente senza marchi danno «da chiarire». Il controllo riguarda soltanto il marchio e le date Play! Pokémon 2025/2026 per eventi occidentali in presenza; la legalità completa resta indeterminata in attesa di APP-018.

## Prova dei controlli di costruzione APP-028

Nella **Lista corrente**, sotto la rotazione, trovi tre controlli distinti. Importa `3 Iono PAL 185` e `2 Iono PAL 254`: il limite generale di quattro copie segnala **Iono ×5**, indipendentemente dalla rarità. Sostituisci con `59 Basic Psychic Energy` e `1 Mew ex PAF 216`: il totale è 60 e le Energie Base non violano il limite di quattro; il controllo del Pokémon Base resta **da chiarire** finché quella stampa non è presente con la sua fase nel catalogo locale. Aggiungi una riga non riconosciuta per vedere un esito incerto sul totale. Questi controlli non attestano legalità Standard, date di rilascio o regole speciali.

## Prova del perimetro promo APP-032

Aggiorna nuove carte e cerca **Oshawott** nel set **MEP Black Star Promos**: la stampa MEP 051 deve avere marchio J e stato disponibile nel pacchetto verificato del 23 ottobre 2026. Il contatore distingue promo disponibili, future, non elencate e non verificate. Ripeti l'aggiornamento: i dettagli già acquisiti non vengono riscaricati. Usa **Scansione completa** quando vuoi ricontrollare rarità o varianti esistenti. Se il pacchetto online manca, il Catalogo mostra l'errore e mantiene la versione locale datata. Importa poi `1 Rare Candy SVI 191` insieme a `2 Mega Absol ex MEG 86`: la vecchia stampa SVI resta nel testo ma non viene risolta dal catalogo Standard e la legalità resta indeterminata.

## Prova dei thread APP-019

Apri un progetto con una lista, per esempio `60 Carta A MEG 1`, poi il tab **Thread**. Crea **Piano A** e **Piano B**: entrambi partono dalla stessa versione principale. In Piano A salva `60 Carta B MEG 2` come candidata; in Piano B salva `60 Carta C MEG 3`. Tornando a **Lista**, la lista principale deve ancora essere `60 Carta A MEG 1`. Salva `60 Carta D MEG 4` come nuova lista principale: i due thread mostrano **Base da confrontare**, ma mantengono le rispettive candidate. Chiudi e riapri l'app per verificare versioni, osservazioni e candidate. Puoi creare un thread anche in un progetto senza lista. Le candidate sono bozze manuali locali: la generazione Codex e l'adozione esplicita arriveranno nei task successivi.

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
