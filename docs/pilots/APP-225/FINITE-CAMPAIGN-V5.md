# APP-232 — Esito della campagna reale v5 su nuovi job isolati

05-11-2026. Prova autorizzata dall’istruzione diretta dell’utente: nuovi job isolati sui tre matchup, contabilità precedente conservata, nessun intervento manuale, tutti i controlli e lo scaling, tetti 500/1500 con riserva 24 e stop globale al primo esito non valido.

**Esito: 0/3 guide valide. Ventisei nuove chiamate, tutte riuscite al provider; campagna fermata dopo 23m41s su Crustle per audit ancora non conformi dopo il retry consentito. Gli altri due matchup non sono stati avviati.** Lo stop finale dimostra un limite del filtro linguistico introdotto per i conteggi, non un esaurimento del budget né un valore di inventario dimostrato errato da quel rifiuto.

## Esecuzione e contabilità

Runner **80664**, terminale exit 1. Durata del job: **1.420.642 ms**. Freeze verificato di **703 input**, seal `4a03ef0e9293dc900ad3d4c6b478572f77cb3368dabcf91d0d66b74328689a40`. Nuovo job Crustle `ce9ad11a-09a5-45a6-bc4c-f2c6fd4fc57e`, zero tentativi iniziali e zero approvazioni importate. Vecchi job e relative chiamate conservati nei database collegati, senza riapertura.

| Matchup | Nuove chiamate | Cumulative v28 | Esito |
| --- | ---: | ---: | --- |
| Crustle–N’s Zoroark | 26 | 320 | Primo setup validato localmente; secondo fermato sugli audit |
| Alakazam/Dudunsparce–Basic Box | 0 | 0 | Non avviato per lo stop globale |
| Dhelmise–Lucario/Hariyama | 0 | 0 | Non avviato per lo stop globale |

Totale **320 v28 / 396 storiche**, comprese le tre diagnostiche precedenti e le 76 chiamate della campagna storica separata. Residui **180 per Crustle / 1.180 nel pool**, entro **500 cumulativi per guida / 1.500 v28 / riserva 24 per ciascuna guida successiva**. Il nuovo job ha usato 26 del massimo 206, senza trasformare il tetto cumulativo in un nuovo budget di 500.

Uso misurato di tutte le 26 invocazioni: **1.195.476 token di input e 49.062 di output**; nessuna chiamata con uso ignoto. I campioni di calibrazione del nuovo job passano da 274 ereditati a **300**, aggiungendo solo le misure reali. Nessun errore di servizio, timeout o limite di token ha causato questo stop.

## Passaggi effettivamente raggiunti

1. Piano globale costruito da zero, senza riutilizzare piano o pass dei vecchi job.
2. Prima proposta del primo setup respinta dal controllo fisico: assegnazione Energia con destinatario ambiguo fra copie del Pokémon. Il generatore usa il rilievo per la seconda proposta, entro il limite previsto.
3. Seconda proposta del primo setup arrivata agli audit quantitativi. I quattro audit iniziali sono respinti per quantità nel testo libero; i retry passano. **Primo setup ricostruito e validato dal lettore completo**, con ricevuta quantitativa autenticata. Non è un pass del critico.
4. Secondo setup arrivato agli audit senza una nuova ricostruzione fisica. Le quattro prime risposte sono respinte; soltanto una delle quattro risposte di retry viene accettata. Tre unità raggiungono due rifiuti locali.
5. Il protocollo si ferma con `invalid-response`; nessun terzo tentativo della stessa unità. I batch già predisposti per unità indipendenti conservano i loro risultati; al termine della fase non viene pubblicato il secondo setup.

Le dieci richieste di audit producono **16 risposte di unità: 5 accettate e 11 respinte**. Le risposte accettate restano originali parziali, non attestazioni della correttezza dell’intera guida. Non sono state raggiunte linea principale, critica indipendente della premessa, repliche, prosa o revisioni finali. Nessun report approvato o prova UI di guida reale.

## Causa precisa dello stop

I tre rifiuti definitivi riguardano ancora il testo qualitativo degli audit di `scenario-2`, nei turni storici 1, 2 e 4. I frammenti interessati **non contengono cifre**; contengono parole vietate dal filtro, tra cui `nessuna`, `nessun` ed `entrambi`.

Un esempio originale è «nessuna promozione serve». Il codice lo tratta come quantità libera, benché sia una formulazione qualitativa sull’assenza di una promozione. Nel medesimo frammento viene descritta anche l’assenza di copie alternative in campo. Quel rifiuto non confronta un valore dichiarato con un saldo del registro e non dimostra che un conteggio sia sbagliato.

Una prova locale, senza provider e senza adottare modifiche nel job, usa due formulazioni equivalenti:

| Testo di input al solo filtro | Risultato |
| --- | --- |
| Nessuna promozione serve. | Respinto |
| Non serve alcuna promozione. | Accettato |

La differenza conferma **un falso positivo linguistico e una debolezza del metodo basato su parole vietate**. Il filtro è troppo rigido su queste formulazioni, mentre una parafrasi equivalente lo supera. Non è la dimostrazione che ogni affermazione degli audit sia corretta: lettore completo e critico devono ancora verificarli. Non è corretto descrivere lo stop come un nuovo conteggio numerico certamente errato.

Nessuna delle due frasi diagnostiche è stata inserita nella risposta AI originale o nella guida. Nessun controllo è stato escluso per proseguire; codice e runner sono rimasti congelati. Il problema va distinto dalla precedente ambiguità del destinatario Energia, corretta autonomamente nella seconda proposta fisica.

## Conservazione e riapertura

- Archivio immutabile `campaign-finite-v5-archive/manifest.json`: **722 file**; tutti i **703 input congelati** verificati invariati dopo lo stop.
- I tre database sono equivalenti ai backup finali su schema e **39 tabelle** ciascuno. Le tre basi v4 rimangono invariate.
- Solo Crustle ha un nuovo job; la politica degli audit è `quantified`, con `legacyRefs=[]`. Nessun pass precedente importato, nessun contenuto AI corretto manualmente, held-out esclusi.
- Due riaperture del generatore su copie ritrovano lo stesso rifiuto terminale **senza provider o risposte simulate**: 26 tentativi e 300 campioni invariati, circa 0,905 s e 0,818 s. Il database reale non viene modificato dalla diagnosi.
- I 449 test offline e la build precedenti restano evidenza del codice congelato; **non coprivano questo falso positivo della formulazione reale** e non dimostrano successo della campagna.

Evidenze in `.verify/app225-segments-20261102/`: `campaign-finite-v5/terminal.json`, `campaign-finite-v5-archive/manifest.json`, `verification-app232-finite-v5.json`, `app232-finite-v5-crustle--n-s-zoroark-diagnosis.json`, `app232-finite-v5-format-diagnosis.json`, `app232-v5-terminal-recovery.json` e `app232-finite-campaign-v5-live.log`. Verificatore ripetibile: `verify-app232-finite-v5-terminal.mjs`.

## Stato del lavoro

APP-232 resta **In progress**, APP-225 **Blocked**, obiettivo completo non raggiunto. La campagna autorizzata è conclusa: nessun riavvio automatico, aumento dei tetti, nuovo invio o modifica del codice dopo lo stop. I residui di budget non cancellano il limite locale delle risposte invalide.

Il problema residuo osservato è il filtro linguistico degli audit, non la mancanza di chiamate. Prima di proporre un’altra prova serve risolverlo in modo generale, conservando il controllo dei riferimenti quantitativi, la provenienza delle risposte e i rifiuti storici. Questa pagina registra la diagnosi; non autorizza o dichiara implementata un’altra correzione.

Restano tre guide valide, verifica di salvataggio/riapertura/UI, valutazione della generalità, policy applicativa e build locale utilizzabile dall’utente. Default v27, guard v28 e policy v5 isolata invariati. Le [verifiche offline del contratto quantitativo](AUDIT-COUNT-COHERENCE.md) restano documentate separatamente.
