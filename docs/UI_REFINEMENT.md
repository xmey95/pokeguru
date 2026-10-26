# Rifinire Pokéguru mantenendo i percorsi attuali

26 ottobre 2026 · direzione aggiornata dopo il feedback dell'utente

L'utente apprezza l'organizzazione attuale del software. Le alternative strutturali di UX_DIRECTIONS sono troppo estese: restano Lista, Thread, Matchup, selettori, creazione dei Thread e lista persistente. La scelta da riprendere è il piano Matchup con tre tab **Apertura, Sviluppo, Chiusura**. Il resto del lavoro riguarda maturità della presentazione, chiarezza degli stati e quantità di informazioni esposte.

## Da interfaccia tecnica a strumento quotidiano

La sensazione di software acerbo può derivare da una pagina che racconta continuamente il proprio funzionamento: query, prompt, contatori, identificativi, spiegazioni preventive e avvisi ripetuti. Nel renderer molti dettagli sono già richiudibili; il problema residuo comprende anche il numero e il linguaggio dei titoli che restano visibili. Aggiungere altre sezioni richiudibili per ogni dettaglio non basta.

La proposta è assegnare alle informazioni tre posizioni coerenti, senza cambiare navigazione:

- **Nel lavoro corrente:** piano, carte, differenze della proposta, versione utile, stato dell'operazione e problemi che richiedono una scelta. Una lacuna che cambia il significato di una guida resta qui.
- **In Fonti e dettagli:** dati consultati, provenienza, periodo, copertura, versioni e impostazioni effettive. Restano verificabili senza interrompere la lettura.
- **Nella Diagnostica AI, dentro i dettagli:** prompt integrale, hash, byte, query, token e dati utili all'assistenza. Non occupano più più titoli separati fra piano e discussione.

La selezione delle informazioni è contestuale. «Lista precedente» e «Carta non identificata» aiutano una decisione; un hash della lista o la dimensione del prompt servono a un approfondimento tecnico. Le credenziali e lo stato di accesso appartengono alle Impostazioni AI, mentre un problema di connessione che impedisce un'analisi deve essere visibile nel punto dell'azione.

## Correzioni concrete proposte

| Evidenza nel renderer attuale | Presentazione proposta | Condizione da rispettare |
| --- | --- | --- |
| `Job Codex Matchup in corso.` e `Job Codex in corso per questo thread.` | «Preparazione della guida…» / «Codex sta rispondendo…» con un solo stato e Annulla | Non mostrare una percentuale o un tempo restante senza dati reali. |
| `Risultato Codex in attesa di recupero.` e `Recupera risultato` | «La risposta è pronta, ma non è stata salvata.» e «Completa salvataggio» | Non presentare l'analisi come disponibile finché non è stata applicata e salvata. Il testo deve corrispondere allo stato effettivo. |
| `Query automatiche al motore · N` | Dentro Diagnostica AI; nel riepilogo utile, «Dati consultati» | Se una ricerca incompleta limita una conclusione, mostrare quella lacuna vicino alla conclusione. |
| `Prompt effettivo · N byte`, `Impronta SHA-256`, token di pianificazione | Un approfondimento dentro Diagnostica AI | Preservare i dati, senza obbligare il giocatore a interpretarli. |
| `lista {hash} · snapshot Meta {id}` nei metadati guida | Versione del mazzo e periodo leggibili; ID tecnici in diagnostica | Per guide legacy senza versione attribuibile, «Versione della lista non disponibile», senza inventare vN. |
| `Base superata` e spiegazioni ripetute | «Questa proposta usa una lista precedente.» con azione per continuare sulla lista attuale | L'adozione resta bloccata; il nuovo Thread non aggiorna automaticamente la proposta precedente. |
| `Legalità torneo da verificare` nella scheda candidata e di nuovo nel confronto | Un riepilogo coerente dei controlli, con cause specifiche e dettaglio accessibile | Conservare l'ambito dei controlli e la cautela prima della conferma; non trasformare dati incerti in un via libera. |
| `Set ufficiali nel manifest` | «Espansioni presenti nel catalogo» nei dettagli di copertura | Conteggi e denominatore devono continuare a descrivere lo stesso insieme, non tutte le carte fisiche. |
| Descrizione del pacchetto, turno aggiuntivo, query di sola lettura e token nell'anteprima Thread | Riassunto dei dati inviati; spiegazione tecnica nei dettagli | Il controllo prima dell'invio previsto da R-11 resta accessibile. |

Riferimenti verificati: [MatchupSection](../src/renderer/src/MatchupSection.tsx), [ThreadsSection](../src/renderer/src/ThreadsSection.tsx), [AiQueryTraceView](../src/renderer/src/AiQueryTraceView.tsx), [AiPromptAuditView](../src/renderer/src/AiPromptAuditView.tsx), [CatalogSection](../src/renderer/src/CatalogSection.tsx). Sono proposte editoriali, non stringhe già sostituite in produzione.

## Rifinitura del Matchup

Il piano occupa lo stesso pannello centrale, con il mazzo ancora a destra o nel dock. Sotto il titolo «Piano di gioco», tre tab mostrano una fase alla volta. Carte chiave, limiti decisivi e discussione restano raggiungibili nello stesso percorso. Fonti e diagnostica confluiscono in un unico ingresso di secondo livello.

Il cambio di fase deve funzionare da tastiera, mantenere il focus e non perdere un'osservazione già scritta. Non avvia analisi né cambia versione. Durante un aggiornamento, l'ultima guida valida resta leggibile; dopo un errore si offre Riprova conservando il contenuto. Una guida storica identifica la lista usata e la lista attuale con un messaggio breve e un'azione pertinente.

Oggi `MatchupReport.strategy` è una stringa unica. Il prompt già chiede avvio, sviluppo e chiusura, ma non garantisce tre campi separati. Nell'implementazione serviranno fasi esplicite e validate per le nuove guide e revisioni, conservando la lettura del testo delle guide precedenti. Il prototipo mostra anche «Guida senza fasi»: il testo resta intero e non viene suddiviso automaticamente per frasi o lunghezza. Non è necessario riscrivere o rigenerare in massa lo storico.

Riferimenti: [contratto guida](../src/shared/meta-matchups.ts), [generazione e revisione](../src/main/codex-matchup.ts). Punti forti, debolezze, fonti e limiti restano contenuti del prodotto; le tab organizzano il piano, non sostituiscono l'intera analisi.

## Segnali di maturità da verificare

La revisione non si conclude con testi più brevi. Lo stesso stato deve avere la stessa etichetta nelle varie schermate; un avviso deve dare una causa comprensibile e un'azione quando disponibile. Un successo deve corrispondere a un risultato salvato. La bozza deve sopravvivere agli errori e al cambio di tab; contenuto precedente, focus, scorrimento e pulsanti in attesa devono comportarsi in modo prevedibile. Gli stati vuoti devono aiutare il primo passo, senza raccontare l'architettura dell'app.

Nel lavoro successivo conviene verificare questi casi nelle viste reali prima di attribuire loro un difetto: esistono già diverse protezioni e prove nel progetto. Non si assumono regressioni di persistenza o navigazione solo perché l'aspetto appare acerbo.

## Proposta da guardare

[Anteprima Matchup](../prototypes/refinement/index.html): riprende la shell dello studio iniziale con navigazione e lista persistente, aggiunge le tre fasi e riduce l'informazione tecnica nel primo livello. È uno studio mirato, non una replica completa del renderer. Testi tattici e dati sono illustrativi; l'AI non viene eseguita.

Le viste Lista e Thread richiamano lo studio iniziale e servono solo a orientarsi; non rappresentano una nuova proposta di modifica dei loro flussi. Le architetture A/B/C restano archiviate e non costituiscono il prossimo intervento. Il prossimo incremento da definire riguarda le tab Matchup e una revisione editoriale circoscritta, usando gli esempi sopra.
