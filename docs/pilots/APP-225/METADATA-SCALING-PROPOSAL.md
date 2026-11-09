# Proposta — Partizionare calcoli e critiche dei casi grandi

**Implementazione locale APP-227 autorizzata, in verifica.** Questa pagina conserva il disegno iniziale. Stato, prove e budget correnti sono nel [report di verifica](METADATA-PARTITION-VERIFICATION.md). Il replay della correzione end-turn superava la costruzione del turno ma fermava un singolo caso a133085 token contro128000. La compressione reversibile provata non bastava. Un aumento delle chiamate non risolve il limite di input.

Il prossimo incremento deve dividere il lavoro mantenendo tutte le prove attraverso più richieste, anziché richiedere l'intero insieme dei rami in ogni chiamata.

1. Calcolare prima le dimensioni delle unità reali, con l'attuale calibrazione e riserva. Conservare la via attuale quando entra nei limiti; attivare la partizione soltanto per un blocco dimensionale di una singola unità.
2. Valutare ciascun ramo o gruppo ammesso con setup,prefisso,azioni,risorse,ricevute e fonti completi. Persistenza e cache devono includere progetto,job,piano adottato,hash di tutti gli input e requisiti originali. Il risultato intermedio non approva la guida.
3. Costruire i confronti necessari fra risposte,ritirate,promozioni e prove di rimozione in unità limitate. Un indice locale deve dimostrare copertura di tutti i rami e obblighi,comprese le interazioni incrociate; nessuna scelta della risposta migliore può basarsi soltanto su riassunti non verificati.
4. Applicare la stessa partizione alle critiche indipendenti. L'attestazione finale deve verificare copertura,coerenza e dipendenze dell'intero caso e della prosa. Contraddizioni,prove mancanti e obiettivi non adempiuti tornano alla costruzione; nessun pass trasferito da un frammento all'intera guida.
5. Prevedere prima della rete tutte le nuove unità e i loro riesami,anche alla ripresa. Se una singola unità indivisibile non entra,oppure la riserva non basta,fermarsi esplicitamente conservando il lavoro.

Restano invariati i limiti di token,la calibrazione conservativa,il massimo autorizzato di invocazioni e tutti i controlli fisici e tattici. Non eliminare rami storici,obiettivi o fonti per ridurre il contesto. Il protocollo nuovo deve conservare identità e lettura degli input già pagati,con invalidazione esplicita delle sole dipendenze cambiate.

Prima della rete servono regressioni indipendenti dai tre esempi:insiemi crescenti di rami,interazioni fra unità,testimoni omessi o duplicati,stato/fonti alterati,ripresa dopo un frammento e riuso di critiche fuori contesto. Va provato anche un caso irriducibile che rimane correttamente bloccato. Ripetere poi il replay sul job fermo senza provider e ricalcolare il budget effettivo delle fasi mancanti. Questa proposta non autorizza una nuova campagna o una modifica del contratto già congelato20.
