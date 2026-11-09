# APP-225 — Fine turno esplicita nelle alternative

Stato: correzione generale locale; prove reali ferme su richiesta dell'utente. L'obiettivo complessivo delle tre nuove guide valide e dell'app pronta resta incompleto.

## Esito della prova ampia20

Codice congelato durante il live. Su richiesta esplicita `call_89fe317090b94dc6b01f5f3a11c7ef65/0`, arrestato soltanto l'albero verificato del runner. Sessione39419 terminale exit1 per terminazione richiesta,3429.52secondi: **50 nuove invocazioni**,235 v28=232 principali+3 diagnostiche,311 incluse76 precedenti. **0/3 guide reali valide**; gli altri due job non sono partiti.16 unità accettate localmente,32 respinte sullo stesso ramo,un timeout204 eultima232 interrotta senza risultato assegnato. Il timeout non è attribuito al difetto del formato.

Prima di cambiare codice: snapshot grezzo, sola sospensione amministrativa del job con motivo user, confronto esatto di binding e chunk e archivio20 di541file/511input. Audit successivo:19 archivi/9559file integri,76 originali conservate e basi reali identiche alle copie archiviate per tutte le evidenze. Nessun contenuto AI corretto o adottato manualmente.

## Contratto corretto

La linea principale continua a richiedere l'attacco successivo dimostrato. Un'alternativa v28 può invece terminare il proprio seguito dichiarando **action=end-turn** nell'ultimo evento, senza riferimento a un attacco. Pescata ordinaria, azioni precedenti, sviluppo e audit restano completi.

L'evento di fine turno richiede kind=effect,affectedSide=ours,attack/attackPayment/trainer/retreat null; movimenti, percorsi energetici, osservazioni del mazzo, prove di uscita, destinatari delle assegnazioni e afterAttack devono essere vuoti. description e decisionProof delle alternative disponibili sono obbligatori. Il registro deriva gli stessi conti e posizioni: la fine del turno non prende Premi, non esegue effetti nascosti e non è terminalità della partita.

Il marcatore è ammesso soltanto nella posizione finale dell'alternativa. Nel registro compilato diventa un evento other senza azione di gioco; la dichiarazione originale end-turn resta conservata nei nativi e verificata alla rilettura. Il prefisso meccanico non è un'approvazione della guida. Gli obiettivi originali non realizzati, compresi eventuali attacchi richiesti dal goal, restano al riesame e al pianificatore.

Nessuna condizione su carte, nomi di mazzi o identificativi dei tre matchup. Versioni storiche e linea principale conservano i requisiti precedenti. Sourcefreeze471/d71efa1d2dfa1f319f66e6ec0f9663ffa591fb893b4c97d2cb3f7a399bf2c4c2; defaultv27/guardv28 conservati,policy applicativa isolata non adottata.

## Verifiche

Quattro nuove regressioni coprono fine turno alternativa,rilettura del prefisso,risorse,attacco obbligatorio della linea principale e versioni precedenti,rifiuto di effetti nascosti o audit/sviluppi mancanti. Il protocollo sintetico completo attraversa costruzione,critiche,prosa e salvataggio/rilettura tramite ProjectStore: verifica il contratto e la persistenza,non la qualità o convergenza AI. Cinque mirati finali passano,compreso il controllo storico v10 ripristinato; il messaggio di quel controllo era regredito nella suite intermedia,conservata come negativa e arrestata prima della correzione finale.

Quattro replay su copie passano:probe sintetico non adottato sul prefisso reale; ripresa dalla sola costruzione pendente e blocco corretto dei metadata prima della rete; due matchup intatti raggiungono solo il piano iniziale.232 invocazioni/161 checkpoint storici preservati,originali immutati,zero chiamate al provider. Typecheck e build finali passano. Suite completa finale42346 terminale exit0: **678 pass/44 esclusi**,111 file passati/37 esclusi,917.73secondi. I471 input del freeze sono identici dopo tutte le verifiche.

## Ripresa e budget

I tetti500 per guida/1500 v28/riserva24 restano invariati:1265 residue complessive,265 sul primo,500 per ciascuno dei successivi. Questi sono saldi,non una previsione di completamento o un nuovo grant dopo lo stop. La prima guida è una ripresa con185 invocazioni precedenti; non rappresenta il costo a freddo delle altre due.

Dopo il probe,il pianificatore ferma i metadata: **133085 token input stimati contro128000**,fattore conservativo1.5933849345675073 su217 campioni invariato. Il totale149277 è sotto176000 e264 chiamate rimangono nella copia: il vincolo attivo è l'input,non la quantità di invocazioni. Una nuova ripresa oggi si fermerebbe ancora prima dei metadata.

Due esperimenti isolati di compattazione reversibile,senza provider o adozione,non bastano:frammenti testuali132953 e finestra delta più ampia133049,ancora oltre128000. Non cambiare soglie,calibrazione o obblighi per rendere verde il caso. Il prossimo passo è una partizione generale di calcoli e confronti,estesa alle critiche che ricevono gli stessi casi grandi: [proposta](METADATA-SCALING-PROPOSAL.md). Nessuna nuova chiamata reale prima della soluzione verificata e di una ripresa esplicitamente autorizzata.

Evidenze in `.verify/app225-segments-20261102`:epoch20-final-measurement.json,turn-ending-preservation.json,turn-ending-{narrow-targeted,final-replays,final-typecheck,final-build}.log,turn-ending-real-prefix.json,turn-ending-resume-copy.json e turn-ending-freeze/manifest.json.
