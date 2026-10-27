#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 || ( $# -eq 3 && $3 != --gatekeeper ) ]]; then
  echo 'Uso: smoke-mac-dmg.sh <pacchetto.dmg> <x64|arm64> [--gatekeeper]' >&2
  exit 1
fi

dmg=$1
case "$2" in
  x64) bundle=release/mac/Pokeguru.app; machine=x86_64 ;;
  arm64) bundle=release/mac-arm64/Pokeguru.app; machine=arm64 ;;
  *) echo "Architettura non supportata: $2" >&2; exit 1 ;;
esac

test "$(lipo -archs "$bundle/Contents/MacOS/Pokeguru")" = "$machine"
test "$(lipo -archs "$bundle/Contents/Resources/codex/bin/codex")" = "$machine"
hdiutil verify "$dmg" >/dev/null

mount=$(mktemp -d "${TMPDIR:-/tmp}/pokeguru-dmg.XXXXXX")
cleanup() {
  hdiutil detach -quiet "$mount" || true
  rmdir "$mount" || true
}
trap cleanup EXIT
hdiutil attach "$dmg" -readonly -nobrowse -quiet -mountpoint "$mount"
if [[ ${3:-} == --gatekeeper ]]; then
  codesign --verify --deep --strict --verbose=2 "$mount/Pokeguru.app"
  codesign --verify --strict --verbose=2 "$mount/Pokeguru.app/Contents/Resources/codex/bin/codex"
  xcrun stapler validate "$mount/Pokeguru.app"
  spctl --assess --type execute --verbose=4 "$mount/Pokeguru.app"
fi
node tests/package-smoke.mjs "$mount/Pokeguru.app/Contents/MacOS/Pokeguru"
