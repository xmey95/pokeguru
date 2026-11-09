# Regressione completa della copia finita e blocco della consegna

5 novembre 2026. APP-232, obiettivo complessivo APP-225. **Copia isolata verificata, non adottata. Zero nuove chiamate reali.** La v7 e la richiesta di riapertura già inviata restano invariate.

## Risultato osservato

La suite completa della [copia con policy e correzione del piano iniziale](POLICY-CURRENT-FINITE.md) termina nella sessione52405 in717,71s. Il comando iniziale restituisce exit1: **959 passati, 1 fallito, 47 esclusi**, su183 file/1007 casi. L’unico errore è `EACCES` su una connessione locale127.0.0.1 del test OTLP, non una chiamata a OpenAI.

Lo stesso file, con codice e controlli identici, viene rieseguito fuori dal sandbox esterno del tool: **3/3 passati**. Due erano già passati e non vengono sommati nuovamente; il caso fallito si risolve. Risultato effettivo della suite: **960 passati /47 esclusi**. La prova UI Electron separata, già eseguita sugli stessi sorgenti, copre uno dei casi esclusi dal comando ordinario: totale verificato **961 test distinti passati /46 esclusi /183 file**. Non si dichiara che il primo comando fosse verde.

Le esclusioni sono elencate integralmente nell’evidenza; tutti i test opt-in dal vivo restano esclusi. I flag live sono stati cancellati prima dell’esecuzione. Nessun provider, held-out, avvio di campagna o risposta AI reale è usato da questa verifica. I report negativi originali e la riesecuzione locale sono conservati.

Typecheck/build,21 test mirati,3 regressioni storiche e1 prova UI erano già passati; la suite completa sostituisce il limite di copertura del checkpoint precedente, senza sommarvi le stesse asserzioni. UI1440/640px ispezionata, estensione del tetto e tentativi conservati dopo riapertura, nessuna ripresa automatica. La prova usa un job e una guida sintetici e non sostituisce la verifica delle tre guide reali.

## Integrità dopo l’intera suite

- **864 input v7 intatti**; stesso seal4693a0dec046980dc4b41d86f46e04c124b43ada766383a389ccaa986bb767fb.
- **554 file della copia combinata intatti**, inclusi sorgenti, test e scripts. Nessun cambiamento di codice durante la suite o per risolvere l’errore loopback.
- **47 file del runtime nativo** copiati dal pacchetto già disponibile e verificati con le stesse impronte; nessun aggiornamento o nuovo download.
- **881 file dell’archivio v6 intatti**. Tre database preparati v7 e tre originali v6 identici alle rispettive impronte precedenti.
- Nessun file di autorizzazione, marker di avvio o lock creato nella v7. Nessun processo reale della campagna attivo.

Evidenza autorevole: `.verify/app225-segments-20261102/verification-policy-current-finite-full.json`. Conserva conteggi grezzi ed effettivi, elenco esclusioni, impronte degli input/report e prove sui database. I dettagli della correzione isolata e l’audit delle cinque istruzioni emesse/29 moduli sono nel [checkpoint precedente](POLICY-CURRENT-FINITE.md).

## Perché l’obiettivo resta incompleto

Contabilità reale invariata: **327v28 /403 storiche /0 nuove guide valide**, residui **173 primo /1.173 pool**, entro **500 cumulativi per guida /1.500 v28 /riserva24 per ciascuna successiva**. La v6 è terminata al primo esito non valido. La [v7 congelata](CAMPAIGN-V7-PREPARED.md) può riprendere lo stesso job, ma manca la nuova istruzione di riapertura richiesta.

| Requisito finale | Esito corrente |
|---|---|
| Tre guide reali complete e valide | Incompleto:0/3; i successivi matchup non avviati. Richiede il consenso alla nuova campagna. |
| Salvataggio, riapertura e UI delle tre guide reali | Non verificabile senza i tre report validi. Le prove sintetiche non soddisfano questo requisito. |
| Generalità del lavoro | Istruzioni emesse,29 moduli e fixture indipendenti verificati; la qualità dei tre nuovi matchup rimane da valutare. Held-out esclusi. |
| Budget, retry e arresto applicativi | Copia combinata verificata. Mancano calibrazione del tetto iniziale dai preflight e dai costi reali e successiva adozione;16 è insufficiente,17 non garantisce l’ingresso nelle fasi fredde osservate a59. |
| Attivazione e build finale per l’utente | Non eseguite: subordinate a guide reali, verifica generale e policy finale calibrata. La build isolata non è la consegna richiesta. |

La stessa condizione di blocco è rimasta presente in tre turni consecutivi dell’obiettivo: preparazione v7 e richiesta di consenso; correzione/verifica della policy isolata; regressione completa corrente. I primi due turni hanno prodotto lavoro offline utile. Ora questa preparazione e le verifiche disponibili sono concluse: non resta un processo live da osservare né un’altra verifica necessaria sullo stesso codice invariato. Nuove chiamate, attivazione prematura o contenuti manuali non sono alternative autorizzate.

**APP-232 e APP-225 sono Blocked per la riapertura esplicita pendente; l’obiettivo completo non è raggiunto.** Non viene duplicata la richiesta di consenso, non vengono aumentati i tetti e non viene avviata automaticamente un’altra campagna. Dopo il consenso: stesso job Crustle, altri matchup soltanto dopo una valida, stop globale al primo non valido, tutti i controlli/scaling e originali conservati. La verifica del codice effettivamente adottato andrà aggiornata se la calibrazione o l’integrazione finale introducono nuove modifiche.
