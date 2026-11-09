# APP-217 — Audit finale, 1 novembre 2026

**Tre guide valide su tre, 58 invocazioni effettive su 59 autorizzate.** Nessun contenuto AI corretto manualmente e nessun controllo disabilitato. Il motore si è fermato appena Festival ha superato il riesame, lasciando una chiamata inutilizzata. Stessi job, liste e fonti congelate; le successive autorizzazioni dell’utente sostituiscono il primo limite di otto.

| Matchup | Chiamate | Capitoli / parole | Scenari | Esercizi |
| --- | ---: | ---: | ---: | ---: |
| Toucannon–Dragapult | 19 | 8 / 3131 | 2 | 3 |
| Toucannon–Festival | 28 | 8 / 2865 | 2 | 2 |
| Dragapult–Hydrapple | 11 | 8 / 2905 | 2 | 4 |

Le parole contano solo il corpo degli otto capitoli. Gli scenari, gli esercizi e le fonti sono aggiuntivi. I massimi autorizzati sono 19/29/11, totale 59; non sono i default dell’app.

## Verifica del risultato richiesto

| Requisito | Evidenza e portata |
| --- | --- |
| Tre guide valide e personalizzate | Riesami finali positivi senza finding, pacchetti con la nostra lista esatta e una lista avversaria selezionata; nessuna fusione delle quantità. |
| Autonomia senza modifiche manuali dei contenuti | Riparazioni AI archiviate e applicate atomicamente agli originali vincolati agli hash; sei audit postlive, ricostruzione dei registri e salvataggio solo dopo critica positiva. Sono state corrette le implementazioni tra le fasi della campagna. |
| Controlli e scaling conservati | Contabilità, regole e audit tattici, critiche prima della prosa, dipendenze, riserve e riesame finale mantenuti. Il pianificatore conserva tetti e margini e misura il prompt completo con schema. |
| Budget rispettato | Contatori persistiti e autorizzazioni per singola invocazione: 19/28/11, totale 58; nessun nuovo job o azzeramento. |
| Persistenza e integrità | Le tre guide vengono rilette da copie SQLite riaperte, attraverso contratto condiviso, controlli main e isolamento fra progetti, anche col codice finale. Due originali nativi per Toucannon–Dragapult e Festival; Hydrapple storica senza originali resta leggibile, senza backfill. |
| UI delle tre guide | Electron/IPC/SQLite reali su profili isolati, 1440/1280/640 pixel, indice, esercizi, bozza e storico legacy; zero errori renderer/overflow, schermate ispezionate. Solo il recupero pubblico del Meta è congelato nel banco di prova. |
| Codice generale e casi estranei | Audit AST, istruzioni generiche versionate, sette ricostruzioni metamorfiche, fixture indipendenti per budget, riparazioni, isolamento e percorso completo v25. Le fixture usano modello/critico simulati, non costituiscono nuove prove AI reali. |

## Ultime riparazioni e compattazione

Dopo la chiamata 23, Festival corregge automaticamente la scelta della copia esposta, una ricerca con bersaglio del tipo non ammesso e un attacco omesso negli audit di quattro rami. Tutti i rilievi restano bloccanti fino alla correzione. La riparazione 27 supera i controlli locali; il riesame 28 è positivo e revalida esplicitamente le dipendenze invariate interessate. Nessuna bozza respinta viene pubblicata.

Il retry dopo la chiamata 26 si arresta prima dell’invio: 128413 token di input stimati contro il tetto invariato di 128000. Il messaggio di errore include una grande tabella JSON come testo. Il codec opzionale `pg-json-dag-4` permette di condividere i frammenti JSON canonici all’interno del messaggio, preservando prefisso, suffisso e ordine. Hash e roundtrip obbligatorio verificano l’intero dato originale; testo non canonico o malformato resta letterale.

Il replay su copia scende a 123015 token senza perdere errore, risposta o dati, con un riesame riservato. Il pianificatore confronta tutti i formati sul prompt completo con schema; nessuna calibrazione, riserva o soglia viene allentata. La chiamata reale 27 verifica anche questo nuovo formato.

## Generalità e compatibilità

I nuovi job usano `matchup-guide-25`. Gli esempi nominativi del pilota vengono sostituiti da controlli generici su Premi, attacchi multipli, Debolezza/Resistenza, assegnazioni, filtri di ricerca e scelta fra copie con risorse diverse. Le dodici fasi misurate non contengono quei nomi. Per la ripresa storica, i 168 hash dei percorsi v11–24 rimangono identici e le guide reali v24 non vengono riscritte.

L’audit AST esamina 35 moduli runtime e 1249 condizioni, confrontandoli con 102 identificativi e 86 nomi di carte del pilota: zero printId letterali del pilota e zero confronti specifici nei predicati. Non è una prova di ogni possibile equivalenza semantica.

Sette stati storici con identificativi rinominati vengono ricostruiti integralmente. Una fixture completa con carte sintetiche indipendenti percorre v25, riparazione nativa, riesame e pubblicazione; manomissioni dello stato e audit mancanti restano respinti. Altre fixture coprono autorizzazioni persistite, scope, JSON Pointer, contesti senza perdita e isolamento. Il codice finale passa **485 test**, con 44 esterni esclusi, typecheck e build. Le tre guide reali superano nuovamente persistenza e UI con questa build.

Nove archivi immutabili e 585 copie storiche di codice verificati tramite hash; il manifest finale conserva 74 file. Gli archivi mantengono anche i fallimenti, i dati grezzi e le autorizzazioni delle singole fasi.

## Valutazione e limiti

La struttura è riutilizzabile su liste e matchup diversi: non dipende da rami eseguibili o esempi nominativi del pilota nei nuovi prompt. Le prove strutturali indipendenti supportano questa conclusione. **Non è dimostrata la convergenza su ogni archetipo, né entro le 16 chiamate ordinarie.** Due casi della campagna richiedono più di 16 invocazioni. Non sono state eseguite campagne AI su archetipi estranei o con i nuovi prompt v25: la prova reale riguarda v24 e le tre coppie autorizzate.

Il registro non è un simulatore completo. Il confronto ottimale fra copie della stessa stampa con Energie o danni diversi resta in parte affidato al critico; i nuovi prompt lo richiedono esplicitamente, senza fingere una prova deterministica completa. La validità significa superamento dei controlli e del riesame, non certificazione di forza competitiva o copertura di ogni timing. Gli identificativi tecnici presenti nella prosa storica restano un limite editoriale: nessuna modifica manuale dei contenuti salvati.

Nell’app il ciclo è automatico fino a validità o arresto. Il default dei nuovi job v24/v25 resta 16 invocazioni complessive, otto per v1–23. Consumo e motivo del blocco sono visibili; la quota del servizio rimane distinta dai token della singola richiesta. Se il budget non basta conserva lavoro e ultima guida valida. Scelta e aumento del budget dalla UI sono **APP-218 Backlog**, non implementati.

APP-217 è completata nel checkout. Nessuna release, installazione, merge o modifica del profilo personale. L’ultima chiamata autorizzata non viene usata perché le tre guide sono valide.

## Evidenze consultabili

- [Metriche nel repository](METRICS.json).
- [Guide complete e rilievi originali](../../../.verify/app217-autonomous-20261031/report.html).
- [Audit finale e dati delle tre guide](../../../.verify/app217-autonomous-20261031/final-audit.json).
- [Manifest del codice finale](../../../.verify/app217-autonomous-20261031/frozen-code-final.json).
- [Archivio immutabile della validazione finale](../../../.verify/app217-autonomous-20261031/epoch9/archive.json).
- [Confronto dei prompt v24/v25](../../../.verify/app217-autonomous-20261031/prompt-generality-audit.json).
- [Audit AST](../../../.verify/app217-autonomous-20261031/generality-branches.json).
- [Rilettura delle tre guide col codice finale](../../../.verify/app217-autonomous-20261031/final-readback.json).
