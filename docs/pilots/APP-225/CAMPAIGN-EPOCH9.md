# APP-225 — Ripresa con selezione delle varianti

**APP-225 — correzione delle riserve verificata, ripresa non ancora autorizzata (03-11-2026):** epoca9 terminale, 115 chiamate v28 (112 principali + 3 diagnostiche), 191 storiche incluse le 76 precedenti, 0/3 nuove guide valide. Gli altri due job non sono stati creati; nessuna AI dopo lo stop. La previsione per scegliere varianti è distinta dal costo dei rami effettivi; viene ricalcolata dopo ogni gruppo accettato e riusata finché le scelte restano identiche. Guardie native, metadata, critici e scaling invariati. Passano 644 test/43 esclusi, 7 mirati e 4 replay, typecheck/build; dieci archivi v28/diagnostico, 112 tentativi, 85 checkpoint e tutti i byte/binding terminali preservati. Le 76 chiamate/undici archivi/254 sorgenti precedenti sono verificati separatamente. Le verifiche intermedie interrotte non sono conteggiate come verdi. Freeze v2 di 485 file intatto. Ripresa epoca10 congelata con prepare/seal/guard/preflight e typecheck verificati, senza grant o invio. Tetti invariati 128/176/riserva24: 61 residue nel pool, 13 per Crustle; stima di pianificazione 11, non prezzo finale o garanzia. Serve consenso specifico per riaprire lo stop sul codice corretto. Richiesta già inviata: attenderne la risposta senza duplicarla. Default v27/guard v28, held-out esclusi; policy separata non adottata. Tre guide reali, UI/persistenza, audit generale e build utilizzabile ancora necessari. Obiettivo completo aperto. Le note successive sono cronologia.

**APP-225 — stato corrente 03-11-2026:** epoca9 terminata (handle36444, exit1), 27 nuove invocazioni:115 v28=112 principali+3 diagnostiche,191 storiche incluse76 precedenti,0/3 nuove guide valide. Stop globale rispettato, altri due job assenti. Archivio epoca9:505 file/478 sorgenti live intatte,85 checkpoint conservati. Le scelte86–87 hanno conservato due rami;metadata110–111 richiedono altre correzioni e la proposta112 riscrive i seed. Stop prima della113:13 residue contro31 riservate. Correzione offline generale: distinguere la previsione per scegliere varianti dal costo delle varianti effettivamente selezionate; ricalcolo dopo ogni gruppo, guardie native e revisioni intatte. Nessun contenuto scelto o corretto manualmente. Suite644 attesa in verifica (handle47052), replay finale in corso;typecheck/build completati. Tetti128/176/riserva24 invariati:61 invocazioni residue nel pool,13 perCrustle;nessuna nuova chiamata reale o riapertura dopo lo stop senza nuovo consenso specifico. Defaultv27/guardv28,held-out esclusi. Policy separata non adottata;obiettivo completo ancora aperto. Le note successive sono cronologia.

**Aggiornamento17:55 Europe/Rome:** ricevuto consenso128/176/riserva24,riferimento call_5b014ad1a06445a7b4d1950483060f65/0. Preflight approvato verde e una sola esecuzione live,handle36444,epoch9-live.log. Due selezioni86–87 accettate localmente,due rami conservati esattamente,nove nuove varianti da costruire. Il codice congelato è invariato:il candidato policy separato non è adottato. I dati di preparazione sotto sono cronologia;alla terminalità confermata archiviare prima di cambiare codice.

Preparazione verificata offline il 3 novembre 2026. **Non autorizzata**: nessun nuovo grant, job o invio. La campagna epoca8 è terminale e il suo consenso non riapre automaticamente lo stop.

Si riprende lo stesso job Crustle–N’s Zoroark, quindi Alakazam/Dudunsparce–Basic Box e Dhelmise–Lucario/Hariyama soltanto dopo la guida valida del caso precedente. Rimangono stop dell’intera campagna al primo matchup terminato senza guida valida, codice congelato, nessuna modifica manuale, tutti i controlli e riesami indipendenti, scaling dinamico e held-out esclusi. Servizio OpenAI tramite Codex, stessi dati pubblici già autorizzati.

| Voce | Stato o proposta |
| --- | ---: |
| Chiamate principali già usate | 85 |
| Diagnostiche già usate | 3 |
| Totale v28 già usato | 88 |
| Campagna precedente, conservata separatamente | 76 |
| Totale storico attuale | 164 |
| Tetti attualmente autorizzati per guida / nel ciclo | 96 / 144 |
| Riserva per ciascuna guida successiva | 24 |
| Residuo attuale utilizzabile per Crustle | 8 |
| Riserva prudente richiesta oggi dal controller | 29 |
| Soglie che liberano la riserva corrente, senza margine | 117 / 165 |
| Nuovi tetti proposti per guida / nel ciclo | 128 / 176 |
| Incremento del tetto complessivo | 32 |
| Ulteriori invocazioni massime nel ciclo | 88 |
| Ulteriori massime per Crustle | 40 |
| Limite del job principale, escluse tre diagnostiche | 125 |
| Margine sulla riserva attuale della prima guida | 11 |
| Massimo storico, comprese le 76 precedenti | 252 |

Tutti i tetti includono gli invii già effettuati, anche quelli respinti o falliti. Le 55 chiamate importate nel database diagnostico non vengono contate una seconda volta. Il pool viene ricalcolato prima di ogni invio: se una guida conclude prima del proprio limite, le chiamate risparmiate restano disponibili alle successive, entro il massimo per guida e il pool totale. Nessun aumento automatico.

Le 29 chiamate sono una riserva prudente per l’intera proposta di rami e le verifiche successive, calcolata prima della selezione AI. Non rappresentano il costo minimo di qualsiasi possibile scelta e non garantiscono il completamento. La selezione può conservare rami e ridurre il lavoro; nuove carenze, riparazioni o suddivisioni possono richiedere altro. Le riserve di 24 per gli altri matchup proteggono il pool senza garantire la loro validazione.

## Correzione e prove

[PLAN-VARIANT-VERIFICATION.md](PLAN-VARIANT-VERIFICATION.md) descrive la selezione AI delle sole varianti necessarie: nessun obiettivo riscritto dal programma, nessuna equivalenza tattica dedotta, nessuna approvazione trasferita. Piani già pagati riutilizzati; ogni nuovo ramo e tutti i metadata e critici restano obbligatori. Istruzioni esecutive e difensive più esplicite, schemi e lettori fisici invariati.

Codice dell’app identico al freeze della suite: **641 test passati, 43 esclusi**, controllo dei tipi e build passati, 20 test mirati e quattro replay su copie. Il file `codex-usage-capture.test.ts` è escluso dal checkpoint; il lancio iniziale con Node 20 non supportato è conservato separatamente e non conteggiato. La suite autorevole usa Node 24.19.0.

I replay conservano 85 tentativi e 67 checkpoint, senza modificare i database originali o invocare provider. Con 96 il preflight blocca prima di inviare; con 128 la copia raggiunge soltanto la nuova scelta pendente, senza ricomprare le proposte. Gli altri due casi arrivano soltanto al piano nelle copie e non hanno job reali. Nove archivi v28/diagnostico, binding e byte dei chunk storici sono verificati; le 76 precedenti, undici archivi e 254 sorgenti congelate sono preservati separatamente.

## Congelamento e avvio

- Runner: `.verify/app225-segments-20261102/campaign-epoch9-live.test.ts`; variabile `POKEGURU_V28_EPOCH9`; controlli in `campaign-v28-epoch9/`.
- Freeze della ripresa: **478 file**, seal `59acf1c0c79ada91b7f2fbdd79e4baf051ed630e37c8ec0429551e00a8910759`. Baseline, prepare/seal/guard/preflight e controllo dei tipi passano, senza nuovi job o provider.
- Il freeze della suite è distinto: 485 file, hash `9fd3142ecd60b481bc0254fe6bab83636c3cce73fa58f5b60ca44158be396ecf`. Il verificatore confronta ogni input applicativo del runner con questa prova.
- Evidenze: `verification-plan-choice.json`, `verification-epoch9-preparation.json`, `epoch9-{prepare,seal,guard,preflight,typecheck}.log`.
- Occorre consenso specifico a **riaprire lo stop e aumentare 96/144 a 128/176**, conservando la riserva 24. Non creare `authorization.json` prima della risposta effettiva.
- Dopo consenso ricontrollare sorgenti, seal, baseline e contatori; registrare il riferimento alla risposta e ripetere il preflight prima di una sola esecuzione sequenziale. Escludere `**/frozen/**` nella selezione del runner.
- Alla terminalità confermata dall’handle archiviare dati, sorgenti e controlli prima di cambiare codice; confrontare i database e contare tutti i tentativi reali. Nessun rilancio dopo uno stop senza consenso specifico.

**0/3 nuove guide valide**. Questa preparazione non completa APP-225: restano le tre guide reali, persistenza/riapertura/UI, verifica della generalità, politica applicativa e attivazione della build utilizzabile dall’utente. Default v27 e protezione della generazione reale v28 conservati.
