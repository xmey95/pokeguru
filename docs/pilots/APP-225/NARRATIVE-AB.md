# Diagnostico dei testi con registro congelato

**APP-225 In progress — diagnostico concluso e verificato (03-11-2026 10:12 UTC):** handle80065 exit0,3/3 invocazioni autorizzate, entrambe le varianti conformi e approvate dalla critica indipendente senza rilievi. A mantiene i limiti originali del trasporto: non vi è prova che vadano rimossi. Registro/risorse/stringhe AI e tre budget ricostruiti nel replay; archivio480 file,470 impronte intatte e binding/chunk esatti. Main job55 invariato +3 diagnostiche =58 v28,76 originali separate =134 storiche; saldo46 nel pool104, riserva40 conservata, Crustle6 entro64. Due altri job assenti. Nessuna variante adottata, nessun report o guida completa:0/3 reali, app defaultv27/guardv28. Esito e testi in NARRATIVE-AB-RESULTS.md; proposta tecnica generale NARRATIVE-REPAIR-INTEGRATION.md, non integrata. La campagna principale rimane fermata: il diagnostico non autorizza ripresa/adozione o aumento dei tetti. Nessun processo/provider attivo, nessuna domanda pendente. Le note successive sono cronologia; obiettivo delle tre guide e generalizzazione ancora aperto.

[Esito reale e testi prodotti](NARRATIVE-AB-RESULTS.md). Le sezioni successive descrivono il protocollo preparato prima del consenso e poi rispettato.

**APP-225 In progress — diagnostico narrativo autorizzato e dal vivo (03-11-2026 10:07 UTC):** ricevuto «Autorizzo il diagnostico entro3 chiamate», question call_0e9814163d184477b688cd2d04cdd6c5/0. Grant specifico sul seal0423f4e7973af1f1e3810ab5f43b8cad059f47e5e21e2d07ada624ae36fb3e0d dopo controllo hash/preflight/baseline. Handle80065, narrative-ab-live.log, stato narrative-ab/status.json. Massimo3 dentro64/104, baseline55/76, riserva20; registro e codice congelati, nessuna adozione/pubblicazione o altro matchup. Non avviare duplicati. I checkpoint successivi precedono questo consenso; task e obiettivo ancora incompleti.

**Pronto localmente, non autorizzato.** Nessuna nuova invocazione, nessun job diagnostico creato. APP-225 resta In progress e 0/3 guide reali. Il consenso64/104 non viene interpretato come riapertura automatica dello stop concordato.

La prova epoca5 ha consumato otto invocazioni48–55 senza guasti di trasporto; tutte e quattro le critiche49/51/53/55 segnalano frasi incomplete. Le istruzioni con margine60% non hanno dimostrato convergenza. I campioni48 erano già troncati nel raw: non sono tagli eseguiti dall’app. La causa upstream non è provata. Non chiedere un altro aumento di budget per ripetere lo stesso ciclo senza nuove evidenze.

## Esperimento proposto

1. Copiare il database archiviato55 in un’area diagnostica e creare un nuovo job. Il job reale30594bb5-5b1d-4e92-bfca-950de782af06 e i suoi contenuti restano immutati. Copiare il setup e il nostro primo turno esattamente; nuovo scope e nessun pass critico trasferito.
2. A: l’AI riscrive esclusivamente tactical.comparison, development.reason e development.pivot. Schema di trasporto con limiti originali1600/800/1500. Corpo del turno, azioni, risorse e fonti sono congelati.
3. B: stesso prompt byte-identico, rimuovendo soltanto i tre maxLength dallo schema inviato al provider. I limiti nel prompt e soprattutto i validatori locali originali rimangono uguali: fuori limite significa rifiuto, mai taglio o completamento automatico.
4. Una sola critica nativa indipendente delle varianti localmente conformi, deduplicando varianti identiche. Nessun riesame per una risposta respinta localmente. Pianificare il batch completo prima dell’invio: se non entra, fermarsi senza eliminare dati o controlli.

Il test distingue il contributo di una fase narrativa separata e quello dei tre vincoli di trasporto. Due varianti e una critica non dimostrano causalità definitiva, qualità di una guida completa o affidabilità generale. Nessuna variante sarà pubblicata o adottata nel job originario. Un esito positivo servirà a decidere una modifica generale e ulteriori verifiche, non a dichiarare tre guide valide.

## Limiti e stop

Massimo3 invocazioni reali, nessun retry automatico. Baseline55 v28 +76 precedenti. Massimo dopo il diagnostico58/64 sul primo matchup,58/104 nel ciclo e134 storiche su180 autorizzate; le40 riservate ai due casi successivi rimangono disponibili. Tutte le invocazioni diagnostiche, incluse quelle fallite, devono essere sommate alle55 nelle eventuali campagne future, anche se nel nuovo job. Non azzerare i contatori ricopiando il database o scambiando il job.

Un rifiuto locale di A può precedere B perché è un confronto diagnostico. Un errore del servizio, del contenitore, del registro, di integrità o di budget ferma l’esperimento. Se nessuna variante è conforme, niente terza chiamata. Nessun rilancio dei due altri matchup o degli held-out. Lo stop globale della campagna principale resta chiuso.

Nuova autorizzazione esplicita richiesta: cambia il tipo di prova e si crea un job separato dopo uno stop concordato. Non richiede un aumento dei tetti64/104; authorization.json non creato. Dati pubblici e servizio OpenAI tramite Codex sono quelli già autorizzati. Configurazione modello/provider identica al live precedente.

## Verifica locale

Tre regressioni passate: sostituzione esatta delle sole stringhe AI senza mutare fonte/registro; rigetto di native tamper/ID estranei/campi extra/stringhe oltre limite; rimozione dei soli tre maxLength nel trasporto; nuovo scope e nuova critica senza trasferire approvazioni. Typecheck del contratto e del runner passato. Prepare, guard e preflight passati senza rete o nuovi job. Il gate rifiuta assenza di consenso e tentativi oltre3.

Seal470 file:0423f4e7973af1f1e3810ab5f43b8cad059f47e5e21e2d07ada624ae36fb3e0d. Il codice applicativo resta esattamente quello del live epoca5, verificato con606 test/44 esclusi e typecheck/build; non rieseguiti dopo i soli file sperimentali .verify. Nessuna integrazione diagnostica nel generatore dell’app.

Preflight A/B: prompt identico172620 byte, input stimato79690/79664 token, output riservato6000, margine8192. Stime, non usage fatturato. Scaling e timeout usano le funzioni correnti; dopo ciascuna chiamata i campioni osservati aggiornano la pianificazione. Se la nuova calibrazione richiedesse un prompt diverso, il test si ferma per non alterare il confronto. La capienza della critica sarà ricontrollata sui candidati effettivi, prima dell’invio.

Evidenze in .verify/app225-segments-20261102: narrative-ab/{seal,input,guard,preflight}.json, narrative-ab-contract-final.log, narrative-ab-typecheck.log, narrative-ab-{prepare,guard,preflight}.log, epoch5-terminal-audit.json, narrative-ab-original-preservation.log. Runner narrative-ab-run.test.ts, env POKEGURU_NARRATIVE_AB. Non usare live senza un grant specifico sul seal. Nessun risultato reale di questo diagnostico esiste ancora.
