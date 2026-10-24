# Pokéguru — prototipo desktop prima di I4

Questo è un prototipo interattivo isolato dalla build Electron. Non usa database, bridge IPC, Codex, TCGdex o Limitless. Le 60 carte, le quote del meta, i dialoghi e le revisioni sono **dati illustrativi**; la lista non è dichiarata legale o competitivamente validata. Le due stampe esplicite MEG 086 e ASC 172 servono solo a dare un riferimento visivo riconoscibile; le altre sono etichettate «esempio».

## Diagnosi della v0.1.0

Ispezione eseguita sulla build Windows con profilo temporaneo e tre schermate in [`current-list.png`](./current-list.png), [`current-thread.png`](./current-thread.png), [`current-matchup.png`](./current-matchup.png), oltre alla lettura di `App.tsx`, `DeckList.tsx`, `ThreadsSection.tsx`, `MatchupSection.tsx` e `styles.css`.

1. **Lavorare sulla lista.** Il compito è riconoscere subito le 60 carte, le proporzioni, le stampe dubbie e il prossimo intervento. Oggi la lista arriva dopo titolo, metadati del progetto e numerosi pannelli di rotazione, ammissione e costruzione. La diagnostica è accurata ma occupa l’area della decisione; molte etichette sono piccole e tono, bordo e peso dei pannelli sono simili.
2. **Discutere in un thread.** Il compito è formulare un’ipotesi, leggere la candidata, capire i compromessi rispetto alla versione principale e scegliere se adottare tutte le 60 carte. Oggi la candidata è un elemento espandibile nella cronologia, il confronto è nel suo dettaglio e la lista principale scompare passando al tab Thread. La scelta richiede molti spostamenti e ricostruzione mentale.
3. **Studiare un matchup.** Il compito è leggere un piano per l’avversario, verificare le proprie carte chiave e rivedere il piano alla luce di osservazioni personali. Oggi la lista scompare, mentre filtri, dati tecnici, opzioni AI e provenienza condividono lo stesso livello visivo della strategia. In caso di meta non disponibile, l’utente vede un caricamento o uno stato privo di un prossimo passo chiaro.

## Architettura proposta

- **Rail sinistro:** progetto attivo, Lista, Thread e Matchup; Catalogo, Eventi e Impostazioni AI sono risorse globali in secondo gruppo.
- **Centro:** un solo compito alla volta. Lista mostra subito totale, distribuzione e carte. Thread mostra la candidata e il confronto di due liste complete; la discussione è un tab della stessa attività. Matchup apre con piano, carte chiave e incertezza.
- **Lista persistente:** oltre 1080 px il pannello destro ha larghezza **fissa di 320 px**. A 1080 px o meno diventa una fascia inferiore a tutta larghezza, alta 190 px (196 px fino a 640 px), così Thread e Matchup conservano spazio di lettura e la lista non li copre. Le due aree scorrono indipendentemente. «Vista breve» mostra totale, conteggi, esito e carte chiave senza cambiare la dimensione del pannello. I dialoghi compaiono solo per importazione dimostrativa e conferma esplicita di adozione.
- **Livelli secondari:** diagnostica dettagliata, fonti, configurazione AI, testo importato e cronologia stanno in sezioni espandibili. Errori bloccanti e incertezza restano nel livello principale.

La direzione visiva usa un rail petrolio scuro, superficie chiara leggermente calda, accento ambra per navigazione/attenzione e verde petrolio per azioni. Titoli Georgia e corpo Segoe UI distinguono lettura e controllo. Numeri con cifre tabulari, righe compatte ma regolari e separatori sottili aiutano a scansionare 60 carte senza far sembrare ogni blocco un avviso. La densità maggiore è riservata alle liste, non al piano tattico.

## Percorsi da provare

1. **Lista:** apri `http://127.0.0.1:4173/`, usa filtri e ricerca, clicca una carta per evidenziarla nella lista persistente. Apri «Controlli, provenienza e testo importato» per vedere il secondo livello.
2. **Thread:** apri «Variante più rapida» → «Confronto». Leggi le otto quantità cambiate, scorri indipendentemente le due liste complete, poi prova «Adotta l’intera lista proposta». La conferma è manuale e modifica soltanto lo stato in memoria del prototipo. Prova «Discussione», quindi «Simula base superata»: l’adozione diventa indisponibile con motivo visibile.
3. **Matchup:** apri Gardevoir ex, leggi apertura/metà partita/chiusura, clicca una carta chiave e controlla la lista principale senza cambiare vista. Scrivi un’osservazione e premi «Rivedi piano» per vedere una revisione **simulata**. Seleziona Charizard ex per l’analisi assente e Dragapult ex per la guida storica.
4. **Stati e dimensioni:** scegli «Progetto vuoto» dal selettore Scenario. Prova «Vista breve» e «Vista completa»: la larghezza resta invariata. Riduci la finestra a 1080 px o meno per vedere la lista nel dock inferiore; a 640 px o meno la navigazione passa in alto e scorre orizzontalmente. Catalogo, Eventi e Impostazioni AI mostrano la collocazione proposta, non le funzionalità reali.

Per avviare di nuovo, dalla cartella del prototipo esegui `node server.mjs` con Node 24 e apri `http://127.0.0.1:4173/`. `node verify.mjs` richiede Playwright Core e Microsoft Edge; scrive schermate in `.verify/desktop-prototype/`, ignorata da Git.

## Verifica e limiti

`verify.mjs` è stato eseguito in Edge a **1440×900**, **1280×720**, **1080×720**, **1024×768**, **820×740**, **640×720**, **390×844** e **320×568**. Le due misure desktop mantengono il pannello da 320 px; alle altre il dock inferiore resta separato dal lavoro. Sono stati verificati assenza di scorrimento orizzontale del documento, lista persistente in Thread e Matchup, scorrimento indipendente, conteggi e carte chiave nella vista breve, navigazione con Tab/Invio anche a 390 px, base superata e analisi non disponibile. Le schermate sono state esaminate visivamente, compresa la lettura del piano Matchup sopra il dock a 390 px. Questa prova riguarda il prototipo nel browser, non la build Electron di produzione.

Restano da validare con feedback dell’utente: comfort della lista da 320 px e del dock inferiore, quantità di informazioni mostrate nel confronto prima dell’azione, utilità delle tre fasi del piano Matchup e collocazione di fonti/diagnostica. L’eventuale integrazione richiederà un task distinto dopo approvazione, con dati e vincoli reali; I4 non viene avviato da questo lavoro.
