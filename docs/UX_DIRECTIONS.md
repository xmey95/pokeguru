# Ripensare i percorsi di Pokéguru

**Studio superato dal feedback successivo del 26 ottobre:** l'utente apprezza l'organizzazione attuale e giudica eccessive queste modifiche. Si conservano solo le tab Apertura, Sviluppo e Chiusura nei Matchup; la direzione corrente è [UI_REFINEMENT.md](UI_REFINEMENT.md). Le proposte qui sotto restano come storico, non come interventi approvati.

26 ottobre 2026 · studio APP-134 · revisione dei primi mockup

Pokéguru ha già strumenti per importare, discutere, confrontare e preparare un mazzo. La proposta è organizzarli attorno al lavoro del giocatore: partire da una carta o da un problema, sviluppare una variante, decidere e ritrovare la preparazione coerente con la lista scelta. La prima serie di mockup conservava la struttura esistente e variava soprattutto lo stile; non affrontava questo problema.

L'analisi deriva dal renderer su `dev` `f9fcd8c`, dai requisiti e dalle decisioni registrate. I problemi di comprensione sono ipotesi di design fondate sui percorsi presenti, da verificare con l'utente; non sono risultati di interviste o tempi d'uso misurati. Le schermate archiviate del 24 ottobre aiutano a leggere il layout ma precedono alcune correzioni: in particolare la scelta «Discuti / Proponi una lista» è già stata rimossa da APP-129 e non è un problema ancora da correggere.

## Il lavoro che deve guidare l'interfaccia

| Situazione | Risultato che cerca il giocatore | Informazione necessaria al momento |
| --- | --- | --- |
| Ho una lista e un dubbio su una carta | Valutare una modifica senza perdere il mazzo di partenza | Quantità, ruolo, vincoli, versione e motivo della domanda |
| Ho ricevuto una proposta | Decidere se adottare l'intera lista | Differenze, ragioni, compromessi, controlli e conseguenze sulle guide |
| Sto preparando un avversario | Capire il piano e approfondire un punto | Piano leggibile, carte pertinenti, versione usata, fonti e limiti |
| Ritorno dopo una modifica | Capire cosa posso ancora usare | Principale attuale, proposte su basi precedenti, guide correnti e storiche |

«Thread» è un contenitore necessario per conservare conversazioni indipendenti. Non deve necessariamente essere il primo concetto che una persona deve organizzare prima di fare una domanda. Anche «Catalogo» ed «Eventi» sono risorse utili: la loro manutenzione resta accessibile, mentre il contesto pertinente può raggiungere il giocatore nel lavoro sul mazzo.

## Scelte UX da cambiare

Le priorità indicano l'ordine proposto per la progettazione, non bug di correttezza dei dati.

| Priorità | Comportamento osservabile e riferimento | Attrito ipotizzato | Cambiamento proposto e verifica |
| --- | --- | --- | --- |
| Alta | La navigazione divide Lista, Thread e Matchup; una nuova domanda in Thread richiede titolo e messaggio. [App](../src/renderer/src/App.tsx), [ThreadsSection, modulo new-thread-form](../src/renderer/src/ThreadsSection.tsx). | Il giocatore deve tradurre «cosa cambierei qui?» in cambio area, creazione di un contenitore e attribuzione di un nome. | Domanda dalla carta o dal piano; prima richiesta crea un percorso indipendente con titolo derivato e modificabile. Provare ad avviare una variante senza compilare un titolo e riconoscere poi la sua base. |
| Alta | Il mazzo occupa 384 px in Thread/Matchup; sotto 1240 px il dock ha altezza fissa 220 px. A 640×580, 60 px di navigazione + 44 px di barra + 220 px di dock lasciano 256 px di altezza nominale al contenuto prima dei suoi margini. [workspace.css](../src/renderer/src/workspace.css). | La disponibilità permanente della lista sottrae spazio alla lettura anche quando serve solo una carta; più zone di scroll aumentano la gestione della finestra. | Nel banco A la lista è il contenuto principale; nella preparazione C sono visibili le carte pertinenti e un comando per tutta la lista. In finestra stretta il contesto si riordina nel flusso. Provare lettura e consultazione a 640×580 senza dock obbligatorio. |
| Alta | La candidata più recente precede la cronologia; il confronto contiene diff, controlli e liste e condivide la pagina con conversazione e compositore. È presente un comando per saltare alla proposta e tornare. [ThreadsSection, CandidateDetail e candidate-access](../src/renderer/src/ThreadsSection.tsx). | Valutare e conversare richiedono posture diverse. Espandere il confronto modifica la lunghezza della pagina e allontana l'altra attività. | Trattare la variante come risultato riconoscibile, con spazio di valutazione dedicato. Mostrare motivo, compromesso, differenze e decisione; aprire conversazione e liste complete quando servono. Provare a spiegare cosa cambia prima di adottare. |
| Alta | Una base superata è correttamente bloccata e può continuare in un nuovo Thread; le guide conservano la base storica. [ThreadsSection, continueFrom](../src/renderer/src/ThreadsSection.tsx), [MatchupDiscussion](../src/renderer/src/MatchupDiscussion.tsx). | L'utente deve ricomporre l'effetto dell'adozione passando fra versioni, conversazioni e guide. | Prima della conferma mostrare quale principale si crea e quali guide diventano storiche. Dopo, offrire il ritorno alla preparazione. Continuare una variante obsoleta crea un nuovo percorso e richiede nuovi controlli, senza fonderla automaticamente. |
| Media | Il Matchup rende il piano e altre cinque sezioni di testo; discussione/revisione sono un blocco distinto dopo la guida. [MatchupSection, matchup-fields](../src/renderer/src/MatchupSection.tsx), [MatchupDiscussion](../src/renderer/src/MatchupDiscussion.tsx). | Domanda e carta consultata possono trovarsi lontane dal punto del piano che le ha motivate. | Articolare il piano per momenti, con carte pertinenti e domanda nel contesto. Conservare fonti, incertezze e testo storico. La struttura per fasi richiede un output AI strutturato o una normalizzazione affidabile: non dividere arbitrariamente il testo esistente. |
| Media | Il dettaglio carta del mazzo contiene testo, stampe, riconciliazione e vincoli; i collegamenti dalle guide possono aprire il Catalogo. [DeckList](../src/renderer/src/DeckList.tsx), [GuideText](../src/renderer/src/GuideText.tsx). | Consultare una carta può interrompere la lettura del problema che la rende rilevante. | Scheda contestuale richiamabile, con quantità, testo e vincoli; accesso al Catalogo completo come approfondimento. La correzione dell'identità e la scelta della stampa restano esplicite. |
| Media | Il pannello usa «Pronta per controllo» sulla base di conteggio e parsing, mentre il verdetto Standard completo appartiene alla Lista. [DeckCompanion, deckState](../src/renderer/src/DeckCompanion.tsx). | Un messaggio generico può essere interpretato come stato complessivo del mazzo. | Separare «60 carte», errori certi e verifiche incerte. Uno stato sintetico deve portare alle cause; nessuna trasformazione di un'incertezza in esito positivo. |
| Media | Principale, base del Thread, candidata e guide storiche sono rappresentate in più sezioni. [DeckHistory](../src/renderer/src/DeckHistory.tsx), [ThreadsSection](../src/renderer/src/ThreadsSection.tsx), [MatchupSection](../src/renderer/src/MatchupSection.tsx). | Rischio di leggere una proposta o una guida come se usasse la principale attuale. | Identità della versione vicina al risultato e un linguaggio unico: principale, variante, guida su vN. «Corrente» significa corrispondenza ai dati, non soltanto ultima data. |

## Tre alternative di organizzazione

Tutte usano la stessa palette, lo stesso mazzo illustrativo e la stessa modifica Iono 4→3 / Absol 3→4. Le schermate iniziali mostrano il lavoro privilegiato da ciascuna; il confronto corretto consiste nel completare gli stessi compiti nei tre percorsi, non nel scegliere la schermata più gradevole.

### A Il banco del mazzo

La lista è l'area principale; una carta selezionata apre un contesto con dettaglio, vincoli e domanda. La conversazione nasce dalla richiesta. Quando arriva una proposta, il contesto offre il confronto senza sostituire la principale. Le conversazioni già esistenti restano riprendibili.

**Percorso dimostrabile:** seleziona Iono → scrivi la domanda → Chiedi una variante → Valuta la variante → leggi confronto e controlli → conferma l'intera lista → apri preparazione.

È la base che propongo per chi modifica spesso il mazzo. Riduce la distanza fra carta e domanda e dà alla lista il ruolo di contenuto principale. Il compromesso è lo spazio occupato dall'assistente su desktop; nel compatto Lista e Assistente sono due viste alternate, con carta e bozza conservate. La selezione di una carta apre il contesto. Una futura implementazione deve preservare anche la posizione durante questi passaggi.

### B Lo spazio delle decisioni

L'ingresso è un insieme di percorsi con obiettivo e stato. Aprendo una variante, il giocatore vede subito cosa cambia e cosa sacrifica; le conversazioni sono collegate al risultato, leggibili in secondo livello. Una proposta vecchia mostra il motivo del blocco e il percorso per rivalutarla.

**Percorso dimostrabile:** apri una variante → consulta ragioni e diff → leggi la lista completa o le fonti → valuta l'adozione. Apri «Variante precedente» per provare il recupero da una base superata.

È utile quando esistono molte ipotesi parallele. Richiede però più struttura e può essere vuoto o artificioso all'inizio: per questo «Esplora un'idea» parte da una domanda, senza chiedere uno stato o una categoria. Non introduce statistiche di partite, esperimenti giocati o valutazioni automatiche della qualità.

### C La preparazione per avversario

L'ingresso mostra guide disponibili, storiche e mancanti. Una guida si legge per momenti del piano, con le carte pertinenti accanto. Una domanda rimane associata a guida, fase e lista. La lista completa è richiamabile. Le modifiche suggerite aprono lo stesso processo esplicito di valutazione.

**Percorso dimostrabile:** scegli Hydrapple → cambia fase → apri una carta → discuti il piano oppure valuta la variante → adotta → riconosci che la guida su v3 è diventata storica. Seleziona Gardevoir per la guida mancante.

È la scelta più diretta prima di giocare, ma meno naturale per costruire o importare un mazzo. Le etichette «disponibile» e «storica» descrivono l'archivio, non la forza del matchup. La scelta delle carte pertinenti richiede riferimenti verificabili nel risultato AI; nel mockup è illustrativa.

## La direzione proposta

Usare **A come spazio principale**, **B quando si deve prendere una decisione**, **C per preparare i matchup**. Sono tre risposte diverse alla domanda «da cosa inizia il lavoro?»; le parti utili possono convivere come attività dello stesso progetto. Eviterei una nuova dashboard riassuntiva senza un'azione chiara e un wizard rigido che impedisca di tornare alle ipotesi precedenti.

Il modello sottostante resta uno: progetto → principale versionata → conversazioni indipendenti con base dichiarata → candidate complete → adozione esplicita. La discussione di una guida mantiene la propria storia e i propri riferimenti. Le risorse globali si raggiungono anche fuori dal progetto, oltre ai collegamenti contestuali.

Il pannello sempre visibile è un requisito UI attuale in PRODUCT/DESIGN_SYSTEM, non un vincolo del dominio. Questo studio propone di sostituire «sempre aperto» con «sempre raggiungibile senza perdere il contesto». L'eventuale scelta richiederà l'aggiornamento esplicito di quei documenti. Restano invece centrali: adozione completa e manuale, nessuna adozione da base superata, vincoli nel dettaglio carta, fonti e limiti, isolamento fra progetti, dati storici immutabili.

## Come verificare la scelta

| Compito da far provare | Segnale di riuscita | Errore da cercare |
| --- | --- | --- |
| Chiedere una variante partendo da Iono | La prima domanda parte nel contesto della lista corretta senza inventare un titolo | Confondere la selezione della carta con una modifica già salvata |
| Spiegare la proposta prima della conferma | L'utente identifica le due quantità, il compromesso e i controlli aperti | Credere di adottare solo una riga o di avere un miglioramento dimostrato |
| Aprire la variante sulla vecchia base | Riconosce il blocco e sa continuare sulla principale con una nuova valutazione | Pensare che il sistema abbia già riconciliato le liste |
| Adottare e tornare alla guida | Riconosce v4 come principale e v3 come base della guida storica | Usare automaticamente la guida precedente come aggiornata |
| Leggere la guida a 640×580 e consultare una carta | Ritorna al punto del piano, con la domanda conservata | Perdere posizione o testo, oppure nascondere limiti importanti |

Questi sono criteri per una prova di usabilità, non metriche già migliorate. Nel prototipo si verificano soltanto interazioni locali e layout. Import/export, persistenza, AI, fonti, gestione errori di rete e accessibilità assistiva richiedono verifiche nel prodotto reale.

## Sequenza per un eventuale intervento

1. Concordare l'architettura e il ruolo della lista consultabile; aggiornare i requisiti UI. Realizzare un percorso verticale carta → domanda → variante → conferma con le API esistenti.
2. Riutilizzare lo spazio di valutazione per le candidate esistenti e le basi superate, con versioni e conseguenze esplicite. Provare riapertura, isolamento e rifiuto dei controlli falliti.
3. Collegare la preparazione alle versioni; definire prima il contratto delle fasi e dei riferimenti alle carte, poi la nuova lettura della guida. Preservare le guide legacy leggibili.
4. Rifinire densità, tastiera, stati di attesa/errore, palette e tipografia sul percorso scelto.

I4 da zero, editing libero delle quantità, simulazioni, registro partite e stime di vittoria non sono introdotti da questo studio. Sono temi distinti del backlog, non prerequisiti nascosti per la proposta UX.

## Prototipo

[Apri il confronto navigabile](../prototypes/ux-directions/index.html). I primi studi di solo stile restano in `prototypes/visual-directions/` come versione precedente. Il nuovo confronto usa fixture e non scrive nell'archivio dell'app.
