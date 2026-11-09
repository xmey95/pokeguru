# APP-246 — Dimensionamento e partizione degli audit

06-11-2026. Correzione generale integrata e verificata **solo offline**. Zero nuove chiamate reali,399v28/475storiche e0/3 nuove guide valide invariati. APP-246 Done per questo incremento; APP-232/APP-225 Blocked e obiettivo generale incompleto. Nessuna campagna reale riaperta.

## Dimensionamento

La stima specifica del trasporto comprende testo completo,frammenti tipizzati,riferimenti e involucri. Ora viene convertita nelle stesse unità di caratteri usate dal pianificatore:15.000 per unità,con minimo2. Prima veniva divisa per6.000 e raddoppiata,poi riconvertita a15.000:19.936caratteri diventavano8unità e120.000caratteri previsti. Ora sono2unità e30.000caratteri previsti.

La prenotazione di token e la calibrazione restano quelle del pianificatore esistente,compresi i massimi osservati. Non cambiano limiti di input/output,payload,tetto600,8span,24frammenti o profilo della guida. Le stime non sono misure di usage né una garanzia sulla futura risposta.

## Partizione generale

Se l’audit completo non rientra nei gate effettivi,il costruttore prova gruppi progressivamente più piccoli di destinazioni:scelte,eventuale confronto,promozioni. Ogni frammento conserva tutti i dati del turno,candidati,fonti,finestre,feedback e scope;risponde soltanto alle chiavi assegnate. La partizione non elimina fatti per fare spazio. Se neppure una destinazione entra,il percorso si ferma prima del provider.

Piano e ricevuta legano padre,layout ordinato,scope e fonti dei figli. Vengono controllati campi,limite600,uguaglianza testo/frammenti,quantità e finestre di ogni risposta. Il codice ricompone esclusivamente i testi autentici,non li riscrive,tronca o riassume. Il lettore originale dell’intero audit viene eseguito dopo la ricomposizione;segue il normale riesame indipendente di tutte le motivazioni. Un frammento accettato non è un’approvazione semantica o della guida e non produce un falso raw del provider per il padre.

Le risposte accettate si riusano dopo interruzione;layout e fonti mancanti/alterati vengono respinti. Le versioni storiche e le risposte intere già pagate restano leggibili senza ricomprarle. I descrittori originali restano identici:le unità di dimensionamento sono metadati del pianificatore,non cambiano l’identità del testo o l’approvazione.

## Contabilità senza espansioni

I frammenti dello stesso audit condividono lo slot logico originario. Il primo invio occupa quello slot,ogni invio aggiuntivo usa i16crediti condivisi esistenti. Non vengono aggiunti slot di base o rinnovati i due errori di formato/due riesami negativi. Il piano verifica prima degli invii tutte le richieste della partizione,le chiamate future e i crediti disponibili;se non bastano,nessuna chiamata della nuova partizione viene acquistata. Ogni effettivo retry resta soggetto agli stessi blocchi persistenti.

Base148,massimo164perjob,crediti16,tetti551/500/500,pool1500 e riserva24perciascuna successiva invariati. Sulle richieste autentiche note non serve partizionare né aggiungere chiamate obbligatorie. Eventuali frammenti extra in contesti più grandi consumano il margine esistente e possono causare uno stop per budget:non garantiamo il completamento di ogni guida entro164.

## Verifiche eseguite

- **273 test distinti verificati su28file pertinenti**,non la suite dell’intero repository. La suite ampia ha272pass e un timeout a60s;lo stesso caso passa isolato in26,506s,con la soglia originale e tutte le asserzioni invariate. Il report negativo è conservato:il riesame sostituisce quel solo esito,non si sommano doppioni. I28test mirati sono inclusi nel totale. Coperti ricomposizione di17destinazioni,riesame completo,due negativi,interruzione e riuso,riserva prima degli invii,credito16,finestra/quantità/testo600,fonti mancanti,layout e padre estranei,lettura senza scritture. Un test attraversa la vera riparazione degli audit,la ricevuta partizionata e il lettore completo del setup,poi riapre senza richieste.
- Matrice di **102 forme di output**:1–17destinazioni nei6contesti autentici dei due setup. Tutte rientrano nelle stime di output con i379campioni conservati. È una matrice di dimensionamento,non una dimostrazione di legalità di17azioni in ciascun turno. Le due richieste reali congelate da2e4destinazioni sono inoltre pianificate con prompt/schema/contesto completi:56.446/58.180token input stimati,12.000output e30.000caratteri previsti,entro target e limiti.
- Percorso applicativo completo con risposte sintetiche:due liste distinte,due scenari con assegnazione di Energia e audit inizialmente nulli,tutti i lettori,critiche finali,salvataggio,rilettura JSON e recupero senza richieste.42risposte sintetiche,zero crediti di riparazione consumati nel percorso ordinario. La partizione forzata è verificata separatamente;il percorso sintetico completo non approva una nuova guida reale.
- Esecuzione completa separata dal framework:44.691s a freddo,1.140s al recupero,650.68MiB;passano60s/10s/768MiB. Typecheck incluso nella build e build Electron passati. UI sulla nuova guida sintetica a1440/1280/640px,zero errori;anche una guida sintetica storica completata è recuperata senza provider.
- Otto archivi immutabili verificati per799/799/794/798/784/783/903/892file. Tre database reali e39tabelle per ciascuno identici all’archivio terminale. Cambiano6source/test preesistenti,si aggiungono modulo e test della partizione;gli altri565file qualificati restano identici.

## Ripresa reale verificata su copie

Il job0793c786-e318-44d9-9f4c-a52357d68202 riusa il primo audit da540/544caratteri e il riesame pass già pagati. Raggiunge soltanto l’audit del secondo turno,con3scelte più confronto,senza ricomprare piano o setup e senza una terza costruzione. La richiesta viene intercettata prima del provider.

Restano12raw,due rifiuti,379campioni e tutte le8223evidenze originali nel database copiato. Primo replay8,171s,riapertura5,011s,picco490,66MiB entro le soglie. I crediti reali rimangono4usati/12residui;la seconda apertura addebita correttamente nella sola copia il retry interrotto,senza reset. Gli altri due matchup superano l’avvio isolato su copie fino alla richiesta di piano. Un nuovo primo job è respinto prima di creare un job o chiamare il provider.

## Budget prima di altra rete

| Voce | Stato |
| --- | --- |
| Consumo v28 /storico |399 /475|
| Nuove chiamate APP-246 |0|
| Guide nuove reali valide |0/3|
| Tetti cumulativi /pool /riserva |551/500/500 –1500 –24ciascuna successiva|
| Residui per guida /pool |152 /500 /500 /1101|
| Job esistente |12invii,4crediti usati/12residui,gate tecnico di ripresa passato|
| Richiesta successiva |58.180input stimati,12.000output riservati,30.000caratteri previsti|
| Riserva della richiesta |18chiamate future;minimo fase19,non stima del completamento|
| Nuovo primo job |164 di disponibilità contro152;non ammesso,deficit12|

Massimo contrattuale152ulteriori sul job esistente e164perciascuna guida successiva:480nuove nel percorso noto,879v28/955storiche;non quota né garanzia. La riserva24+24 resta mantenuta. Le chiamate o i crediti extra per partizioni sono conteggiati,mai aggiunti ai tetti.

Questo incremento non riapre la campagna fermata e non crea grant o runner reali. Tutti i controlli e lo scaling restano attivi,nessun contenuto AI reale è modificato manualmente,held-out esclusi. Il superamento dei gate offline non dimostra ancora che i futuri testi reali supereranno tutti i critici.

Evidenze in .verify/app246-audit-sizing-20261106:verification.json,budget.json,replay-*.json,sizing-matrix.json,matrix.mjs,standalone-integration.json,ui/result.json. Suite .verify/app246-regression-tests.json e build .verify/app246-build.log.
