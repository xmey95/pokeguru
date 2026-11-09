param([switch]$ValidatedGuide, [switch]$AppTrial, [string]$ApprovedSource)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath
$bundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node).Source }
$nodeVersion = (& $nodePath --version).Trim()
$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'La demo richiede Node 24 o successivo.' }
$env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $env:PATH
& $nodePath 'node_modules/typescript/bin/tsc' --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Controllo dei tipi non superato.' }
& $nodePath 'node_modules/electron-vite/bin/electron-vite.js' build
if ($LASTEXITCODE -ne 0) { throw 'Compilazione della demo non riuscita.' }
if ($AppTrial) {
  if ($ApprovedSource) { & $nodePath 'scripts/pokeguru-trial.mjs' $ApprovedSource }
  else { & $nodePath 'scripts/pokeguru-trial.mjs' }
}
elseif ($ValidatedGuide) {
  if ($ApprovedSource) { & $nodePath 'scripts/validated-guide-preview.mjs' $ApprovedSource }
  else { & $nodePath 'scripts/validated-guide-preview.mjs' }
}
else { & $nodePath 'scripts/guide-demo.mjs' }
if ($LASTEXITCODE -ne 0) { throw 'Avvio della demo non riuscito.' }
