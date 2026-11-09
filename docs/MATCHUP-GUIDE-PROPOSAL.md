# Proposta per guide matchup approfondite e personalizzate

30 ottobre 2026 · APP-188 · R-07, R-10, R-13; collegamento a R-08 solo per eventuali discussioni successive sulle modifiche.

**Stato: proposta da valutare, non implementata.** Autorizzati struttura, generazione e protocollo di verifica. Nessuna nuova generazione AI dell'app, modifica del codice o prova competitiva eseguita.

**Aggiornamento successivo del 30 ottobre:** l'utente ha autorizzato il solo pilota APP-189. Le [tre guide generate e il rapporto](pilots/APP-189/REPORT.md) sono disponibili per la valutazione; l'integrazione applicativa resta esclusa. I riferimenti a budget non ancora autorizzato nelle sezioni seguenti descrivono lo stato originario della proposta, superato per il pilota da T-189.

## Risultato da ottenere

Una guida completa per **questa versione della nostra lista contro il matchup selezionato**. Il giocatore deve capire come prepararsi, quali decisioni cambiano l'esito, come concatenare le azioni e quando abbandonare una linea.

La precisazione dell'utente esclude un manuale generale del mazzo separato. Tutti i contenuti, inclusi sequencing, gestione delle risorse ed esercizi, devono essere legati a quell'incontro. Questo supera la proposta di un livello generale della lista contenuta nel precedente [confronto APP-187](GUIDE-COMPARISON.md).

La guida rimane una sola. All'inizio offre un riepilogo per ripassare; seguono capitoli approfonditi con indice navigabile. Il riepilogo non sostituisce la generazione dei capitoli e non diventa una modalità più povera. Apertura, Sviluppo e Chiusura restano riconoscibili, con prosa naturale secondo T-143. Non è necessario ripetere in ogni paragrafo etichette tecniche o descrizioni delle carte già spiegate.

## Struttura della singola guida

| Parte | Contenuto richiesto | Criterio osservabile |
| --- | --- | --- |
| **Riepilogo del matchup** | Come possiamo vincere, come può vincere l'avversario, tre priorità e il rischio principale. Tendenza qualitativa motivata quando sostenibile. | Il lettore può ripassare il piano senza rileggere tutto; nessuna percentuale inventata. |
| **Prima di iniziare** | Primo o secondo con motivazione; starter preferiti fra quelli realmente presenti; primi bersagli di ricerca; Panchina desiderata; carte da controllare nei Premi. | Specifica cosa cambia con mano debole, risorsa nei Premi o variante avversaria rilevante. |
| **Apertura, Sviluppo, Chiusura** | Obiettivi di ogni fase, sequenze utili, priorità dei bersagli, turni in cui accelerare o rallentare. | Ogni fase spiega le condizioni per passare alla successiva e almeno le eccezioni decisive del matchup. |
| **Decisioni che cambiano la partita** | Snodi concreti: prendere o rimandare un KO, colpire l'attaccante o il motore, usare disruption o svilupparsi, schierare un supporto o preservare spazio. | Per ogni snodo: opzioni, motivazione, risposta avversaria, informazione che ribalta la scelta. |
| **Percorsi di vittoria e risorse** | Sequenze su più turni, bersagli e Premi; piani in parità, vantaggio o svantaggio quando pertinenti; recuperi, Energie e Aiuto necessari. | Ogni percorso esplicita prerequisiti, risorse consumate e punto di fallimento. Anche condizioni diverse dai Premi, se pertinenti e supportate. |
| **Varianti e imprevisti** | Come riconoscere le varianti dell'archetipo selezionato e adattarsi; cosa cambia se una nostra risorsa essenziale manca o viene rimossa. | I segnali sono osservabili; una lista campione non viene presentata come la composizione certa dell'avversario. |
| **Scenari commentati ed errori** | Posizioni esemplificative, alternative confrontate, successione delle azioni e risposta avversaria; errori tipici e brevi esercizi con soluzione apribile. | Il lettore può ricostruire perché una linea è preferita e quando smette di funzionare. |
| **Fonti e aggiornamenti** | Lista/versione usata, periodo e copertura delle evidenze, riferimenti e lacune decisive, cosa cambia rispetto alla revisione precedente. | Carte e fatti sono rintracciabili; limiti che cambiano il piano compaiono anche accanto al consiglio interessato. |

Punti forti, debolezze e carte chiave attuali confluiscono nei capitoli in cui servono. Si può conservare un riepilogo consultabile delle carte chiave, evitando di ripetere gli stessi effetti in quattro sezioni. Le informazioni tecniche su prompt, query e consumo restano nella diagnostica.

**Profondità iniziale proposta:** circa 2.500–4.500 parole per un matchup articolato, riepilogo compreso; orientativamente 3–5 decisioni sviluppate, 2–3 scenari e 1–2 esercizi. Sono riferimenti editoriali da verificare nel pilota, non quote da riempire. Un matchup semplice può richiedere meno; uno complesso più capitoli. La completezza viene valutata sulle decisioni coperte. Il vecchio limite di uno/due paragrafi vale per l'eventuale riepilogo delle fasi, non per l'intera trattazione.

## Personalizzazione obbligatoria

Ogni generazione usa una base congelata: lista completa con quantità e stampe risolte, versione, vincoli, data/formato/circuito, testi delle carte, errata disponibili, controllo Standard e snapshot delle evidenze avversarie. Tutte le fasi AI ricevono la nostra lista e il suo obiettivo, non soltanto una domanda generica o una sintesi dei tornei.

- Una linea può impiegare soltanto carte presenti e quantità disponibili nella lista. Una carta assente può essere nominata come confronto o limite, mai utilizzata implicitamente nel piano.
- Il numero di copie cambia il consiglio: con una sola risorsa di recupero non si può costruire una sequenza che la consumi due volte senza un meccanismo documentato per recuperarla.
- Le condizioni delle carte devono essere rispettate: carte nel mazzo, negli scarti, in mano o nei Premi non sono intercambiabili; i recuperi non vengono estesi a categorie non ammesse.
- Le varianti avversarie restano separate quando cambiano il piano. Non si combinano in un unico mazzo immaginario tutte le tech osservate nell'archetipo.
- Cambi alla nostra lista restano eventuali proposte nel flusso Strategie. La guida spiega come giocare la lista che abbiamo e quali limiti comporta.
- Osservazioni dell'utente possono motivare una revisione, ma non diventano automaticamente risultati verificati. La guida esterna è un riferimento editoriale per questa proposta, non una fonte da incorporare integralmente nella generazione dell'app.

## Forma dei ragionamenti e degli scenari

Una decisione approfondita deve contenere: **situazione → obiettivo → opzioni → risorse e ordine delle azioni → risposta avversaria → seguito → condizione per cambiare piano**. Questi elementi sono dati strutturati per la generazione e la verifica; il testo visibile deve leggerli come una spiegazione naturale.

Lo scenario conserva il turno, l'Attivo e la Panchina di entrambi, danni, Energie e Oggetti rilevanti, Stadio, Premi, risorse note in mano/scarti e azioni già consumate. Distingue informazione nota, assunzione e informazione nascosta. Una mano avversaria ignota non viene trasformata in conoscenza certa: si ragiona per possibilità e per segnali osservabili, senza probabilità numeriche arbitrarie.

Una sequenza completa contiene anche le risposte dell'avversario. Se richiede una pescata o un errore avversario, lo dichiara; non la presenta come vittoria forzata. Ogni diagramma futuro deriva da questo stesso stato, così testo e immagine non possono essere due descrizioni indipendenti.

### Esempio editoriale: Toucannon contro Dragapult

Questo esempio usa interazioni già descritte nei campioni di APP-187. È un'illustrazione del formato, non una nuova guida validata; non assume che la lista attuale dell'utente coincida ancora con il campione.

**Decisione: prendere due Premi su Meowth ex o continuare a danneggiare Dragapult?**

Assumiamo Toucannon pronto ad attaccare, sei Pokémon complessivi nelle due Panchine, Meowth ex avversario integro da 170 PS, Boss's Orders utilizzabile e nessuna prevenzione o modifica dei PS/danni rilevante. Il testo del campione attribuisce a Feather Rondo 180 danni con quella Panchina. La guida deve verificare queste premesse sulle schede originali prima di usare il caso.

Se ci restano due Premi, richiamare Meowth può chiudere immediatamente la partita. Se ce ne restano tre, lo stesso KO lascia ancora un Premio da prendere: il valore della mossa dipende dal prossimo attaccante, dall'accesso al bersaglio successivo e dalla risposta avversaria.

Prendere quel KO rimuove anche un Pokémon dal tavolo. Se nel seguito diminuisce il totale delle Panchine, il danno del prossimo attacco va ricalcolato. Inoltre bisogna verificare se il KO abilita una disruption e se la protezione di Genesect è effettivamente attiva; non basta che Genesect sia nella lista. Un secondo Boss non può essere dato per disponibile soltanto perché il primo è stato trovato.

L'alternativa è continuare sul Dragapult già danneggiato, quando questo rende più affidabile il successivo KO e il danno rimane sul bersaglio. La scelta cambia se Munkidori può rimuoverlo, se perdiamo le protezioni o se non possiamo mantenere un attaccante pronto. Il caso completo deve quindi mostrare entrambe le continuazioni e le loro risorse; con dati insufficienti non assegna una scelta universalmente migliore.

Questo è il salto richiesto rispetto a «usa Boss sui supporti ex»: il lettore vede quando farlo, cosa controllare prima e che cosa deve preparare dopo.

## Generazione proposta

Il flusso riusa isolamento, snapshot, checkpoint e diagnostica dell'app, ma cambia l'unità del lavoro AI: capitoli e decisioni del matchup. È una modifica proposta al contratto delle evidenze, coerente con APP-185/186, non un comportamento già disponibile.

| Fase | Lavoro | Chiamate AI nominali |
| --- | --- | ---: |
| **Preparazione locale** | Congela la base, risolve le nostre carte, calcola aggregati sul perimetro locale pertinente, prepara originali e riferimenti. | 0 |
| **Piano della guida e richieste di evidenza** | Individua condizioni di vittoria, varianti e decisioni da coprire; richiede gli originali necessari e dichiara i dubbi che cambiano il piano. | 1 |
| **Scrittura: piano della partita** | Riepilogo provvisorio, primo/secondo, preparazione e fasi; usa le evidenze effettivamente recuperate e può correggere il piano iniziale. | 1 |
| **Scrittura: decisioni e percorsi** | Confronta le alternative, sviluppa le linee su più turni, le risorse e le risposte avversarie. | 1 |
| **Scrittura: casi e integrazione** | Costruisce scenari/esercizi dalle linee precedenti, tratta eccezioni e rifinisce il riepilogo senza riscrivere o comprimere tutti i capitoli. | 1 |
| **Revisione critica** | Cerca contraddizioni, risorse usate due volte, assunzioni nascoste, alternative ignorate e riferimenti insufficienti; restituisce rilievi puntuali. | 1 |
| **Controlli e salvataggio** | Verifica dati e collegamenti, compone i capitoli, registra la revisione completa e la relativa copertura. | 0 |

Il percorso nominale è quindi di **cinque chiamate AI per una nuova guida completa**. Non include richieste aggiuntive, errori o correzioni: ciascuna di queste operazioni viene conteggiata. Non si assume che cinque chiamate attuali possano già produrre il risultato: il pilota deve misurarlo.

Per il primo pilota propongo un budget massimo di **otto tentativi AI per guida**, comprendendo planner aggiuntivi, riparazioni, riesame dopo una correzione e retry. È una soglia sperimentale, non una stima del consumo in token. Se non basta, si conserva il lavoro e si dichiara ciò che manca; non si riducono silenziosamente i capitoli né si salva come completa una guida con problemi decisivi aperti. La disponibilità di una risposta JSON valida non basta a dichiararla pronta.

Le fasi di scrittura sono inizialmente sequenziali e ricevono un piano comune con identità delle carte, fatti, assunzioni e linee già costruite. Il revisore legge il risultato completo e le fonti originali delle affermazioni decisive. La composizione finale è applicativa, evitando una sintesi unica che perda proprio gli esempi approfonditi. Modello ed effort rimangono uguali alla configurazione scelta dall'utente durante la prima valutazione; nessuna promessa preventiva di durata o risparmio.

I controlli locali applicabili vengono eseguiti dopo ogni fase, prima di consumare una chiamata successiva su contenuti già riconosciuti come invalidi. Cinque chiamate sono il caso nominale con fonti sufficienti e risposte valide. Se emergono carte nuove, contraddizioni o contesto eccessivo, recupero, riparazione e nuova revisione consumano il budget dichiarato; nessun errore decisivo può essere ignorato per mantenere il conteggio nominale. Il tetto di otto è proposto per il pilota, non stabilisce oggi un limite permanente del prodotto.

### Evidenze mirate, con copertura esplicita

Il software calcola frequenze, distribuzioni delle quantità e risultati disponibili sull'intero insieme locale dichiarato, mantenendo periodo, canale, denominatori, irrisolti e provenienza. Il modello riceve questi aggregati e recupera liste esatte pertinenti alle decisioni. Non deve riassumere ogni partecipazione di torneo prima di scrivere il matchup.

La selezione delle liste non si limita alle più popolari. Deve coprire le varianti che cambiano le decisioni ed eventuali controesempi alle ipotesi del piano. Per ogni variante trattata servono una lista reale identificata e gli originali delle carte decisive; eventuali variazioni nelle quantità restano visibili negli aggregati. I gruppi strategici sono interpretazioni, separati dalle identità esatte dei mazzi. La copertura aggregata non equivale a lettura individuale di tutte le liste.

Ogni ricerca aggiuntiva deve rispondere a una domanda concreta, per esempio: «la variante osservata dispone di un modo per rimuovere questa protezione?» o «quante risorse di mobilità contiene la lista di riferimento?». Se i dati non bastano, la guida condiziona quel ramo e rende visibile la lacuna. Il recupero delle nuove carte citate e il controllo delle loro schede restano necessari; il planner non può dichiararli facoltativi per stare nel budget.

Questa proposta richiede un accordo sul contratto diverso da quello attuale, che consegna al processo di sintesi tutti i record recuperati. Conservazione degli originali e accesso puntuale restano obbligatori. La sola modifica del prompt finale lascerebbe irrisolto il costo della raccolta massiva.

## Controlli: cosa può essere verificato e cosa no

| Livello | Verifica proposta | Limite da esporre |
| --- | --- | --- |
| **Base e riferimenti** | Lista/versione corrette, appartenenza e quantità delle nostre carte, stampa delle carte avversarie, esistenza degli originali citati, isolamento del progetto. | Una fonte esistente non dimostra che la conclusione tattica la interpreti correttamente. |
| **Scenario e contabilità** | Stato coerente, conservazione di carte/risorse quando esplicitate, occupazione delle zone, successione delle azioni e registrazione dei Premi; aritmetica dei danni dichiarati. | Le informazioni nascoste restano assunzioni; un conteggio coerente non prova raggiungibilità o ottimalità della posizione. |
| **Regole supportate** | Costi e restrizioni per cui esistono regole strutturate verificate; segnali espliciti per effetti non coperti dal controllo automatico. | I testi delle carte non costituiscono già un motore completo delle regole. Il primo incremento non promette di validare ogni interazione. |
| **Revisione AI** | Risposte avversarie, conflitti fra capitoli, prerequisiti mancanti, uso scorretto delle fonti e alternative trascurate. | È un secondo controllo fallibile, non una certificazione competitiva. |
| **Valutazione umana nel pilota** | Correttezza delle linee e utilità per scegliere nelle posizioni proposte. | Il corpus iniziale misura fattibilità; non dimostra miglioramento del winrate o competenza su ogni mazzo. |

Un errore decisivo impedisce la pubblicazione della nuova revisione come completa. Il lavoro rimane recuperabile e l'ultima guida valida resta disponibile. Parti solo ipotetiche sono accettabili se dichiarate; una lacuna che rende impossibile giustificare la linea non viene mascherata con un avviso generico.

## Versioni, discussione e lettura

La nuova guida richiede un formato versionato con capitoli, decisioni, scenari, affermazioni e riferimenti. Il modello concettuale comprende una base immutabile, una revisione della guida, contenuti con ID stabili, evidenze utilizzate e dipendenze. Non basta aggiungere un campo testuale molto lungo all'output attuale.

Il manifest di dipendenze include progetto/lista/risoluzione, testi ed errata, regole, snapshot e risultati delle query, schema/prompt e configurazione AI. Un cambio di lista crea una nuova base collegata. Capitoli immutati possono essere riusati soltanto dopo la verifica delle dipendenze; se non è possibile escludere un impatto si rivalutano. Cambiare una linea impone di ricontrollare anche scenari e riepilogo che dipendono da essa. Un cambiamento di frequenze può invalidare la scelta delle varianti anche se i testi delle carte restano uguali.

Le guide esistenti restano leggibili nel vecchio formato e non vengono riscritte automaticamente. I job in corso continuano con il proprio contratto. Pausa, riapertura, applicazione unica e risultato storico se la lista cambia durante il job devono continuare a funzionare.

L'utente può discutere un capitolo o uno scenario. La revisione rilegge quella parte, le sue dipendenze, il contesto aggiornato e le osservazioni pertinenti; non si affida soltanto a un breve riassunto dell'intera guida. Salva una nuova revisione coerente, con spiegazione di cosa è cambiato. La lettura dei capitoli già generati non avvia chiamate AI.

Nell'interfaccia: titolo con lista/versione e avversario, riepilogo, indice dei capitoli, prosa con carte cliccabili, tabelle delle linee e soluzione degli esercizi apribile. Una prima versione può rappresentare gli scenari con tabelle testuali di Attivo/Panchina/Energie/danni/Premi. Il tavolo grafico è un incremento successivo derivato dagli stessi dati; video e simulatore completo non servono alla prima prova.

## Primo incremento proposto e verifica prima dell'estensione

L'ordine consigliato è:

1. **Pilota editoriale isolato:** definire schema minimo, pacchetti congelati e tre guide campione. Provare il nuovo processo fuori dal profilo personale, con report leggibili e conteggio completo dei tentativi. Nessuna migrazione del prodotto per valutare il primo risultato.
2. **Integrazione delle guide testuali approfondite:** dopo il riscontro sul pilota, introdurre persistenza versionata, pipeline mirata, indice/capitoli, discussione e compatibilità legacy. Riutilizzare contabilità/cache già integrate, verificando lo stato reale del checkout di consegna.
3. **Tavoli illustrati:** usare gli scenari strutturati già valutati per aggiungere la rappresentazione visiva e gli esercizi interattivi. Non chiedere all'AI di inventare separatamente immagini e testo.

Corpus iniziale proposto: Toucannon contro Dragapult, Toucannon contro Festival Lead e una lista Dragapult Blaziken della guida contro Hydrapple. Per il terzo caso vanno prima trascritte e risolte tutte le 60 carte della versione scelta; non si mescolano aggiornamenti mensili diversi. Per i primi due si usano le basi e le evidenze dei campioni APP-187, senza chiamarle automaticamente lista attuale dell'utente.

Il primo budget proposto è di 24 tentativi per tre guide (otto ciascuna), non ancora autorizzato all'esecuzione. Un eventuale confronto con nuove generazioni del formato precedente o una prova live di revisione richiedono di dichiarare prima il budget aggiuntivo. Le vecchie guide disponibili sono un riferimento qualitativo; i loro tempi non costituiscono automaticamente una baseline comparabile.

Per ogni caso registrare carte/fonti usate, ipotesi, decisioni sviluppate, linee e risposte avversarie, rilievi critici, chiamate, token quando disponibili e tempo alla guida utilizzabile. L'accettazione del pilota richiede:

- Nessuna carta assente usata come disponibile, nessun consumo impossibile o errore critico di regole/Premi nei casi controllati.
- Copertura esplicita di preparazione, fasi, risorse e almeno una decisione con alternative e una sequenza completa con risposta avversaria per ciascun caso; profondità ulteriore secondo la complessità.
- Motivazioni specifiche della nostra lista e assunzioni visibili, senza presentare gli scenari sintetici come partite giocate.
- Miglioramento osservabile, valutato da un giocatore competente, nella capacità di scegliere fra alternative rispetto al formato precedente. Una preferenza per testi più lunghi non basta.
- Consumo e tempi compatibili con il percorso scelto, da valutare su misure reali. Nessuna equivalenza fra pochi tentativi, pochi token e bassa latenza viene presunta.

Prima dell'integrazione servono inoltre prove di salvataggio atomico, isolamento, riavvio/pausa, guide legacy, invalidazione e modifica della lista durante la generazione. Una prova utile di personalizzazione riduce una risorsa della lista o rimuove una carta chiave: la linea che dipendeva da essa deve essere aggiornata o dichiarata non disponibile, senza alterare lo storico. Per la revisione si verifica che una correzione a una decisione raggiunga anche il relativo scenario e riepilogo.

Questa consegna definisce la proposta e il protocollo. Il pilota, lo sviluppo e i controlli sopra descritti non sono stati eseguiti.

## Riscontri e collegamenti

- [GUIDE-COMPARISON.md](GUIDE-COMPARISON.md): gap osservati, immagini e due output reali.
- [AI-LIVE-JOB-AUDIT.md](AI-LIVE-JOB-AUDIT.md): costo della lettura integrale e proposta APP-185/186.
- [PRODUCT.md](PRODUCT.md), R-07/R-10/R-13, e [AI_EVIDENCE.md](AI_EVIDENCE.md): contratto attuale da preservare o modificare esplicitamente.
- [DECISIONS.md](DECISIONS.md), T-135/T-143/T-186: fasi, prosa naturale e proposta di recupero mirato.
- [codex-matchup.ts](../src/main/codex-matchup.ts): prompt, contratto breve e attuale sintesi dello storico.
- [matchup-analysis.ts](../src/main/matchup-analysis.ts), [meta-matchups.ts](../src/shared/meta-matchups.ts): schema attuale a campi testuali.
- [ai-analysis-work.ts](../src/main/ai-analysis-work.ts): percorso attuale dei lotti e delle sintesi, distinto dalla pipeline qui proposta.

Verifica documentale eseguita: dieci riferimenti locali presenti, coerenza del budget ricontrollata (5 nominali, 8 massimi sperimentali, 24 per tre guide), perimetro del singolo matchup e distinzione fra capacità attuali, proposta e risultati futuri riscontrati. Le verifiche software e qualitative previste per il pilota restano da eseguire.
