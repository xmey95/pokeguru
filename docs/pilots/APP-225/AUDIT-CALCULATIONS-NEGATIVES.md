# APP-232 — Calcoli e riesami negativi degli audit

Verifica offline del 05-11-2026, successiva alla [campagna v7](FINITE-CAMPAIGN-V7.md). Nessuna nuova chiamata reale, nessun contenuto AI corretto manualmente. Restano **339 chiamate v28 / 415 storiche / 0 nuove guide valide**. APP-232 resta In progress; APP-225 Blocked e consegna finale incompleta.

## Contratto generale

Il protocollo quantitativo 3 rappresenta i risultati aritmetici con un programma di massimo otto operazioni binarie. Gli operandi devono provenire da inventari nelle finestre ammesse, misure stampate, fatti del turno, citazioni numeriche originali oppure risultati precedenti. Non esistono costanti numeriche libere. Il lettore ricalcola ogni passo e respinge riferimenti futuri, citazioni inventate, saldi errati, divisioni per zero, frazioni e risultati fuori limite. Nessun identificativo di mazzo, carta, matchup o risultato del pilota governa questa logica.

Un calcolo prova l'aritmetica, non l'applicabilità di un effetto, una disponibilità di carte o una regola. Restano il riesame semantico indipendente e i gate completi di gioco, registro, costi, finestre, lati e destinatari. Una quantità non comprovata ha una classificazione esplicita `unproven`: richiede un negativo e un rilievo; non può produrre un pass né essere riclassificata come qualitativa per aggirare un numerale.

Ogni target problematico ha un solo finding, con citazione identica all'intero testo assegnato; la riserva output include questa lunghezza. Il motivo riassume i problemi e le annotazioni mantengono i dettagli. Le verifiche positive implicite rientrano nella lettura completa, senza diventare rilievi che impediscono il pass.

Il pacchetto `rules` attuale documenta ammissione Standard, rotazioni ed errata: non contiene automaticamente le regole ordinarie dei Premi. Questa correzione non aggiunge né inventa prove mancanti. Un'affermazione di regola ancora priva di fonte resta un problema legittimo, da risolvere prima di approvare il testo.

## Negativi storici e ripresa

I protocolli 1 e 2 conservano lettori, identità e originali. Un vecchio `revise` respinto può essere interpretato **soltanto come richiesta di riparazione**, con riferimento `negativeOnlyAs:3`, dopo autenticazione del trasporto, del ruolo indipendente, del contesto e della copertura completa. Serve almeno un finding letterale nel testo assegnato. Le sue annotazioni non certificate non diventano prove positive e il raw resta respinto e immutato.

Per lo stesso testo/registro/pacchetto la riparazione riceve tutte le risposte storiche respinte, ordinate e marcate come feedback non verificato. Non si perde il dettaglio dell'ultimo retry. Due errori di formato condividono ancora il limite fra versioni: nessun terzo critico ottenuto azzerando il contatore. Restano anche il limite dei due negativi di contenuto e i controlli sulle fonti eliminate o alterate.

Sul database v7 copiato il primo negativo (chiamata 44) è autenticabile in questa vista. Il secondo (45) conserva classificazioni non ammissibili anche per la vista negativa: rimane feedback non verificato, senza approvazione. Entrambi i raw originali e tutti gli esiti di trasporto sono identici agli originali reali.

Due riaperture della medesima copia raggiungono `segments-finite-audits`, la sola riparazione degli audit. Nessun nuovo critico, output AI o risposta sintetica: il runner viene arrestato prima del provider. Restano quattro pass quantitativi precedenti, quadro e otto dichiarazioni evento, tutti dalle fonti pagate. Non è ancora un turno principale completo né una guida valida.

## Verifiche

**513 test distinti passati, 1 esclusione storica, 48 file; typecheck e build passati.** La regressione estesa comprende quantità, migrazione, riparazioni, persistenza, ripresa, limiti, registro e generazione finita. Dopo l'ultima modifica al feedback sono stati ripetuti i quattro file pertinenti (59 test), senza doppio conteggio: l'aggregazione sostituisce per file/nome/ordinale dell'occorrenza. Non è una nuova suite completa dell'intero repository né una prova della qualità AI.

| Profilo su copia | Primo ingresso | Riapertura | Picco RSS |
|---|---:|---:|---:|
| Crustle–N's Zoroark, ripresa reale | 8,772 s | 7,516 s | 574,2 MiB |
| Alakazam/Dudunsparce–Basic Box, nuovo job offline | 0,628 s | 0,044 s | 340,8 MiB |
| Dhelmise–Lucario/Hariyama, nuovo job offline | 1,796 s | 0,242 s | 375,3 MiB |

Tutti entro i limiti invariati di 60 s / 10 s / 768 MiB. I nuovi job dei due ingressi esistono soltanto nelle copie e conservano le richieste dei rispettivi matchup. Nessun pass sintetico usato per questa verifica.

Archivio v7 di **886 file** intatto; tre database equivalenti ai backup per schema e **39 tabelle**, seed v6 intatti. Rispetto agli 864 input congelati sono modificati intenzionalmente cinque file e aggiunti due moduli source/test; gli altri **859 input restano invariati**. Sono improntati **535 file source/test**. Nessun cambiamento a default v27, guard v28, limiti, calibrazione o policy applicativa isolata.

Evidenze in `.verify/app225-segments-20261102/`: `verification-app232-audit-v3.json`, `app232-audit-v3-recovery-proof.json`, i tre profili `app232-audit-v3-recovery.json` / `app232-audit-v3-cold-{1,2}.json`, `app232-audit-v3-sizing.json` e `app232-audit-v3-budget.json`. I due report Vitest e la ricevuta build sono in `.verify/app232-audit-v3-*.json`.

## Budget prima di nuovi invii

Tetti invariati: **500 cumulativi per guida / 1.500 nel ciclo / 24 riservate per ciascuna successiva**. Residui reali **161 / 500 / 500**, pool **1.161**. Lo stesso job Crustle conserva **45 tentativi su 206**, con altre 294 chiamate precedenti della guida già conteggiate. I **319 campioni reali** mantengono fattore conservativo **1,5933849345675073**; nessun campione escluso o sintetico aggiunto.

Il prossimo invio noto è la riparazione degli audit: **72.041 token input stimati**, output riservato **24.000**, margine **8.192**, riserva **28 altre chiamate**, soglia d'ingresso **29**. Il profilo caldo indica 160 residue perché la prima intercettazione ha registrato un avvio nella sola copia: il conto reale resta 161. Gli ingressi freddi degli altri matchup prenotano **59** chiamate disponibili ciascuno. Queste sono soglie, non costi di completamento.

Il critico 3 è stato dimensionato anche sul testo originale e sul contesto completo arricchito dall'host, con gli stessi normalizzatori e compattazione reversibile: **85.201 input / 50.000 output / 8.192 margine**, totale **143.393**, entro il limite attuale. Il testo che l'AI riparerà resta sconosciuto: le richieste future verranno dimensionate di nuovo, suddivise quando consentito oppure fermate prima dell'invio. Nessun troncamento o allentamento dei controlli.

Riferimenti seriali condizionali: ripresa `21+3M+N+e*(M-1)`; freddo `25+6H+3M+N+e*M`, con `H=7`, `M=6+4R`, `N=2+2R`. Rispetto al riferimento precedente sono già pagati il quadro, gli otto eventi e la dichiarazione del primo turno; si considera una riparazione dell'audit e resta necessario il suo critico. Le quattro revisioni quantitative precedenti sono riutilizzate.

| R | e | Ripresa Crustle | Ciascuna fredda | Pool delle tre | Entro 161 per Crustle |
|---|---|---:|---:|---:|---|
| 2 | 3 | 108 | 157 | 422 | sì |
| 2 | 5 | 134 | 185 | 504 | sì |
| 4 | 3 | 160 | 209 | 578 | sì, una sola di margine |
| 4 | 5 | 202 | 253 | 708 | no |

Questi riferimenti escludono retry, ulteriori rilievi semantici, ricostruzioni, partizioni aggiuntive e riscritture della prosa. Non garantiscono successo o capienza futura: il limite del primo matchup può restare vincolante anche con pool complessivo ampio. Nessun aumento automatico.

## Stato della consegna

Correzione e verifica offline concluse; nessuna campagna nuova o riaperta, nessun grant creato. L'istruzione corrente termina prima di nuove chiamate reali. La futura ripresa richiede preparazione congelata aggiornata e istruzione esplicita, mantenendo contabilità e stop globale al primo esito non valido. Altri matchup solo dopo una guida valida; held-out esclusi.

Restano da dimostrare tre guide reali valide, persistenza/UI e generalità, poi calibrazione/adozione della policy e build finale da provare. L'obiettivo complessivo non è completato.
