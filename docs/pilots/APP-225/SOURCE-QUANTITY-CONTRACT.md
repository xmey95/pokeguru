# Quantità nelle fonti del critico: correzione generale e ripresa offline

5 novembre 2026, APP-232; APP-225 e l’obiettivo completo restano aperti.

La [campagna v6](FINITE-CAMPAIGN-V6.md) è terminata dopo **7 nuove chiamate e 0/3 guide valide**. Lo stop globale ha impedito di avviare gli altri matchup. La correzione successiva è offline: nessun nuovo invio a OpenAI, nessuna modifica manuale ai contenuti AI, nessuna guida pubblicata o attivazione nell’app.

## Contratto delle risposte

Il riesame quantitativo passa al protocollo 2. Lo schema distingue i tipi di annotazione: inventory, measure, context e source richiedono un intero `declaredCount` e il solo riferimento pertinente; qualitative e name richiedono valore numerico nullo. Gli altri campi devono essere null. La copertura esatta degli indizi, la lettura completa e i rilievi sulle affermazioni implicite restano obbligatori. Un numero noto nel testo, anche un articolo classificato quantitativo, non può essere sostituito con un altro numero contenuto nella medesima citazione.

Per le sole quantità stampate nelle fonti, il lettore riconosce anche frequenze `once`/`twice` in costruzioni delimitate e articoli `a`/`an` davanti a card, Pokémon o Energy singolari, con modificatori di regola ammessi. Non riconosce come uno `a few`, `a pair of`, `a lot of`, `a number of`, `all at once` o un generico «Once a player…». La citazione deve essere una sottostringa esatta della fonte card/rules originale. Nessuna regola contiene nomi di mazzi, stampe, matchup o valori dell’esempio.

Questo controllo individua un riferimento numerico: non dimostra da solo che una citazione giustifichi una decisione. Il critico indipendente deve comunque verificarne significato e condizioni; inventari, finestre, lati, destinatari, misure, effetti e tattica conservano i controlli precedenti. Una fonte di regola non sostituisce un saldo di inventario.

## Originali e migrazione

Il lettore storico 1 resta immutato. La ripresa autentica richiesta, scope, packet, ruolo critic, hash del risultato e motivo del rifiuto storico prima di riesaminare con il lettore 2. Una risposta respinta che ora supera integralmente il contratto viene collegata con `revalidatedAs:2`: il record originale rimane `accepted:false`, con testo e rifiuto intatti. Non viene fabbricato un nuovo output né trasferito un pass di un altro contesto.

I riesami negativi autentici sono conservati. I rifiuti di formato dei due protocolli condividono lo stesso limite: cambiare versione non compra una terza risposta. Richieste canoniche, comprensive del contesto finito, determinano l’ordinale del retry. Un costruttore non può diventare critico; fonti mancanti o alterate bloccano la ripresa.

Sul database reale copiato il processo ricostruisce quattro pass quantitativi effettivi: tre già accettati e il quarto collegato alla risposta indipendente originale con interpretazione 2. Il confronto verifica che il valore letto sia identico al JSON AI originale. La riparazione dei soli audit già pagata è riutilizzata, il registro fisico resta invariato e il prossimo invio sarebbe il quadro della linea principale (`segments-finite-turn-frames`). Il database reale conserva invece tre pass, due risposte respinte e il precedente arresto: nessuna adozione reale dopo lo stop.

## Verifiche

Risultati definitivi, profili e impronte sono registrati in `.verify/app225-segments-20261102/verification-app232-source-quantities.json`. La verifica di provenienza è `app232-source-quantity-recovery-proof.json`; la regressione delle quantità include esempi indipendenti positivi e negativi, inventari, isolamento, persistenza e ripresa dei protocolli storici. Le misure su copie non attestano la qualità AI delle guide.

**497 test distinti passati, 1 esclusione storica, 47 file; typecheck e build passati.** Dopo aver completato i campi tipizzati della sola fixture di migrazione, i suoi sei test sono stati ripetuti senza doppio conteggio. Tre profili freddo/riapertura su copie rispettano i limiti60s/10s/768MiB: Crustle6,726s/4,479s/471,3MiB; Alakazam1,232s/0,077s/323,8MiB; Dhelmise2,527s/0,414s/354,2MiB. I profili aggiuntivi del [runner v7 congelato](CAMPAIGN-V7-PREPARED.md) verificano gli stessi ingressi con il suo nucleo compilato identico.

L’archivio v6 di **881 file** resta intatto. I tre database sono equivalenti ai backup su schema e **39 tabelle**; i seed v5 restano intatti. Rispetto ai 859 input congelati sono cambiati intenzionalmente due file esistenti, con tre nuovi file source/test; **857 input precedenti invariati, 533 file source/test improntati**. Nessuna modifica ai limiti, alla calibrazione o ai controlli di gioco.

## Budget prima di altre chiamate

Contabilità invariata dopo la chiusura v6: **327 v28 / 403 storiche**, massimo **500 cumulativi per guida / 1.500 v28 / riserva24 per ciascuna successiva**. Residui: **173 / 500 / 500**, pool **1.173**. Lo stesso job Crustle conserva 33 tentativi su206, con294 chiamate precedenti della guida conteggiate separatamente. I307 campioni reali mantengono fattore conservativo1,5933849345675073; nessun campione sintetico aggiunto.

Il prossimo quadro principale stimato dall’host richiede **52.745 input**, riserva output12.000, margine8.192; sono riservate29 altre chiamate, quindi soglia d’ingresso30. Gli ingressi freddi degli altri matchup richiedono59 chiamate disponibili ciascuno. Sono condizioni d’ingresso, non stime di completamento.

La nuova richiesta del critico, dimensionata separatamente sui dati originali, entra nei limiti del trasporto; questa misura pura non comprende gli arricchimenti dell’host e non è la richiesta successiva. Schema2 non ancora provato dal vivo. Ogni richiesta futura sarà nuovamente dimensionata, suddivisa se ammesso o arrestata prima dell’invio.

Riferimenti seriali condizionali: ripresa `22+3M+N+A`; freddo `25+6H+3M+N+A`, con H=7, M=6+4R, N=2+2R, A=e×M. Il termine di ripresa scende di quattro perché sulla copia sono riutilizzabili i quattro riesami già pagati, senza un terzo tentativo.

| R | e | Ripresa Crustle | Ciascuna fredda | Pool delle tre | Entro173 per Crustle |
|---|---|---:|---:|---:|---|
| 2 | 3 | 112 | 157 | 426 | sì |
| 2 | 5 | 140 | 185 | 510 | sì |
| 4 | 3 | 164 | 209 | 582 | sì |
| 4 | 5 | 208 | 253 | 714 | no |

Sono esclusi retry, rilievi semantici, ricostruzioni, partizioni aggiuntive e riscritture. Nessuna garanzia di successo o aumento dei tetti: anche la capienza token e i limiti locali di revisione restano vincolanti.

## Ripresa reale

La [preparazione v7](CAMPAIGN-V7-PREPARED.md) lega il codice corretto ai tre database e alla contabilità v6, conserva lo stesso job Crustle, usa le richieste corrette per gli altri matchup e verifica il blocco in assenza di consenso. Sono congelati864 input; nessun grant o invio creato. La campagna v6 autorizzata è conclusa: l’eventuale riapertura richiede istruzione esplicita sul nuovo freeze, senza riavvii automatici. Le successive guide partono solo dopo una valida; stop globale al primo esito non valido, held-out esclusi. Defaultv27, guardv28 e policyv5 isolata restano invariati. Non è ancora disponibile una nuova guida reale da verificare in UI.
