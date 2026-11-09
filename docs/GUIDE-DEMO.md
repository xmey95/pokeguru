# Provare le guide nell’app, senza chiamate AI

**Nuova guida verificata, 08-11-2026:** eseguire **Apri-guida-verificata-PokeGuru.cmd** per Crustle–N’s Zoroark. Apre una copia separata della prima nuova guida approvata, con lista da 60 carte, otto capitoli, due scenari e due esercizi. Il profilo è in sola consultazione e non avvia nuove chiamate. [Verifiche, consumi e limiti](pilots/APP-259/FIRST-VALID-GUIDE.md). Gli altri due matchup restano da completare.

Il comando storico descritto qui sotto rimane distinto.

Da questo checkout Windows aprire **Avvia-demo-PokeGuru.cmd**. Il comando compila il codice locale e apre una finestra «Pokéguru — Consultazione offline» con la fascia del pilota storico; non installa una release. Usa Node 24+ già presente e un runtime Electron locale. Non scarica dipendenze.

La fascia verde permette di scegliere:

- Toucannon–Dragapult;
- Toucannon–Festival;
- Dragapult–Hydrapple.

Sono le tre guide reali del pilota APP-217, con le rispettive liste originali da 60 carte. Contenuti, fonti e approvazioni storiche non vengono riscritti. Non sono le tre nuove guide ancora da validare e non sono aggiornate al metagame attuale. La compatibilità con l’app corrente non equivale a una nuova approvazione AI.

Provare l’indice dei capitoli, «Scenari commentati», i confronti delle repliche, «Mettiti alla prova» e le soluzioni degli esercizi. «Lista» mostra il mazzo originale; il pannello laterale lo mantiene visibile leggendo la guida. Si possono anche consultare versioni e testo importato.

La demo consente la consultazione. Generazione, revisioni, recuperi automatici, modifiche alle liste, aggiornamenti e apertura di siti esterni sono bloccati nel backend. I consumi mostrati in «Consumo storico del pilota» appartengono alla vecchia campagna: aprire la demo non avvia nuove richieste AI.

Ogni avvio prepara un nuovo profilo sotto `.verify/guide-demo/session-*`. Non usa il profilo personale dell’app installata, non cambia gli archivi del pilota o quelli della campagna interrotta. Per uscire chiudere la finestra; per riprovare usare lo stesso comando. Il percorso dell’ultima sessione è in `.verify/guide-demo/latest-session.json`.

## Verifiche e lavoro restante

APP-258 verifica le tre guide con i lettori condivisi, i controlli d’integrità e gli originali disponibili, poi SQLite/IPC/UI reali, isolamento dei progetti, riapertura e layout a 1440/1280/640 pixel. [Rapporto tecnico](pilots/APP-258/DEMO-OFFLINE.md).

Il generatore ordinario resta sperimentale e non abilitato in generale. Il percorso isolato ha ora prodotto la prima nuova guida valida; ottimizzazione e altri due matchup rimangono aperti. I profili di consultazione non cambiano le regole dei job storici, non cancellano rilievi e non avviano prove reali. La qualificazione generale resta distinta dalla consultazione del risultato.
