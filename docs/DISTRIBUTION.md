# Provenienza dei pacchetti

La release su `main` costruisce AppImage Linux e installer NSIS Windows in job separati. Ciascuno crea `provenance-<piattaforma>.json` con commit SHA, ID dell'esecuzione GitHub Actions, nome, dimensione e SHA-256 del pacchetto. Un job successivo ricontrolla entrambi i manifest e genera un'attestazione GitHub/Sigstore sui quattro file. Il job di pubblicazione verifica di nuovo hash, commit, ref `main` e identità del workflow firmatario prima di creare il tag e pubblicare i cinque asset (due pacchetti, due manifest, `SHA256SUMS.txt`). Una discrepanza ferma la release.

Per verificare un pacchetto scaricato dalla prossima release:

1. Confronta lo SHA-256 del file con `SHA256SUMS.txt` e con il manifest della sua piattaforma. Controlla che il `sourceSha` nel manifest sia il commit del tag della release.
2. Esegui `gh attestation verify <file> --repo xmey95/pokeguru --source-digest <sourceSha> --source-ref refs/heads/main --signer-workflow xmey95/pokeguru/.github/workflows/release.yml` per ciascun pacchetto e manifest. Il comando interroga le attestazioni del repository e verifica la firma e il digest. La procedura richiede accesso a GitHub.
3. Su Windows, se il pacchetto dichiara una firma Authenticode, verifica anche l'editore con `Get-AuthenticodeSignature` sull'installer. Un'attestazione GitHub e la firma dell'editore sono controlli distinti.

I pacchetti pubblicati prima di APP-098 non hanno questa attestazione. Non attribuire loro retroattivamente la provenienza del nuovo workflow.

## Firma nativa

L'installer Windows resta senza firma Authenticode finché non è disponibile un certificato di code signing del publisher. Il workflow è predisposto a ricevere `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` come secret GitHub; quando sono presenti, controlla che sia l'eseguibile sia l'installer abbiano firma valida e fallisce in caso contrario. Prima di configurare i secret serve scegliere identità/editore e certificato, custodire la chiave fuori dal repository e provare una release su Windows. L'AppImage non incorpora una firma GPG: l'attestazione GitHub copre provenienza e integrità del file scaricato, mentre una firma incorporata richiederebbe una chiave di distribuzione e un flusso di verifica Linux separati.

La prima esecuzione reale del workflow aggiornato va controllata prima di considerare verificata la pubblicazione end-to-end. La prova locale di APP-098 ha controllato i manifest su file di prova, inclusi manomissione, ID esecuzione diverso e file inattesi; non ha creato né pubblicato una release.

Fonti: [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [verifica con GitHub CLI](https://cli.github.com/manual/gh_attestation_verify), [electron-builder 26 Windows signing](https://www.electron.build/v26/docs/features/code-signing/), [firma AppImage](https://docs.appimage.org/packaging-guide/optional/signatures.html).
