# Obiettivi originali dei rami: esecuzione e critica

L’epoca12 è conclusa senza guide valide: **149 chiamate v28,0/3 nuove valide**,225 includendo le76 precedenti.21 invocazioni nuove126–146,in1101.73s;processo29736 terminale exit1. Il controller ferma prima147 in `branch-plan-cases`:tre residue sul primo contro sette minime per accedere alla fase. Gli altri due job restano assenti. Archivio509 file,481 input live invariati,112 checkpoint,binding e chunk SQLite confrontati.

La nuova diramazione iniziale funziona come protocollo:prima mossa costruita,critica130 negativa,riparazione131 e pass132 prima della replica. Tutte le nuove repliche e continuazioni vengono poi completate,dopo due riparazioni automatiche degli audit. I metadata145/146 richiedono però ancora alternative:Ascension e accesso con Trade nel primo caso,difesa con Zekrom a parità di risorse e pescata nel secondo. Non sono scenari approvati;nessuna prosa o guida è stata salvata.

## Difetto osservato

L’assegnazione del ramo iniziale conserva un requisito originale su Ascension e una motivazione che lo richiama. Il seed selezionato contiene invece un goal abbreviato sulle azioni avversarie Trade/Night Joker. La scelta aggiunge `forkAtTurn:0`,ma la costruzione riceve soltanto quel seed:requisiti e motivazione restano nell’archivio,senza arrivare all’esecuzione. Il turno cambia l’ordine delle ricerche e mantiene Jolting Charge.

La critica preliminare riceve prefisso e fonti,ma non l’assegnazione originale. Può quindi approvare la correttezza della mossa senza verificare se dimostra l’alternativa richiesta. Questa è una perdita di contesto tra pianificazione ed esecuzione;un registro corretto e un pass generico non bastano.

## Correzione generale

`guide-reply-objective.ts` recupera gli originali dell’assegnazione AI dalle scelte immutabili:seed esatto,requisiti identificati dal loro hash e motivazione. Verifica job/progetto,packet,caso,linea principale,contesto,selezione,fonti e corrispondenza al piano adottato. Non riscrive testi,non deduce azioni dai nomi e non seleziona una variante al posto dell’AI. Le assegnazioni compatibili vengono conservate senza perdere requisiti ripetuti.

I nuovi turni ricevono `branchAssignment` quando esiste un’assegnazione. Le richieste storiche senza assegnazioni mantengono l’identità. I checkpoint nativi pagati restano conservati:aggiungere contesto al lavoro futuro non riscrive i turni precedenti.

La critica della prima mossa alternativa riceve `branchObjective`:requisiti originali,motivazioni,goal,mossa di riferimento e pescata fissa. Deve verificare la parte dell’obiettivo relativa al primo turno,distinguendola da replica e seguito futuri. `goalEvaluation` lega il risultato all’hash dell’intera assegnazione,con esito,motivazione e indici degli eventi. Un pass con obiettivo iniziale dichiarato non eseguito è respinto localmente,come hash o indici estranei/duplicati. Non basta riordinare le azioni quando è richiesto un diverso attacco.

Cache e risultato sono vincolati anche all’obiettivo. Un pass storico della sola premessa resta evidenza storica:può informare una scelta di riparazione,ma non approvare esecuzione o metadata correnti. Un ramo già completo riceve il nuovo controllo prima di riusarne il seguito. Se passa conserva tutti i turni;se respinto invalida soltanto quel ramo,con feedback durevole e riparazione prima del seguito. Un ramo completo mai esaminato non viene trattato come migrazione autorizzata.

La prova sull’obiettivo viene conservata separatamente dal riesame ordinario nel record del feedback. I lettori completi del setup ricevono la revisione ordinaria invariata,con tutti i rilievi;la prova aggiuntiva resta archiviata e disponibile al costruttore. Nessun allentamento di schema,registro,audit,critiche o controlli di pubblicazione. Il nuovo giudizio sull’adempimento resta una verifica semantica AI,non una prova matematica della strategia.

## Verifiche e limiti

Passano26 test mirati e typecheck. Coprono trasferimento esatto dei requisiti e della motivazione,scope estraneo,hash/indici,pass incompatibile con obiettivo non eseguito,migrazione con conservazione dei turni,migrazione negativa prima di altra costruzione,assenza della critica originaria,ripresa e routing al setup senza perdita dei rilievi. Sono fixture sintetiche,non una nuova prova di convergenza del provider.

Tre replay su copie conservano146 tentativi e112 checkpoint. Il replay diretto ricostruisce il packet nativo congelato,recupera requisito e motivazione su Ascension e conferma che il pass storico resta presente ma non approva il nuovo contratto. Non esegue una nuova critica AI:non dimostra quale sarà il suo verdetto reale. Il tetto corrente152 blocca prima del provider,tre residue contro sette richieste. La copia ipotetica168 raggiunge soltanto i due piani pendenti,senza ricomprare vecchi turni o riesami e senza invocazioni del servizio.

Suite completa **658 pass/44 esclusi**,106 file passati e37 esclusi su143,in542.59s;handle73351 terminale exit0,poi typecheck/build riusciti. Log `goal-bound-full-suite.log` e `goal-bound-build.log`. Freeze485 file,hash **73ac4f40fa6996d009eeebf99e7a123f92bfcc22343854781d7abd43080b3db0**,ricontrollato intatto dopo le verifiche. Anche i tre replay ripetuti sul codice definitivo passano. L’audit verifica13 archivi v28/diagnostico,481 input precedenti e binding/chunk correnti;nessun contenuto reale modificato manualmente. La policy654/UI resta una prova separata,da riallineare e verificare in combinazione prima dell’adozione.

Tetti autorizzati invariati152/200/riserva24:51 residue nel pool,tre sul primo e48 riservate. Stop globale chiuso,nessun grant nuovo. È preparato soltanto un runner proposto168/216/riserva24,senza autorizzazione alla rete. Consentirebbe67 nuove invocazioni,19 sul primo e48 riservate,massimo292 storico;+16 sui due tetti. Sette è solo la soglia della fase corrente;nuovi piani,controllo dell’obiettivo e riparazioni possono richiedere altro lavoro. Suite/build,sigillo,guardia/preflight e typecheck del runner sono conclusi.482 input congelati,seal **c88156129badfa8b5f28fed069e23983055997cf7bf479713f427c11649060ce**. Prima di altra rete serve nuovo consenso specifico all’aumento e alla riapertura sul nuovo codice. Nessuna garanzia di approvazione. [Protocollo epoca13](CAMPAIGN-EPOCH13.md).

Defaultv27 e guardia realev28 nell’app restano;policy654/UI separata non adottata e da riallineare prima della verifica combinata. Gli held-out restano esclusi. Mancano ancora tre valide reali,persistenza/riapertura/UI,generalità,policy/calibrazione e attivazione verificata. APP-225 e l’obiettivo completo restano aperti.

Evidenze in `.verify/app225-segments-20261102/`: `epoch12-live.log`, `campaign-v28-epoch12-archive/manifest.json`, `campaign-v28-epoch12/metadata-observed.json`, `goal-bound-targeted-5.log`, `goal-bound-typecheck-3.log`, `goal-bound-real-replays-2.log`, `goal-bound-real-context.json`, i due `goal-bound-sizing-replay-0-*.json`, `goal-bound-preservation.json` e `goal-bound-freeze/manifest.json`.
