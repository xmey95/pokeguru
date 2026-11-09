# APP-251 — Ripresa reale v18: esito non valido e stop rispettato

Verifica del 7 novembre 2026. **0/3 nuove guide valide.** Campagna terminata alla prima guida dopo **10 nuove invocazioni / 7m08s**, tutte completate al servizio e accettate dai rispettivi lettori. Non sono partiti gli altri due matchup. Processo38548,sessione40299,exit1 osservato;terminale03:29:23UTC,lock rimosso dal runner. Nessun rilancio o nuovo invio dopo il terminale.

La ripresa della richiesta interrotta ha funzionato. Il modello ha rappresentato sviluppo storico con evoluzione,KO,Premio e promozione;sono stati aggiornati gli audit e il nostro turno. I quattro nuovi riesami degli audit(34/36/38/41) sono pass. Questo non approva la premessa o l’intera guida: **il riesame della premessa,richiesta42,non è stato inviato**.

## Causa dello stop

Il manifest esistente consente148posizioni base,16invii di riparazione e164invocazioni totali. Prima della v18 erano già usati6crediti;le10nuove richieste modificano posizioni logiche già visitate e consumano i10residui. Il codice conserva correttamente la contabilizzazione anche dopo ripresa e cambio delle identità. Al momento dello stop:41tentativi nel job,40raw,27posizioni base usate,16crediti consumati,zero residui per la correzione. Il tentativo31senza risultato resta contato.

Il preflight42 riporta fits=true,123chiamate disponibili,63.540token input stimati e10.000output riservati,ma non include la dimensione dei crediti di riparazione. Il successivo guardiano rifiuta l’invio con call-budget:«Riserva condivisa di consegna esaurita». Il limite non è quello576della prima guida né un esaurimento dei token. Il preflight avrebbe dovuto evidenziare la capacità di riparazione e prenotare le verifiche obbligatorie prima di impegnare altre richieste.

Non si sono verificati errori di servizio,figli non validi o nuovi riesami negativi nelle10invocazioni. Il precedente revise sulla premessa resta conservato e non ancora riesaminato. Non è dimostrato che la guida sarebbe valida con un’altra chiamata:restano replica,confronti,prosa e controlli successivi.

## Conservazione e verifiche

- **40risposte complete**(30precedenti+10nuove),41tentativi e432campioni conservati.
- Tutti i **9.542riferimenti precedenti** sono presenti con hash identici;nessun contenuto AI corretto manualmente.
- **795file archiviati** in .verify/app251-resume-v18-20261107-archive,con manifest e tre backup. Tutte le **39tabelle per database**,compresa sqlite_sequence,confrontate con i database di esecuzione;gli altri due casi coincidono ancora con i dati precedenti. I tre database sorgente v17 e i sorgenti/evidenze congelati restano invariati.
- Due riaperture del job su copia restituiscono call-budget con **zero provider**,41tentativi/40raw/432campioni/16crediti invariati. Nessun reset o approvazione trasferita.
- Codice invariato rispetto ai **338test/34file**,typecheck/build/UI e gate offline qualificati. Le verifiche sintetiche non certificano la riuscita del modello reale.
- Uso misurato delle sole10nuove chiamate: **488.658input /15.264output /0cached**. La chiamata31precedente resta senzausage;nessun totale storico di token viene inventato.

## Contabilità corrente e prossimo incremento

| Voce | Valore |
| --- | ---: |
| v28 / storico | 453 / 529 |
| Tetti per matchup / pool | 576 /500 /500 — 1.500 |
| Residui per matchup / pool | 123 /500 /500 — 1.047 |
| Riserva per ogni matchup successivo | 24 |
| Invocazioni residue nel manifest corrente | 123 |
| Crediti di riparazione residui | **0** |

**APP-251 Blocked** sui criteri di validità. APP-252 è preparato per la correzione generale offline della pianificazione e diagnostica delle riserve,conservando vecchi manifest e ricevute. Nessun incremento automatico delle quote locali,nessuna modifica manuale ai contenuti,nessuna riapertura reale autorizzata da questa chiusura. Qualsiasi proposta per utilizzare la capacità residua deve essere esplicita,verificata offline e compatibile con576/1500/riserva24;non basta cambiare il conteggio o creare un nuovo identificativo.

APP-232/APP-225 e l’obiettivo completo restano incompleti. Gli held-out sono esclusi. Non viene dichiarata pronta l’app per generare guide valide in generale.

Autorizzazione consumata:«Autorizzo la ripresa entro576/1500,riserva24». Sigillo e consenso originali conservati. Evidenze principali: .verify/app251-resume-v18-20261107/{terminal.json,diagnosis-v18.json,budget-terminal.json,verification-terminal.json,replay-stopped.json},manifest dell’archivio e .verify/app251-live.log. [Qualificazione precedente](PLANNER-MEASUREMENTS-OFFLINE.md).
