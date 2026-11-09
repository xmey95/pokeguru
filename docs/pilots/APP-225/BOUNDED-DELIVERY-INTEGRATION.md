# APP-234 — Integrazione del percorso di consegna limitato

6 novembre 2026. Integrazione e verifiche esclusivamente offline autorizzate dall’utente. **Adapter e gate tecnici offline completati; rete disabilitata per mancata ammissione della campagna al budget corretto.** APP-234 Done per questo incremento; APP-232 e APP-225 restano Blocked, obiettivo generale aperto. Nessuna campagna riaperta.

## Contratto adottato

Il backend seleziona `bounded-delivery-1` per le nuove guide, con lista esatta, singolo matchup, otto capitoli, due casi, due repliche selezionate per caso e due esercizi. Le revisioni conservano il contratto della guida precedente. I profili da tre o quattro repliche restano nella specifica: non sono opzioni abilitate implicitamente nell’app.

Ogni caso costruisce il setup raggiungibile, la prima nostra mossa e la sua critica prima di scegliere le repliche. Costruisce soltanto le risposte selezionate e i relativi seguiti. La linea principale finale riprende un registro completo già verificato; non viene inventato un seguito. I reader fisici, le prove delle alternative, le fonti dei Premi, i controlli quantitativi e le critiche complete rimangono obbligatori. Un caso con tutte le risposte terminali prima del terzo turno si arresta esplicitamente: il contratto nativo principale corrente richiede ancora tre turni.

Un turno nativo è una richiesta completa, senza una chiamata per evento. Sono ammessi al massimo sei eventi complessivi, dodici movimenti e otto percorsi Energia per evento; due round di setup più l’eventuale turno avversario iniziale. Le motivazioni sono al massimo diciassette per turno, seicento caratteri e otto span ciascuna. Le dimensioni non sanano mosse illegali: un originale troppo grande viene respinto senza troncamenti.

Gli audit vengono scritti **dopo** il turno, sui candidati prodotti dal codice. La richiesta dichiarativa può omettere temporaneamente gli audit; nessun checkpoint viene approvato prima che il finalizzatore li abbia costruiti, riesaminati e sottoposti al reader originale completo. Il riesame quantitativo divide soltanto target interi, in non più di quattro gruppi. Tutti i gruppi devono avere originali indipendenti autenticati, stessa fonte/contesto e copertura esatta. Qualsiasi negativo mantiene negativo il risultato aggregato. Un errore autentico di output può raffinare una partizione; non basta un’osservazione del modello. Le partizioni pagate e il loro ordine sono persistenti.

## Limite e contabilità

Il manifesto immutabile lega job, progetto, packet originale e configurazione. Ogni invocazione registra in una transazione avvio e ricevuta contabile prima di chiamare il runner. Una sola riserva di sedici invocazioni copre riparazioni, ripetizioni e discendenti da riesaminare: nuovi input o riaperture non la rinnovano. Due errori di formato o due giudizi negativi sulla medesima posizione logica impediscono altri tentativi automatici. Un avvio senza esito resta in quarantena. Timeout, rete, autenticazione e quota interrompono senza retry automatico del servizio.

**Correzione rispetto alla specifica APP-233:** il suo grafo ometteva la richiesta separata che scrive gli audit dopo i candidati. Per turno il massimo è ora sei richieste: una dichiarazione nativa, una dichiarazione audit e fino a quattro riesami. Il massimo prudenziale del profilo base è quindi `28 + 2 × (5 + 1 + 2 × 2) × 6 + 16 = 164`, non144. Le due richieste fisse conservative in eccesso rispetto all’assemblaggio attuale restano riservate. La specifica eseguibile è corretta insieme all’adapter; i vecchi risultati restano evidenze storiche, non prove del nuovo conteggio.

Un nuovo job con allowance inferiore a164 si ferma all’ammissione, prima del piano. Il limite non è una quota da consumare. L’app mostra separatamente chiamate, riserva condivisa e quota effettivamente comunicata dal servizio. La pubblicazione richiede attestazione finale atomica, corrispondenza del consumo con gli esiti originali e rilettura del risultato salvato.

I dati reali restano **355 chiamate v28 /431 storiche /0 nuove guide valide**. Nessuna nuova invocazione reale in APP-234. Tetti500 per guida /1500 pool /riserva24 invariati; residui145/500/500,1145 pool. Il residuo145 della prima guida **non ammette il massimo prudenziale164**: il codice deve fermarsi prima di acquistare un nuovo piano. Nessuna redistribuzione o aumento è implicito nell’integrazione.

## Gate di verifica

Le prove comprendono percorso applicativo completo con provider sintetico e reader reali, persistenza e rilettura, riparazioni native e dei testi, ripresa senza ricomprare, errori del servizio, pausa/cancellazione, esaurimento della riserva, cambi di contesto e rifiuto di originali/ricevute mancanti o alterati. Le prove dimensionali mantengono tutto il contesto reale e tutte le fonti; gli originali storici non sono migrati né modificati.

UI Electron: lettura tramite SQLite e IPC effettivi; otto capitoli, due scenari, esercizi espandibili, navigazione e storico legacy. Nessun overflow a1440/1280/640px, nessun errore del renderer. Le risposte sintetiche esercitano il protocollo; **non sono guide AI reali né prove di qualità competitiva**.

La readiness della rete richiede sia i gate tecnici sia l’ammissione della campagna. I gate applicativi, negativi, dimensionali, di isolamento e le soglie invariate60s a freddo /10s a caldo /768MiB sulle copie reali sono verificati; il gate di budget conserva invece la rete disabilitata. Nessuna chiamata reale è avviata da test o misurazioni di questo incremento. Gli held-out sono esclusi.

## Esito finale verificato

**Tutti i gate tecnici offline misurati passano. L’ammissione della campagna reale resta negativa.** Il generatore senza runner di test viene respinto prima di qualsiasi invocazione; nessuna autorizzazione né contabilità è stata rinnovata. L’interfaccia può leggere le guide esistenti; la nuova generazione reale resta deliberatamente disabilitata.

La regressione completa ha eseguito1027 casi:979 passati,5 inizialmente falliti e43 esclusi. I fallimenti comprendevano tre timeout, il listener127.0.0.1 impedito dal sandbox e il test di ammissione caricato durante l’aggiornamento del codice. I cinque casi sono stati riesaminati con successo: tre in isolamento senza aumentare i timeout, uno fuori dal sandbox con solo traffico locale fittizio e quello di ammissione sul codice finale. Dopo la correzione generale della memoria,104 test selezionati passano; la guardia di rete è verificata ancora separatamente. L’unione per file, nome e occorrenza conta **992 casi distinti passati /43 esclusioni esplicite /0 fallimenti residui /182 file**, senza sommare due volte i riesami. Le esclusioni sono prove opt-in di integrazioni/servizi reali e prove storiche già escluse, non nuovi pass. Typecheck e build finali passano; l’adapter è presente nel bundle effettivo `out/main/backend-worker.js`.

Un primo riesame mirato aveva omesso l’esclusione di `.verify` e stava eseguendo anche copie storiche: è stato interrotto, non contato e sostituito da un’esecuzione sui soli due file correnti. La suite completa e tutti i risultati finali conteggiati escludono `.verify`. Gli archivi storici sono stati verificati nuovamente dopo l’interruzione e risultano intatti.

| Prova offline | Freddo | Caldo | Massimo RSS |
| --- | ---: | ---: | ---: |
| Generazione completa con risposte sintetiche, pubblicazione e rilettura |16,173s|0,539s|727MiB|
| Copia reale Crustle, nuovo contratto, arresto prima del provider |0,784s|0,050s|396MiB|
| Copia reale Alakazam/Dudunsparce, stesso arresto |0,543s|0,040s|334MiB|
| Copia reale Dhelmise, stesso arresto |1,222s|0,212s|380MiB|
| Ripresa storica v9, stop dimensionale prima del provider |7,229s|8,090s|713MiB|

La prova completa sintetica impiega36 invocazioni fittizie e zero riparazioni; non misura tempo/costo del modello reale. Le tre copie reali verificano packet completi,335 campioni, calibrazione invariata e ripresa, non generano guide reali. Usano allowance simulata164 soltanto per provare il percorso, senza concederla alla campagna con residuo145.

La prima misura storica aveva superato la memoria con985MiB. Il pianificatore ora si arresta prima di tokenizzare tutte le rappresentazioni d’input quando l’output supera già un limite inderogabile: nessuna codifica dell’input potrebbe sanarlo. Il budget espone il vero stage bloccato,108.000 caratteri contro100.000, e omette input/byte non misurati invece di mostrare zeri come misure. Il controllo non viene saltato; sparisce soltanto un calcolo inutile. Le misure successive soddisfano le soglie invariate.

La partizione sul contesto v9 conserva10 target/57 span in gruppi7+3, con input stimati86.331/69.364 e output90.000/18.000 caratteri. Il profilo massimo17 testi da600 caratteri e136 span entra in gruppi6+6+5, con90.000/90.000/72.000 caratteri previsti. Le risposte sintetiche usate per verificarne i reader restano negative: nessun pass è inventato. Il massimo RSS del dimensionamento è704MiB. Sono inoltre misurate21 rappresentanti, selezionate come descrittori serializzati più grandi per famiglia, scope critico e capitolo fra171 originali delle prove di base e riparazione: tutte entrano mantenendo l’intero contesto di fonti reale. Questo dimensionamento non certifica tutti gli stati tattici futuri.

La UI è verificata nuovamente sulla build finale con Electron locale, SQLite/IPC effettivi e metagame congelato: esercizi, navigazione, conservazione del messaggio in composizione, storico legacy, tre larghezze senza overflow e zero errori del renderer. Gli screenshot includono contenuti esplicitamente sintetici e non costituiscono un’anteprima di guide AI reali approvate.

Il confronto con la baseline v9 conserva516 dei540 file source/test precedenti;24 sono modifiche intenzionali dell’adapter, del budget e della diagnostica. I903 file dell’archivio v9, gli892 del v8 e tutti e tre i database reali conservano gli hash originali. Nessuna chiamata, guida, fonte o raw della campagna è alterata. L’evidenza con contatori, esiti individuali, hash e script di riproduzione è in [verification.json](../../../.verify/app234-integration/verification.json).

## Limiti e ripresa

L’applicazione riusa l’orchestratore finito esistente e i suoi reader delle dipendenze; non esegue direttamente la macchina isolata della specifica. I descrittori reali, i checkpoint e i riesami originali determinano le dipendenze da rivalidare; il manifesto impone i massimi e il credito globale. I gruppi audit non necessari vengono esclusi dalla copertura esatta aggregata, senza promuovere pass parziali. Metadata e confronto sono assemblati nello stesso originale accettato; il conteggio prudenziale mantiene comunque due slot fissi aggiuntivi.

Il profilo applicativo ha due repliche per caso; tre/quattro restano fuori dall’ammissione corrente. Un giudizio negativo sul piano iniziale arresta prima dei setup, senza ricostruzione automatica del piano. Un caso con tutte le risposte terminali prima del terzo turno resta non rappresentabile e si arresta senza inventare azioni. Dimensioni maggiori o un atomo che non entra nel budget sono esiti espliciti di mancata consegna, mai approvazioni. Questi confini sono generali e non dipendono dai nomi dei mazzi del pilota.

Non sono dimostrate la qualità competitiva o la convergenza reale: nessuna nuova guida dei tre matchup è valida. Il residuo145 contro164 impedisce la prova prudenziale sul primo matchup entro il tetto cumulativo500 attuale; pool1500 e riserva24 non sono redistribuiti automaticamente. L’eventuale futura prova richiede ammissione e riapertura esplicite, nuovi job per il nuovo contratto senza trasferire i pass precedenti e conservando la contabilità cumulativa. Nessun riavvio reale fa parte di APP-234.
