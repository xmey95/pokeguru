# Pokéguru v0.3.12

Le domande nelle Strategie possono ricevere una risposta già nella prima chiamata AI quando i testi originali forniti sono sufficienti. Se servono altre prove, il modello richiede le ricerche locali necessarie prima di rispondere. Modello e livello di ragionamento restano quelli scelti.

Restano i controlli su fonti, identità e testi delle carte, quantità, vincoli, ACE SPEC e ammissibilità delle candidate. Le carte nuove citate nella bozza richiedono ancora i testi originali e una revisione, anche dopo una ripresa. L'adozione della lista resta esclusivamente manuale.

## Misure e limiti

Confronto live con gpt-6.1-sol sullo stesso campione congelato di 32 partecipazioni già usato per APP-191, usando il percorso persistente di produzione:

| Domanda | Mediana precedente | Mediana v0.3.12 | Differenza |
| --- | ---: | ---: | ---: |
| Budew, tre coppie | 19,55 s | 14,62 s | −25,22% |
| Protezioni, due coppie | 15,97 s | 12,63 s | −20,86% |

Le sei prove puntuali, inclusa una domanda dipendente dallo storico, passano da **12 a 6 chiamate**; tempo cumulativo **104,41 → 80,37 s (−23,02%)**. Sono state verificate anche ricerca dei conteggi, sostituzione vincolata e miglioramento generale: quando servono prove aggiuntive, la ricerca viene eseguita.

Tutte le 18 risposte sono state confrontate con gli originali. Candidate complete e vincoli sono stati verificati; le prove negative respingono liste errate, vincoli violati, due ACE SPEC, stampe e fonti sconosciute. Nessuna regressione osservata nei criteri definiti, senza indebolire i validatori.

Il campione è ridotto e non dimostra equivalenza qualitativa universale, efficacia competitiva o latenza sull'intero archivio. Le risposte ampie di entrambi i flussi usano ancora una terminologia generica per Air Balloon, registrata in APP-194. [Protocollo, risultati e limiti](AI-FOCUSED-FLOW.md).

## Aggiornamento

La nuova prima chiamata si applica ai nuovi turni Strategie, workflow v5. I lavori già avviati mantengono algoritmo e checkpoint v1–v4; le guide Matchup restano v4. La prima risposta conserva il registro dei testi effettivamente consegnati al modello e può essere recuperata senza ripetere la chiamata. Schema del database **16**, senza nuove migrazioni.

Pacchetti per Linux x64, Windows x64, macOS Intel e Apple Silicon, con manifest di provenienza, attestazioni GitHub e `SHA256SUMS.txt`.

I pacchetti macOS usano firma ad hoc, senza Developer ID né notarizzazione; resta da provare l'apertura Finder su un Mac Apple Silicon esterno alla CI (APP-147). L'installer Windows è senza firma Authenticode. APP-187 mantiene l'indagine sui picchi intermittenti del renderer macOS. [Guida alla distribuzione](https://github.com/xmey95/pokeguru/blob/main/docs/DISTRIBUTION.md).

[Confronto completo con v0.3.11](https://github.com/xmey95/pokeguru/compare/v0.3.11...v0.3.12).
