# APP-232 — Campagna reale v3 con candidati predisposti dal codice

**Aggiornamento offline successivo:** i tre difetti osservati sono corretti e verificati su copie; nessuna nuova chiamata reale o guida approvata. Questa pagina conserva l’esito storico della campagna. Stato corrente in [ROUTING-RECOVERY-TURN-PARTITION.md](ROUTING-RECOVERY-TURN-PARTITION.md).

5 novembre 2026. **Campagna conclusa con esito negativo: 0/3 nuove guide valide.** Crustle–N’s Zoroark si ferma prima della costruzione delle repliche. Gli altri due matchup non sono stati avviati, rispettando lo stop globale al primo esito non valido. Nessuna guida o risposta incompleta salvata come valida.

## Esecuzione autorizzata

Istruzione diretta: «Procedi con la ripresa reale sui tre matchup, senza interventi manuali, mantenendo tutti i controlli e lo scaling, entro 500/1500 e riserva 24. Ferma la campagna al primo esito non valido.» Nessuna ulteriore conferma richiesta. Codice congelato su **688 input**, seal `3bee86689b0e8f5a5a38045f035992cde75536008b4252b021c8f18153e284ea`.

Runner **20425**, terminale exit 1. Durata: **17 minuti e 56 secondi**, **23 nuove invocazioni**. Stesso job Crustle `8d09e700-7b4d-44c8-8cf8-96ded5568d2b`, su database isolato collegato ai precedenti. Nessun contenuto AI corretto manualmente, nessun caso held-out utilizzato, nessuna modifica al codice durante la prova.

Totali: **291 v28** (288 principali e 3 diagnostiche), **367 storiche** con le 76 precedenti. Restano **209 sul primo matchup e 1.209 nel pool** entro i tetti 500/1.500 e riserva 24. Questi residui non autorizzano un riavvio della campagna conclusa.

22 chiamate hanno uso misurato: 1.015.631 token di input e 36.586 di output. L’uso della chiamata fallita non è disponibile e non viene contato come zero. Calibrazione finale: 271 campioni, fattore conservativo 1,5933849345675073.

## Risultati effettivi

La prima chiamata ripara il solo audit della promozione del primo scenario, riutilizzando piano, quadro e quattro turni già pagati. Il setup supera poi il lettore completo. Anche il secondo setup arriva a una validazione completa, dopo una ricostruzione automatica: nella prima proposta un movimento `prizes→hand` indicava una carta presente in mano e nel mazzo, ma non nei Premi congelati.

Sono costruite e controllate le prime mosse dei due scenari. I candidati del codice e le riparazioni locali degli audit funzionano in questa parte della prova: cinque richieste di audit complessive, tutte con giudizi AI autentici e registro immutabile durante la singola riparazione. Questo non certifica la correttezza di ogni motivazione.

La critica della premessa accetta il secondo scenario e respinge il primo. Una motivazione dell’audit storico di Dwebble dice che resta una sola copia di Crustle nel mazzo; la lista ne contiene due e nessuna è uscita dal mazzo. Il critico rileva correttamente la contraddizione e scrive esplicitamente che non occorre cambiare i movimenti.

La risposta del critico assegna tuttavia `repairScope: setup`; il coordinatore esegue quindi una ricostruzione completa della premessa. Il percorso nuovo di riparazione dei soli audit copre le incompletezze locali, **non questo instradamento dei rilievi semantici del critico**. Dopo quel rifiuto vengono effettuate sette chiamate: quadro, quattro turni storici, audit e nuova prima mossa. Il lavoro accettato sull’altro scenario viene riutilizzato.

L’ultima invocazione, sequenza 36 del job, termina con `output-limit` su **un’unica dichiarazione di turno**, non su un batch divisibile. Nessun risultato finale o risposta grezza completa è presente. La campagna termina qui senza avviare gli altri matchup. Non sono stati costruiti rami completi, capitoli, esercizi o revisioni finali; i test UI delle guide approvate non sono stati eseguiti.

## Diagnosi del blocco finale

Piano della richiesta fallita: input stimato 61.738, output riservato 6.000, margine 8.192, una unità, stima sotto target e limiti locali. Timeout 600.000 ms; il provider termina dopo circa 100.661 ms con exit 1 e ultimo evento `turn.failed`. Non è un timeout né esaurimento del tetto delle chiamate.

I 6.000 token sono una riserva del pianificatore. Non attestano il limite numerico del servizio o la quota effettivamente consumata. Il limite numerico di output e l’uso della chiamata fallita rimangono sconosciuti. Lo scaling dei batch non può dividere ulteriormente un’unità che già contiene un solo turno: questa unità resta un limite del metodo osservato.

## Verifica negativa della ripresa

Due riaperture del generatore reale su copia **non raggiungono la richiesta pendente**. Si fermano senza invii al provider sul vecchio errore dei Premi del secondo scenario.

La stessa esecuzione aveva conservato una proposta respinta, ordinale 0, e poi costruito e validato la successiva, ordinale 1, nello stesso contesto. Il recupero tenta nuovamente la proposta respinta prima di raggiungere quella successiva già pagata. Il salto dei negativi riconosce negativi successivi, ma non questo successore positivo. La ripresa è quindi **non verificata per questa storia di recupero**. La prova negativa è conservata; non è stata corretta a mano né trasformata in un replay verde cambiandone l’aspettativa.

Il replay precedente all’esperimento copriva un’altra storia reale, con due negativi locali conservati: il suo esito positivo rimane valido per quel caso, ma non dimostrava questo percorso. Le 422 verifiche precedenti non coprivano la nuova combinazione di rifiuto e successore positivo.

## Integrità ed evidenze

- Archivio immutabile `campaign-finite-v3-archive/manifest.json`: **706 file**, inclusi i **688 input congelati**, database e originali.
- Tutti i 688 input risultano invariati. I tre database coincidono con i backup su schema e **39 tabelle**, compresa `sqlite_sequence`; le sorgenti della campagna v2 rimangono intatte.
- Nessuna chiamata reale dopo lo stop. La diagnosi e i replay su copie non modificano i database reali. Nessun vecchio pass trasferito a una guida nuova, nessun override dei controlli o aumento del budget.

Evidenze in `.verify/app225-segments-20261102/`: `campaign-finite-v3/terminal.json`, `app232-finite-v3-inspection.json`, `app232-finite-v3-verification.json`, `app232-finite-v3-diagnosis.json`, `app232-v3-current-preflight-0.json` e `app232-finite-campaign-v3-live.log`.

## Stato per la ripresa del lavoro

APP-232 resta **In progress**, APP-225 Blocked e obiettivo completo non raggiunto. Nessuna nuova campagna proposta o avviata automaticamente. Prima di un eventuale altro live occorrono correzione generale e prove offline di:

1. instradamento tipizzato dei rilievi che richiedono solo giudizi di audit, preservando registro e rifiuto indipendente fino al nuovo riesame;
2. recupero del successore già validato dopo un singolo negativo, con autenticazione di entrambi gli originali e senza ricomprare il lavoro;
3. richieste native che possano progredire entro il limite di output anche quando resta un solo turno.

Sono problemi generali osservati; nessuna correzione per nomi o ID delle carte è stata introdotta. Questa campagna non prova la generalità della generazione: nessuno dei tre nuovi matchup ha una guida valida e gli altri due non sono stati eseguiti. Restano tre guide reali valide, salvataggio/riapertura/UI, audit generale, policy applicativa e build locale utilizzabile dall’utente. Default v27, guard v28 e profilo personale invariati.
