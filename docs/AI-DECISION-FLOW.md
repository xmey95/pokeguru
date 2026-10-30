# APP-191 — Flusso AI proporzionato alla domanda

Ramo `task/app-191-ai-decision-flow`, base dev `524b69b` (v0.3.10). Implementazione e verifica autorizzate il 30 ottobre 2026. L'integrazione e il rilascio successivamente autorizzati sono tracciati in APP-193 per la v0.3.11; questo rapporto descrive le prove APP-191. Il checkout originale e il profilo personale non sono modificati.

## Contratto

Il percorso v3 analizza tutte le liste recuperate e i relativi aggregati mediante foglie e sintesi AI. Il percorso v4 calcola le distribuzioni sull'intero filtro, poi fornisce al modello statistiche complete e poche liste esatte consultabili per pagina. Non esiste una chiamata AI obbligatoria per ogni gruppo di record.

- Le quantità per stampa, partecipazioni, liste distinte, record nel torneo e risultati contro avversari etichettati sono calcoli deterministici. I denominatori escludono bye, doppie sconfitte, esiti ignoti e invalidi; tali categorie restano visibili. I lati giocatore non sono incontri unici.
- La pagina mostra al massimo quattro liste esatte, ordinate per frequenza, con conteggi del loro utilizzo. Le carte rare restano nella distribuzione; una query per carta o pagine successive recuperano varianti pertinenti. Questo non certifica che il modello abbia valutato tutte le combinazioni.
- Ogni originale resta nello snapshot sigillato. `events.details` può recuperare tutte le partecipazioni e gli abbinamenti della lista acquisita, comprese occorrenze diverse dall'esempio. Le pagine Catalogo/Eventi sono esplicite e tracciate; profili uguali sono rappresentati una sola volta nel prompt.
- Il pianificatore collega ogni passaggio a un dubbio che può cambiare la risposta; può passare i risultati direttamente al rispondente. Massimo sei passaggi, con interruzione esplicita e prove conservate se il compito resta irrisolto.
- I testi delle carte nella lista, nelle liste esemplificative e nelle nuove bozze restano originali verificabili. Una carta nuova o modificata richiede revisione prima del salvataggio. Quantità, stampa, formato/data, vincoli, ACE SPEC e fonti restano affidati ai validatori esistenti; adozione sempre manuale.
- I nomi completi, compresi suffissi e qualificatori, evitano di confondere carte diverse nella prosa. Il piano senza nuove ricerche non riscrive già la risposta; la risposta finale è proporzionata al compito, con indicazioni di concisione che non autorizzano a omettere condizioni o prove decisive.
- Workflow v4 e `decision-evidence-v1` separano cache e algoritmo dai job v1–v3. Ripresa su snapshot originale, isolamento per job e nessuna migrazione SQLite. La cache dei profili è per job, non condivisa fra nuove analisi.

## Metodo del confronto

Due esperimenti distinti, senza equivalenza implicita:

1. **Scala locale:** lettura in sola lettura della copia del job reale già auditato. Quattro ricerche sull'archivio completo; riconciliazione indipendente di ogni frequenza e quantità con le righe originali. Nessuna invocazione AI.
2. **Cinque casi live:** stessa lista Toucannon, Catalogo congelato, data 29 ottobre 2026 e 32 partecipazioni reali (prime 16 Toucannon e 16 Dragapult nell'ordine stabile dello snapshot). Vecchio workflow v3 contro v4; `gpt-6.1-sol`, effort automatico in entrambi. Prima una coppia per caso, alternando l'ordine delle varianti; poi una ripetizione di tutti i cinque casi v4 dopo la correzione descritta sotto, conservando il baseline e ogni risultato iniziale. Nessuna selezione della risposta più veloce. Meta e guida precedente sono fixture dichiarate, identiche per le due versioni. Il campione non è rappresentativo del metagame.

Prompt di produzione, raccolta, controllo della consegna delle carte, parser e validatori reali. Il turno finale usa CLI effimera in entrambi i bracci: non misura l'eventuale vantaggio della sessione persistente della UI. Tempi complessivi dal setup del job locale al risultato verificato, con dettaglio delle chiamate; non includono la preparazione iniziale del campione o una sincronizzazione di rete. Cache del provider e carico remoto possono variare. Nessuna prova di forza competitiva o garanzia statistica di qualità universale.

I payload, le risposte e le impronte restano in `.verify`, esclusi da Git. Le metriche pubblicabili omettono liste, persone, URL torneo, identificativi e prompt. Un pilot interrotto per un errore del runner non conta come confronto appaiato; le sue chiamate restano conservate separatamente. L'invio del campione a Codex e il consumo di quota sono stati autorizzati esplicitamente dopo il blocco iniziale della revisione automatica.

## Criteri di qualità

| Caso | Verifiche sul contenuto oltre al JSON valido |
| --- | --- |
| Domanda su carta | Budew senza Energia, 10 danni, blocco dei soli Item dalla mano nel prossimo turno avversario; Judge consentito, Unfair Stamp bloccato. |
| Sostituzione con vincoli | Una sola Hassel sostituita da Judge; 60 carte, quattro Toucannon della stampa vincolata, Legacy Energy unica ACE SPEC; compromesso corretto fra rinnovo mano e selezione condizionata di Hassel. |
| Miglioramento generale | Candidata completa e valida, motivi legati a meccaniche/fonti, vincoli mantenuti, campione e lacune dichiarati, nessun winrate inventato. |
| Guida matchup | Apertura/sviluppo/chiusura concreti; distinzione danni/segnalini, panchina/attivo, attacchi/abilità; premi e protezioni coerenti con le schede. |
| Revisione | Correzione esplicita della premessa falsa: Battle Cage non protegge l'Attivo né blocca i danni; confronto corretto con Mist Energy e piano aggiornato. |

Una candidata respinta dal validatore non passa la prova solo perché il testo è plausibile. Un miglioramento di tempo con errore tattico decisivo non è accettato come successo.

## Risultati

Il nuovo procedimento riduce il tempo totale osservato da **20 minuti e 44 secondi a 3 minuti e 47 secondi (−81,79%)**, con **46 → 12 chiamate**. Le sintesi preliminari passano da 31 a zero. È più veloce in quattro casi su cinque; il vantaggio sulla domanda puntuale non è dimostrato. [Metriche complete, incluse le prime misure](AI-DECISION-METRICS.json).

| Caso | v3 | Prima v4 | v4 finale | Chiamate v3 → finale |
| --- | ---: | ---: | ---: | ---: |
| Domanda su carta | 19,1 s | 24,5 s | 21,7 s | 2 → 2 |
| Sostituzione con vincoli | 147,3 s | 22,8 s | 21,0 s | 7 → 2 |
| Miglioramento generale | 570,7 s | 61,0 s | 84,0 s | 22 → 4 |
| Guida matchup | 433,0 s | 79,4 s | 48,6 s | 13 → 2 |
| Revisione | 73,8 s | 137,3 s | 51,2 s | 2 → 2 |

La prima revisione v4 abbreviava «Fezandipiti ex» in «Fezandipiti»: il controllo cercava correttamente la diversa carta senza suffisso (`sv06-096`) e richiedeva un secondo turno finale. La correzione richiede nomi completi e risposte proporzionate, senza modificare riconoscimento, originali o validatori. La ripetizione non ha richiesto questa revisione aggiuntiva. Il miglioramento generale finale ha invece svolto una ricerca in più rispetto alla prima v4: si conserva la misura più lenta di 84 secondi perché appartiene al codice finale. Questo mostra la variabilità del percorso scelto dal modello.

Input dichiarato dal provider: 1.157.118 → 544.205 token; output: 41.318 → 6.124. I token di input includono quelli in cache (224.000 e 18.688 rispettivamente): non sono una misura monetaria né una stima della quota dell'abbonamento. Le misure finali riusano il baseline già completato e non costituiscono una seconda campagna appaiata indipendente.

## Qualità e controlli

I criteri principali della tabella sono stati verificati manualmente contro le schede congelate, oltre ai parser e validatori di produzione:

- **Carta:** costo vuoto e 10 danni di Budew, destinatario/durata del blocco, Judge consentito e Unfair Stamp vietato corretti in entrambe le versioni.
- **Sostituzione:** entrambe producono lo stesso cambiamento, 3 Hassel e 1 Judge, con il resto invariato; 60 carte, 4 Toucannon della stampa vincolata e Legacy Energy unica ACE SPEC. Il compromesso descritto è coerente con le schede.
- **Generale:** le candidate differiscono, ma entrambe sono complete e superano i controlli. Hilda, Trumbeak e Brave Bangle della versione finale hanno funzioni coerenti con le schede; 260/290 danni non vengono dichiarati sufficienti contro 320 PS. Verificati indipendentemente anche 16 partecipazioni/15 liste Toucannon e Budew presente in tutte le 16 partecipazioni Dragapult. Alternative e frequenze non sono presentate come prova di efficacia.
- **Guida e revisione:** distinzione corretta fra Panchina/Attivo, danni/segnalini e attacchi/Abilità; Battle Cage e Mist Energy non impediscono i 200 danni all'Attivo. Soglie di KO e Premi coerenti; la premessa falsa dell'utente viene respinta. Nessun winrate inventato.

Non emerge una regressione sostanziale sui criteri controllati. Questo non equivale a risposte perfette: nella revisione resta la formula ambigua «dopo un KO avversario» per Hassel, presente anche nel baseline; la condizione precisa è un nostro Pokémon messo KO durante il turno precedente dell'avversario. La qualità linguistica delle condizioni e il riconoscimento delle abbreviazioni richiedono attenzione anche oltre questo campione. Nessuna prova di maggiore forza competitiva.

Le sonde locali sulla lista reale rifiutano separatamente: 61 carte; 60 carte con violazione del vincolo esatto; 60 carte con due ACE SPEC; stampa sconosciuta; fonte inventata. I test controllano anche consegna delle carte nuove/cambiate, ambiguità dei giocatori, esiti contraddittori, pagine distinte, originali oltre l'esempio, fonti dei dettagli, isolamento e ripresa. **387 test passati, 50 opzionali esclusi**, typecheck comprendente il runner, build e due prove Electron offline passati. Le prove desktop non sono dichiarate generazioni AI reali: queste ultime appartengono al runner separato.

## Scala dell'archivio completo

La riconciliazione sull'archivio completo è riuscita:

| Filtro | Partecipazioni | Liste distinte | Righe stampa distinte | Profilo con 4 esempi | Calcolo locale |
| --- | ---: | ---: | ---: | ---: | ---: |
| Toucannon | 756 | 462 | 252 | 75.896 byte | 16,4 s |
| Dragapult ex | 12.726 | 5.697 | 478 | 117.286 byte | 26,8 s |
| Raging Bolt ex | 2.699 | 1.150 | 236 | 103.897 byte | 24,9 s |
| Gardevoir ex | 64 | 62 | 201 | 32.233 byte | 25,2 s |

Sono durate di materializzazione, senza cattura iniziale dello snapshot né generazione AI. La scansione dell'indice giocatori è ancora un costo locale rilevante e si ripete fra profili; le pagine dello stesso profilo riusano la materializzazione. I conteggi sovrapposti non sono additivi.

La verifica locale degli originali e delle frequenze sul corpus completo non dimostra che una generazione live su tutto quel corpus impieghi i tempi del campione da 32 partecipazioni. Resta inoltre da ridurre il percorso obbligatorio di pianificazione per le domande puntuali: il confronto attuale misura ancora due chiamate e circa 22 secondi. Non si dichiara raggiunto un miglioramento uniforme su tutti i compiti.

## Riproduzione

Node 24; controlli ordinari `npm test -- --maxWorkers=2 --testTimeout=15000`, `npm run build`, test Electron offline in profilo temporaneo. Il runner opt-in è `scripts/ai-decision-evaluation.test.ts`, eseguito esplicitamente con Vitest e `POKEGURU_DECISION_EVAL` impostato a `prepare`, `preflight`, `scale` o `live`. `prepare` e `scale` richiedono percorso e job della copia privata via `POKEGURU_DECISION_SNAPSHOT` e `POKEGURU_DECISION_JOB`; il database si apre in sola lettura. `live` richiede accesso Codex e autorizzazione al payload/quota; riusa i confronti già completati con la stessa impronta. I dati privati non sono inclusi nel repository. `POKEGURU_DECISION_CASE` e `POKEGURU_DECISION_VARIANT` limitano una ripresa; nessuna prova live parte dalla suite ordinaria.
