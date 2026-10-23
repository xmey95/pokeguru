# Pokéguru

Pokéguru è un'applicazione locale pianificata per costruire e migliorare mazzi Pokémon TCG: idea, catalogo delle carte, lista importata o creata da zero, confronto con tornei pertinenti al circuito competitivo, sezione Matchup con carte chiave e guide tattiche, thread AI paralleli con proposte motivate e adozione manuale dell'intera lista. Il primo MVP usa Codex; in una fase avanzata sarà possibile scegliere il motore AI. Le carte di gioco collegano ristampe e rarità senza trattare ogni lingua come un diverso mazzo competitivo. Deve supportare archetipi diversi; Mega Absol ex / Mega Audino ex è solo un esempio.

**Stato al 23 ottobre 2026:** I1 e una parte di I2 (`APP-016`, `APP-022`, `APP-005`, `APP-006`) sono utilizzabili. L'app Electron crea progetti Standard occidentali, importa liste testuali e offre un primo catalogo TCGdex condiviso fra progetti. Ogni riga importata può essere collegata manualmente a una stampa; le copie di ristampe con la stessa identità di gioco sono aggregate senza perdere set, numero e rarità originali. Mostra automaticamente gli archetipi del Metagame Limitless nel periodo e nelle regioni selezionate; per ogni archetipo può generare una guida Matchup con Codex e conservarne le revisioni. La prima versione di **Impostazioni AI** permette di controllare l'accesso Codex, scegliere modello e ragionamento e provare una richiesta; su Windows è stata verificata con Codex reale, mentre la verifica Linux resta aperta. Verifica di legalità, dati di match dei tornei e thread Codex paralleli per modificare il mazzo sono attività successive. CI/CD e release GitHub sono pianificate in I3, non ancora attive.

## Avvio per sviluppo

Servono Node.js **24 o successivo** e npm. Su Linux serve un ambiente desktop; i comandi sono gli stessi su Linux e Windows, dalla radice del repository:

```sh
npm ci
npm run dev
```

`npm run build` genera i file in `out/`; `npm start` apre la build locale. `npm test` verifica parser, persistenza e preferenze AI; `npm run test:e2e` costruisce l'app ed esegue un percorso con una vera finestra Electron, quindi richiede un display grafico (su Linux può usare `xvfb-run -a npm run test:e2e`). `npm run test:ai-live` e `npm run test:matchup-live` richiedono Codex CLI installato e autenticato; inviano richieste reali a Codex e possono consumare parte del limite. Il pacchetto installabile per utenti finali non è ancora disponibile.

La prova reale del catalogo è separata dai test locali: su Linux `POKEGURU_CATALOG_LIVE=1 npx vitest run tests/catalog-live.test.ts`; in PowerShell impostare prima `$env:POKEGURU_CATALOG_LIVE='1'`. La prova grafica `npm run test:e2e` sincronizza il campione TCGdex e carica il metagame Limitless, quindi richiede rete.

`npm run test:reconciliation-live` prova in Electron la scelta delle stampe, codici ALT/promo, riapertura e isolamento usando TCGdex reale. `npm run test:reconciliation-ai-live` esegue anche una guida Codex reale e richiede Codex CLI autenticato; può consumare parte del limite.

## Prova rapida

1. Crea un progetto Standard.
2. Apri [examples/lista-demo.txt](examples/lista-demo.txt) dal pulsante **Scegli file .txt**, oppure incollane il contenuto nel campo **Testo lista**, poi scegli **Salva lista**.
3. Verifica il totale di **12 carte**, le stampe lette dalle righe, lo stato **Bozza** e il circuito **Occidentale / internazionale**. Il campione è sintetico e serve solo a provare il flusso.
4. Apri **Catalogo** e premi **Sincronizza campione**. Dovresti vedere 28/28 stampe del campione con dettaglio, su 782 stampe totali dei tre set `sv01`, `sv02`, `sv04.5`. Cerca **Iono**: le stampe di Paldea Evolved e Paldean Fates compaiono sotto la stessa identità testuale, con numeri e rarità distinti. Cerca **Rare Candy**, prova il filtro Espansione e apri una scheda fonte. Crea o apri un secondo progetto: il catalogo è lo stesso. Chiudi e riapri l'app, scollega la rete e riprova la ricerca: testo e miniature acquisite restano locali. Premere di nuovo **Aggiorna campione** non deve creare duplicati.
5. Apri **Matchup**: l'elenco arriva da Limitless (Standard, ultimo mese, Europa/Nord America/America Latina/Oceania), senza inserimento manuale. La pagina mostra la data dell'ultimo aggiornamento e la quota di ciascun archetipo.
6. Apri **Impostazioni AI** in alto a destra. Controlla lo stato Codex, scegli «Automatico» o un modello disponibile e, se scegli un modello, il livello di ragionamento. Salva e riapri la schermata: la scelta deve restare. **Esegui prova AI** invia una breve richiesta senza dati del mazzo. L'accesso Codex è condiviso con le altre app locali: **Disconnetti Codex** disconnette anche quelle. Se serve, **Accedi con ChatGPT** apre il browser.
7. Torna al progetto, apri **Matchup**, scegli un archetipo e leggi **Dati inviati a Codex per questa analisi**. Puoi usare le preferenze globali oppure scegliere modello e ragionamento solo per la guida corrente. Premi **Genera analisi con Codex**. La generazione richiede rete e Codex CLI installato e autenticato (`codex login status`); può richiedere qualche minuto. Esamina punti forti, debolezze, carte chiave, strategia, fonte della lista avversaria, limiti e configurazione AI registrata. La lista demo di 12 carte è sintetica: la guida relativa è solo una prova tecnica.
8. Sotto la guida, scrivi un pensiero in **Rispondi a questa analisi** e premi **Rivedi analisi con Codex**. Prova a rispondere ancora: nella cronologia trovi ogni osservazione e ogni versione completa della guida, con la spiegazione di cosa è cambiato. In caso di errore, la guida precedente rimane leggibile e il commento può essere riprovato.
9. Riapri l'app: guida e discussione restano salvate anche se cambi le preferenze AI. Sostituisci la lista o aggiorna il meta quando lo snapshot cambia: la vecchia discussione è marcata come storica; **Continua sulla nuova base** genera una nuova guida collegata, se l'archetipo è ancora nel meta. Se l'archetipo esce dal meta, resta nell'elenco storico e la discussione rimane consultabile.
10. Crea un secondo progetto e importa una lista diversa: le guide del primo non devono comparire nel secondo. Per vedere la diagnostica della lista, aggiungi una riga libera non riconosciuta oppure cambia `Total Cards: 12` in `Total Cards: 60`, poi scegli **Sostituisci lista**.

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

In **Carte della lista**, scegli manualmente la prima stampa proposta per entrambe le righe Iono. Vedrai numeri e rarità diversi e il totale **Iono: 3** per la carta di gioco. La riga ALT mostra un avviso e solo proposte basate sul nome; promo ed Energia fuori campione restano irrisolte. Puoi annotare la lingua del testo originale senza cambiare l'identità competitiva. Chiudi e riapri l'app: le scelte restano; un secondo progetto non le eredita. Sostituire il testo della lista cancella i mapping precedenti, mentre reimportare lo stesso testo li conserva. Dopo aver generato una guida Matchup, cambiare una stampa scelta rende quella guida storica. La guida riceve le stampe confermate e segnala le copie non ancora risolte.

Il totale deriva dalle quantità delle righe interpretate, non da `Total Cards`. Il testo originale resta consultabile. **Pronta per controllo** indica solo 60 copie interpretate senza righe non riconosciute o totale discordante: non attesta legalità Standard, identità delle carte o compatibilità con PTCG Live/Limitless. Salvare di nuovo sostituisce la baseline corrente del progetto; non c'è ancora cronologia delle importazioni. Le guide Matchup sono ipotesi AI basate sulla lista importata, sul Metagame Limitless e su una lista avversaria pubblica di esempio quando disponibile. La **quota del meta non è il winrate del matchup**. Le vecchie note personali della versione APP-021 restano nel database ma non compaiono come guide AI.

Il catalogo copre soltanto i nomi selezionati nei tre set dichiarati. Il denominatore delle carte di gioco dell'intera fonte non è disponibile; la UI indica «non misurabile». Le equivalenze Trainer derivano dal testo coincidente, non attestano legalità Standard o errata. I Pokémon sono tenuti separati finché non sono verificati. Le immagini grandi sono controllate online ma non salvate localmente. Il collegamento tra riga e stampa richiede sempre una scelta esplicita; non sono ancora verificati import/export direttamente nei client PTCG Live e Limitless.

I dati sono nel percorso `userData` di Electron, sotto `data/pokeguru.sqlite`. Nei test automatici si usa una cartella isolata tramite `POKEGURU_DATA_DIR`.

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
