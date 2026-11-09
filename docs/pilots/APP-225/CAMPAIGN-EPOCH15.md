# Ripresa proposta con riserva ricalcolata

**APP-225 In progress — epoca15 terminale, ripresa16 pronta offline (04-11-2026 Europe/Rome):**91979 terminale exit1 dopo la sola invocazione149;152 v28=149 principali+3 diagnostiche,228 storico,0/3 valide. Zero stdout/risultato,81ms nel figlio,errore classificato storage;contatto con il servizio non provato,tentativo comunque conteggiato. Stop globale rispettato,altri job assenti,archivio509 file/484 input e112 checkpoint intatti. Sei DB di stato Codex falliscono l’apertura readonly nel sandbox esterno;gli stessi sei superano quick_check fuori da esso,4520 terminale exit0. Vincolo ambientale riprodotto,causa esatta149 non dimostrata perché stderr originale non conservato;nessuna corruzione dichiarata. Diagnostica e replay senza AI;nessun profilo manualmente modificato. Replay raggiunge soltanto la seconda scelta,conserva149 tentativi/112 checkpoint e riusa147/148. App invariata rispetto ai659 test/build. Runner16,TSC/prepare/guard/preflight passati,484 input/seal4fe057392b6b965bcc9355fb3016a61ce9a0eed9fc88e258984c8e9b089352ae,grant/live assenti. Primo seal fallito per riferimento artefatto errato,corretto prima del freeze. Proposta di riapertura fuori dal sandbox esterno,isolamento interno CLI e tutti i controlli/scaling invariati;nessun aumento dei tetti184/232/riserva24 già approvati:80 future massime,32 sul primo,308 storico. Serve consenso specifico per riaprire lo stop,nessuna garanzia di approvazione. Altri casi solo dopo una valida,stop globale al primo non valido,held-out esclusi. Defaultv27/guardv28 e policy isolata conservati;RUNTIME-ACCESS-VERIFICATION.md/CAMPAIGN-EPOCH16.md documentano prove e limiti. Obiettivo completo aperto. Le note successive sono cronologia.

**APP-225 In progress — epoca15 autorizzata e avviata (04-11-2026 Europe/Rome):** ricevuto «Autorizzo184/232,riserva24»,question call_6e0ee1229d03454fb0487200c18ce21c/0. Baseline151 v28=148 principali+3 diagnostiche,227 storico,0/3 valide. Grant registrato sul seal484/a3e056bc382439f8eabb6050830a4d11a3210f3c5ab90efbbda4dcdb3b8395e4 e preflight approvato passato. Unico live91979,epoch15-live.log;monitor readonly epoch15-status.mjs. Tetti184/232/riserva24:massimo81 nuove,33 sul primo,308 storico. Ripresa dalla seconda scelta senza ricomprare147/148. Altri matchup soltanto dopo una valida,stop globale al primo non valido,held-out esclusi. Tutti i controlli/scaling e codice app659/build congelati;nessun contenuto manuale,duplicato o nuovo consenso pendente. Defaultv27/guardv28 e policy isolata conservati,obiettivo completo aperto. Le note successive sono cronologia.

04 novembre2026, Europe/Rome. **Pronta offline, non autorizzata.** Baseline151 v28,227 storico,0/3 valide. [Audit e limiti](NATIVE-RESERVE-VERIFICATION.md).

| Limite | Autorizzato | Proposto |
| --- | ---: | ---: |
| Cumulativo per guida | 168 | 184 |
| Ciclo v28 | 216 | 232 |
| Riserva per ciascuna successiva | 24 | 24 |
| Massime ulteriori nel ciclo | 65 | 81 |
| Massime ulteriori su Crustle | 17 | 33 |
| Massimo storico incluse76 | 292 | 308 |

La riserva minima corrente è18; l’intera proposta nota richiederebbe26. Il tetto proposto lascia sette chiamate oltre quella riserva. Non garantisce il risultato. Non avviare chiamate con il solo consenso dell’epoca14: occorre autorizzare aumento e riapertura dello stop.

Runner `campaign-epoch15-live.test.ts`, env `POKEGURU_V28_EPOCH15`.484 input congelati, seal `a3e056bc382439f8eabb6050830a4d11a3210f3c5ab90efbbda4dcdb3b8395e4`. Prepare/seal/guard/preflight/typecheck e tre replay su copie passano. Nessun grant/live. Codice app invariato rispetto ai659 test e alla build verificati. Baseline148 principali +3 diagnostiche; il jobcap principale proposto181 sottrae le diagnostiche al tetto184.

Riprendere solo la seconda scelta: piano147 e scelta148 salvati restano riusati. Stesso job Crustle `30594bb5-5b1d-4e92-bfca-950de782af06`; altri due casi soltanto dopo una guida valida. Fermarsi appena valida ogni guida e arrestare l’intera campagna al primo matchup terminato senza valida. Nessun aumento automatico, contenuto manuale o held-out. Tutti i controlli e lo scaling mantenuti. Nessuna attivazione v28 o adozione della policy isolata prima dei criteri completi di APP-225.
