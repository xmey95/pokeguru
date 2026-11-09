# APP-225 — Continuità dei requisiti nelle riparazioni

Aggiornamento 2026-11-04T09:17:29.640Z. Nessuna chiamata al provider in questa verifica offline.

La prova17 è terminata a180 chiamate v28 (177 principali+3 diagnostiche),256 con le76 precedenti,0/3 nuove guide valide. L’ultima risposta177 omette quattro carte dagli scarti nell’audit;il controller ferma correttamente il retry a4 chiamate residue contro5 richieste. L’errore di contenuto e lo stop di budget restano validi.

## Difetto riprodotto

L’audit readonly trova una scelta che sostituisce l’unico testimone di un obbligo precedente,a linea principale/packet/scope invariati. Non si tratta di un ciclo esatto degli hash:le formulazioni e i piani cambiano mentre un’obbligazione scompare. epoch17-requirement-loss-audit.json e requirement-retention-real-audit-v2.json contengono la prova. Non tutti gli ID non assegnati implicano rami mancanti:più richieste possono descrivere lo stesso testimone.

## Contratto generale

- Il ledger ricostruisce gli originali goal,reason,sourceIds e gli ID dalla sola ascendenza dei piani adottati. Verifica contesto,selezione,bisogno metadata,decisione,hash e scope;proposte non adottate non creano obblighi.
- Le nuove selezioni conservano uno snapshot verificabile del ledger. La scelta AI deve conservare o riassegnare ogni obbligo,anche a varianti precedenti. Una mappatura è un’intenzione,non una prova tattica.
- Metadata e critico ricevono tutti gli obblighi e le assegnazioni. Solo gli indirizzi opachi interni della provenienza rimangono fuori dal nuovo protocollo AI;il ledger integrale resta nell’archivio verificato.
- Il critico indipendente compila un audit esatto per ogni coppia caso/requisito:risolto con testimone e turni correnti,superato motivando da fonti/condizioni,o ancora aperto con finding azionabile sullo stesso caso. Nessun pass con aperti. L’approvazione salvata rivalida l’audit.
- I rifiuti storici e le richieste senza ledger conservano il contratto precedente. Le assegnazioni storiche sono limitate all’ascendenza del piano esaminato,senza contaminazione da scelte successive.
- Le riparazioni con ledger possono crescere dagli extra già presenti più i nuovi bisogni,entro il tetto strutturale60;il caso freddo resta5. I limiti di input,output,byte,chiamate e le riserve sono invariati.
- Lettore v28 e originali persistiti conservano tutti i rami e l’eventuale fork iniziale,con i rispettivi sviluppi. Nuovo job ricostruisce le dichiarazioni senza copiare approvazioni. I protocolli precedenti respingono ancora9 opzioni.
- Il fallback di trasporto inlining conserva basi delta,letterali,ordine delle chiavi e JSON espanso esatto. Stessa grammatica v3/v4 e calibrazione;non cambia richieste già ammesse. Prove di frasi condivise e finestre maggiorate restano solo diagnostiche non adottate.

## Verifiche e limiti

Primo freeze intermedio:668 test passati/44 esclusi. Freeze finale468 file,sigillo05298f44df4539f2db472ea9676ef6b96abdfb1b1c9f22339933fbcd91a62b9c:24 mirati,typecheck/build passati;**671 passati/44 esclusi sul freeze finale**,sessione70481 terminale exit0,502.37s. I mirati includono ledger,riassegnazione,audit negativo/duplicato/estraneo,critica storica,salvataggio e ricostruzione9 rami e fork0,letterali/delta e stop su input non comprimibile. Sono protocolli sintetici,non qualità competitiva o convergenza reale.

Cinque replay su copie passano:184 blocca prima del provider;185 e200 ipotetici raggiungono solo segments-reply-next con feedback177;altri casi solo piano su copie24. Un’aggiunta dell’esatto testimone storico misura soltanto la capienza:non è un piano adottato né un contenuto della guida,usa peraltro lo schema ancora da8 e quindi sottostima l’eventuale richiesta da9. Anche compattata supera128000 input (128817):resta un limite reale. Non aumentare soglie o dichiarare che tutte le guide entreranno;la pianificazione può condividere testimoni realmente equivalenti e deve passare tutte le critiche.

Il minimo attuale5 è solo la soglia per la fase pendente. Le riparazioni e i riesami successivi sono ignoti. Proposta200 per guida/248 v28/24 di riserva:68 nuove massime,20 al massimo sul primo,324 storiche;non autorizzata e senza garanzia di riuscita. Il codice della nuova prova deve essere congelato e sigillato;prima di invii occorre nuovo consenso perché i tetti184/232 sono ancora vincolanti e lo stop globale17 è terminale.

Restano tre guide reali valide,verifica UI/persistenza/riapertura,giudizio di generalità,policy app riallineata/adottata e attivazione v28 con build utilizzabile. Defaultv27,guardv28,policyv4 isolata e held-out esclusi. Nessun merge/release/installazione o modifica manuale dei contenuti.

## Ripresa pronta e non autorizzata

Prepare/seal/guard/preflight e TSC del runner epoca18 passano,497 input congelati,sigillo cd2febd3996acacb15cde6a22dbc197b40960c8f006236de1e934a858073b7b5. Le tre basi e il binario sono ricontrollati;grant e live assenti. verification-requirement-retention.json e verification-epoch18-preparation.json registrano proof e proposta. I metadata attuali entrano a125373 input,con la medesima calibrazione conservativa;il dimensionamento da9 resta bloccato. Verifica di17 archivi/8495 file e confronto dei binding/chunk con il terminale17,più76 precedenti invariati. Nessun codice specifico dei matchup nelle22 sorgenti cambiate.
