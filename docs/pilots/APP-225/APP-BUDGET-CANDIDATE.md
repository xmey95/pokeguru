# Componente isolato per il budget applicativo — APP-225

Preparato il 3 novembre 2026 mentre il consenso alla ripresa epoca9 è pendente. Il componente è in `.verify/app225-segments-20261102/policy-candidate/`, fuori da `src/` e dal codice congelato. **Non è collegato all’app o alla campagna** e non abilita v28. Nessun invio OpenAI, nessuna modifica ai contenuti AI, ai tetti reali o ai database della campagna.

## Comportamento realizzato nel componente

- La scelta iniziale riceve soltanto un massimo cumulativo intero. Job, progetto, versione v28 e impronta della richiesta vengono ricavati dal contesto del main process; il payload non può fornire un grant o cambiare proprietario.
- Una catena di ricevute immutabili conserva scelta iniziale, estensioni, precedente, massimo e tentativi già consumati. Una scelta iniziale differente sullo stesso job viene respinta. Le ricevute vengono verificate nuovamente dopo riapertura.
- Il consenso durevole precede l’uso del grant da parte della generazione. Se il processo si interrompe fra questi passaggi, il grant si ricostruisce dalla stessa ricevuta senza un invio AI. I grant vengono creati dal componente e verificati dal vero `guideAttemptLimit` esistente.
- L’estensione richiede uno stop persistito per il limite locale di chiamate. Quota del servizio, job in esecuzione e stato del budget obsoleto non vengono trattati come autorizzazioni a estendere. La ripetizione dello stesso comando già registrato è idempotente.
- L’estensione non riprende il job, non rinnova i retry di trasporto e non azzera i tentativi, compresi quelli falliti. La normale ripresa conserva il massimo precedente finché non esiste una scelta di aumento esplicita.
- Consumo, residuo e previsione dell’ultimo controllo restano separati. Un eventuale massimo stimato è consumo attuale più riserva del controllo, non una garanzia di completamento o una misura della quota Codex.
- Ricevute copiate da altri job/progetti/fonti, catene incoerenti e grant estranei superiori alla scelta applicativa causano errore; non diventano budget disponibili.

Il componente non sceglie un nuovo limite ordinario e non trasferisce il pool della campagna all’app. Il limite attuale di16 rimane invariato. La calibrazione del valore iniziale dipende ancora dalle guide reali; non viene sostituita dal tetto proposto128/176 della campagna.

## Prove eseguite e limiti

Quattro test mirati passano con SQLite reale, `AiJobStore`, `AiAnalysisWork` e `guideAttemptLimit` esistenti. Verificano riapertura fra scelta e uso del grant, normale ripresa senza aumento, estensione dopo stop locale, ripetizione dello stesso comando, conservazione dei tentativi falliti, isolamento e distinzione dalla quota del servizio. Le risposte AI non sono coinvolte; si tratta di job sintetici in nuovi database separati.

Il controllo dei tipi include app, test esistenti e candidato. Non è una prova IPC o UI e non aumenta il numero dei test della suite applicativa congelata: quest’ultima rimane a641 passati. Il primo lancio mirato ha respinto un’asserzione con un refuso nel messaggio atteso; il refuso è corretto e il test è stato ripetuto insieme agli altri, senza allentare il comportamento richiesto.

Evidenze: `policy-candidate-tests-final.log`, `policy-candidate-typecheck-final.log`, `verification-policy-candidate.json`. Il verificatore epoca9 continua a confrontare sorgenti, dati e freeze originali: la preparazione isolata non modifica ciò che l’utente è chiamato ad autorizzare.

## Collegamento applicativo ancora necessario

1. Aggiungere al flusso di avvio una scelta esplicita del massimo e persisterla nel workflow catturato dal main process. Dopo la creazione del packet, usare la ricevuta per fornire `attemptLimit` e autorizzazione a `generateDeepGuide`. La ripresa deve riusare la scelta congelata, non il valore corrente delle impostazioni.
2. Esporre un’azione distinta di estensione, verificando proprietà del job, packet congelato, stato e massimo atteso. Restituire alla UI i soli dati di presentazione; il grant rimane interno al main process. Aggiornare il massimo scelto mostrato senza falsificare il budget stimato dall’ultimo controllo.
3. Tenere separati «estendi budget», «riprendi» e «riprova dopo intervento». Una quota account esaurita non viene risolta aumentando il limite locale. Nessuna estensione automatica o reset dei consumi.
4. Verificare IPC, riavvio, richieste ripetute, isolamento tra progetti e UI sui flussi reali. Le guide storiche restano consultabili; non introdurre una migrazione implicita dei grant dei job della campagna.
5. Solo dopo le guide reali e gli altri criteri dell’obiettivo: calibrare il valore iniziale, adottare il componente nel sorgente applicativo, verificare il percorso completo e abilitare v28 nella build destinata all’utente.

Le importazioni del candidato puntano esplicitamente ai moduli del checkout. L’adozione dovrà sistemarne i percorsi ed eseguire i controlli sull’integrazione effettiva. Questo checkpoint riduce il lavoro residuo sulla policy, ma **APP-225 resta incompleta e le nuove guide valide restano0/3**.
