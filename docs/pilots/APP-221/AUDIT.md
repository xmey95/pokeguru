# APP-221 — Risorse, pagamenti e alternative prima delle azioni

## Chiusura corrente: la convergenza non è dimostrata

**0/3 guide valide con 76/84 invocazioni cumulative. Nessun job attivo.** Le due continuazioni autorizzate 28/84 hanno aggiunto undici e quattro chiamate alle 61 precedenti. Nessun contenuto AI modificato manualmente o report respinto pubblicato.

| Matchup | Chiamate | Ultimo esito |
| --- | ---: | --- |
| Crustle–N’s Zoroark | 26/28 | Riparazione locale valida; nuova critica completa ancora negativa |
| Alakazam/Dudunsparce–Basic Box | 25/28 | Ricostruzione locale precedente e critica negativa; ultima riparazione in timeout a 725 secondi |
| Dhelmise–Lucario/Hariyama | 25/28 | Operazioni parziali dichiarate incomplete, respinte prima della prosa |

La correzione della riserva funziona dal vivo: il riesame integrale può occupare una richiesta quando il contesto supera il target preferito ma rispetta i limiti rigidi. Le nuove transazioni richiedono modifiche reali e i record cache/critici sono separati per versione/input, senza sostituire i legacy. Questi miglioramenti hanno rimosso difetti del programma; il problema di costruzione e valore tattico resta aperto. Non si attribuisce ogni insuccesso all’AI.

Sul sorgente finale effettivamente usato dal vivo passano **542 test**, 44 prove esterne escluse, typecheck/build, otto audit cumulativi, tre regressioni e la prova SQLite. **254 file** sono rimasti invariati durante l’ultima epoca. Archivi delle ultime epoche: 408 e 464 file. Tre chiamate non hanno usage: i totali osservati sono parziali. Nessuna nuova UI è eleggibile perché non esiste una guida valida di questa campagna.

La prova di generalizzazione è negativa: il pilota precedente aveva raggiunto tre guide valide con 58/59 chiamate, mentre i nuovi sei archetipi non producono tre guide approvate. I controlli generici, le fixture indipendenti e l’assenza di eccezioni per i nomi non dimostrano convergenza generale. Anche il processo di sviluppo è stato guidato ripetutamente dagli errori degli stessi esempi: questo limite va riconosciuto, non nascosto dietro il numero di test.

L’utente esprime la preoccupazione che il ciclo non stia portando al risultato. La risposta operativa è chiudere questa verifica, senza chiedere un altro aumento del tetto, e rivalutare il metodo prima di nuove modifiche o prove. Le chiamate residue 2/3/3 restano inutilizzate: non bastano alle fasi obbligatorie. L’obiettivo delle tre guide valide non è raggiunto.

La proposta APP-223 distingue la verifica a posteriori dalla costruzione: v27 verifica il setup e proietta gli stati, ma chiede ancora all’AI grandi registri completi, repliche e audit ripetuti. La proposta è un costruttore per passi/segmenti verificabili e rami separati, con riuso dei prefissi validi e gli stessi controlli finali. Prima serve una specifica e una prova locale circoscritta; nessun simulatore completo o risparmio di costo è promesso. Per un’eventuale campagna futura, contratto/codice/budget e criterio di arresto vanno fissati prima, con casi estranei alla taratura e nessun aumento a posteriori per ottenere tre esiti positivi. **Proposta non implementata:** nessun sorgente di produzione è stato modificato dopo l’ultima prova reale.

Evidenze finali: [rapporto](../../../.verify/app221-resources-20261102/report-closing.html), [metriche](METRICS-CLOSING.json), [audit](../../../.verify/app221-resources-20261102/final-audit-closing.json), [verifiche effettive](../../../.verify/app221-resources-20261102/verification-epoch6.json), [archivio dell’ultima epoca](../../../.verify/app221-resources-20261102/archive-epoch6/manifest.json). Le sezioni successive conservano i checkpoint precedenti.

## Esito finale corrente: 61 chiamate, nessuna guida valida

**0/3 valide, 61/72 invocazioni, nessun job in corso.** Il limite effettivo rimane 24 per guida; nessuna redistribuzione o estensione implicita.

| Matchup | Chiamate | Residue / minimo necessario |
| --- | ---: | ---: |
| Crustle–N’s Zoroark | 21/24 | 3 / 5 |
| Alakazam/Dudunsparce–Basic Box | 20/24 | 4 / 5 |
| Dhelmise–Lucario/Hariyama | 20/24 | 4 / 5 |

La richiesta ridotta di Alakazam è stata realmente elaborata: stima prudente 126.818, massimo input della singola richiesta misurato 103.155, limite invariato 128.000. L’usage aggregato del turno Codex è 205.885 input: non va confuso con il massimo di una richiesta. La risposta include Dawn fra le alternative utilizzabili dopo aver giocato Hilda; Dawn è in mano ma il Supporter del turno è già consumato. Il controllo respinge questa risposta, senza modificare la lista o i contenuti. Nessuna prosa o report viene pubblicato.

Dopo la terminalità è completato un controllo generale per le riparazioni cache respinte: recupera anche i riesami negativi successivi quando scenari e fatti del turno, claim, dipendenze delle fonti e configurazione coincidono. Le review restano identiche e non sostituiscono il nuovo critico obbligatorio. Il replay di Crustle mantiene esattamente l’ultimo riesame, prima perso tornando alla vecchia riparazione vuota. **Questo ultimo affinamento ha prova soltanto offline: zero nuove chiamate AI sul sorgente finale.**

Passano **530 test**, 44 prove esterne escluse, sette audit cumulativi più tre regressioni, quattro test mirati, replay dei tre job su copie, typecheck e build. 244 file finali sigillati; tutti gli originali delle 61 chiamate e gli archivi precedenti sono preservati. La prima suite sul sorgente intermedio aveva tre timeout locali; la suite finale completa passa con timeout locale di quindici secondi e asserzioni invariate. Timeout e limiti AI non cambiano. Nessuna nuova UI è eleggibile, perché non esiste una guida valida di questa campagna.

Le correzioni non contengono eccezioni per carte o matchup e le fixture indipendenti sostengono il riuso strutturale. Il risultato **non dimostra convergenza generale né qualità competitiva universale**, e non raggiunge l’obiettivo delle tre guide valide. Le tre guide storiche del pilota rimangono integre ma non validano il contratto v27 sui nuovi archetipi.

Il minimo attuale è quindici nuove invocazioni, totale almeno 76; ne restano undici entro 72, con tetti individuali insufficienti. Proposta con margine **28 per guida / 84 complessive**, fino a 23 nuove invocazioni sugli stessi job, fermandosi appena validi, tutti i controlli/scaling e nessuna modifica manuale. **Non autorizzata e senza garanzia di approvazione.** Il replay con tetto solo sintetico raggiunge le riparazioni pendenti di tutti e tre, mantiene i rilievi recenti e si ferma prima della rete; al tetto reale 24 non invoca il runner.

Evidenze correnti: [rapporto](../../../.verify/app221-resources-20261102/report-history-final.html), [metriche](METRICS-HISTORY-FINAL.json), [audit finale](../../../.verify/app221-resources-20261102/final-audit-history-final.json), [replay senza rete](../../../.verify/app221-resources-20261102/next-budget-epoch4-replay.json), [verifiche](../../../.verify/app221-resources-20261102/verification-history-final.json), [sigillo](../../../.verify/app221-resources-20261102/seal-history-final.json). Le sezioni successive conservano i checkpoint precedenti.

## Checkpoint corrente: autorizzazione 24/72 e riduzione senza perdita dello schema

L’utente ha autorizzato **24 chiamate per guida e 72 complessive**, sugli stessi job e dati. La terza epoca termina con **0/3 valide e 60 invocazioni cumulative: 21 Crustle, 19 Alakazam, 20 Dhelmise**, dodici nuove. Nessuna prosa o pubblicazione. I sette audit cumulativi e le tre regressioni passano sul sorgente congelato di 237 file; tutti gli originali precedenti rimangono intatti. Archivio di questa epoca: [231 file](../../../.verify/app221-resources-20261102/archive-epoch3/manifest.json). Le sezioni seguenti descrivono checkpoint precedenti, inclusi tetti allora vigenti.

Crustle riceve due transazioni senza operazioni, dichiarate esplicitamente incomplete ma ammesse dal lettore locale: i critici le respingono. Dhelmise mantiene un KO immediato migliore e una difesa dominata. Alakazam incontra errori di audit e un output-limit, poi il retry viene fermato **prima della rete**: 135.525 token stimati oltre il limite prudente di 128.000. Due invocazioni della campagna non hanno usage disponibile (timeout/output-limit): i consumi osservati sono parziali, non un totale completo.

Dopo la terminalità, una guardia generale respinge le dichiarazioni esplicite di riparazione incompleta prima dei critici, anche nei due percorsi di lettura cache. L’originale non viene sovrascritto: eventuali sostituti usano chiavi derivate dal valore respinto e dalla versione del controllo. Il replay della transazione reale dimostra il rifiuto; al limite effettivo 24 il runner non parte. La prova supplementare su una copia con un tetto esclusivamente sintetico verifica l’invalidazione della cache e si ferma in uno stub prima della rete; **nessuna autorizzazione della campagna viene alterata**.

La riduzione dei token abbrevia soltanto nomi e riferimenti interni delle definizioni dello schema v27. Gli schemi espansi risultano identici, inclusi campi obbligatori, enum e limiti; valori letterali e riferimenti esterni restano invariati. Tutti i dati della richiesta fermata sono identici, senza riassunti o omissioni. La nuova stima è **126.818 token**, con gli stessi limiti, calibrazione prudente e riserva di quattro chiamate successive. Il replay completo su copia di Alakazam raggiunge soltanto la ricostruzione pendente entro le cinque chiamate già autorizzate. Dhelmise resta correttamente bloccata: quattro residue contro cinque necessarie. Crustle ne ha tre. Nessuna redistribuzione implicita.

Preflight passato e 240 file sigillati prima della continuazione prevista per il solo Alakazam. Cinque regressioni finali e sei test mirati sulla guardia/cache passati; typecheck e build passati. Verificati complessivamente 527 test: la suite ha 524 passati e tre timeout locali di cinque secondi; il file del generatore, inclusi questi tre casi, passa poi tutti i 119 test con timeout locale di quindici secondi e asserzioni invariate. Non si dichiara passata la prima esecuzione. 44 prove esterne escluse. La continuazione reale del solo Alakazam è ora in corso, handle 31575, con al massimo cinque invocazioni ulteriori già autorizzate; sorgenti congelati, nessuna nuova UI eleggibile. Evidenze: [audit sorgenti e originali](../../../.verify/app221-resources-20261102/repair-schema-audit.json), [replay token](../../../.verify/app221-resources-20261102/short-schema-replay.json), [schema espanso](../../../.verify/app221-resources-20261102/short-schema-lab.json), [cache incompleta](../../../.verify/app221-resources-20261102/noop-repair-after.json), [riserva Dhelmise](../../../.verify/app221-resources-20261102/dhelmise-budget-replay.json).

## Stato corrente dopo la ripresa autorizzata 20/60

**0/3 guide valide, 48/60 invocazioni cumulative, sedici per job.** La seconda epoca aggiunge nove chiamate alle 39 della prima. I tre job sono terminali, senza prosa o report salvati; nessuna UI nuova è eleggibile. Tutti i controlli e lo scaling rimangono attivi, nessun contenuto AI corretto manualmente.

| Matchup | Invocazioni cumulative | Ultimo esito | Residue / minimo necessario |
| --- | ---: | --- | ---: |
| Crustle–N’s Zoroark | 16/20 | Riparazione locale valida, due critiche ancora negative | 4 / 5 |
| Alakazam/Dudunsparce–Basic Box | 16/20 | Tre riparazioni respinte per schema e copertura prima dell’azione | 4 / 5 |
| Dhelmise–Lucario/Hariyama | 16/20 | Riparazione locale valida, due critiche ancora negative | 4 / 5 |

I nuovi critici rilevano KO già disponibili, ricerche complementari e protezioni preventive; cambiare una spiegazione o dichiarare il caso sfavorevole non sostituisce l’esecuzione della scelta competente. Una correzione mantiene addirittura il finding del setup dichiarato irrisolto. Il critico lo respinge correttamente. Per Alakazam gli errori sono un accessReceipt mancante nel turno avversario, lo stesso campo vietato nel nostro seguito e una copertura delle alternative incoerente dopo il nuovo KO. Le dodici chiamate residue non coprono i quindici tentativi minimi stimati per completare tutti i cicli; nessun budget viene esteso o redistribuito automaticamente.

Passano **sette audit cumulativi** e rimangono intatti input/output delle prime 39 invocazioni. Il codice effettivo della seconda epoca era identico alla prima: 230 file sigillati, 515 test e tre regressioni già passati sullo stesso sorgente. Il piano iniziale resta una stima storica con massimo 16; autorizzazione vincolata al job, diagnostica e budget delle richieste successive provano il tetto effettivo 20. Il verificatore è stato corretto per non confondere questi dati. Primo archivio: 103 file; secondo: 157. Il conflitto del nome archive.json del secondo manifest è stato corretto preservando manifest prima/dopo e ripristinando il riepilogo iniziale con hash identico. Output AI, sorgenti congelati e database non sono stati modificati.

## Correzione della cache dopo la prova reale

Un replay su copie identifica una richiesta duplicabile: quando diminuisce il budget residuo, lo scaling può scegliere un riesame unico anziché le due parti già eseguite e non ritrovare il risultato. La correzione generale cerca prima partizioni complete già archiviate. Ogni parte deve corrispondere esattamente a prompt e configurazione correnti; ogni review viene ricontrollata, tutte le parti devono coprire lo scope nell’ordine corretto e tutte le partizioni complete corrispondenti mantengono i loro rilievi, anche negativi. Cache parziali, scope diversi, sovrapposti o riordinati non sostituiscono una revisione completa. Nessuna nuova review o approvazione viene inventata.

**520 test passati**, 44 esterni esclusi, sei test mirati/replay, typecheck e build; i 192 hash storici restano invariati. Modificato un solo sorgente esistente, aggiunto un helper generico; nessuna istruzione, schema, carta, movimento o verdetto AI cambiato. 234 file finali sigillati. Il replay dei tre database reali su copie conferma zero richieste al tetto 20 e, con il solo massimo simulato 24, raggiunge direttamente la riparazione con i 4/1/2 rilievi più recenti invariati. **La correzione è verificata soltanto offline: nessuna nuova generazione AI è stata eseguita sul codice finale.** Il risultato reale resta 0/3 e 48 chiamate.

L’obiettivo delle tre valide rimane aperto. Il minimo ulteriore corrente è 5/5/5 (15 richieste; totale almeno 63). La proposta con margine è massimo **24 per guida e 72 complessive**, fino a 24 nuove invocazioni sugli stessi job, fermandosi appena validi; non è autorizzata e non garantisce tre approvazioni. Il limite reale resta 20/60. L’assenza di nuove regole per i nomi degli esempi e i test sostengono il riuso strutturale; le tre guide non valide impediscono di dichiarare convergenza generale. Non si approvano bozze per esaurimento dei tetti.

Evidenze correnti: [rapporto finale](../../../.verify/app221-resources-20261102/report-final.html), [metriche finali](METRICS-FINAL.json), [audit della seconda epoca](../../../.verify/app221-resources-20261102/final-audit-epoch2.json), [audit della cache](../../../.verify/app221-resources-20261102/cache-followup-audit.json), [replay attuale senza rete](../../../.verify/app221-resources-20261102/next-budget-epoch2-replay.json), [sigillo del codice finale](../../../.verify/app221-resources-20261102/seal-cache-followup.json), [archivio finale](../../../.verify/app221-resources-20261102/archive-cache-final/manifest.json), [coerenza finale](../../../.verify/app221-resources-20261102/consistency-final.json).

## Prima epoca: correzioni iniziali e limite 16/48

Il contratto v27 implementa setup verificato prima della continuazione, inventario derivato dal registro unico, pagamenti degli attacchi sull’Attivo e fatti disponibili prima delle scelte. La nuova prova reale termina con **0/3 guide valide e 39/48 invocazioni**, tredici per matchup. Nessun contenuto AI è stato modificato manualmente; nessuna bozza respinta è stata pubblicata. L’obiettivo delle tre guide valide, ripristinato dall’utente durante la prova, **non è raggiunto**.

| Matchup sulle liste esatte pubbliche di prova | Chiamate | Setup verificati / casi locali | Arresto |
| --- | ---: | ---: | --- |
| Crustle–N’s Zoroark | 13/16 | 2 / 2 | Riparazione respinta per audit di promozione e risorse; 3 residue contro almeno 4 necessarie |
| Alakazam/Dudunsparce–Basic Box | 13/16 | 2 / 2 | Critica negativa per KO alternativo sul successore caricato; 3 residue contro almeno 5 necessarie |
| Dhelmise–Lucario/Hariyama | 13/16 | 2 / 2 | Critica negativa per Debolezza non applicabile e KO/seguito conseguenti; 3 residue contro almeno 5 necessarie |

Tutti e sei i casi hanno raggiunto una versione che supera i controlli locali. Tutti e tre i critici chiedono revisione; Crustle tenta anche una riparazione, ancora non valida. Nessuna fase di prosa viene raggiunta. Il test live fallisce correttamente il criterio delle tre valide. Le nove chiamate residue non vengono spese in tentativi che non possono completare i controlli e non vengono redistribuite o azzerate. Sono limiti locali della campagna, distinti dalla quota del servizio.

## Cosa cambia

Per ogni caso, una richiesta costruisce soltanto il setup sull’allocazione iniziale validata. Il programma rigioca il registro, controlla quantità, disponibilità, turni, assegnazioni e audit, poi consegna alla continuazione lo stesso setup con inventario completo, campo e turno successivo. Il programma compone soltanto le parti dichiarate; non inventa movimenti, pescate o scelte. Il setup viene rigiocato anche dalla cache. Un output-limit ricostruisce soltanto la linea dal medesimo stato. Minimo pianificato nove chiamate, riserve aggiornate e default di sedici mantenuto.

Il pagamento legge costo stampato, Attivo e Energie della sua copia. Ogni Energia Base fornisce automaticamente una unità del proprio tipo. Contributi Speciali, unità aggiuntive e modificatori richiedono copie fisiche e fonti presenti o ricevute di Allenatori già giocati. Un matching impedisce di contare più volte una unità multitype o usare Energie della Panchina. Il replay in sola lettura dell’errore reale Erba–Erba–Psico contro tre Erba è respinto senza cambiare i movimenti originari. Le condizioni specifiche dei contributi restano soggette al critico; non viene dichiarato un simulatore completo.

Prima delle azioni rilevanti, `choiceBefore` deriva mano, campo, Pokémon negli scarti e utilizzi del turno; `decisionProof.cards` deve coprire esattamente i candidati disponibili. Un’evoluzione o scarto già scelti non dimostrano l’assenza precedente di un’alternativa. Il destinatario delle Energie deve essere dimostrato al momento dell’assegnazione. Rami, accessi, ritirate, KO/Premi/promozioni, prove di rimozione, critiche indipendenti, originali nativi, persistenza e pubblicazione mantengono i controlli precedenti.

## Verifiche eseguite

- Suite finale: **515 test passati**, 44 prove esterne escluse; typecheck e build passati prima del sigillo.
- Tre regressioni supplementari: pagamento sul rifiuto reale, uscite senza KO e lettura/integrazione delle tre guide storiche. Nessun risultato diagnostico applicato ai job reali.
- Schemi setup/linea/nativo completo verificati sulle **17 liste avversarie** archiviate; preparazione e preflight a zero chiamate.
- **227 file sigillati invariati** per tutta la campagna; dati, codice e pacchetti congelati prima della prima invocazione.
- **Sette audit postlive passati**: campagna/costi/scope/pubblicazione, setup e ricevute, riserve/timeout, accessi e allocazioni, output compatto reversibile, contesti effettivi dei critici e lettura persistita dei risultati eleggibili.
- Tre database/job nuovi per questa campagna, stesso modello `gpt-6.1-sol`, profondità automatica, stesse liste pubbliche e dati al 30 ottobre. Tutte le 39 invocazioni hanno usage: 2.871.611 input, 336.250 output, 227.072 cached input; il cached non si somma all’input per dedurre un consumo distinto.
- Ventuno risposte respinte localmente, tutte `invalid-response`; nessun timeout o output-limit effettivo in questa campagna. Retry inclusi nei tetti.
- Prompt storici protetti da **192 hash v11–26**; nessuna nuova condizione per nomi o printId del pilota o dei nuovi matchup. Tre guide storiche integre. Archivi APP-219 (46 file), APP-220 prima epoca (105) e finale (129) invariati.
- Zero report validi salvati: **nessuna nuova prova UI eleggibile** e nessuna dichiarazione di UI passata. Nessuna release/installazione o modifica del profilo personale.

## Generalizzabilità e limite osservato

Le correzioni usano inventari, tipi, copie, zone e fonti; non regole dedicate ai tre esempi. Test e audit sostengono il riuso strutturale, non l’affidabilità su tutte le guide. Sei setup e sei casi localmente validi non certificano una strategia competente: i critici trovano ancora un ordine di ricerca/assegnazione migliore, un bersaglio alternativo che elimina il successore e una Debolezza errata.

L’elenco delle alternative non equivale al loro confronto corretto. La richiesta di ripetere esattamente gli identificativi prima di molte azioni genera anche retry di metadati; non basta aumentare i campi o le istruzioni per provare convergenza. Separare il setup dalla linea anticipa gli errori contabili, ma non dimostra da solo la qualità tattica del setup. Il controllo meccanico dei costi non certifica tipo della Debolezza, danno o applicabilità di tutti gli effetti. Questi sono limiti generali, non motivi per approvare una bozza o aggiungere eccezioni ai matchup. Le revisioni fra versioni native rimangono APP-222, fuori dal perimetro verificato.

## Ripresa e obiettivo aperto

Il replay su copie dei tre database passa con zero chiamate modello: al tetto attuale non viene invocato il runner; con un massimo **soltanto simulato** di 20 per guida, tutti riprendono da `repair-scenarios-delta`, con i rilievi originali e le riserve, prima di fermarsi obbligatoriamente prima della rete. Nessun nuovo piano, setup o caso viene rigenerato nel replay; nessun contatore reale cambia. Questa prova non autorizza una ripresa dal vivo e non garantisce che la riparazione successiva sarà valida.

I minimi correnti sono 4/5/5 nuove invocazioni, almeno 14 totali: il minimo complessivo diventerebbe 53, con massimi individuali almeno 17/18/18. Il perimetro proposto per un tentativo con margine è massimo **20 per guida, 60 complessive**, cioè fino a 21 nuove invocazioni sui job esistenti, fermandosi prima se validi. **Proposta non autorizzata**: il limite reale resta 16/48. Prima di altre richieste serve una risposta esplicita dell’utente, perché i tetti provengono dalla sua istruzione. L’obiettivo non deve essere marcato completo in base al solo esaurimento delle riserve.

Evidenze: [metriche](METRICS.json), [rapporto navigabile](../../../.verify/app221-resources-20261102/report.html), [audit finale](../../../.verify/app221-resources-20261102/final-audit.json), [sigillo](../../../.verify/app221-resources-20261102/seal.json), [audit del codice](../../../.verify/app221-resources-20261102/code-audit.json), [replay della ripresa, soltanto offline](../../../.verify/app221-resources-20261102/next-budget-replay.json), [archivio immutabile](../../../.verify/app221-resources-20261102/archive/archive.json), [coerenza finale](../../../.verify/app221-resources-20261102/consistency.json).


## Diagnosi quantitativa della mancata convergenza

Il riesame in sola lettura delle 76 invocazioni aggiunge una distinzione utile per la revisione del metodo. Le transazioni native sono **22**, di cui **11** dichiarate incomplete o interamente prive di operazioni; tre di queste erano state ammesse localmente dal lettore storico, ma non hanno prodotto guide approvate. Sono presenti **15 critiche formalmente accettate e zero verdetti pass**. Nessuna chiamata ha raggiunto la prosa. La classificazione dei messaggi di errore è diagnostica e non sostituisce gli esiti originali.

Questa evidenza impedisce di ridurre il problema ai soli identificativi o al budget: anche dopo una costruzione localmente valida il giudizio tattico resta negativo. Inoltre il codice supporta già patch su percorsi puntuali e verifica separata del setup; proporre semplicemente «patch più piccole» o «registro unico» ripeterebbe funzionalità esistenti. Il punto da specificare in APP-223 è un protocollo di costruzione che verifichi precondizioni e prefissi prima di accumulare grandi linee, insieme a un controllo anticipato della premessa tattica. Le critiche indipendenti finali e gli altri controlli restano obbligatori; il risparmio di costo e la convergenza devono essere misurati, non presunti.

Analisi locale senza ulteriori invocazioni AI o modifiche al generatore. [Profilo completo](../../../.verify/app221-resources-20261102/failure-profile.json).
