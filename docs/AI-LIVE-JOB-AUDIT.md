# Audit del job reale da 872 lotti — 29 ottobre 2026

Il collo principale è la quantità di record Evento consegnati individualmente al modello: sei query Eventi introducono il **96,98% dei byte** del flusso da analizzare. La sola ricerca `Dragapult ex` introduce 39,65 MB. Il Catalogo pesa molto meno, pur contando 227 query. La proposta è cambiare la rappresentazione delle evidenze Evento, con aggregati deterministici e accesso agli originali, mantenendo modello e ragionamento.

Misure complete: [AI-LIVE-JOB-AUDIT-METRICS.json](AI-LIVE-JOB-AUDIT-METRICS.json). MB indica 1.000.000 byte. Il perimetro autorizzato è misurazione e proposta; nessuna implementazione applicativa, nuova generazione AI, pausa o riavvio del job.

## Identificazione e attendibilità

- App installata **v0.3.8**; job avviato il 29 ottobre alle **09:46:39 Europe/Rome**. La lista salvata coincide con tutte le **21 righe** della lista Toucannon fornita dall'utente, dopo normalizzazione di maiuscole e apostrofi.
- Snapshot del job aggiornato alle **13:57:19**: `running`, **333/872** lotti, due giri di pianificazione; modello `gpt-6.1-sol`, effort automatico (`null`). Sono le impostazioni osservate, non modificate dall'audit.
- Ricostruiti offline **esattamente 872 lotti foglia** con il partizionamento a 60.000 byte. Le sequenze di chiavi di tutti i **333 checkpoint della generazione corrente coincidono**, senza differenze. Le 58 foglie di una generazione precedente hanno input diversi: non sono checkpoint corrotti né altre 58 foglie del flusso corrente.
- Il totale 872 riguarda le foglie della generazione corrente, non tutte le chiamate del job: sintesi successive, tentativi e ulteriori pianificazioni possono aggiungersi.

L'apertura ordinaria del percorso AppData restituiva un altro file da 46,4 MB, con errori di schema. Gli handle dell'app puntavano a file omonimi con **identificativi NTFS diversi**. L'audit ha aperto questi ultimi per identificativo, con accesso di sola lettura e puntatore indipendente, copiando database da 1.122.897.920 byte e WAL da 213.671.472 byte nel workspace privato. Gli SHA-256 di entrambi coincidevano con una seconda lettura degli originali; `PRAGMA quick_check` sulla copia ha restituito `ok`. La causa della divergenza dei file non è stata determinata: l'errore del file omonimo non dimostra corruzione del database usato dal job. Nessun file originale è stato riparato, sostituito o cancellato.

L'export diagnostico delle 13:46 confermava cinque analisi attive. Tutta la ricostruzione è stata svolta sulla copia; nessun controllo di pausa, ripresa, annullamento o generazione è stato attivato. Copia, export e script di misura rimangono locali nell'area ignorata `.verify/first-analysis-job-audit/`; non sono inclusi nei documenti pubblicabili. Il JSON allegato non contiene identificativi di progetti/job, nomi dei partecipanti, conversazioni o credenziali.

## Query che producono il volume

Tutte le query Evento usano l'intervallo **10 aprile–29 ottobre 2026**. `limit: 4` nel piano è una dimensione di pagina: l'app prosegue fino a esaurire i risultati.

| Query | Pagine | Partecipazioni trovate | Liste distinte trovate | MB aggiunti al flusso |
| --- | ---: | ---: | ---: | ---: |
| Eventi, carta Dragapult ex | 3.182 | 12.726 | 5.697 | **39,651** |
| Eventi, carta Raging Bolt ex | 675 | 2.699 | 1.150 | **7,782** |
| Eventi, nome mazzo Toucannon | 189 | 756 | 462 | **2,642** |
| Eventi, carta Gardevoir ex | 16 | 64 | 62 | 0,228 |
| Eventi, carta Charizard ex | 1 | 0 | 0 | 0,000557 |
| Eventi, senza carta/nome mazzo | 1 | — | — | 0,000392 |
| Catalogo, tutte le 227 query | 236 | — | — | **1,568** |

La query Eventi senza carta/nome mazzo è **respinta** con «Argomenti Eventi non validi». Non ha fornito una panoramica generale. Charizard restituisce zero nel campione locale interrogato: questo non dimostra assenza dal metagame. Le query per carta trovano liste contenenti quella carta, non necessariamente un solo archetipo puro.

Le 227 query Catalogo comprendono **225 ricerche per `printIds` e due per termini**: il numero delle query non è il numero di decisioni AI indipendenti. Il piano salvato contiene otto richieste in due giri; il resto comprende il recupero automatico delle schede. La ricerca per termini più pesante (`Iono`, `Counter Catcher`, `Enhanced Hammer`, `Area Zero Underdepths`) introduce solo 0,215 MB.

**Metodo di attribuzione:** ogni record è assegnato una volta alla prima pagina che lo introduce, nell'ordine di inserimento. Le statistiche derivate di una lista sono attribuite alla query che ne introduce la prima partecipazione. I byte includono chiavi, riferimenti e involucro JSON del record. Le appartenenze condivise sono conservate: non si sommano le risposte di query sovrapposte come se fossero dati nuovi. I conteggi di partecipazioni/liste trovate nella tabella sono invece propri di ogni query e non sono additivi.

I lotti sono ordinati per chiave dei record, non per query. Quasi tutte le query Evento toccano quindi moltissimi lotti: Dragapult e Raging Bolt ne toccano entrambe 847, Toucannon 840. Questi numeri **non si possono sommare** o leggere come chiamate causate separatamente.

Come verifica di sensibilità, ripartizionando offline il flusso senza i soli record esclusivi di ciascuna query, si ottengono 222 lotti senza quelli esclusivi di Dragapult (**650 in meno**), 741 senza Raging Bolt (**131 in meno**), 834 senza Toucannon (**38 in meno**) e 868 senza Gardevoir (**4 in meno**). Sono confronti separati, non additivi, e non propongono di eliminare quei matchup.

## Tipi di record che occupano i lotti

| Tipo | Record | MB serializzati | Lotti contenenti il tipo | Lotti interamente del tipo |
| --- | ---: | ---: | ---: | ---: |
| Abbinamenti delle partite (`pairing`) | 69.364 | **22,551** | **379** | 377 |
| Partecipazioni (`occurrence`) | 16.212 | **13,177** | **223** | 221 |
| Statistiche per lista esatta | 7.343 | 7,862 | 133 | 131 |
| Liste distinte | 7.343 | 6,710 | 114 | 112 |
| Schede Catalogo | 1.010 | 1,345 | 23 | 22 |
| Riepiloghi delle query | 233 | 0,227 | 5 | 4 |

In totale: **101.505 record**, **51.872.300 byte** dei record e **51.974.677 byte** negli array effettivi dei 872 lotti. Le risposte originali delle query misurano **50.881.758 byte**: è un contatore diverso, precedente alla rappresentazione con riferimenti e statistiche. Cinque lotti contengono più tipi; perciò la colonna dei lotti contenenti il tipo non va sommata.

Abbinamenti e partecipazioni occupano **68,88%** dei byte. Le statistiche ripetono inoltre le righe delle carte già presenti nelle liste: **4.837.655 byte** per il solo valore degli array ripetuti. I risultati degli incontri sono dati importanti, ma il modello riceve decine di migliaia di righe individuali per ricavarne considerazioni che in parte possono essere calcolate esattamente dal software.

Nella finestra diagnostica disponibile, 39 chiamate batch completate hanno mediana **35,896 secondi** e 90° percentile **40,463 secondi**. È una finestra recente, non la distribuzione dell'intero job; non dimostra un costo in token né permette una previsione affidabile della durata residua.

## Prove offline e loro limite

Un controllo di sensibilità, senza chiamate AI, mantiene tutte le 7.343 liste, tutte le 1.010 schede e le statistiche già disponibili:

| Flusso passato al partizionatore | Lotti foglia |
| --- | ---: |
| Input reale completo | **872** |
| Esclusi dal prompt i record individuali di partecipazioni e abbinamenti | **272** |
| Come sopra, con righe delle carte presenti una volta sola | **190** |

**190 non è un risultato pronto né un risparmio di qualità equivalente.** La prova omette i dettagli degli incontri: servono aggregati aggiuntivi per matchup, denominatori, copertura e accesso ai casi originali. Non conta il contesto aggiuntivo della lista base, richieste di approfondimento, sintesi o revisioni future. Dimostra dove esiste spazio per un incremento, senza giustificare tagli ciechi.

Un secondo limite qualitativo è verificato nel prompt installato: ogni foglia riceve domanda e dati del lotto, ma non un contesto esplicito con lista base e vincoli. La prima sintesi salvata segnala proprio l'assenza della lista iniziale. La lista è presente nell'input del job e nelle fasi superiori: non è persa dall'app, ma non accompagna ogni foglia.

## Incremento proposto: APP-185

**Risultato:** per le richieste di miglioramento generale, consegnare prima evidenze Evento aggregate e contestualizzate, con gli originali navigabili e recuperabili quando servono. Il primo incremento mantiene modello, effort e tutte le schede/liste distinte; non richiede campionamento dei mazzi.

1. Aggiungere un'operazione esplicita di **panoramica Eventi**, valida anche senza nome mazzo o carta, sullo snapshot locale e sulla finestra richiesta. Riportare frequenze, date, eventi, partecipazioni, liste disponibili e copertura degli archetipi osservati; dichiarare classi non risolte e lacune. Questo rende verificabile l'equilibrio fra matchup richiesto dall'utente.
2. Calcolare **aggregati deterministici** delle partecipazioni e degli abbinamenti: lista esatta, evento/periodo, avversario quando risolvibile, vittorie/sconfitte/pareggi e denominatori. Distinguere risultato contro il campo da risultato contro un matchup e distinguere liste esatte da archetipi. Contare a parte incontri non risolti, assenze di lista, risultati mancanti e casi ambigui; non convertirli in sconfitte o eliminarli dal denominatore senza segnalarlo.
3. Consegnare ogni lista distinta una volta, con statistiche riferite alla sua chiave e collegamenti agli originali. Conservare nell'archivio tutte le righe Evento, gli snapshot e la provenienza. Le richieste mirate recuperano gli incontri/listati originali pertinenti, mantenendo le appartenenze alle query e l'isolamento del job.
4. Includere nelle foglie un contesto breve con lista Toucannon, data, obiettivo e vincoli. Separare la copertura dei matchup dalle dimensioni delle query: un risultato enorme per Dragapult non deve valere come prova di copertura generale.
5. Registrare byte e lotti per query/tipo, aggiunte dopo deduplicazione, aggregati e approfondimenti, integrandosi con la contabilità APP-179 e il riuso APP-180/181. Applicare il nuovo contratto a nuove analisi, senza reinterpretare i checkpoint del job già attivo.

**Verifica prevista prima dell'attivazione:** replay offline della stessa copia; somme, identità, denominatori, provenienza, copertura delle query e possibilità di risalire agli originali devono riconciliarsi esattamente. Prove su incontri condivisi da più query, giocatori con URL lista condiviso, avversari non risolti, pareggi, liste diverse dello stesso archetipo, finestra temporale, isolamento, pausa/ripresa e invalidazione dei checkpoint. Confrontare il nuovo payload con i 872 lotti attuali; **obiettivo ingegneristico iniziale: non più di 350 foglie su questo campione**, includendo gli aggregati sostitutivi. È un obiettivo da verificare, non un limite che autorizza a scartare dati e non una previsione di chiamate totali.

La preservazione della qualità tattica richiede poi una valutazione appaiata delle risposte sullo stesso modello/effort e un budget live esplicitamente concordato. Fino a quella verifica non dichiarare non inferiorità. Modificare concorrenza o effort non è necessario per questo incremento; la consegna già in corso di APP-179–181 resta separata.

## Esito e riproducibilità

Audit APP-184 concluso. Ricostruzione del flusso e conteggi eseguiti due volte sulla stessa copia, entrambi a 872 foglie. Verificati integrità degli oggetti decompressi tramite hash, risoluzione di tutte le appartenenze alle pagine, somme per tipo e attribuzione alle query, coincidenza dei 333 checkpoint correnti e corrispondenza della lista base. Gli strumenti locali caricano soltanto il lettore dell'archivio in modalità read-only e il partizionatore puro; nessun backend applicativo o client AI è stato invocato dalla misura.

Controllo finale dei soli file di checkpoint: **362 foglie salvate della stessa generazione**, ultimo aggiornamento alle **14:14:20 Europe/Rome**. Il job ha continuato ad avanzare durante la misura; i conteggi analitici restano riferiti allo snapshot delle 13:57.

APP-185 è una proposta da rifinire/implementare dopo autorizzazione, con dipendenza dall'integrazione APP-179–181 e dal contratto degli aggregati. Il job corrente continua con il comportamento della v0.3.8. La discrepanza fra file omonimi va conservata come nota diagnostica, senza attribuirle una causa non verificata.

## APP-186 — Valutazione strategica del 30 ottobre 2026

**Giudizio:** il percorso esaminato impone un volume di lavoro AI sproporzionato per una normale richiesta di miglioramento del mazzo. La priorità raccomandata è cambiare l'unità di analisi: decisioni e fatti pertinenti, con calcoli sull'intero archivio e accesso agli originali. Le ottimizzazioni di cache, database e concorrenza restano utili, ma la prima analisi su dati nuovi deve essere sostenibile da sola.

Questa revisione riusa le misure APP-184 del 29 ottobre e controlla i sorgenti locali: non è una nuova misura del job, del pacchetto installato o della qualità della sua risposta finale. Il checkout contiene lavoro preesistente e non stabilisce lo stato attuale di altri checkout. Nessuna generazione AI dell'app o modifica del suo comportamento è stata eseguita.

### Perché il costo cresce più del valore dimostrato

1. **Acquisizione completa e lettura AI integrale sono accoppiate.** `archivedRecords()` consegna schede, liste, partecipazioni, incontri e statistiche; `analyzeLargeEvidence()` fa passare ogni record nei lotti. Nel campione sono 101.505 record e 872 foglie. Conservare dati e denominatori completi è utile; far riassumere ogni riga al modello a ogni nuova analisi è una scelta architetturale ulteriore. Parte dei conteggi è già deterministica: il flusso consegna comunque anche i dettagli individuali.
2. **La quantità recuperata non misura la pertinenza.** Sei query Evento producono il 96,98% dei byte; Dragapult domina il volume mentre la panoramica generale è respinta. Leggere tutto ciò che corrisponde a una carta non dimostra copertura equilibrata dei matchup. La finestra aprile–ottobre è quella del job osservato, non una finestra ottimale dimostrata per ogni domanda.
3. **Il costo delle foglie precede la decisione di approfondire.** Il planner ha istruzioni per cercare lacune decisive e può fermarsi. Tuttavia `runAiEvidenceQueries()` attende la sintesi prima della pianificazione successiva, e nuovi record impongono una rivalutazione. Il controllo operativo di progresso conta record aggiunti; non misura se quei record cambiano una raccomandazione. Una query troppo ampia può così costare centinaia di chiamate prima che il piano venga rivisto.
4. **La compressione non certifica la qualità.** Le foglie ricevono domanda e lotto senza lista base e vincoli espliciti; la sintesi conclusiva dei lotti arriva a un massimo di 2.400 caratteri, oltre a limiti e riferimenti. Il finale riceve anche altro contesto, ma il dettaglio del grande corpus passa attraverso questa compressione. Fonti ammesse e JSON valido non dimostrano che ogni conclusione sia supportata o che le interazioni decisive sopravvivano. Manca un confronto tattico che giustifichi il lavoro aggiuntivo.

Riscontri: `src/main/ai-analysis-work.ts:179–323`, `src/main/ai-evidence-queries.ts:261–326`, `src/main/backend.ts:1381–1435`. Il contratto in `PRODUCT.md` per APP-159 esclude un obbligo di risposta rapida; APP-161–164 e T-161/T-162 consolidano l'elaborazione estesa. Quel compromesso va riesaminato alla luce del feedback attuale, senza attribuire all'utente la scelta dei dettagli implementativi.

### Il precedente obiettivo di 350 lotti è insufficiente come criterio di prodotto

Usando soltanto come esercizio aritmetico la mediana recente di 35,896 secondi per chiamata:

| Foglie seriali | Prodotto foglie × mediana osservata |
| ---: | ---: |
| 872 | 8 ore e 42 minuti circa |
| 350 | 3 ore e 29 minuti circa |
| 190 | 1 ora e 54 minuti circa |

Non sono durate misurate, previsioni del job o prove delle alternative: la mediana proviene da 39 chiamate, payload e latenza possono cambiare e mancano sintesi, planner, revisioni e attese. Il confronto mostra comunque che accettare centinaia di chiamate seriali è incompatibile con l'obiettivo proposto di un'interazione ordinaria in pochi minuti. Il limite ≤350 di APP-185 resta una misura intermedia di riduzione dei dati, non una definizione di esperienza accettabile.

### Direzione raccomandata

- **Separare preparazione delle fonti e ragionamento sul mazzo.** All'aggiornamento dei dati, produrre viste deterministiche versionate di frequenze, distribuzioni delle quantità, varianti, risultati e denominatori. Conservare differenze tra periodi, fonti e archetipi, avversari irrisolti, eccezioni e collegamenti alle liste esatte. Le viste pubbliche riutilizzabili non devono includere contesti privati dei progetti.
- **Preparare un contesto specifico per il compito.** Una domanda su una carta richiede schede e interazioni pertinenti; una guida richiede le due strategie e le varianti rilevanti; un miglioramento generale richiede lista, vincoli, panoramica del meta, distribuzioni e alternative. Il numero di record nel database non deve determinare direttamente il numero di chiamate AI.
- **Interrogare gli originali per risolvere dubbi concreti.** Dare al modello operazioni di panoramica, confronto e approfondimento con provenienza. Ogni ulteriore ricerca deve indicare quale incertezza potrebbe cambiare la proposta. Cercare anche carte per effetti e funzione, varianti rare e controesempi; scegliere soltanto i mazzi più popolari potrebbe eliminare proprio le idee utili. La copertura aggregata e i dettagli letti dal modello vanno dichiarati separatamente.
- **Mantenere la correttezza verificabile.** Tutte le carte consigliate devono avere testi originali pertinenti; quantità, vincoli e conformità restano controlli locali. Una candidata adottabile resta completa e validata. Se manca una prova decisiva, circoscrivere la conclusione o dichiarare la lacuna. La disponibilità di nuovi dati non obbliga da sola ad ampliare la ricerca.
- **Distinguere l'uso ordinario dalla ricerca estesa.** Proporre pochi passaggi AI per il percorso ordinario e un obiettivo di pochi minuti da misurare; una ricerca estesa deve avere un risultato aggiuntivo esplicito. I budget sono criteri di progettazione e trasparenza, non autorizzazioni a presentare una risposta incompleta come esaustiva. Nessuna nuova modalità o soglia è attivata da questo audit.

La documentazione ufficiale OpenAI include riduzione delle richieste e uso di elaborazioni convenzionali fra le leve di latenza ([Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization), consultata il 30-10-2026). Questo sostiene la direzione generale, non garantisce tempi, costi o qualità nel percorso Codex dell'app.

### Priorità e verifica proporzionata

La revisione strategica raccomanda di rifinire APP-185 attorno a viste aggregate e recupero mirato, valutando separatamente la scelta iniziale di consegnare comunque tutte le 7.343 liste. Conservare e contabilizzare tutte le liste non richiede che ognuna sia riassunta dal modello. Il passaggio modifica il contratto di consegna delle evidenze: è una proposta esplicita, non una modifica già approvata di R-07/T-161/T-162. APP-179/180/181 restano investimenti utili; il nuovo percorso dovrebbe riusarli senza perfezionare preventivamente ogni aspetto dei lotti massivi. Modello, effort e concorrenza seguono la verifica dell'architettura.

Prima prova proposta: cinque casi mirati (domanda su carta, sostituzione con vincoli, miglioramento generale Toucannon, guida matchup, revisione), stessi snapshot e stesso modello/effort. Confrontare fatti decisivi e fonti dagli originali, correttezza delle candidate, utilità delle motivazioni, chiamate, token disponibili e tempo alla prima risposta utilizzabile. È una prova di fattibilità, non una dimostrazione statistica di non inferiorità; ampliare la valutazione prima di adottare il percorso generale. Un replay offline verifica esattezza e copertura degli aggregati prima di consumare quota. Nessuna campagna live avviata.

**Verifiche dell'audit:** misure JSON e rapporto APP-184 coerenti per conteggi, quota Eventi e mediana; calcoli della tabella ricontrollati; percorso seriale, punto di pianificazione, contesto delle foglie e schema delle sintesi riscontrati nel codice. La qualità finale e il vantaggio del nuovo disegno restano da provare.
