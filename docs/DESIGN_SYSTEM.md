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
| Carta con nome lungo troncato in due colonne strette | Serve aprire la riga per riconoscere una carta | Nomi a capo, griglia guidata dalla larghezza effettiva del contenuto, una colonna quando serve |
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
- **Lista persistente in Thread e Matchup:** **384 px fissi** sopra 1240 px di finestra. Quantità, sezioni e stato restano leggibili; nomi lunghi vanno a capo. Lo stato “Pronta per controllo” è neutro: non equivale a Standard verificato.
- **Finestra stretta:** fino a 1240 px, navigazione a icone e lista in dock inferiore di 220 px solo in Thread e Matchup, sempre parte della griglia. A 640 px la navigazione diventa orizzontale. Nessun pannello copre il contenuto.
- **Livelli informativi:** decisione e blocchi → dettaglio operativo → provenienza e diagnostica. I dati non vengono eliminati per rendere la schermata più breve.

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
- **Senza lista:** azione “Aggiungi una lista” porta il focus al campo di importazione.
- **Lista caricata:** carte, totale e verifica essenziale; origine e testo originale restano consultabili.
- **Catalogo incompleto:** stato breve con azione; lacune ufficiali e problemi certi non sono nascosti.
- **Nuova proposta:** identità delle due liste e differenze in primo piano; confronto completo con scroll separati.
- **Base superata:** avviso esplicito e adozione disabilitata; storico conservato.
- **Guida assente o incerta:** stato esplicito, limiti nel piano e accesso alle fonti. Nessuna certezza ottenuta cambiando il colore.
- **AI indisponibile:** errore leggibile e stato locale; preferenze consultabili.
- **Scansioni e richieste in corso:** mantengono le etichette di progresso e i controlli disabilitati esistenti.
- **Dialogo adozione:** azione annullabile, focus contenuto e restituito; sostituzione sempre manuale dell'intera lista.

## Verifica

La verifica usa Electron reale su Windows, con archivi separati. I dati di Catalogo/Eventi e la guida del test sono **fixture UI**, non nuove acquisizioni o generazioni AI. Il test Matchup può ricevere il metagame attraverso il connettore già esistente; la guida resta una fixture dichiarata.

`tests/design-system-audit.mjs` controlla testo effettivamente renderizzato, contrasto, dimensioni minime dei controlli e nomi dei pulsanti. È richiamato dai percorsi workspace, Catalogo, Eventi e AI. Sono esclusi elementi nascosti e controlli disabilitati. Non è una certificazione generale di accessibilità.

Riferimenti per i criteri utilizzati: [contrasto del testo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [dimensione dei bersagli](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [focus visibile](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Il design adotta controlli più grandi del minimo di 24 px citato dal criterio sui bersagli.

Esiti dei comandi e limiti effettivi sono registrati in **APP-059 in BACKLOG.md**. Le prove a 1440×900 e 1280×720 sono integrate da 1241/1240×720, 1024×768 e 640×720; le risorse globali sono provate anche a 640×580.

## Percorso di prova

**Progetti (APP-061):** aprire il nome in alto, cercare un progetto o scegliere “Nuovo progetto”. Provare anche Tab, frecce, Invio ed Escape. [Selettore desktop](design-review/progetti-1280.png) e [compatto](design-review/progetti-640.png).

Schermate registrate: [Lista 1440](design-review/lista-1440.png), [Lista 1280](design-review/lista-1280.png), [Thread](design-review/thread-1440.png), [Matchup 1280](design-review/matchup-1280.png), [Lista a 640](design-review/lista-640.png), [dock Thread a 640](design-review/thread-640.png), [Catalogo](design-review/catalogo-1440.png), [Eventi](design-review/eventi-1280.png), [conferma di adozione](design-review/adozione.png).

1. **Lista:** leggere carte con nomi lunghi, aprire una carta, verificare lo stato Standard e provare “Importa / sostituisci”.
2. **Thread → Piano più rapido:** confrontare principale e proposta; scorrere le due liste e il pannello persistente in modo indipendente; aprire e annullare l'adozione.
3. **Matchup → cercare “fixture UI”:** leggere la guida, aprire una revisione precedente e le opzioni AI; tenere la lista principale a vista.
4. **Catalogo / Eventi / AI:** confrontare filtri, pulsanti, dettagli apribili e messaggi di stato.
5. Ridimensionare tra 1440 e 1280 px, poi sotto 1240 px; provare Tab, Shift+Tab, Enter, Escape e PageDown nella lista.

Per conservare il profilo creato dalla prova: `node tests/workspace-ui-live.mjs --keep-profile`. Il comando stampa la cartella temporanea da usare come `POKEGURU_DATA_DIR` durante la prova manuale.

## Feedback utile

- Leggibilità e ritmo durante una sessione reale, soprattutto sui nomi lunghi.
- Equilibrio tra colonna di lavoro e pannello da 384 px.
- Chiarezza del colore proposta e degli stati incerti.
- Utilità del dock sotto 1240 px e della nuova gerarchia delle fonti.

La resa su Linux e ad alti fattori di scala del sistema richiede una prova nel relativo ambiente. Nessuna nuova qualità tattica o affidabilità delle integrazioni è dedotta dalle fixture UI.
