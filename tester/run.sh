#!/usr/bin/env bash
set -euo pipefail

# Generate an ephemeral cert for the direct-SSL-only front (proof 4).
if [ ! -f /app/front.key ]; then
  openssl req -new -x509 -days 365 -nodes -text \
    -out /app/front.crt -keyout /app/front.key -subj "/CN=localhost" >/dev/null 2>&1
fi
export FRONT_KEY=/app/front.key
export FRONT_CERT=/app/front.crt

exec node proofs/index.js
