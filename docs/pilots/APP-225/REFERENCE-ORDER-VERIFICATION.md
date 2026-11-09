# Compattazione dei metadata mediante riordino dei riferimenti

04 novembre 2026, Europe/Rome. **167 chiamate v28 conteggiate,243 storiche,0/3 nuove guide valide.** APP-225 resta In progress.

L’epoca16, autorizzata entro184/232 con riserva24, termina dopo15 nuove invocazioni. L’avvio fuori dal sandbox esterno funziona per queste richieste. Il primo turno alternativo supera la critica indipendente dell’obiettivo originale; due rifiuti locali vengono corretti automaticamente e le nuove linee native sono completate. Nessun contenuto AI è modificato manualmente.128 checkpoint conservati; altri due job assenti. Processo67073 terminale exit1, archivio16 con509 file/484 input verificato.

Il blocco avviene prima dell’invio dei metadata di un singolo caso: input stimato128319 contro128000 ammessi. La riserva output è8000, il margine8192 e il totale144511 resta entro176000; la sola causa di budget è l’input. Non è un errore di quota o del servizio. Il tentativo165 non è stato acquistato. Restano17 chiamate sul primo matchup e48 riservate agli altri.

## Correzione generale

Venti configurazioni alternative delle codifiche dense esistenti non bastano. Il riordino del dizionario assegna invece gli indici più brevi ai riferimenti più frequenti, aggiornando anche i riferimenti alle basi dei delta. Conserva numeri negativi letterali, marcatori, stringhe JSON, ordine dei dati e fonti. Non introduce un nuovo protocollo: v3/v4 consentono già riferimenti ricorsivi indipendenti dall’ordine delle definizioni.

Il JSON espanso viene confrontato integralmente prima e dopo ogni riordino; una differenza interrompe la richiesta. Il pianificatore misura nuovamente i token e sceglie soltanto una codifica che rispetta gli stessi limiti. La permutazione è un fallback per richieste bloccate per dimensione con budget di chiamate/output sufficiente. Richieste già ammesse, prompt pagati e identità della cache restano invariati. Nessun fatto, ramo, audit, fonte, riesame o margine viene eliminato.

| Misura dello stesso contesto | Prima | Dopo |
| --- | ---: | ---: |
| Token visibili, schema incluso | 79247 | 76826 |
| Input stimato | 128319 | 124462 |
| Byte del prompt | 222011 | 217492 |
| Calibrazione | 1.5933849345675073 | invariata |
| Limite input | 128000 | invariato |

La parità del JSON espanso è verificata sul contesto reale completo, senza adozione manuale di output. La modifica non contiene nomi, identificativi di carte o condizioni sui matchup.

## Verifiche concluse

**663 test passati,44 esclusi**,107 file passati e37 esclusi su144; singola esecuzione, processo13255 terminale exit0,485,93 secondi, Node24 e un worker. Typecheck/build e20 mirati passano. I462 input restano identici al freeze `40a1f5a0c4b33fb4e01d1660ff2bd8175eaace5a15a86d6c562376bda75bb54a`.

Tre replay su copie passano. Crustle raggiunge soltanto `metadata-scenario-1`, conserva164 tentativi e128 checkpoint, senza ricomprare linee o critiche. Gli altri due casi, ancora senza job reali, raggiungono soltanto il piano iniziale su copie da24. Nessun provider è invocato.17 archivi, binding e byte dei chunk sono verificati, con originali invariati.

La prima esecuzione mirata non è verde: il filtro includeva copie archiviate e la fixture scelta non beneficiava del riordino. Il comando finale esclude `.verify`; quella fixture è mantenuta come caso che deve restare bloccato, affiancata da un caso indipendente comprimibile. Sono testati anche marcatori, Unicode, JSON annidato, basi dei delta, corruzione, calibrazione e limiti di chiamate. I log negativi restano conservati.

La policy è riallineata nella copia isolata v4: typecheck/build e30 test mirati passati,un test UI escluso;472 input e47 file nativi congelati. Non è una nuova suite completa della copia: la precedente suite669 appartiene alla v3 prima di questa correzione. Nessuna adozione o attivazione. Il controllo UI delle guide reali resta preparato e tipizzato,non eseguito.

## Ripresa proposta

Epoca17 pronta offline entro gli stessi184/232/riserva24:65 ulteriori massime,17 su Crustle,massimo308 storico. Minimo di ammissione corrente4,non previsione di completamento. Runner485 input, seal `38cc6ac3fb9e883cd4134ed3f8357b3864b21170a5e2fcf5ada01c132d51689c`; prepare/seal/guard/preflight/typecheck passati,grant/live assenti. Ripresa dai soli metadata, stesso job/dati pubblici/OpenAI, fuori dal sandbox esterno con isolamento interno invariato. Serve consenso specifico per riaprire lo stop;nessun aumento o garanzia di approvazione. Altri casi solo dopo una valida,stop globale al primo non valido,held-out esclusi. Defaultv27 e guardv28 conservati.

Evidenze in `.verify/app225-segments-20261102/`: `verification-reference-order.json`, `verification-epoch17-preparation.json`, `reference-order-{full-suite,targeted-final,three-replays,build}.log`, `reference-order-preservation.json`, `metadata-{budget-request-0,wire-benchmark,reference-benchmark}.json`, `verification-policy-app-v4.json` e `campaign-v28-epoch17/`.
