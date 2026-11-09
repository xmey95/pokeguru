# APP-236 — Protocollo del critico iniziale e ripresa offline

6 novembre 2026. Autorizzazione: correggere schema,istruzioni e validatore,verificare offline ripresa e budget,mantenendo controlli/scaling e tetti519/1500/riserva24. **Nessuna nuova chiamata reale.** Totali invariati358v28/434storiche,zero nuove guide valide.

## Correzione generale

Il protocollo `guide-delivery-outline-review-2` conserva gli stessi campi e criteri di approvazione. Lo schema di trasporto descrive due alternative complete: `pass` con `findings=[]`; `revise`/`incomplete` con1–8 rilievi. Restano hash del piano obbligatorio,divieto di campi aggiuntivi e massimo1200 caratteri per rilievo; un rilievo di soli spazi è ora escluso anche dallo schema. Le alternative restano presenti dopo la condivisione e la codifica degli schemi.

Istruzioni e task indicano esplicitamente che findings contiene problemi irrisolti e prove mancanti,mai conferme positive o riepiloghi di un piano approvato. In presenza di un problema il modello deve scegliere un verdetto negativo: non può cancellarlo per rientrare nello schema. Il reader applica la stessa relazione fra verdetto e cardinalità e restituisce un errore puntuale,con i campi da correggere,al posto del precedente messaggio generico.

Non viene introdotto un filtro lessicale che decide se un testo è positivo o negativo,né un decoder che elimina findings. I due raw reali v10 restano immutati e respinti; sono copiati come dati non approvati nei test di regressione,con lo stesso piano e lo stesso hash. Un negativo coerente resta un negativo e arresta prima dei setup.

Versioni1 e2 condividono la posizione logica `outline-review`. Cambiare schema,istruzioni o identificativo della richiesta non rinnova il limite di due errori né la riserva globale16. I precedenti giudizi invalidi non vengono trasformati in pass.

## Verifiche eseguite

**82 test mirati passati /0 fallimenti /12 file**,typecheck e build passati. Coprono entrambi i raw reali,combinazioni positive/negative,hash/campi/limiti,feedback del retry,vincoli dopo la codifica del batch e conservazione della storia fra versioni. Il ciclo applicativo sintetico arriva a validazione completa tramite i reader originali anche dopo un primo output incoerente; conserva quel raw e usa il feedback puntuale. Due incoerenze fermano e non ripartono alla riapertura. Nessuno di questi verdetti sintetici dimostra qualità AI reale.

La UI Electron offline sulla build corretta passa alle tre larghezze1440/1280/640px,senza errori o overflow. Una guida già completata con il protocollo precedente è recuperata e riverificata in0,636s,senza ricomprare chiamate o cambiare il report.

| Replay su copie | Esito | Freddo /caldo | RSS massimo |
| --- | --- | ---: | ---: |
| Job Crustle già fermato |Blocco persistente dei due errori,zero invii|2,603s /0,409s|414MiB|
| Job Crustle nuovo con residuo161 |Blocco budget prima del piano,zero invii|0,023s /0,010s|84MiB|
| Alakazam/Dudunsparce nuovo |Intercettato prima del provider|0,515s /0,037s|327MiB|
| Dhelmise nuovo |Intercettato prima del provider|1,167s /0,208s|364MiB|

Le soglie60s/10s/768MiB non sono aumentate. Gli ultimi due replay sono simulazioni di ammissione su copie: non avviano i matchup nella campagna reale. Il primo conserva tre avvii,tre raw,due rifiuti e un credito di riparazione già usato. Il piano pagato viene recuperato senza invio; la nuova richiesta del critico viene fermata dalla stessa posizione logica prima del provider. La ripresa di quel job è quindi **verificata come bloccata**,non come capace di generare una nuova guida.

## Budget ricalcolato

| Vincolo | Stato corrente |
| --- | ---: |
| Prima guida,cumulativo autorizzato |519|
| Prima guida,già consumato |358|
| Prima guida,residuo |161|
| Singolo job bounded,massimo prudenziale |164|
| Nuovo job completo sulla prima guida |Non ammesso:164 >161|
| Pool autorizzato /residuo |1500 /1142|
| Riserve dei due matchup successivi |24 +24|
| Job corrente,credito riparazioni usato /residuo |1 /15|
| Job corrente,errori di formato sulla posizione |2,limite raggiunto|

Le due condizioni sono distinte: il job esistente ha ancora161 chiamate nel proprio massimale ma è fermato dal limite locale; un nuovo job non è ammesso dal residuo cumulativo. Non viene aumentato il tetto519,né assegnata alla prima guida parte dei tetti500 delle altre. Queste ultime sono individualmente finanziabili ma non possono partire prima di una prima guida valida e di una riapertura della campagna terminata.

Il critico corretto,dimensionato con tutte le fonti e338 campioni reali,entra nel budget:41.449 token input stimati,8.000 output riservati,8.192 di margine,67.738 byte e12.000 caratteri di risposta previsti. Restano le28 chiamate future riservate della richiesta originale. La calibrazione dinamica usa il massimo osservato,ora fattore1,61149; non viene riportata ai335 campioni precedenti. L’ammissibilità in token non supera i blocchi di storia o di chiamate.

## Integrità e stato

Sono modificati soltanto due file di produzione (`guide-delivery-outline.ts` e routing della versione in `guide-delivery-policy.ts`) e l’emulatore di schema della fixture sintetica; gli altri source qualificati restano identici. Nessun controllo fisico,tattico,quantitativo o finale viene rimosso. Archivi v10/v9/v8,raw originali e database reali sono verificati immutati. Il flag generale della rete resta disabilitato. Nessuna prova reale del protocollo2,nessuna nuova campagna,nessuna promozione manuale dei pass.

Evidenze riproducibili e budget: [verification.json](../../../.verify/app236-outline-protocol/verification.json),[budget.json](../../../.verify/app236-outline-protocol/budget.json). APP-236 Done per correzione e verifica offline;APP-232/APP-225 restano incomplete. Qualsiasi ulteriore proposta reale deve prima risolvere l’ammissione della storia e del budget senza rinnovare silenziosamente i limiti.
