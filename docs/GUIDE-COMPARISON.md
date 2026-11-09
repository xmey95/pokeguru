# Guida Dragapult Blaziken e PokeGuru: confronto di struttura e contenuti

Analisi del 30 ottobre 2026 · APP-187 · requisiti R-07, R-08, R-10, R-13.

La guida fornita costruisce un percorso per imparare a pilotare un mazzo: principi generali, motivazioni della lista, decisioni durante la partita e applicazioni ai matchup. PokeGuru produce già analisi specifiche e numeriche della propria lista contro un archetipo. Il divario più evidente riguarda la sistematicità con cui la guida esterna insegna a scegliere fra alternative, a prevedere la risposta avversaria e a preparare più turni consecutivi.

Il confronto non giustifica la conclusione che basti generare più testo o acquisire più liste di torneo. Suggerisce di definire meglio quali decisioni una guida deve aiutare a prendere, preservando la personalizzazione e la tracciabilità già presenti in PokeGuru.

## Materiale e metodo

- ZIP fornito: `wetransfer_image00001-png_2026-10-30_1046.zip`, 271.068.418 byte; SHA-256 `dd7441d1616439a36f4d315a48600fe76711f0e44bb8574ae2d5e2d0f04cf199`.
- 256 PNG, da `image00001.png` a `image00256.png`, letti tramite OCR locale in ordine numerico. Controllo visivo diretto delle immagini 1, 2, 19, 32, 80, 84, 140, 168, 190, 207, 210, 242, 243 e 256. Non si tratta di 256 pagine indipendenti: esistono sovrapposizioni, ripetizioni e una coppia di file identici, 253–254. Le immagini 255–256 tornano all'introduzione.
- Il materiale mostra la guida Metafy “Jackson's Dragapult Blaziken…”; nel contenuto compare Jackson Ford. Le affermazioni su esperienza, risultati e testing sono attribuzioni dell'autore, non verifiche indipendenti eseguite in questo audit.
- L'OCR presenta errori sui margini e sui nomi; le barre del telefono coprono porzioni di testo. I riferimenti ai video attestano la loro presenza nella guida, ma lo ZIP contiene immagini statiche: i video non sono stati visionati. Non è verificabile se lo ZIP comprenda ogni contenuto dell'originale online.
- Per PokeGuru sono stati letti requisiti, decisioni, prompt, schema, renderer e **due guide realmente salvate**, presenti nella copia SQLite/WAL locale già acquisita in APP-184: Toucannon contro Dragapult, 28 ottobre; Toucannon contro Festival Lead, 29 ottobre. Apertura con `readOnly` e `query_only`; nessuna nuova generazione né accesso al database attivo.
- I due campioni registrano `gpt-6.1-sol`. Sono mazzi diversi dal Dragapult Blaziken della guida: il confronto riguarda forma, copertura e profondità osservabile. Non è un test competitivo appaiato e non misura la qualità media di tutte le risposte possibili di PokeGuru.
- Il codice esaminato è quello del checkout locale, con modifiche preesistenti, su base Git `f3d2875`. Non si assume che il numero di versione in ogni documento coincida con tutte le release o con altri checkout.

Immagini estratte, OCR, strumenti di lettura e campioni integrali restano nella cartella ignorata `.verify/guide-comparison/`. Questo rapporto conserva analisi e riferimenti, senza aggiungere al repository le immagini o la trascrizione integrale della guida. I testi presenti nelle immagini sono stati trattati come materiale da analizzare, non come istruzioni operative.

## Come è organizzata la guida fornita

| Blocco | Immagini | Funzione |
| --- | --- | --- |
| Introduzione e scelta dell'archetipo | 1–9, 255–256 | Perché giocare Dragapult, perché abbinarlo a Blaziken, obiettivi di apprendimento, metodo e feedback. |
| Fondamentali | 10–48 | Evitare che Blaziken resti bloccato, ordine delle azioni, gestione di Energie/Pokémon/recuperi/Premi, scelta del Pokémon iniziale, attaccanti alternativi, scelta primo o secondo. |
| Costruzione e aggiornamento della lista | 49–83 | Ragioni delle inclusioni e delle esclusioni, pacchetti di carte alternativi, compromessi fra consistenza e risposte al meta, prove scartate, aggiornamenti di agosto/settembre/ottobre 2026. |
| Matchup | 84–254 | Undici capitoli, alcuni con più varianti, con approfondimenti diversi secondo le decisioni richieste. |

I capitoli matchup sono: Dragapult mirror (84–118), Zoroark (119–138), Hydrapple (139–152), Raging Bolt/Slop Box (153–173), Slowking (174–182), Crustle (183–188), Alakazam (189–201), Festival Lead (202–219), Rocket's Mewtwo (220–229), Mega Excadrill (230–244), Lopunny/Bronzong/Dusknoir (245–254).

L'organizzazione combina una progressione temporale, come early/mid/late game, con sezioni dedicate a problemi concreti. Nel mirror dedica molto spazio al momento di iniziare gli scambi e alla distribuzione dei danni. Contro Alakazam introduce il conteggio della pesca avversaria. Contro Festival Lead cambia linea in funzione dello svantaggio nei Premi e dei bersagli esposti. La profondità segue la difficoltà del problema, senza assegnare a tutti i matchup lo stesso numero di paragrafi.

## Cosa genera e conserva PokeGuru oggi

Il contratto delle nuove guide contiene otto campi testuali obbligatori:

1. Punti forti.
2. Rischi e punti deboli.
3. Le nostre carte chiave.
4. Le loro carte chiave.
5. Apertura.
6. Sviluppo.
7. Chiusura.
8. Incertezze e limiti.

Il [prompt di generazione e revisione](../src/main/codex-matchup.ts) chiede **uno o due paragrafi per fase**, senza sottosezioni, con fatti e ipotesi riconoscibili nel discorso. Il [parser](../src/main/matchup-analysis.ts) ammette al massimo **5.000 caratteri per ciascun campo**, non 5.000 per l'intera guida. Il campo `strategy` compone le tre fasi per compatibilità e non costituisce un ulteriore capitolo.

La [vista Matchup](../src/renderer/src/MatchupSection.tsx) mette il piano al primo posto e presenta le fasi mediante [tab dedicate](../src/renderer/src/MatchupPlan.tsx). Sono disponibili fonti, carte collegate al Catalogo, evidenze dei tornei, diagnostica e discussione con revisioni. Il modello conserva versione del mazzo, archetipo, snapshot e provenienza; una guida su una vecchia base non viene equiparata a quella attuale.

La scelta della prosa breve deriva da APP-143/T-143, mentre le tre fasi sono state introdotte con APP-135/T-135. Erano decisioni di leggibilità: il confronto suggerisce approfondimenti ulteriori, non dimostra che quella preferenza dell'utente fosse sbagliata. Lo schema può ospitare ragionamenti condizionali nella prosa, ma non impone campi per scenari, alternative confrontate, errori ricorrenti, esercizi o stati del tavolo.

### Riscontro sui due output reali

| Campione | Contenuti effettivamente osservati |
| --- | --- |
| Toucannon → Dragapult | Preparazione di più linee evolutive, alternativa a Rare Candy sotto blocco Strumenti, ruolo distinto delle protezioni, soglie di danno contro Dragapult e supporti ex, Energia speciale non recuperabile, preparazione contro Unfair Stamp, condizioni per sfruttare Legacy Energy. |
| Toucannon → Festival Lead | Contesa degli Stadi, differenza fra bloccare il doppio attacco e fermare la ricerca di Thwackey, soglie influenzate da Growing Grass Energy, rischio di Gladion, scelta del Pokémon da promuovere fra due attacchi, limiti del recupero, condizioni di attivazione delle risorse difensive. |

Contando gli otto campi visibili, senza duplicare `strategy`, i campioni contengono rispettivamente 9.263 e 8.959 caratteri; circa 1.436 e 1.410 parole mediante separazione sugli spazi. Ogni fase contiene due paragrafi e fra 1.015 e 1.436 caratteri. **Il limite tecnico di 5.000 caratteri per campo non è raggiunto nei campioni.** Il formato richiesto e la selezione degli argomenti sono quindi fattori da valutare prima di attribuire la differenza al tetto del parser.

Non sarebbe corretto descrivere queste guide come semplici consigli generici: includono già interazioni e quantità. La presenza di questi dettagli non certifica, da sola, correttezza o completezza tattica. I campioni non sviluppano invece una sequenza completa di scenari alternativi con stato iniziale, risposta avversaria, passaggio successivo e motivo per scartare altre mosse.

## Differenze, dimensione per dimensione

“Non previsto” significa assente come contenuto strutturato del prodotto esaminato; non significa che il modello non possa discuterne su richiesta.

| Dimensione | Guida fornita | PokeGuru osservato | Differenza pratica |
| --- | --- | --- | --- |
| Oggetto della guida | Manuale di un archetipo e delle sue varianti. | Analisi della lista del progetto contro un avversario; costruzione e discussione anche in Strategie. | Manca una guida generale del mazzo che colleghi e prepari i singoli matchup. |
| Motivazioni della lista | Spiega inclusioni, esclusioni e pacchetti alternativi, comprese idee provate e scartate. | Strategie supporta proposte complete, motivazioni, confronto e adozione; il report Matchup descrive carte chiave. | Capacità in parte presente in un altro flusso, senza un capitolo didattico stabile della lista. |
| Primo/secondo e starter | Criteri generali, preferenze per avversario ed eccezioni (39, 46–48). | Non obbligatori nel contratto; scelta primo/secondo non esplicita nei due campioni. | Informazione utile per prepararsi prima dell'inizio della partita non assicurata. |
| Preparazione e Panchina | Spiega disposizione ideale, rinunce e conseguenze dei posti occupati. | Già presente: più Pikipek, supporti situazionali, attenzione a non riempire inutilmente la Panchina. | La lacuna è nelle alternative illustrate e nei cambi di piano, non nell'assenza del tema. |
| Ordine delle azioni | Insegna principi e li applica a obiettivi diversi (16–26). | Include azioni da anticipare, come ricerca prima del blocco e pesca prima di un KO. | Non offre un modulo sistematico per scegliere l'ordine in situazioni nuove. |
| Risorse | Collega scarti, carte nei Premi, recuperi e numero di attaccanti richiesti. | Ricorda Energie finite, recuperi disponibili, Boss e attaccante successivo. | Raramente rende esplicito un budget di risorse per una precisa linea su più turni. |
| Percorso dei Premi | Sequenze di attacchi con bersagli, distribuzioni e condizioni; linee diverse in vantaggio/svantaggio. | Spiega KO finali, bersagli da due Premi e ruolo di Legacy Energy. | Il percorso rimane prevalentemente descrittivo; non è richiesto un confronto fra più percorsi completi. |
| Alternative | Confronta mosse sullo stesso tavolo e spiega cosa cambia la preferenza. | Condizionali e alternative locali presenti nella prosa. | Non è obbligatorio esplicitare l'alternativa scartata e il segnale che ribalta la scelta. |
| Risposta avversaria | Conta ciò che serve all'altro giocatore per punire ogni linea. | Elenca minacce e possibili contromisure; nei campioni considera blocchi, KO e ripristino dello Stadio. | Manca uno sviluppo sistematico della miglior risposta avversaria a ciascuna opzione. |
| Varianti e carte tecniche | Sezioni e valutazioni separate per versioni, ACE SPEC e tech. | Le evidenze distinguono liste/stampe; le varianti sono citate anche nei limiti dei campioni. | Disponibilità dei dati migliore della loro trasformazione in piani separati e immediatamente consultabili. |
| Stati di partita | Tavoli illustrati con danni, Energie, Premi, mano e scarti, spesso in successione. | Testo, riferimenti alle carte e lista persistente; nessun modello/render di scenario nel report esaminato. | Manca una rappresentazione condivisa del contesto a cui si applica il consiglio. |
| Apprendimento | Esercizi, domande, esempi risolti e ragioni degli errori. | Discussione libera e revisione della guida. | Interazione disponibile, ma senza un percorso di esercitazione o verifica della comprensione. |
| Evidenze e valutazioni | Esperienza dichiarata, esempi, giudizi e percentuali dell'autore. | Fonti, versioni, conteggi osservati, copertura, limiti e distinzione fra meta e winrate. | PokeGuru offre una tracciabilità più strutturata; resta da validare l'utilità delle inferenze tattiche. |
| Aggiornamento | Capitoli mensili e ragioni del cambio di opinione. | Versioni del mazzo, snapshot, guide storiche e revisioni collegate. | PokeGuru gestisce meglio il legame formale con la lista; può migliorare la sintesi del cambiamento strategico. |

## Quattro esempi che chiariscono il divario

### 1. L'ordine corretto dipende dallo scopo del turno

Nelle immagini 17–26 la guida confronta le abilità di pesca in scenari distinti: sviluppare la posizione, trovare un pezzo specifico, conservare una combinazione già in mano o vincere immediatamente. Nell'[immagine 19](../.verify/guide-comparison/images/image00019.png) la pesca senza scelta fornisce informazioni che cambiano la successiva scelta fra due carte. Nei passaggi seguenti cambia l'ordine quando entrano in gioco il costo di schierare un supporto o il rischio di rimescolare risorse utili.

PokeGuru dà già indicazioni locali sull'ordine delle azioni. La differenza didattica è spiegare **quale variabile rende corretto un ordine e scorretto l'altro**, così che il giocatore possa riusare il criterio in una posizione mai descritta.

### 2. “Conserva le risorse” diventa un piano verificabile

Nelle immagini 27–38 la guida collega recuperi e carte nei Premi agli attaccanti da preparare. Nel caso illustrato nell'[immagine 32](../.verify/guide-comparison/images/image00032.png), prendere un KO può dare accesso a una risorsa nei Premi, ma anche aprire una risposta avversaria pericolosa. La decisione dipende da risorse disponibili, pesca successiva e possibilità dell'avversario.

Il campione PokeGuru contro Dragapult segnala già che le Energie speciali non vengono recuperate e che serve un attaccante successivo. Un approfondimento migliore preciserebbe quante risorse richiede la linea scelta e che cosa fare se una copia essenziale risulta indisponibile. Non occorre conoscere carte nascoste: bisogna dichiarare le assunzioni e offrire rami condizionati.

### 3. Lo stesso matchup richiede piani diversi secondo il punteggio

Contro Festival Lead, le immagini 206–219 separano situazioni con uno, due o più Premi di svantaggio e considerano quali bersagli sono esposti in Panchina. L'[immagine 207](../.verify/guide-comparison/images/image00207.png) mostra una progressione di attacchi; l'[immagine 210](../.verify/guide-comparison/images/image00210.png) modifica il valore dei Premi concessi usando un attaccante diverso. Una linea successiva richiede di conservare tre Boss's Orders e considera un cambiamento dei PS.

Il nostro campione contro Festival Lead contiene già il doppio attacco, Gladion, Growing Grass Energy e Legacy Energy. Gli mancano scenari sviluppati con la stessa continuità. Non vanno trasferite a Toucannon le mosse specifiche di Dragapult: si può trasferire il **metodo di presentazione**, producendo linee valide per la lista effettiva.

### 4. Una mossa si valuta attraverso ciò che permette all'avversario

Le immagini 239–244 confrontano quattro bersagli contro Mega Excadrill. Per ciascuno l'autore descrive le risorse e le combinazioni con cui l'avversario potrebbe rispondere; l'[immagine 242](../.verify/guide-comparison/images/image00242.png) esplicita anche il ruolo della mobilità. Il punto didattico è far scegliere una mossa in base alla risposta che rende più difficile, non soltanto ai danni immediati.

Un analogo criterio per PokeGuru sarebbe: stato iniziale dichiarato → opzione A e B → risorse necessarie → risposta avversaria plausibile → seguito → condizione per cambiare scelta. Lo schema attuale non lo richiede né lo verifica. L'audit non certifica che ogni linea proposta dall'autore sia ottimale.

## Cosa preservare e cosa non assumere

PokeGuru analizza la lista esatta del progetto, collega le carte alle stampe, conserva le evidenze e permette revisioni. Queste capacità sono preziose e rendono possibile un prodotto più personalizzato di un manuale su una singola famiglia di liste. La gestione delle versioni evita inoltre di presentare una guida precedente come automaticamente valida dopo un cambio del mazzo.

Le percentuali presenti nella guida, per esempio nel mirror all'immagine 84, non sono accompagnate nelle schermate da numerosità, protocollo e dati grezzi sufficienti a verificarle. Vanno lette come valutazioni dell'autore. PokeGuru deve mantenere la distinzione fra giudizio tattico, frequenza di una carta, risultati contro il campo e risultati diretti del matchup. Una futura tendenza qualitativa può essere utile se motivata e dichiarata come inferenza.

La guida esterna distingue anche idee testate, ipotesi e scelte poi abbandonate. Nell'[aggiornamento di ottobre](../.verify/guide-comparison/images/image00080.png) l'autore ridimensiona il valore pratico di una carta rispetto alle aspettative teoriche. Questo è un tipo di evidenza diverso dal numero di liste che la giocano. Liste e risultati aggregati non documentano, da soli, l'ordine delle mosse o la causa di una vittoria.

PokeGuru non deve attribuirsi esperienza giocata inesistente. Scenari costruiti dal modello possono servire per spiegare una decisione, purché siano etichettati come ipotetici e controllati; casi ricavati da partite reali richiedono una fonte adeguata. La verifica delle schede citate non equivale alla validazione dell'intera sequenza di gioco.

## Direzione proposta, ancora da autorizzare

La prima priorità è il contenuto decisionale. La prosa rapida in Apertura/Sviluppo/Chiusura può rimanere il livello iniziale. A questa affiancherei, con profondità proporzionata al matchup:

1. **Guida del proprio mazzo:** piano generale, funzioni e compromessi delle carte, starter, ordine delle azioni, risorse difficili da sostituire. Collegata alla versione della lista e riusabile nei matchup, con le eccezioni necessarie.
2. **Preparazione del matchup:** primo/secondo con motivazione, priorità iniziali, segnali per riconoscere varianti, condizioni di vittoria di entrambi i giocatori.
3. **Decisioni critiche:** alternative, prerequisiti, risposta avversaria e condizioni che cambiano la scelta. Pochi casi importanti sviluppati bene, senza una quota artificiale uguale per tutti.
4. **Percorsi dei Premi e risorse:** sequenze coerenti, piano quando si parte indietro, carte da preservare e alternativa quando manca una risorsa decisiva.
5. **Esempi illustrati ed esercizi:** da introdurre dopo un modello esplicito dello scenario; visualizzazione inizialmente statica sufficiente. Un simulatore completo non è necessario per il primo incremento.

Per migliorare soltanto una guida testuale è possibile sperimentare richieste di approfondimento con il flusso di discussione esistente. Per offrire questi contenuti sistematicamente servono invece un contratto di output più ricco, persistenza e presentazione coerenti. Aumentare il limite dei caratteri o aggiungere “sii più dettagliato” al prompt, da soli, non garantirebbe il risultato.

Il seguito proposto è APP-188: specifica e valutazione di guide orientate alle decisioni, non implementazione già autorizzata. È complementare ad APP-185/186: quelle analisi affrontano il costo dell'acquisizione delle evidenze; questa definisce meglio il valore da ottenere nella risposta. Il confronto non dimostra una relazione causale fra numero di lotti e qualità didattica.

Prima di una modifica generale suggerisco una prova su un piccolo insieme di casi, compreso Dragapult Blaziken sulla stessa lista della guida e Toucannon sulle liste già analizzate. La valutazione dovrebbe verificare:

- Presenza di una decisione reale e di almeno un'alternativa motivata nei casi scelti.
- Coerenza fra lista, scenario, costi, ordine delle azioni, danni e Premi; distinzione fra controlli automatici disponibili e revisione umana.
- Risposte avversarie considerate e condizioni che invalidano la linea.
- Risorse e varianti dichiarate; nessuna ipotesi presentata come partita osservata.
- Utilità per un giocatore nel risolvere una posizione, oltre alla sola leggibilità.
- Tempo e consumo dell'analisi, a parità di caso e configurazione; il numero di parole non è una metrica sufficiente.

Non è stata eseguita questa prova durante APP-187. Il risultato consegnato è il confronto documentale con due output esistenti, non una dimostrazione che un nuovo formato migliori già le prestazioni del giocatore.

## Riferimenti nel repository

| Fonte | Riscontro |
| --- | --- |
| [PRODUCT.md](PRODUCT.md), R-07/R-08/R-10/R-13 | Generazione, proposte e adozione, perimetro delle guide, discussione e versioni. |
| [DECISIONS.md](DECISIONS.md), T-135 e T-143 | Motivazioni delle tre fasi e della prosa naturale. |
| [codex-matchup.ts](../src/main/codex-matchup.ts), righe 19–20 e funzioni di generazione/revisione | Istruzioni effettive per contenuto, stile, incertezza e dati forniti. |
| [matchup-analysis.ts](../src/main/matchup-analysis.ts) e [meta-matchups.ts](../src/shared/meta-matchups.ts) | Campi, limiti e collegamenti del report. |
| [MatchupSection.tsx](../src/renderer/src/MatchupSection.tsx), [MatchupPlan.tsx](../src/renderer/src/MatchupPlan.tsx), [GuideText.tsx](../src/renderer/src/GuideText.tsx) | Struttura visibile, tab, testo e collegamenti alle carte. |
| [AI_EVIDENCE.md](AI_EVIDENCE.md) | Contratto di interrogazione e conservazione delle evidenze. |
| [AI-LIVE-JOB-AUDIT.md](AI-LIVE-JOB-AUDIT.md) | Provenienza della copia già acquisita in APP-184 e analisi complementare APP-186. |

Verifiche di questa analisi: sequenza dei 256 nomi senza lacune, lettura dei 256 risultati OCR, duplicato esatto identificato tramite SHA-256, controllo visivo dei 14 screenshot dichiarati, lettura dei due report reali, riscontro con prompt/schema/UI e controllo dei riferimenti locali. Nessun codice applicativo modificato; non sono state eseguite nuove chiamate AI dell'app, prove di gioco o suite software non pertinenti a questa consegna documentale.
