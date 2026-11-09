# Stop di avvio e verifica dell’accesso allo stato Codex

04 novembre2026, Europe/Rome. **152 chiamate v28 conteggiate,228 storiche,0/3 nuove guide valide.** APP-225 resta In progress.

L’epoca15 è stata avviata con consenso specifico184/232/riserva24 sul codice congelato. Il processo91979 è terminale exit1 dopo la sola invocazione149 principale: nessun evento stdout, nessun file di risultato,81 ms misurati nel figlio,1049 byte stderr. Il messaggio originale non è conservato, per evitare la persistenza di possibili dati privati; restano contatori, classificazione storage e hash. Non è dimostrato che la richiesta abbia raggiunto il servizio. Il tentativo resta comunque conteggiato, senza sconti o reset.

La seconda scelta non è stata salvata. Piano147 e prima scelta148 restano riusati. Altri job assenti e stop globale rispettato. Archivio15 verificato:509 file,484 input congelati, binding e byte dei chunk preservati.112 checkpoint presenti.

## Diagnostica senza chiamate al modello

Versione del binario incluso0.164.0; help e `doctor` locali eseguiti. `doctor` segnala problemi dei database di stato, ma questo da solo non distingue corruzione e impossibilità di accesso. La [documentazione ufficiale OpenAI](https://learn.chatgpt.com/docs/cli/reference) descrive il comando diagnostico; [le variabili di ambiente](https://learn.chatgpt.com/docs/config-file/environment-variables) distinguono la posizione dello stato e dell’autenticazione.

| Controllo identico con connessione SQLite in sola lettura | Sandbox esterno | Fuori dal sandbox esterno |
| --- | --- | --- |
| state_5.sqlite | unable to open database file | quick_check ok |
| logs_2.sqlite | unable to open database file | quick_check ok |
| goals_1.sqlite | unable to open database file | quick_check ok |
| memories_1.sqlite | unable to open database file | quick_check ok |
| queue_1.sqlite | unable to open database file | quick_check ok |
| thread_history_1.sqlite | unable to open database file | quick_check ok |

Il vincolo ambientale di accesso è riprodotto. **La causa esatta dell’uscita149 resta non dimostrata:** manca il messaggio originale. Non dichiarare database corrotti, né servizio corretto o richiesta completata. I controlli SQLite sono stati eseguiti senza modifiche manuali al profilo e senza chiamate AI. Il processo4520 esterno è terminale exit0. `doctor` effettua anche controlli di connettività; nessuna generazione di guida è stata avviata dalla diagnostica.

## Ripresa preparata

Replay su copia con intervento esplicito sul solo blocco di trasporto: raggiunge esclusivamente `branch-plan-choice-scenario-2`, conserva149 tentativi e112 checkpoint, lascia il database reale invariato. Una sola richiesta intercettata sulla copia; nessun provider. Tipo e controlli del retry applicativo restano invariati.

Runner epoca16, prepare/seal/guard/preflight e typecheck passati. Il primo seal aveva un riferimento errato a un artefatto storico: corretto prima del congelamento; nessuna modifica app.484 input sigillati, impronta `4fe057392b6b965bcc9355fb3016a61ce9a0eed9fc88e258984c8e9b089352ae`. Tutti gli input app/test sono identici alla versione dei659 test e build già verificati; nessuna nuova suite completa dichiarata. Nessun grant o processo live16.

Tetti **già autorizzati e invariati184/232/riserva24**:80 ulteriori massime,32 su Crustle e48 riservate agli altri; massimo308 storico. La riapertura proposta usa il normale processo CLI fuori dal sandbox esterno del tool; **l’isolamento interno Codex, i tool disabilitati, i controlli di contenuto, le riserve e lo scaling rimangono identici**. Non si interviene sui testi delle guide o sul profilo personale. Serve consenso specifico perché riapre lo stop concordato; non aumenta il budget e non garantisce approvazione.

Stesso job e dati pubblici, OpenAI tramite Codex. Altri matchup solo dopo una guida valida, arresto globale al primo non valido, held-out esclusi. Defaultv27, guardv28 e policy isolata conservati. L’obiettivo completo resta aperto.

Evidenze: `.verify/app225-segments-20261102/verification-runtime-preflight.json`, `verification-epoch16-preparation.json`, `runtime-preflight-replay-0-184.json`, `epoch15-{sandbox-state-readonly,state-readonly-verified}.log`, `campaign-v28-epoch15-archive/manifest.json`, `epoch16-typecheck-final.log` e `campaign-v28-epoch16/`.
