#!/usr/bin/env bash
# Retry only recognized transient download failures. Validation/build failures
# keep their exit code immediately; every downstream smoke/provenance gate stays.
set -euo pipefail
if [[ $# -eq 0 ]]; then
  echo 'Usage: retry-ci-download.sh command [arguments...]' >&2
  exit 2
fi
for attempt in 1 2 3; do
  log=$(mktemp)
  if "$@" 2>&1 | tee "$log"; then
    rm -f "$log"
    exit 0
  else
    status=$?
  fi
  if [[ $attempt -eq 3 ]] || ! grep -Eqi 'Response code (429|5[0-9]{2})|HTTP[^0-9]*(429|5[0-9]{2})|ECONNRESET|ETIMEDOUT|EAI_AGAIN' "$log"; then
    rm -f "$log"
    exit "$status"
  fi
  rm -f "$log"
  echo "Transient download failure; retry $((attempt + 1))/3 in 5 seconds." >&2
  sleep 5
done
