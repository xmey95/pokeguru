# APP-225 — Capienza dei batch e contratto delle repliche

Stato: correzioni generali offline verificate dopo lo stop dell’epoca 7. **637 test, typecheck e build passati**; nessuna nuova chiamata reale dopo la 71 principale. La campagna resta a **74 v28 = 71 principali + tre diagnostiche**, 150 con le 76 precedenti, **0/3 nuove guide valide**. Non è una prova di generazione completa sul codice corretto.

## Risultato reale e diagnosi

L’epoca 7 autorizzata a 80/128/riserva24 termina con exit 1 dopo 14 nuove invocazioni, in 1.615,14 secondi. La guida è interrotta prima della prosa: sei chiamate residue non coprono le sette allora richieste. Altri due job assenti, stop globale rispettato. Archivio `campaign-v28-epoch7-archive/manifest.json`: 499 file, tre SQLite, 473 impronte del live intatte e binding/chunk confrontati.

La riparazione narrativa è riuscita realmente: la 58 modifica soltanto `comparison`, con 942 caratteri AI esatti e tutti gli altri dati identici; la nuova critica 59 è positiva. Il routing 56 è riusato. Questo non identifica retrospettivamente la causa dell’errore 57.

Le due linee principali e i piani delle alternative superano i controlli locali. I rami pianificati sono **sette**, con un’alternativa aggiuntiva nel primo caso. Correzione del precedente aggiornamento intermedio: la 71 era il ramo difensivo del secondo caso, non il retry del suo accesso. La 70 manca della ricevuta di accesso; la 71 tenta una carta dai Premi quando il saldo verificato è zero. Sono due rami pendenti distinti. Il retry del primo accesso era invece la 67, `retryOrdinal=1`, ed è passato. `branch-audit.json` conserva identificativi, ruoli e risultati esatti.

Le chiamate 64 e 66, rispettivamente di sei e tre unità, falliscono per `output-limit`, non per timeout; il runner passa a unità singole. Non è misurato un massimo universale del servizio. La capienza ridotta era locale a quella fase e non veniva conservata per riprese e turni successivi. Inoltre, il costruttore nativo non riceveva la regola esplicita `accessReceipt` applicata dal validatore del ramo access.

## Correzioni implementate

- `guide-output-capacity.ts` conserva osservazioni empiriche di output-limit, restringendo il massimo di unità. Il contesto lega job, progetto, configurazione, packet e protocollo nativo. Cambiare modello o fonti non eredita automaticamente il dato. Non trasferisce pass, giudizi tattici o contenuti tra guide.
- Le osservazioni sono controllate tramite hash e invarianti. I fallimenti storici vengono importati soltanto con tentativo fallito, prompt esatto, configurazione e packet compatibili e batch nativo verificabile. Prompt e risultati pagati rimangono intatti; non serve un nuovo errore per apprendere le chiamate 64/66.
- Lo scheduler applica la capienza anche nelle fasi successive e dopo riapertura. Un errore di una singola unità resta un arresto; request-limit non diventa una misura del limite di output. Le richieste di sola narrativa non ereditano il vincolo dei turni completi.
- Le riserve delle linee principali e dei rami contano i turni futuri alla capienza appresa. Un ramo terminale è escluso solo quando il registro lo deriva. I vecchi minimi delle linee principali non vengono abbassati; restano tutte le critiche, i controlli e le riserve esterne.
- Soltanto il task/dato della replica access esplicita esattamente una ricevuta sull’evento reale, fonte, costi e movimento aggiuntivo. Il feedback strutturale del contratto precedente è trasferito integralmente come evidenza. Schema e lettori restano identici, gli altri ruoli conservano l’identità originale e i checkpoint accettati non sono riscritti.

Nessun nome di carta, ID del caso o verdetto particolare governa queste correzioni. Non cambiano modello, effort, profilo Codex, timeout, limiti dei testi o tetti autorizzati. Il codice non modifica i testi AI né inventa spostamenti per superare un controllo.

## Verifiche offline

38 test mirati e typecheck passano. Quattro replay senza provider conservano tutti i **71 attempt e 47 checkpoint** del job reale, con database originali invariati:

1. Con il tetto reale 80 la copia si ferma prima di inviare: sei residue, **almeno 13 richieste** con le riserve ricalcolate.
2. Con un tetto puramente ipotetico 100 la copia raggiunge soltanto una richiesta singola del ramo access pendente, riusa l’evidenza 64/66, conserva il rifiuto 70 nel nuovo contratto e il retry del ramo difensivo 71. Nessuna risposta sintetica o AI adottata.
3. Gli altri due matchup arrivano soltanto al piano, sempre in copie e senza nuovi job reali.

Freeze della verifica: **482 file**, hash JSON compatto `f3eeed459dfb15d56869cb951884f8900f2c207775c172639f49a918c7f25f6a`, intatto dopo le prove. Suite completa con un worker: **637 pass/44 esclusi**, 104 file passati/37 esclusi su 141, 409,48 secondi; handle 77081 terminale exit 0. Anche typecheck finale e build passano. I 38 mirati precedono il freeze e sono sullo stesso codice. Un quinto replay sulla copia con tetto proposto96 passa: stessa richiesta access singola, feedback originale conservato,71 attempt/47 checkpoint intatti. Il tetto ipotetico100 del secondo replay non è una proposta o autorizzazione reale.

Preservazione passata: otto archivi v28/diagnostico, tutti i binding e i byte dei chunk anteriori intatti, quattro file applicativi cambiati intenzionalmente e altri 469 precedenti invariati. Aggiunti un modulo e due file di test. Le 76 invocazioni originarie, 254 sorgenti e undici archivi precedenti sono verificati separatamente. Nessuna nuova guida, prosa o attestazione finale è stata creata.

## Budget e eventuale ripresa

I limiti reali restano 80/128/riserva24. Restano 54 nel pool, ma soltanto sei assegnabili al primo caso conservando 24 per ciascuna guida successiva. Il nuovo minimo corrente 13 è una riserva prudenziale delle fasi note, non una garanzia di convergenza: riparazioni e nuove suddivisioni possono richiedere altro.

È pronta una **proposta non autorizzata** 96 per guida / 144 v28 / riserva24: include tutte le 74, consente al massimo 70 nuove invocazioni, 22 per Crustle e 24 riservate per ogni successiva; massimo storico 220 con le 76 precedenti. Aumenta il pool di 16, non lo azzera. Replay sul tetto proposto, typecheck del runner, nuovo seal di477 file, guard e preflight passano senza rete. Serve consenso esplicito sia al budget sia alla riapertura dello stop. Nessun grant predisposto. Protocollo completo in [CAMPAIGN-EPOCH8.md](CAMPAIGN-EPOCH8.md).

Default v27, guardia reale v28 e held-out esclusi conservati. Restano i cinque criteri del completamento: tre guide reali valide, UI/persistenza reali, generalità, policy applicativa e attivazione/build utilizzabile.
