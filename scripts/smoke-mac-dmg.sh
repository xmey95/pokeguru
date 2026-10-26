#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo 'Uso: smoke-mac-dmg.sh <pacchetto.dmg> <x64|arm64>' >&2
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

mount=$(mktemp -d "${TMPDIR:-/tmp}/pokeguru-dmg.XXXXXX")
cleanup() {
  hdiutil detach -quiet "$mount" || true
  rmdir "$mount" || true
}
trap cleanup EXIT
hdiutil attach "$dmg" -readonly -nobrowse -quiet -mountpoint "$mount"
node tests/package-smoke.mjs "$mount/Pokeguru.app/Contents/MacOS/Pokeguru"
