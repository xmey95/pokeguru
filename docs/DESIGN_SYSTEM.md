# Design system Pokéguru — APP-059

24 ottobre 2026 · checkpoint di qualità prima di I4.
Base: `dev` al commit `d59aeaa`. Implementazione: `task/production-design-system`.
Ambito: renderer Electron, accessibilità e prove UI; persistenza, validatori e integrazioni invariati.

## Diagnosi

L'audit comprende codice e avvio della versione integrata, schermate di Lista, candidata, Matchup, Catalogo, Eventi Play/Regional, AI e stati senza dati. Le criticità si ripetono tra le viste, quindi la correzione riguarda fondazioni e comportamenti comuni.

| Punto osservato | Effetto sul lavoro | Correzione |
| --- | --- | --- |
| Due fogli CSS con regole sovrapposte, colori e dimensioni indipendenti | La stessa funzione sembra appartenere ad applicazioni diverse; ogni aggiunta introduce eccezioni | Token semantici, componenti condivisi, layout separato. Rimossi gli override del precedente prototipo |
| Titoli Georgia, testo sans, microtesti da 9–11 px e pesi molto marcati | Gerarchia frammentata e affaticamento nelle sessioni lunghe | Famiglia sans di sistema, corpo 14 px, lettura della strategia 15 px, metadati almeno 12 px |
| Numeri e glifi Unicode nella navigazione | Le aree non hanno una grammatica visiva comune | Piccolo set SVG locale, tratto e dimensioni uniformi, nomi accessibili anche nella barra compatta |
| Ambra sia per selezione sia per avvisi | La selezione può sembrare una condizione da correggere | Petrolio per navigazione/azioni; ambra per incertezza; rosso per blocchi; viola per proposta |
| Titoli, origine dell'import e note occupano il primo schermo | Le carte e il piano tattico arrivano troppo tardi | Metadati import sotto le carte; metagame apribile; rimossi sottotitoli ridondanti |
| Carta con nome lungo troncato in due colonne strette | Serve aprire la riga per riconoscere una carta | APP-062: righe intere con miniature, nomi a capo a 16 px e categorie con conteggi |
| Ogni informazione in un ulteriore riquadro verde | Controlli, proposta, conversazione e spiegazioni competono per attenzione | Superfici neutre, bordi strutturali e separatori; tinta solo dove comunica uno stato |
| Principale e candidata troppo simili | Il cambiamento è difficile da distinguere a colpo d'occhio | Etichette esplicite, proposta viola, differenze con segno e conteggi, conferma dell'intera lista |
| Guide e fonti estese prima della discussione | Lo studio del piano richiede scorrimento eccessivo | Strategia prima, limiti visibili, carte osservate e meccaniche in dettagli apribili |
| Metadati e metodo prima dei partecipanti in Eventi | La prima schermata non mostra il contenuto cercato | Filtri evento/giocatore insieme; copertura dettagliata dopo le liste |
| Focus non restituito chiudendo l'adozione; errore dietro il dialogo | Il flusso da tastiera perde il punto di partenza e un errore può restare nascosto | Ritorno del focus, errore nel dialogo, Tab contenuto e Escape verificati |
| Modulo iniziale nella barra progetti | Prima esperienza compressa in una colonna di navigazione | Creazione del primo progetto nell'area principale, in linea con i moduli del resto dell'app |

## Architettura

- **Navigazione:** selettore del progetto attivo, tre aree del mazzo, risorse globali. Sidebar desktop di **224 px**. Il selettore apre ricerca, elenco scorrevole e “Nuovo progetto”; a finestra stretta si compatta in un pulsante. Escape chiude e restituisce il focus; frecce e Invio consentono di scegliere. Decisione approvata in APP-061.
- **Lavoro:** contenuto centrale fluido con scorrimento indipendente. La larghezza delle singole componenti risponde allo spazio effettivo tramite container query.
- **Vista Lista:** una sola lista nell'area di lavoro disponibile, senza riepilogo laterale o dock; decisione confermata dall'utente in APP-060.
- **Intestazione Lista (APP-063):** titolo, totale e stato Standard nello stesso riepilogo, azioni a destra quando lo spazio lo consente. Nessun badge “Pronta per controllo” in questa vista. “Controlli e fonti” apre dettagli e incertezze; problemi certi subito visibili. Conformità positiva sempre qualificata dallo snapshot, campione parziale da verificare.
- **Carte della Lista (APP-062):** righe di almeno 72 px, miniatura 36×50 px, quantità e nome a 16 px. Sezioni Pokémon/Allenatori/Energie con conteggi delle copie; riepilogo cliccabile per raggiungerle. Categoria dal catalogo o dalle intestazioni esplicite dell'import, con nota; altrimenti “Da classificare”. Miniature esistenti della stessa identità, segnaposto stabile quando assenti o non leggibili.
- **Lista persistente in Thread e Matchup:** **384 px fissi** sopra 1240 px di finestra. Quantità, sezioni e stato restano leggibili; nomi lunghi vanno a capo. Lo stato “Pronta per controllo” è neutro: non equivale a Standard verificato.
- **Dettaglio carta (APP-064):** immagine 180×252 px e testo di gioco a 15 px/1,65; poi vincolo. Stampe/varianti e testo importato/controlli in disclosure native. Immagine sopra il testo sotto 700 px di contenuto. Testo e immagine derivano dalle stampe della stessa identità, con riferimenti distinti; dati ignoti non ricostruiti.
- **Finestra stretta:** fino a 1240 px, navigazione a icone e lista in dock inferiore di 220 px solo in Thread e Matchup, sempre parte della griglia. A 640 px la navigazione diventa orizzontale. Nessun pannello copre il contenuto.
- **Livelli informativi:** decisione e blocchi → dettaglio operativo → provenienza e diagnostica. I dati non vengono eliminati per rendere la schermata più breve.
- **Vincoli (APP-065):** creazione dentro la carta con identità fissata, esito e conflitti in anteprima. Modifica dentro la riga del riepilogo; creazione generale apribile su richiesta. Modulo condiviso, campi di almeno 40 px, stampa facoltativa a tutta larghezza. Errori mantengono i valori, Annulla/Escape restituiscono il focus; scroll confinato al contenuto.
- **Importazione (APP-066):** modulo sopra la lista, aperto dal comando nell'intestazione e sempre presente nei progetti vuoti. Testo salvato precompilato, textarea con altezza responsive e scorrimento interno; file a sinistra, Annulla e salvataggio esplicito a destra quando lo spazio lo permette. Nessuna sovraimpressione. Errori contestuali, ritorno del focus e nessuna scrittura all'annullamento.

## Fondazioni

| Elemento | Regola |
| --- | --- |
| Famiglia | Segoe UI Variable, Segoe UI, system-ui; fallback nativo Linux. Monospaziato solo per liste grezze |
| Scala | 12 / 13 / 14 / 16 / 20 / 24 / 28 px; 15 px per prosa tattica; numeri tabulari |
| Spazi | Scala 4 / 8 / 12 / 16 / 20 / 24 / 32 px |
| Controlli | 40 px ordinari; 44 px navigazione e righe del pannello; 32–36 px per il comando compatto della lista |
| Superfici | Canvas grigio freddo, pannelli bianchi, dettaglio neutro chiaro; ombra riservata al dialogo |
| Raggi | 6 px controlli e gruppi; 10 px superfici; 14 px dialogo |
| Colori | Testo scuro, petrolio per azioni, verde conferma, ambra incertezza, rosso errore, viola proposta |
| Focus | Bordo esterno di 3 px; file picker con focus reso sul pulsante visibile; regioni lista/confronto accessibili da tastiera |
| Movimento | Transizioni brevi; rispetto di `prefers-reduced-motion`, anche nello scorrimento verso import e vincoli |
| Icone | SVG locali a tratto uniforme; decorative, con testo o nome accessibile sul controllo |

I token risiedono in `src/renderer/src/tokens.css`; `styles.css` descrive i componenti e `workspace.css` soltanto il layout e i breakpoint. `Icon.tsx` è il set di icone. Non sono richiesti font remoti, immagini decorative o librerie UI aggiuntive.

## Comportamenti e stati

- **Senza progetti:** primo modulo nel contenuto, con formato e circuito espliciti.
- **Senza lista:** modulo “Aggiungi una lista” subito disponibile sopra i vincoli, senza invito duplicato.
- **Lista caricata:** carte, totale e verifica essenziale; origine e testo originale restano consultabili.
- **Catalogo incompleto:** stato breve con azione; lacune ufficiali e problemi certi non sono nascosti.
- **Nuova proposta:** identità delle due liste e differenze in primo piano; confronto completo con scroll separati.
- **Base superata:** avviso esplicito e adozione disabilitata; storico conservato.
- **Guida assente o incerta:** stato esplicito, limiti nel piano e accesso alle fonti. Nessuna certezza ottenuta cambiando il colore.
- **AI indisponibile:** errore leggibile e stato locale; preferenze consultabili.
- **Scansioni e richieste in corso:** mantengono le etichette di progresso e i controlli disabilitati esistenti.
- **Dialogo adozione:** azione annullabile, focus contenuto e restituito; sostituzione sempre manuale dell'intera lista.

## Verifica

**Discussione Matchup (APP-073):** ultimo scambio aperto, contributo “Tu” su superficie neutra e riepilogo “Cosa cambia · Codex” distinto; corpo a 15 px/1,7, metadati secondari. Campo vicino allo scambio e unica azione primaria “Aggiorna guida”; “Rigenera guida” secondaria. Lo storico chiuso inizialmente conta le versioni precedenti, dalla più recente; “Leggi versione” mostra piano, limiti, carte, punti forti/debolezze e riferimenti propri nel normale flusso della pagina. Nessuna guida corrente duplicata. La guida iniziale senza osservazioni ha solo metadati e campo di scrittura. Un commento in attesa compare una volta, con stato/errore e riprova dello stesso turno; il focus resta nella sezione e la guida precedente continua a essere leggibile. Stato e bozze seguono il contesto anche dopo navigazione. [1440](design-review/discussione-1440.png), [1280](design-review/discussione-1280.png), [640](design-review/discussione-640.png), [errore](design-review/discussione-errore-1280.png): fixture UI dichiarate.

**Guida Matchup (APP-071):** piano subito dopo la scelta dell'avversario, stato storico e incertezze visibili, carte chiave in due colonne quando lo spazio lo consente. Punti forti/rischi e fonti dettagliate sono apribili. I collegamenti nei testi sono sottolineati, con focus e destinazione riconoscibili; i nomi senza una destinazione univoca restano testo. Carte riconosciute della base attuale → Catalogo; riferimenti salvati e citazioni esplicite supportate → browser tramite IPC. Lo storico non viene arricchito usando la lista attuale. URL nudi con etichette brevi, errori di apertura accanto al riferimento, nessuna interpretazione HTML.

**Scrittura Thread (APP-069):** un campo e due modalità con radio native, navigabili con Tab e frecce. Stesso testo al cambio modalità, azione primaria esplicita, osservazione separata e una sola anteprima secondaria. Azioni nella stessa riga quando lo spazio lo permette, a capo quando serve. Errori nel modulo, valori conservati e controlli disabilitati durante invio/salvataggio; nessuna anteprima tardiva in un contesto diverso.

**Avversario Matchup (APP-070):** selettore con nome, quota meta e disponibilità della guida; stessa superficie e tipografia dei Thread. Menu ricercabile entro il contenuto centrale, scorrimento proprio, nomi lunghi a capo, opzione corrente in vista alla riapertura. Storico distinto dal meta attuale; percentuali vecchie non riproposte. Caricamento incompleto o errore non devono diventare “Nessuna guida”. Un solo nome scelto, punti Limitless nei dettagli della fonte. Escape chiude anche dopo una ricerca; Tab esce senza cambiare scelta.

**Thread (APP-067/068):** selettore con titolo, base e stato sintetico accanto a “Nuovo thread”. Ricerca e opzioni riprendono i componenti del selettore progetti; il menu resta entro l'area di lavoro, con scorrimento proprio e titoli lunghi a capo. La creazione usa un modulo nel flusso, con annullamento/Escape, focus restituito ed errori conservativi portati in vista. La candidata corrente mostra un riepilogo con stato, copie cambiate, blocchi/incertezze e origine; il confronto completo si apre nella pagina e si richiude anche con Escape. Le candidate precedenti restano nella cronologia. Titolo/base duplicati sono rimossi, data e configurazione AI sono sotto la conversazione.

La verifica usa Electron reale su Windows, con archivi separati. I dati di Catalogo/Eventi e la guida del test sono **fixture UI**, non nuove acquisizioni o generazioni AI. Il test Matchup può ricevere il metagame attraverso il connettore già esistente; la guida resta una fixture dichiarata.

`tests/design-system-audit.mjs` controlla testo effettivamente renderizzato, contrasto, dimensioni minime dei controlli e nomi dei pulsanti. È richiamato dai percorsi workspace, Catalogo, Eventi e AI. Sono esclusi elementi nascosti e controlli disabilitati. Non è una certificazione generale di accessibilità.

Riferimenti per i criteri utilizzati: [contrasto del testo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [dimensione dei bersagli](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [focus visibile](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Il design adotta controlli più grandi del minimo di 24 px citato dal criterio sui bersagli.

Esiti dei comandi e limiti effettivi sono registrati in **APP-059 in BACKLOG.md**. Le prove a 1440×900 e 1280×720 sono integrate da 1241/1240×720, 1024×768 e 640×720; le risorse globali sono provate anche a 640×580.

## Percorso di prova

**Progetti (APP-061):** aprire il nome in alto, cercare un progetto o scegliere “Nuovo progetto”. Provare anche Tab, frecce, Invio ed Escape. [Selettore desktop](design-review/progetti-1280.png) e [compatto](design-review/progetti-640.png).

**Dettaglio carta (APP-064):** in Lista aprire Mega Absol ex per leggere gli attacchi; aprire un Allenatore per l'effetto. “Testo importato e controlli” e “Stampe e varianti” si aprono anche con Invio/Spazio. [Carta 1440](design-review/carta-1440.png), [1280](design-review/carta-1280.png) e [640](design-review/carta-640.png) usano il campione TCGdex già acquisito nel solo profilo demo. La miniatura ingrandita conserva i limiti della risoluzione originale.

**Vincoli (APP-065):** Lista → carta → Aggiungi vincolo; scegliere Almeno N e osservare l'esito prima di salvare. “Gestisci vincoli” raggiunge il riepilogo; Modifica apre il modulo nella riga. Provare Annulla/Escape. [Creazione 1440](design-review/vincolo-1440.png), [1280](design-review/vincolo-1280.png), [640](design-review/vincolo-640.png) sul catalogo locale della demo; [modifica a 640](design-review/vincolo-modifica-640.png) su fixture dichiarata di Iono.

**Importazione (APP-066):** Lista → Importa / sostituisci, modificare il testo e provare Annulla/Escape; riaprire per verificare il testo salvato. Provare anche un file `.txt` e il salvataggio esplicito. [Modulo 1440](design-review/importazione-1440.png), [1280](design-review/importazione-1280.png), [640](design-review/importazione-640.png), [errore file](design-review/importazione-errore-1280.png), [progetto vuoto](design-review/importazione-vuota-1280.png). Schermate su demo o fixture UI, senza nuove generazioni AI. `node tests/import-ui-live.mjs` verifica anche rollback e risposte tardive nel profilo isolato.

Schermate registrate: [Lista 1440](design-review/lista-1440.png), [Lista 1280](design-review/lista-1280.png), [Thread](design-review/thread-1440.png), [Matchup 1280](design-review/matchup-1280.png), [Lista a 640](design-review/lista-640.png), [dock Thread a 640](design-review/thread-640.png), [Catalogo](design-review/catalogo-1440.png), [Eventi](design-review/eventi-1280.png), [conferma di adozione](design-review/adozione.png).

**Selezione Thread (APP-067):** aprire “Piano più rapido”, cercare un titolo e scegliere con frecce/Invio; provare Escape e Tab. “Nuovo thread” apre il modulo; Annulla evita il salvataggio. [Menu 1440](design-review/thread-selettore-1440.png), [1280](design-review/thread-selettore-1280.png), [640](design-review/thread-selettore-640.png) e [creazione 1280](design-review/thread-creazione-1280.png) usano una fixture UI con 13 thread per verificare scorrimento e nomi lunghi. Le schermate Thread 1440/640 e [1280](design-review/thread-1280.png) sono aggiornate sulla demo esistente. `node tests/thread-switcher-ui-live.mjs` verifica anche errore SQLite, recupero e isolamento in archivio temporaneo.

1. **Lista:** controllare conteggi e miniature, usare il riepilogo per raggiungere Allenatori o Energie, aprire una carta, verificare lo stato Standard e provare “Importa / sostituisci”. Le schermate Lista APP-062 usano il campione reale TCGdex nel profilo demo; non tutte le carte della lista hanno una miniatura disponibile.
2. **Thread → Piano più rapido:** leggere il riepilogo e usare “Apri confronto”; scorrere le due liste e il pannello persistente in modo indipendente; aprire e annullare l'adozione. Chiudere con Escape o il comando finale e verificare il ritorno del focus. [Conversazione 1440](design-review/thread-conversazione-1440.png), [confronto 1440](design-review/thread-confronto-1440.png), [1280](design-review/thread-confronto-1280.png), [640](design-review/thread-confronto-640.png), [base superata](design-review/thread-base-superata.png) provengono da fixture dichiarate. Le schermate generali Thread sono aggiornate sulla demo; contrasto minimo osservato 5,54:1.
3. **Matchup → aprire il selettore dell'avversario → cercare “fixture UI”:** leggere la guida, aprire una revisione precedente e le opzioni AI; tenere la lista principale a vista.

**Prova dei riferimenti nella guida (APP-071):** nella demo, selezionare “Gardevoir ex · fixture UI”, poi usare il link **Mega Absol ex** nel piano o i nomi nelle carte chiave. Aprire “Punti forti e rischi”, “Fonti e dati della guida” e una revisione precedente. Le [schermate 1440](design-review/matchup-1440.png), [1280](design-review/matchup-1280.png) e [640](design-review/matchup-640.png) mostrano la guida di esempio aggiornata con riferimenti espliciti a schede del catalogo locale. Le guide reali non sono state riscritte. Sette test `guide-links.test.ts` e `node tests/matchup-switcher-ui-live.mjs --guide-links` coprono URL, nomi ambigui, testo non affidabile, riferimenti storici, apertura Catalogo e IPC esterne con shell intercettata. Piano visibile nella prima schermata anche a 640 px; contrasto minimo 5,16:1 nella fixture e 5,54:1 nella demo. Altri URL e Markdown non supportato restano testo; nessuna nuova generazione AI o prova Linux/lettore di schermo.

**Prova del selettore Matchup (APP-070):** [menu 1440](design-review/matchup-selettore-1440.png), [1280](design-review/matchup-selettore-1280.png), [640](design-review/matchup-selettore-640.png) e [nome lungo](design-review/matchup-nome-lungo-640.png) usano 16 archetipi correnti e uno storico dimostrativi. `node tests/matchup-switcher-ui-live.mjs` verifica ricerca, tastiera, focus, guida corrente/storica/assente, isolamento progetti, progetto vuoto ed errore di lettura, con storage/IPC reali e snapshot di rete simulato. Minimo contrasto 5,16:1. [Guida demo 1440](design-review/matchup-1440.png), [1280](design-review/matchup-1280.png) e [640](design-review/matchup-640.png) aggiornate sulla demo esistente, anch'essa con guida fixture; minimo contrasto 5,54:1. Nessuna nuova generazione AI verificata; Linux, lettore di schermo e scala OS elevata non provati.
4. **Catalogo / Eventi / AI:** confrontare filtri, pulsanti, dettagli apribili e messaggi di stato.
5. Ridimensionare tra 1440 e 1280 px, poi sotto 1240 px; provare Tab, Shift+Tab, Enter, Escape e PageDown nella lista.

Per conservare il profilo creato dalla prova: `node tests/workspace-ui-live.mjs --keep-profile`. Il comando stampa la cartella temporanea da usare come `POKEGURU_DATA_DIR` durante la prova manuale.

**Prova della scrittura (APP-069):** Thread → scrivere un testo → cambiare Discuti / Proponi una lista anche con le frecce → aprire l'anteprima. “Salva osservazione” salva realmente il testo nel thread; le azioni Codex richiedono il servizio disponibile. [Proposta 1440](design-review/thread-scrittura-1440.png), [1280](design-review/thread-scrittura-1280.png), [640](design-review/thread-scrittura-640.png), [Discuti](design-review/thread-discuti-1280.png), [errore 640](design-review/thread-scrittura-errore-640.png) usano fixture dichiarate; `node tests/thread-composer-ui-live.mjs` verifica anche persistenza, errore SQLite, instradamento e anteprime tardive. Non certifica nuove generazioni AI. Contrasto minimo osservato 5,16:1.

## Feedback utile

**Navigazione globale (APP-072):** un solo gruppo Indietro/Avanti nell'intestazione, con tooltip della destinazione, focus visibile, stato disabilitato e Alt+Sinistra/Destra. L'intestazione resta sopra il contenuto anche sotto 640 px. Tornare recupera la lettura esatta, le selezioni e le bozze; non modifica dati salvati. I link esterni hanno ↗ e mantengono il contesto nell'app. Cronologia e bozze sono valide nella sessione, con 80 destinazioni al massimo. [Desktop 1440](design-review/navigazione-1440.png), [1280](design-review/navigazione-1280.png) e [compatto 640](design-review/navigazione-640.png) usano guide dichiaratamente dimostrative. Provare una guida → Catalogo → Indietro, poi un Thread con bozza → Impostazioni AI → Indietro; verificare anche Avanti e Alt+frecce.

- Leggibilità e ritmo durante una sessione reale, soprattutto sui nomi lunghi.
- Equilibrio tra colonna di lavoro e pannello da 384 px.
- Chiarezza del colore proposta e degli stati incerti.
- Utilità del dock sotto 1240 px e della nuova gerarchia delle fonti.

La resa su Linux e ad alti fattori di scala del sistema richiede una prova nel relativo ambiente. Nessuna nuova qualità tattica o affidabilità delle integrazioni è dedotta dalle fixture UI.
