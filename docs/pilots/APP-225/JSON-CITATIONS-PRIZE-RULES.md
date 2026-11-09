# APP-232 — Citazioni JSON e fonti delle regole dei Premi

Incremento offline del 05-11-2026 dopo la [campagna v8](FINITE-CAMPAIGN-V8.md). Correzione generale, senza nuovi invii AI né modifiche manuali ai contenuti delle guide. La contabilità resta **354 v28 / 430 storiche / 0 nuove guide valide**, con tetti **500 cumulativi per guida / 1.500 nel ciclo / riserva 24 per ciascuna successiva**.

## Citazioni e riesami storici

Il nuovo lettore accetta una sottostringa esatta di un singolo valore stringa del JSON originale, oltre alle citazioni raw già ammesse. Gestisce gli escape JSON di a capo, virgolette, barre e Unicode. Non normalizza spazi o caratteri, non unisce campi e non interpreta ricorsivamente come JSON un testo già decodificato. Identità, tipo e corpo della fonte restano vincolati; valore numerico, contesto, inventario, applicabilità e gate completi mantengono i controlli precedenti.

Il critico quantitativo usa il protocollo **4**. I lettori storici 1/2/3 conservano la loro interpretazione originale, compreso il rifiuto delle citazioni JSON nel protocollo 3. Un raw storico respinto viene prima autenticato e il rifiuto riprodotto, poi riletto integralmente con la nuova semantica delle citazioni. Il riferimento `revalidatedAs:4` documenta questa interpretazione senza riscrivere il raw o cambiarne lo stato di trasporto.

I due riesami reali della v8 restano `revise`: la correzione del falso positivo non cancella il loro rilievo sulla fonte dei Premi. La riparazione riceve anche entrambe le risposte respinte come diagnostiche non verificate. I limiti di due risposte di formato e due negativi di contenuto non si azzerano cambiando versione. Risposte con citazioni inventate o valori errati continuano a bloccare il processo.

## Fonti ufficiali dei Premi

Il bundle locale `prize-evidence-2026-11-05.1` conserva tre estratti brevi, con URL, sezione, ambito, data di verifica e impronta. Sono fonti di gioco distinte dal pacchetto di ammissione Standard:

- Il [regolamento ufficiale, pagina 14](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/par_rulebook_en.pdf) documenta il Premio ordinario e il suo trasferimento nella mano del giocatore.
- L'[appendice 1 del regolamento ufficiale](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/rulebook/pal_rulebook_en.pdf) documenta i due Premi dei moderni Pokémon ex.
- Il [comunicato ufficiale della nuova serie Mega Evolution del 26 settembre 2025](https://press.pokemon.com/en/Mighty-Mega-Evolution-Pokemon-Return-in-Pokemon-Trading-Card-Game-Mega) documenta i tre Premi dei moderni Mega Evolution Pokémon ex.

Gli estratti dei regolamenti sono stati verificati nel testo indicizzato della fonte ufficiale; non si dichiara acquisito o verificato l'intero PDF. Il comunicato è stato consultato direttamente. La copia locale riguarda soltanto queste regole base: altre Rule Box, vecchi Mega Pokémon-EX, Pokémon TCG Pocket e modificatori richiedono evidenze proprie. Il bundle non assegna Premi automaticamente e non prova un KO, una promozione, il timing o una vittoria. Per richieste anteriori alla finestra del bundle, iniziata il 26 settembre 2025, questi estratti non vengono inseriti automaticamente.

I nuovi packet finiti includono le fonti sin dall'inizio. Nei job esistenti vengono aggiunte alla biblioteca completa con una transazione append-only verificata: lista, stock, packet nativo, scope e fonti pagate restano intatti. Sono ammesse soltanto le fonti di regole curate esatte; una fonte con lo stesso ID ma corpo, URL o metadati diversi viene respinta.

Il critico quantitativo corrente e le nuove critiche anticipate ricevono le fonti vincolate nel proprio contesto. I nuovi negativi possono fornirle alla riparazione; gli input delle riparazioni storiche già pagate conservano invece contenuto e ordine delle proprietà. Anche le critiche complete e la guida finale mantengono le fonti nella biblioteca completa. Aggiungerle non trasferisce pass né risolve automaticamente un vecchio finding.

## Persistenza e prestazioni

Gli originali portabili delle nuove guide finite conservano anche l'ancora completa delle evidenze. Il lettore verifica che il packet nativo sia la proiezione originale di quell'ancora e che le fonti finali siano un'estensione autorizzata. Il nuovo hash della biblioteca completa può così convivere con lo scope nativo originale, senza allentare identità di lista, fonti o ricevute. Le guide storiche prive dell'ancora conservano il controllo precedente di uguaglianza delle basi. I test respingono ancore o scope alterati e la rimozione dell'ancora da una guida estesa.

Per contenere il tempo di ripresa, il riesame riutilizza i descrittori già autenticati nella singola operazione sincrona. Ogni invocazione ricontrolla tutti i descrittori, esiti e ricevute; non esiste una nuova cache di integrità tra scritture o riaperture. I controlli sui byte compressi dell'archivio non sono stati modificati. Sono state eliminate anche copie ripetute del packet durante la lettura delle annotazioni.

## Verifica offline della ripresa

Due riaperture della stessa copia della v8 raggiungono **la riparazione dell'audit del secondo turno**, non una riparazione storica già pagata. Il riferimento negativo punta all'ultimo raw del critico della v8, reinterpretato con versione 4. Il confronto verifica:

- Tutti gli output AI originali e i loro rifiuti sono identici; nessun nuovo output o critico acquistato.
- I cinque pass quantitativi precedenti e le 19 fonti dei quadri/eventi sono conservati.
- Entrambi i raw respinti e le tre fonti ufficiali arrivano al feedback della riparazione.
- L'ancora nativa e l'identità del job restano invariate; la sola nuova estensione contiene le fonti ufficiali.

Il runner viene interrotto prima del provider, senza risposte sintetiche. Le due nuove registrazioni di avvio appartengono soltanto alla copia e non consumano budget reale. I due altri profili usano nuovi job nelle copie, con packet iniziali che contengono già le tre fonti ufficiali e richieste dei rispettivi matchup.

| Profilo | Primo ingresso | Riapertura | Picco RSS |
|---|---:|---:|---:|
| Crustle–N's Zoroark, ripresa | 11,433 s | 9,829 s | 564,7 MiB |
| Alakazam/Dudunsparce–Basic Box, ingresso freddo | 0,601 s | 0,046 s | 325,2 MiB |
| Dhelmise–Lucario/Hariyama, ingresso freddo | 1,324 s | 0,236 s | 358,6 MiB |

Tutti entro le soglie invariate di 60 s / 10 s / 768 MiB. Sono misure di questa esecuzione; il margine della riapertura Crustle è ridotto. Non dimostrano la qualità AI o il successo di una guida.

**526 test distinti passati, 1 esclusione storica, 51 file; typecheck e build passati.** La suite estesa ha prodotto 524 pass e due timeout nei percorsi storici di riparazione finale e ripresa con evidenze aggiunte. I due casi sono passati isolati, in sequenza, con gli stessi limiti di 90 e 60 secondi e senza modifiche al codice. I report originali sono conservati; l’aggregazione sostituisce soltanto i due casi effettivamente rieseguiti, per file/nome/ordinale, senza contare i test filtrati o duplicare i pass. Non è una suite completa dell’intero repository né una prova di qualità AI. Una precedente esecuzione parziale, interrotta dopo aver individuato il difetto negli originali portabili poi corretto, non entra nel conteggio.

Archivio v8 di **892 file** intatto; tre database equivalenti ai backup per schema e **39 tabelle**, seed v7 intatti. Rispetto agli 870 input congelati: **16 modifiche intenzionali, 5 nuovi file source/test, 854 input precedenti invariati**. Sono improntati **540 file source/test**. Nessun routing dipende da nomi, ID o risultati dei tre matchup; le regole Mega sono una categoria di gioco, non un'eccezione per un esempio.

Evidenze in `.verify/app225-segments-20261102/`: `verification-app232-json-rules.json`, `app232-json-rules-integrity.json`, `app232-json-rules-recovery-proof.json`, i tre profili `app232-json-rules-recovery.json` / `app232-json-rules-cold-{1,2}.json`, `app232-json-rules-sizing.json` e `app232-json-rules-budget.json`. I report dei test e la ricevuta build sono in `.verify/app232-json-rules-*.json`.

## Budget prima di nuovi invii

Residui reali **146 / 500 / 500**, pool **1.146**. Lo stesso job Crustle conserva **60 tentativi su 206**, con altre 294 chiamate della guida già conteggiate. I **334 campioni reali** restano tutti presenti; fattore conservativo **1,5933849345675073**, calibrazione e scaling invariati.

La prossima riparazione nota richiede **74.640 input stimati / 24.000 output riservati / 8.192 margine**, con **25 altre chiamate riservate**, quindi soglia d'ingresso **26**. Le 145 residue del profilo caldo appartengono alla copia dopo il primo avvio intercettato: il conto reale rimane 146. I due ingressi freddi richiedono **59** chiamate disponibili ciascuno. Sono soglie d'ingresso, non previsioni di completamento.

Il critico 4 è stato dimensionato sul testo originale e su tutti gli arricchimenti dell'host, con gli stessi normalizzatori e compattazione reversibile: **95.115 input / 50.000 output / 8.192 margine**, totale **153.307**, entro i limiti attuali. Il testo riparato dall'AI resta sconosciuto: ogni richiesta futura sarà dimensionata di nuovo, suddivisa se consentito o fermata prima dell'invio. Nessuna prova viene troncata per farla entrare.

Riferimenti seriali condizionali: ripresa `18+3M+N+e*(M-2)`; freddo `25+6H+3M+N+e*M`, con `H=7`, `M=6+4R`, `N=2+2R`. Considerano primo turno completo, quadro/nove eventi/dichiarazione del secondo già pagati, cinque pass conservati e una riparazione con nuovo critico ancora necessari. I retry già consumati restano nella baseline reale.

| R | e | Ripresa Crustle | Ciascuna fredda | Pool delle tre | Entro 146 per Crustle |
|---|---|---:|---:|---:|---|
| 2 | 3 | 102 | 157 | 416 | sì |
| 2 | 5 | 126 | 185 | 496 | sì |
| 4 | 3 | 154 | 209 | 572 | no |
| 4 | 5 | 194 | 253 | 700 | no |

Sono esclusi nuovi retry, rilievi semantici, ricostruzioni, partizioni aggiuntive e riscritture della prosa. Il limite del primo matchup può impedire il completamento anche con spazio nel pool; nessun aumento automatico o garanzia di approvazione.

## Stato della consegna

Nessuna campagna nuova o riaperta, nessun grant creato, zero nuove chiamate reali. L'istruzione corrente termina prima di ulteriori invii. Una futura ripresa richiederà preparazione congelata aggiornata e istruzione esplicita, con la stessa contabilità, altri matchup soltanto dopo una valida e stop globale al primo esito non valido. Held-out esclusi; default v27, guard v28 e policy applicativa isolata invariati.

APP-232 resta In progress, APP-225 Blocked. Restano da ottenere tre guide reali valide, verificarne persistenza/UI e generalità, calibrare/adottare la policy e consegnare la build finale da provare. L'obiettivo complessivo resta incompleto.
