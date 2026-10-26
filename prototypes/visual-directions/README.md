# Pokéguru — tre direzioni visive

Mockup navigabile per discutere l'identità dell'app desktop prima di qualsiasi modifica al renderer di produzione. Le tre direzioni usano gli stessi contenuti, le stesse dimensioni e gli stessi flussi: **Banco tattico**, **Archivio editoriale** e **Arena analitica**.

Apri `index.html` in un browser. La barra di confronto cambia direzione e scenario; Lista, Thread e Matchup si scelgono dalla navigazione del mockup. Le URL conservano `theme`, `view` e `state`, così una schermata può essere condivisa o riaperta. Per vedere solo l'app, aggiungi `capture=1` alla query.

## Cosa provare

1. A **1440×900**, confronta le tre direzioni sullo stesso Thread. Apri il confronto della candidata e scorri il pannello della lista principale separatamente dalla conversazione.
2. Apri **Lista** e seleziona una carta. Il dettaglio mostra il livello di lettura, con stampe e controlli richiudibili; la vista Lista non duplica il pannello del mazzo.
3. Apri **Matchup** e riduci la finestra a 640 px. Il dock inferiore mantiene totale, categorie e tutte le carte con scorrimento proprio.
4. Nella barra del mockup scegli **Vuoto**, **Caricamento**, **Errore** e **Contenuto lungo**. I dati già visibili nel pannello lista restano consultabili nei flussi Thread e Matchup.

Le carte, la candidata, la quota meta, la guida, le revisioni e gli stati sono **fixture di presentazione**. Non ci sono database, IPC, Codex, TCGdex o Limitless. Le azioni come invio, importazione e adozione sono soltanto controlli visivi; nessun dato viene salvato. Il logo usa il master SVG già presente nel progetto.

## Differenze da valutare

| Direzione | Impostazione | Rischio da discutere |
| --- | --- | --- |
| Banco tattico | Petrolio, menta e oro di marca; superfici calme; proposta viola | L'identità potrebbe restare troppo vicina all'interfaccia attuale |
| Archivio editoriale | Carta calda, accento ruggine, titoli serif e dettagli da archivio | La lettura editoriale potrebbe rallentare la scansione di dati fitti |
| Arena analitica | Blu scuro, griglia discreta, ciano e viola luminosi | Sessioni lunghe e contrasto degli stati richiedono una prova di comfort accurata |

Il layout è identico nelle tre direzioni per isolare il giudizio visivo. Le misure del mockup riprendono il contratto attuale: navigazione da 224 px e pannello lista da 384 px oltre 1240 px; sotto la soglia, navigazione compatta e dock inferiore; a 700 px la barra passa in alto. Il dock di questo studio è alto 210/188 px, ipotesi reversibile da confrontare con i 220 px dell'app attuale.

## Verifica

`node verify.mjs` richiede `playwright-core` e Microsoft Edge. Esegue geometria e screenshot a 1440×900, 640×720 e 640×580, più i quattro scenari sulle tre viste. I PNG in `screenshots/` sono artefatti del mockup, non schermate dell'app Electron. Questa verifica non sostituisce prove nel renderer, su Linux, con lettore di schermo o con dati reali.
