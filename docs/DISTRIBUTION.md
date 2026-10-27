# Distribuzione e provenienza dei pacchetti

La release su `main` costruisce AppImage Linux x64, installer NSIS Windows x64 e DMG macOS Intel e Apple Silicon in job separati. Ciascuno crea `provenance-<piattaforma>.json` con commit SHA, ID dell'esecuzione GitHub Actions, nome, dimensione e SHA-256 del pacchetto. Un job successivo ricontrolla i quattro manifest e genera un'attestazione GitHub/Sigstore su pacchetti e manifest. Il job di pubblicazione verifica hash, commit, ref `main` e identità del workflow firmatario prima di creare il tag e pubblicare i nove asset (quattro pacchetti, quattro manifest, `SHA256SUMS.txt`). Una discrepanza ferma la release.

## Problema noto della v0.2.1 su Apple Silicon

Un utente ha segnalato che il DMG Apple Silicon si monta e consente di copiare `Pokeguru.app` in Applicazioni, ma macOS mostra «L'app è danneggiata e non può essere aperta» all'avvio e non offre «Apri comunque». Sul suo Mac Intel la v0.2.1 si avvia dopo l'autorizzazione manuale. Entrambi i DMG v0.2.1 sono stati costruiti con `identity: null`, senza firma Developer ID né notarizzazione. Lo smoke test precedente montava il DMG e avviava l'eseguibile direttamente: non verificava l'apertura secondo la policy di Gatekeeper. Non è stata ancora verificata la copia scaricata sul Mac che mostra l'errore; non attribuire quindi il singolo errore con certezza alla sola firma.

Per controllare quel download, eseguire sul Mac `shasum -a 256 ~/Downloads/Pokeguru-0.2.1-macos-arm64.dmg` e confrontare il valore con `SHA256SUMS.txt` della [release v0.2.1](https://github.com/xmey95/pokeguru/releases/tag/v0.2.1). Il digest pubblicato per quel DMG è `6c8e9e3358a57b98a94b5b517d7e8bbe57bd1f0b9a15e86fb8d2662bc95e88a8`. Se non coincide, riscaricare il DMG dalla release. Se coincide, il file scaricato corrisponde all'asset pubblicato, ma non significa che macOS lo accetti. Non rimuovere globalmente le protezioni di Gatekeeper o la quarantena come rimedio di distribuzione.

Per verificare un pacchetto scaricato:

1. Confronta lo SHA-256 del file con `SHA256SUMS.txt` e con il manifest della sua piattaforma. Controlla che il `sourceSha` nel manifest sia il commit del tag della release.
2. Esegui `gh attestation verify <file> --repo xmey95/pokeguru --source-digest <sourceSha> --source-ref refs/heads/main --signer-workflow xmey95/pokeguru/.github/workflows/release.yml` per ciascun pacchetto e manifest. Il comando interroga le attestazioni del repository e verifica la firma e il digest. La procedura richiede accesso a GitHub.
3. Su Windows, se il pacchetto dichiara una firma Authenticode, verifica anche l'editore con `Get-AuthenticodeSignature` sull'installer. Un'attestazione GitHub e la firma dell'editore sono controlli distinti.

Su una futura release Mac firmata e notarizzata, verificare il DMG con `hdiutil verify <file.dmg>`, quindi l'app montata con `codesign --verify --deep --strict --verbose=2 <Pokeguru.app>`, `xcrun stapler validate <Pokeguru.app>` e `spctl --assess --type execute --verbose=4 <Pokeguru.app>`. La CI di release esegue questi controlli su entrambi i Mac; la CI delle PR continua a usare pacchetti non firmati come smoke applicativo e non certifica Gatekeeper.

I pacchetti pubblicati prima di APP-098 non hanno questa attestazione. Non attribuire loro retroattivamente la provenienza del nuovo workflow.

## Firma nativa

Per la prossima release macOS servono un certificato **Developer ID Application** e credenziali di notarizzazione Apple, salvati come secret GitHub e mai nel codice o in chat:

| Secret | Contenuto |
| --- | --- |
| `MAC_CSC_LINK` | Certificato Developer ID Application `.p12` codificato in base64. |
| `MAC_CSC_KEY_PASSWORD` | Password del certificato `.p12`. |
| `APPLE_API_KEY_P8_BASE64` | File `.p8` della chiave API App Store Connect codificato in base64. |
| `APPLE_API_KEY_ID` | ID della chiave API. |
| `APPLE_API_ISSUER` | Issuer ID della chiave API. |

Il preflight interrompe la release prima del packaging quando manca un secret o la chiave `.p8` non è leggibile. Il job conserva la chiave solo nel percorso temporaneo del runner, firma anche il Codex incluso, richiede la notarizzazione e controlla firma, ticket allegato e policy Gatekeeper sul DMG montato. Restano necessarie una prova effettiva con credenziali reali e una prova dal Finder su un Mac Apple Silicon prima di dichiarare risolto il problema della v0.2.1.

L'installer Windows resta senza firma Authenticode finché non è disponibile un certificato di code signing del publisher. Il workflow è predisposto a ricevere `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` come secret GitHub; quando sono presenti, controlla che sia l'eseguibile sia l'installer abbiano firma valida e fallisce in caso contrario. Prima di configurare i secret serve scegliere identità/editore e certificato, custodire la chiave fuori dal repository e provare una release su Windows. L'AppImage non incorpora una firma GPG: l'attestazione GitHub copre provenienza e integrità del file scaricato, mentre una firma incorporata richiederebbe una chiave di distribuzione e un flusso di verifica Linux separati.

La release v0.2.1 ha verificato manifest e attestazioni, ma non firma o notarizzazione Mac. La prossima esecuzione reale del workflow con i secret Apple va controllata prima di considerare verificata la nuova distribuzione end-to-end.

Fonti: [Apple sulla firma Developer ID](https://developer.apple.com/developer-id/), [Apple sulla notarizzazione](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [electron-builder 26](https://www.electron.build/v26/docs/notarization/), [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [verifica con GitHub CLI](https://cli.github.com/manual/gh_attestation_verify), [firma AppImage](https://docs.appimage.org/packaging-guide/optional/signatures.html).
