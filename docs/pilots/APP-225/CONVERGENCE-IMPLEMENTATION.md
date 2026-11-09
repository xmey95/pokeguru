# APP-231 — Integrazione in corso

**Aggiornamento successivo:** l'utente accetta guide con copertura finita e limiti espliciti. APP-231 incompleta è sostituita come dipendenza da APP-232: [stato corrente](FINITE-EVIDENCE-IMPLEMENTATION.md), [contratto](FINITE-EVIDENCE-CONTRACT.md). Ultimo preflight del driver: 60,811 s freddo / 10,080 s caldo / 958,8 MiB senza descrittore, zero provider e sorgente integro. Prova negativa `app231-dialogue-real-preflight.json` conservata. Driver con ricevute/ripresa presente e nove test di componente verdi, non integrato globalmente. Le note seguenti sono cronologia, non un ordine a completare quel grafo prima della consegna finita.

04 novembre 2026. Stato: **In progress**, gate B non superato. Nessuna nuova chiamata reale, campagna terminale, nessuna attivazione v28. L'obiettivo completo di APP-225 resta invariato.

## Aggiornamento: provenienza e contratti della scomposizione

Gli [ingressi degli obblighi](../../../src/main/guide-obligation-input.ts) importano in uno snapshot SQLite coerente tutti gli originali delle repliche e le unità accettate che ne riportano integralmente il testo. Sono riferimenti di trasporto verificati, comprese copie ereditate; non attestano paternità esclusiva o equivalenza semantica. La nascita dell'originale viene fissata in un passo host esplicito, distinto dal lettore puro. Nuovi riferimenti rafforzano monotonamente l'indipendenza senza duplicare l'originale o cambiarne l'ID. Un giudizio divenuto non indipendente è invalidato anche dopo riapertura.

I [contratti di proposta e riesame](../../../src/main/guide-obligation-mapping.ts) sono presenti e provati con risposte sintetiche attraverso il batch reale del protocollo. La proposta conserva originale completo, ragione, condizioni, quantificatori e politica. Formula in tabella topologica, riferimenti controllati, niente cicli, duplicati o nodi orfani. `single-line` impone un solo atomo esistenziale con tutte le proprietà sullo stesso testimone; gruppi e confronti mantengono politiche distinte. La dichiarazione di testimoni indipendenti richiede comunque la verifica semantica del critico, non è una prova meccanica del significato della frase.

Il critico è distinto dal proponente e dalle unità che riportano l'originale. Legge originale, proposta e linea principale integrali; le intenzioni dei seed sono riportate esattamente nella directory, senza diventare prove dei risultati. I predicati noti forniti al ruolo sono candidati selezionati, non un catalogo completo né approvazioni. Un mapping accettato lascia i fatti aperti. Una confutazione AI richiede fonti/linea principale sufficienti; corpi ulteriori necessari producono `needs-context`, senza costruzione automatica. Nessun originale utente/prodotto è ritirabile. Opinioni accettate incompatibili sul medesimo descrittore bloccano l'adozione.

Il [trasporto verificato](../../../src/main/guide-transport-evidence.ts) ricostruisce soltanto feedback di retry realmente rifiutati e autentica richiesta, figlio grezzo e valore accettato. L'ammissione nel registro è una derivazione deterministica delle due risposte, con entrambe e il codec conservati; non è una nuova risposta attribuita al modello. Un errore di persistenza lascia invariata la proiezione viva. I contratti sono invocabili, ma **non sono ancora eseguiti automaticamente dal coordinatore**.

La semantica del mapping è legata anche all'head della linea principale. Una sua modifica invalida le vecchie corrispondenze. I fatti condizionali sui registri esatti restano separati e possono essere riusati soltanto dopo una nuova corrispondenza indipendente nel nuovo frame; il prefisso del contesto vincola ancora radice, caso, packet, fonti e contratto atomico.

**225 test passati, una esclusione intenzionale del prototipo storico, 28 file; typecheck completo passato.** Inclusi i 60 test runtime precedenti rieseguiti sul codice corrente, retry non validi di proponente e critico, mapping/fatti separati, gruppi, riuso, refutazione AI, negative conservate, errore di storage e invalidazione della linea principale. Evidenze `app231-mapping-current-tests.{json,log}` e `app231-mapping-current-typecheck.log`.

Su copia reale: **50 originali, 95 riferimenti a 31 unità accettate, 26 journal completi**; 50 nascite registrate solo nella copia, tutti gli originali ancora `proposed`. Il descrittore di proposta sull'originale reale più lungo, con intenzioni esatte e tutti i 237 campioni, richiede **81.060 input stimati**, **6,502 s freddo / 4,132 s caldo / 493,7 MiB**. Include packet corrente, schema trasformato e quattro campi host. Zero risposte di proposta/critica inventate nel job copiato, zero chiamate o approvazioni semantiche; 252 tentativi principali conservati e sorgente intatto. Questa è una misura dell'ingresso/proposta, non dell'intero dialogo, del budget totale o dei tre replay. Fonte `app231-mapping-input-profile.{ts,json,log}`; la misura precedente alle intenzioni è conservata separatamente.

Integrità: 8 input esistenti modificati / 469 invariati rispetto al freeze477; 34 file del lavoro corrente improntati, prototipo preservato e tre database originali equivalenti agli archivi su schema e 39 tabelle ciascuno. Fonte `app231-mapping-input-integrity.json`.

**Confine aperto:** manca il driver automatico dei due stadi con manifest completo delle opinioni, persistenza/ripresa autorevole dell'intero dialogo e gestione di revisione, recupero e conflitto. I lettori attuali verificano tutti gli esiti critici ancora presenti: prima della rete serve anche una ricevuta durevole per ogni opinione di mapping, così una negativa mancante sia rilevata come nel percorso dei fatti. Restano migrazione di invarianti/rilievi e integrazione del coordinatore, di tutte le famiglie e della finalizzazione. `producerUnitBindings=true` non equivale alla migrazione completa o al riesame dei fatti. Gate B/C ancora aperti; nessuna riapertura della campagna.

## Richieste, persistenza e collegamento dei fatti: incremento precedente

Il percorso [reviewGuideAtomicPredicate](../../../src/main/guide-atomic-review.ts) usa lo scheduler esistente per le sole unità prive di giudizio. Le [richieste](../../../src/main/guide-atomic-requests.ts) derivano da una vista immutabile verificata: journal completi, fonti correnti, condizioni e politica esatta del predicato. Le fabbriche non ripetono letture/decompressioni della storia. Restano batch, retry durevoli, riserve delle chiamate e scaling dinamico. Una prova esistenziale completa ferma i gruppi successivi; le risposte già pagate nello stesso gruppo restano archiviate. Le dipendenze numeriche, di fonte e di chiarimento non entrano in retry critici o costruzioni automatiche.

Ogni richiesta viene archiviata prima della chiamata; risposta accettata, descrittore e ricevuta dell'opinione sono salvati nella stessa transazione. Il lettore ricostruisce le ricevute dai descrittori esatti e dai figli grezzi accettati. Una risposta negativa mancante, segnalata dalla propria ricevuta, blocca il riuso; le opinioni contraddittorie restano esplicite. La riapertura è pura e non avvia chiamate o salvataggi. La serializzazione dei fatti ordina soltanto le voci del loro insieme per produrre una radice riproducibile; journal, eventi e testi originali restano identici.

Il [collegamento al registro](../../../src/main/guide-atomic-binding.ts) codifica integralmente il predicato e la sua politica nel nodo da mappare. Una corrispondenza indipendente agli originali resta obbligatoria. Il registro usa coperture host correnti, verificando scope, fonti, condizioni e indipendenza anche dai produttori di un nuovo originale. Può riusare un fatto immutato dopo un nuovo mapping; un vecchio certificato globale non è ammesso come prova atomica. Dopo riapertura gli obblighi restano aperti fino alla riautenticazione dei fatti. Le formule `all`/`any` e l'invalidazione dopo nuovi concorrenti restano operative.

Il precontrollo della sola capienza output usa esattamente riserve e campioni del budget completo: divide gruppi certamente impossibili prima di codificarne i corpi. Il budget integrale controlla poi input, calibrazione, output, byte, margini e chiamate. Le regressioni verificano che il raggruppamento produca le stesse identità e conservi tutte le unità.

**Verifiche:** 149 test passati/1 esclusione intenzionale storica su 16 file, più 60 regressioni del runtime su 10 file: **209 test distinti passati**. Ultimi 14 test delle richieste/collegamento ripetuti dopo il congelamento in memoria della vista; typecheck completo verde. Generazione nativa, riparazione, persistenza, revisione, fonti tardive, partizione, limiti output/chiamate, rollback e perdita di un'opinione negativa coperti. Non è una suite completa dell'app né una campagna AI. Evidenze `app231-atomic-pipeline-tests.json`, `app231-atomic-runtime-regression-tests.json`, `app231-atomic-final-immutability-tests.json` e `app231-atomic-final-typecheck.log`.

Dimensionamento sul codice corrente compilato in processi Node dedicati, su copie del job reale, con journal completi, packet corrente integrale, schema effettivo, quattro campi host e tutti i 237 campioni di calibrazione:

| Unità diagnostica | Input stimato | Freddo / caldo | Picco RSS | Esito locale |
| --- | ---: | --- | ---: | --- |
| Linea più grande | 60.080 | 2,878 s / 1,027 s | 492,4 MiB | Entra |
| Coppia dei due journal più grandi | 73.131 | 3,294 s / 1,215 s | 500,9 MiB | Entra |
| Gruppo di 26 journal | Non codificato | 1,581 s / 0,702 s | 434,5 MiB | Stop esplicito sull'output |

I predicati di questo dimensionamento sono diagnostici: non sono decomposizioni AI, approvazioni semantiche o una stima delle chiamate totali della guida. I tre test locali non sono i tre replay completi richiesti dal gate B. Rapporti `app231-atomic-sizing-{single,pair,group}.{json,log}`, harness e compilato conservati. Sorgenti reali invariati, 252 tentativi principali conservati, zero chiamate/fatti AI aggiunti. La precedente misura negativa dell'assessment intero resta storica e non viene cancellata.

Integrità corrente: **8 input esistenti modificati / 469 invariati** rispetto al freeze477; 29 file del nuovo incremento improntati. Tre database equivalenti agli archivi su schema e 39 tabelle ciascuno, originali invariati durante la lettura; prototipo A preservato. Fonte `app231-atomic-pipeline-integrity.json`.

Il confine di questo precedente incremento è aggiornato sopra: contratti di scomposizione/riesame e provenienza delle unità presenti, esecuzione automatica e persistenza del dialogo ancora da completare. Le corrispondenze dei test restano sintetiche e non dimostrano la qualità di un mapping AI reale. Nessuna nuova campagna è pronta; gate B e C restano aperti.

## Biblioteca e fatti locali: incremento precedente

La [biblioteca dei testimoni](../../../src/main/guide-witness-library.ts) legge una vista SQLite coerente di tutte le head accettate della stessa radice, incluse quelle di piani ritirati. Ricontrolla le catene, i prefissi, i registri nativi e la dichiarazione produttrice di ciascun turno. Un ramo invalidato o incompleto resta escluso; non si recupera un suo vecchio discendente completo. Deduplica soltanto registri integralmente identici e conserva gli alias delle accettazioni. La directory non attesta una lettura o un'approvazione tattica. Una biblioteca con produttori mancanti non autorizza conclusioni di assenza globale.

Il [registro dei fatti atomici](../../../src/main/guide-atomic-proofs.ts) distingue esistenza di una linea, coppia, confronto su un dominio finito e gruppo irriducibile. Le ricevute host richiedono corpi completi, turni, fonti e indipendenza dai produttori. Il confronto dichiara se le pescate devono essere identiche o se si confrontano condizioni diverse; quest'ultima scelta richiederà un mapping semantico indipendente. I fatti locali immutati restano validi quando arriva un candidato: si riaprono la conclusione globale e le nuove unità necessarie, senza ricomprare le vecchie. Dominio vuoto, gruppo omesso, autocertificazione o semplice directory non producono un pass.

Una critica incompleta distingue valutazione numerica, fonti mancanti e chiarimento. Opinioni incompatibili richiedono riesame; una ricevuta nota senza il proprio risultato richiede recupero. Nessuno di questi casi autorizza nuova costruzione o chiusura della guida. La copertura restituita è una capacità host verificata, non un booleano importabile dal JSON.

**Verifiche correnti:** 124 test passati, una esclusione intenzionale del solo prototipo storico, 13 file; gli 11 test atomici passano anche dopo le ultime asserzioni sul routing. Typecheck completo passato. SQLite concorrente verificato: la lettura resta coerente durante il commit esterno, rileva i chunk alterati subito dopo e vieta salvataggi nell'ambito di lettura. Il primo comando aggregato, avviato senza escludere le copie sotto `.verify`, è stato interrotto; non è contato come prova verde. La riesecuzione esclude le copie e limita i worker, senza modificare timeout o asserzioni. Evidenze `app231-library-atomic-current-tests.{json,log}`, `app231-atomic-routing-tests.{json,log}` e `app231-library-atomic-final-typecheck.log`.

Su copia del job reale la biblioteca trova **26 registri completi, 26 alias e un ramo incompleto escluso**. Lettura a freddo **1,528 s**, a caldo **0,616 s**, picco **393,7 MiB**. Sono misure del componente, non del coordinatore o del gate B. I registri hanno 14 gruppi di pescate distinti: non sono intercambiabili. Le 325 coppie possibili sono una diagnosi strutturale, non 325 richieste AI autorizzate o necessariamente dovute. Nessun fatto semantico, approvazione o chiamata reale creato. Fonte `app231-witness-profile.{ts,json,log}` e `app231-real-witness-library.json`.

Integrità corrente: cinque input esistenti modificati rispetto al freeze di 477 (quattro moduli e un test); altri 472 identici. Nuovi moduli e test hanno impronte proprie, prototipo A preservato. I tre database sorgenti restano identici durante la lettura ed equivalenti agli archivi su schema e 39 tabelle ciascuno. Fonte `app231-library-atomic-integrity.json`; il precedente manifest della fondazione resta storico.

Il precedente confine di questo incremento è superato soltanto per descrittori, persistenza e collegamento strutturale al registro, come dettagliato sopra. Il coordinatore globale resta da completare. Il vecchio contratto preventivo continua a escludere `construct`. Il registro di fatti non è una nuova autorità per pubblicare una guida. Il dominio finito dei registri archiviati non dimostra ottimalità su tutte le mosse legali e non sostituisce i controlli tattici esistenti.

La chiusura resta in tre passaggi già concordati: completare B come unico incremento e dimostrarne i replay completi; congelare il codice e ricalcolare le richieste prima della prova reale; completare C con tre guide valide, persistenza/UI, verifica generale, policy e build utente. Nessuna nuova campagna per validare singole patch durante B e nessun successo dichiarato dai soli test di componenti. Le misure negative della prima forma dell'assessment qui sotto restano valide come evidenza storica.

## Fondazione precedente e limiti ancora aperti

- [Registro incrementale](../../../src/main/guide-obligation-registry.ts): namespace `guide-obligations-1`, ricevute host indicizzate per contenuto, append atomica su proiezione separata senza rigiocare tutta la storia, riapertura verificata, alias di tutti i produttori conosciuti per evitare autocertificazioni. È ancora separato dal coordinatore.
- [Provenienza delle repliche](../../../src/main/guide-obligation-origins.ts): verifica l'intera ascendenza adottata e i bisogni della costruzione corrente usando i lettori esistenti. Conserva corpi e occorrenze esatti; esclude intenzioni di proposte non adottate e bisogni di altre costruzioni. Non crea autorità, giudizi o piani.
- [Contratto del critico preventivo](../../../src/main/guide-obligation-assessment.ts): originale intero, frame, directory esplicitamente non probatoria e corpi completi selezionati. Chiusura con testimoni correnti; recupero dei corpi mancanti distinto dalla nuova costruzione. Tipo distinto dall'approvazione di una guida. La prima forma conservativa di assenza richiedeva tutti i candidati letti ed è **insufficiente come strategia generale di partizione**. Il contratto corrente esclude quindi `construct` dallo schema: il manifest dichiara ancora `historicalWitnessLibrary=false`, anche leggere tutte le linee del piano corrente non autorizza nuova costruzione.
- [Cache dei soli byte decodificati](../../../src/main/evidence-json-cache.ts), utilizzata da `AiEvidenceArchive`: ogni lettura ricontrolla binding, dimensione, ordinali e fingerprint di tutti i chunk compressi correnti. Un nuovo fingerprint percorre nuovamente decompressione e SHA originale. Il risultato viene sempre analizzato in un nuovo oggetto; nessuna cache di verdict, validatore o approvazione. Limite conservativo 32 MiB/128 elementi per archivio, svuotato alla chiusura.
- Famiglia di budget e capienza output distinte per `obligation-*`; calibrazione input globale conservativa mantenuta. Il preparatore dei dati riconosce queste fasi e fornisce le evidenze correnti, lasciando i nativi sul packet congelato. Nessuna fase esistente chiama ancora il nuovo critico.

Il prototipo A e i suoi quattro file verificati sono preservati in `.verify/app225-segments-20261102/app231-prototype-baseline/`. Le stesse prove di comportamento sono riusate tramite un contratto condiviso, con differenze esplicite fra prototipo e nucleo di produzione.

### Intenzioni AI e invarianti

Nel prototipo A anche i seed erano trattati come non ritirabili. È una restrizione troppo forte per l'integrazione: un'intenzione di un piano è testo AI e può contenere una premessa infondata. Il nucleo B consente di superarla soltanto con un'altra richiesta critica, fonti e condizioni correnti, mantenendo l'originale e invalidando il giudizio quando cambiano le dipendenze. Utente e prodotto restano inderogabili. Refutare un seed non elimina la copertura tattica obbligatoria, i controlli nativi, i ruoli delle repliche o i riesami finali. Non è ammesso rinunciare per risparmiare budget.

## Verifiche eseguite

**108 test passati, 1 esclusione intenzionale del solo prototipo storico**, 11 file; typecheck dell'intero progetto passato. Inclusi cache dopo corruzione dei chunk/dimensioni/binding, isolamento, risorse originali, checkpoint, conservazione degli obblighi, richieste critiche non valide, produttori multipli, namespace e fonti tardive. Evidenze: `app231-foundation-tests-current.{json,log}` e `app231-foundation-typecheck-current.log` sotto `.verify/app225-segments-20261102/`.

La verifica di integrità identifica esattamente tre input esistenti modificati rispetto al freeze precedente di 477 file: `ai-evidence-archive.ts`, `guide-request-budget.ts`, `matchup-guide-generation.ts`. Gli altri 474 restano identici; nuovi moduli e test hanno impronte proprie. Tutti i 39 schemi di tabella e le celle dei tre database coincidono con gli archivi terminali, e i file sorgente restano invariati durante i controlli. Evidenza: `app231-foundation-integrity.json`.

Non sono stati ripetuti build e suite completa dell'app per dichiarare questo incremento finito: il codice è ancora in lavorazione e nessuna build viene consegnata come pronta all'utente.

## Dati reali letti su copia

Il lettore completo della provenienza trova **50 originali** sul job fermato: 25 intenzioni AI dei piani adottati e 25 requisiti metadata, con 115 occorrenze e 6 scelte adottate. Il solo ultimo snapshot ne conteneva 35. I corpi non sono riscritti e non si deducono equivalenze dal testo. La prova conserva 252 tentativi pagati; fonti e job originali restano invariati.

Il primo profilo del solo lettore misura circa **4,09 s freddo / 4,10 s caldo / 541,2 MiB di picco**. Non comprende il coordinatore completo e non soddisfa da solo i limiti del gate B. Il manifest dichiara ancora assenti invarianti della guida, rilievi critici e ricevute delle chiamate produttrici: **non è una migrazione completa**. Evidenze: `app231-origin-profile.{ts,json,log}` e `app231-real-origin-manifest.json`.

## Primo controllo di capienza: esito negativo

Misura della prima forma del critico, prima dell'ultima aggiunta del binding alle evidenze correnti. Include originale reale, registri reali, stesso schema trasformato, wrapper di batch, quattro campi host acquisiti e 237 campioni di calibrazione senza riduzioni. Nessuna risposta del modello è stata prodotta.

| Vista | Input stimato | Esito di capienza |
| --- | ---: | --- |
| Directory, senza corpi | 95.349 | Entra, non costituisce prova |
| Due corpi completi | 65.202 | Entra, non certifica semanticamente il goal |
| Tutti gli 11 corpi | 128.621 | Respinta, limite 128.000 |

La stima minore con due corpi deriva dall'attivazione dei codec di condivisione dopo il target; non sono rimossi dati. Il processo raggiunge **797,8 MiB**, oltre i 768 fissati: esecuzione terminale **exit 1**. Anche la preparazione/stima dell'unità completa richiede circa 15,1 s. Il report parziale dei tempi del lettore non va interpretato come un pass di questi controlli. Evidenze: `app231-assessment-sizing.json`, `app231-assessment-profile.{ts,json,log}` e `app231-assessment-sizing-verification.json`.

Questa è una diagnosi negativa conservata, non una verifica della versione finale del generatore. Non aumentare i limiti, non eliminare candidati e non riaprire la rete da questo risultato.

## Lavoro necessario per completare lo stesso incremento

1. Collegare i due stadi al driver/scheduler con descrittori prima della chiamata, ricevute durevoli per ogni opinione e riapertura autorevole di tutto il dialogo/derivazioni. I contratti e il codec sono presenti; i test del loro uso manuale nel harness non sono esecuzione autonoma integrata. Gestire revisioni, corpi mancanti, conflitti e candidati noti con selezione esplicita; non affermare assenza dal solo sottoinsieme fornito al ruolo.
2. Migrazione completa di invarianti/rilievi/produttori e originali dell’intero job, comprese riparazioni e altre radici pertinenti. I50 originali delle repliche hanno bind verificati a unità accettate; non è ancora l’importazione dell’intera guida. Un mapping accettato non è un fatto o un permesso di nuova costruzione. Per portare una linea storica nella guida serve selezione AI esplicita con corpo immutabile.
3. Integrare ammissione prima delle scelte, valutazioni, metadata, riparazioni native/testuali, prosa, fonti tardive, critiche, attestazione e salvataggio nello stesso contratto. Conservare proposta252 e risultati pagati compatibili, invalidazioni precise, avanzamento e stop senza chiusure per budget.
4. Tutte le famiglie,tre replay completi,integrità,typecheck/build e regressioni prima del freeze. Restano60s freddo/10s caldo/768MiB;dimensionare un ingresso non soddisfa questi gate. Poi ricalcolare il budget effettivo del lavoro residuo e richiedere la sola riapertura concreta della prova reale.

Contabilità: **255 v28 / 331 storiche / 0 nuove guide valide**. Limiti500 per guida/1500v28,riserva24 per ciascuna guida successiva;residui245 sul primo e1245 nel pool. Defaultv27,guardia del providerv28,nessuna adozione della policyv5 e held-out esclusi. GateC e build utilizzabile dall’utente restano da completare.
