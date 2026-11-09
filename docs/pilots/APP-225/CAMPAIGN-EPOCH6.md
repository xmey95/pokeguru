# Ripresa dopo integrazione della riparazione narrativa

**APP-225 In progress — epoca6 terminale, correzione offline in verifica (03/11/2026, 12:44:33 Europe/Rome):** handle92860 exit1,2 invocazioni nuove56–57;57 principali+3 diagnostiche=60 v28,136 con76 precedenti,0/3 valide.56 classifica correttamente text/comparison;57 fallisce in4,2s,exit1/output-limit,zero turn/item completati e nessun risultato applicato. Altri job assenti, stop globale rispettato, nessun rilancio implicito del saldo68 entro128. Archivio campaign-v28-epoch6-archive/manifest.json:496 file,473 impronte live intatte, SQLite/binding/chunk confrontati, incluse le due basi diagnostiche congelate. Causa esatta57 non dimostrata; log locale readonly nella finestra non contiene record. Dopo terminalità e archivio, output narrativo v2 limitato ai soli campi autorizzati, altri testi conservati nell’input e rivalidati nativamente; schema/limiti e routing v1 pagato restano. Migliorata distinzione locale tra parametri/schema rifiutati e output incompleto e aggiunti soli codici/parametri strutturati da whitelist ai metadati. Tests39045/selected-text-targeted.log in corso; leggere esito prima di suite/TSC/build e nuova proposta di ripresa. Nessuna nuova AI dopo57, nessuna modifica manuale di corpi/passi o aumento80/128/24; defaultv27/guardv28 e held-out esclusi. Obiettivo completo ancora attivo, tre valide/UI/generalità/policy/build ancora aperti. Le note successive sono cronologia.

Le registrazioni live sottostanti sono cronologia della prova conclusa; non autorizzano a riaprirla.

**APP-225 In progress — epoca6 autorizzata e dal vivo (03/11/2026, 12:27:42 Europe/Rome):** ricevuto «Autorizzo80/128 con riserva24», question call_d0a99f9226f0440f8a364034526bcc49/0. Preflight approvato ripetuto verde,473 impronte/source/binary e baseline58=55+3 ricontrollati; grant campaign-v28-epoch6/authorization.json sul seal1fe9a1e544dc534f36f3c74aec0b481a22d98990f0e5e1ca490794450838bea6. **Handle92860**, epoch6-live.log, una sola copia. Limiti80/128 incluse58,24 per ogni guida successiva,70 ulteriori massime/204 incluse76 precedenti; primo caso fino22 nuove, main job cap77 dopo3 diagnostiche. Stesso job Crustle, altri casi soltanto dopo guida valida, stop globale al primo matchup terminato non valido; tutti i controlli/scaling, nessuna modifica di codice/contenuti, held-out esclusi. Attendere terminalità del processo prima di archiviare o correggere codice; i lock e i log da soli non attestano processo vivo. Obiettivo completo attivo,0/3 al via, defaultv27/guardv28 preservati. Le note successive precedono il consenso o sono cronologia.

Il protocollo sotto conserva la preparazione precedente alla risposta: i tetti80/128/24 sono ora autorizzati, non più una proposta pendente.

**Pronta offline, non autorizzata (03/11/2026, 12:21:35 Europe/Rome).** Nessuna nuova chiamata reale o nuovo job reale. APP-225 e l’obiettivo completo restano aperti:0/3 guide nella nuova campagna. Non creare authorization.json prima di un consenso specifico alla riapertura dello stop e ai nuovi tetti.

## Stato e proposta

| Matchup | Chiamate nel job | Diagnostiche da sommare | Cumulative attuali |
| --- | ---: | ---: | ---: |
| Crustle–N’s Zoroark |55 |3 |58 |
| Alakazam/Dudunsparce–Basic Box |0 |0 |0 |
| Dhelmise–Lucario/Hariyama |0 |0 |0 |

I76 tentativi della campagna precedente rimangono separati e conservati:134 effettivi nelle due campagne fino a oggi. Il database diagnostico contiene anche55 tentativi importati: il runner conta soltanto le3 invocazioni del suo job88e51db2-8a03-4de3-817a-56b36cb464d4. Verifica sia il database diagnostico reale sia l’archivio immutabile. Nessun testo o pass del diagnostico è adottato o passato al costruttore della guida.

**Proposta soggetta a consenso:** massimo80 cumulative per guida e128 nel ciclo v28, incluse tutte58;24 riservate per ciascuna guida successiva. Fino a70 nuove invocazioni nel ciclo e204 incluse le76 precedenti. È un aumento del pool di24 rispetto a104 e del tetto per guida di16 rispetto a64. Stop appena ogni guida è valida, esecuzione sequenziale e stop dell’intera campagna al primo matchup che termina senza guida valida. Nessun aumento automatico, nessun intervento manuale sui contenuti, nessuna modifica al codice durante il live e held-out esclusi.

Il minimo misurato70/110 lascia solo il necessario per accedere alla ripresa con le riserve minime precedenti; non è una previsione di completamento. La proposta80/128 consente22 nuove invocazioni su Crustle:12 minime richieste dal controller più10 di margine. Le24 per ciascuna successiva superano le vecchie stime18/20 senza riparazioni, che restano storiche e non sono state aggiornate. Il margine non è una garanzia: nuove riparazioni, critiche, splitting o errori del servizio possono consumarlo.

## Contabilità e arresti

Per il caso corrente il massimo complessivo è min(80, proprie cumulative + saldo del pool −24×guide successive). Le cumulative comprendono le diagnostiche. Il limite passato al generatore è il massimo complessivo meno le chiamate del job diagnostico: inizialmente80−3=77 sul job principale con55 già spese. Nessun reset o doppio conteggio. Il saldo risparmiato da un caso resta nel pool, entro80 per guida e128 complessive.

Il runner legge i contatori durevoli dopo ogni guide-attempt-start e verifica per-guida, pool, riserve, hash dell’input e configurazione prima di inviare al servizio. Anche retry, errori e risposte respinte consumano un’invocazione. L’archivio diagnostico e quello reale restano congelati per impedire un saldo silenziosamente diverso. Le76 precedenti sono controllate separatamente e non finanziano nuovi tentativi.

Un rifiuto di campo o di critica può essere riparato soltanto dal ciclo automatico nei limiti residui. Se il matchup termina per budget, errore del servizio o mancata guida valida, il runner conserva il lavoro e ferma tutti i successivi. Un outcome negativo non viene trattato come autorizzazione a riprovare. Una risposta non valida non viene tagliata o completata manualmente.

Solo dopo assertGuideIntegrity e assertGuideSegmentApproval si salva un report; il runner lo riapre e verifica l’isolamento del progetto. Le guide valide non sono rigenerate. Dopo le tre valide serviranno audit dei risultati reali, prova UI e verifica generale; defaultv27 e guardv28 dell’app restano finché quei requisiti non sono soddisfatti.

## Verifiche e congelamento

Codice dell’app identico al freeze di integrazione a0456e71fe157ab39ac159bdda2a2993f9031504e6f80b409e19cddbaeacbeaf, già verificato con612 pass/44 esclusi,22 mirati e typecheck/build. Le modifiche del presente passo riguardano soltanto il runner sperimentale in .verify e la documentazione: non è una nuova verifica live del generatore.

Runner e replay typechecked; prepare, seal, guard e preflight passati senza job o provider. Guard verifica80/128/24, rifiuto senza grant,3 diagnostiche incluse,77 come limite principale iniziale, redistribuzione del saldo e stop globale. Tre test sulle copie passati: con80 complessive si raggiunge il solo routing pendente; con routing sintetico marcato solo nella copia si raggiunge la richiesta narrativa dell’unico caso pendente; gli altri due casi arrivano soltanto al piano.55 attempt e30 checkpoint conservati, database originali immutati. Nessuna approvazione AI prodotta da queste simulazioni.

Freeze **473 file**, seal **1fe9a1e544dc534f36f3c74aec0b481a22d98990f0e5e1ca490794450838bea6**. Baseline main55/0/0, diagnostiche3/0/0, cumulative58/0/0 e job1/0/0. Pacchetti, liste pubbliche, schede, aggregati, modello gpt-6.1-sol e servizio OpenAI tramite Codex sono quelli delle prove precedenti. Nessuna fonte esterna nuova o modifica al profilo personale.

Il primo typecheck del nuovo runner ha trovato una dichiarazione existing mancante dopo la separazione dei contatori: ripristinata prima del freeze, log negativo conservato. Typecheck finale, guard/preflight e replay passano. Non sono state alterate le asserzioni o i limiti per far entrare le richieste.

Evidenze in .verify/app225-segments-20261102: verification-epoch6-preparation.json, campaign-v28-epoch6/{seal,baseline,authorization-guard,preflight}.json, epoch6-{prepare,seal,guard,preflight,replay}.log, epoch6-final-typecheck.log e epoch6-copy-replay-*.json.

## Avvio soltanto dopo consenso

Runner campaign-epoch6-live.test.ts, env POKEGURU_V28_EPOCH6. Il grant deve vincolare il seal sopra,80/128/24,58 incluse55+3, il job diagnostico, massimo70 ulteriori/204 storiche e le condizioni di stop. Ricontrollare sorgenti/binary/baseline e assenza di un processo precedente attivo prima di registrarlo. Il solo stato Ready o l’obiettivo attivo non autorizzano la rete. Authorization.json è assente e nessuna modalità live è stata eseguita.
