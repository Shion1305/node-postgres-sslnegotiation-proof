#!/usr/bin/env bash
set -uo pipefail

# Certs (CA + server + front, all for localhost.shion.dev) are minted by the
# `certgen` service into the shared /certs volume before this runs.
mkdir -p /out

# Capture the raw bytes on the wire while the proofs run, so a reviewer can open
# the .pcap in Wireshark and SEE the SSLRequest packet (traditional) vs the TLS
# ClientHello (direct) without trusting our code. Capture is best-effort: if the
# container lacks NET_RAW the proofs still run and produce the other evidence.
PCAP=/out/capture.pcap
tcpdump -i any -s 96 -w "$PCAP" 'tcp port 5432 or tcp portrange 1024-65535' \
  >/out/tcpdump.log 2>&1 &
TCPDUMP_PID=$!
# Give tcpdump a moment to start sniffing before the first connection.
sleep 1

# Tee the full proof output so CI can attach the complete log as an artifact.
set +e
node proofs/index.js 2>&1 | tee /out/proof-output.txt
code=${PIPESTATUS[0]}
set -e

# Flush + stop the capture.
sleep 1
kill "$TCPDUMP_PID" 2>/dev/null || true
wait "$TCPDUMP_PID" 2>/dev/null || true

exit "$code"
