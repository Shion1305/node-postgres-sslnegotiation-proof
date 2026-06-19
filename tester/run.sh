#!/usr/bin/env bash
set -uo pipefail

# Certs (CA + server + front, all for localhost.shion.dev) are minted by the
# postgres container into the shared /certs volume before this runs.
mkdir -p /out

# Capture the raw bytes on the wire while the proofs run, so a reviewer can open
# the .pcap in Wireshark and see the SSLRequest packet (traditional) vs the TLS
# ClientHello (direct). Capture is best-effort: if the container can't sniff
# (no NET_RAW, etc.) the proofs still run and produce the other evidence.
PCAP=/out/capture.pcap
TCPDUMP_PID=""
if command -v tcpdump >/dev/null 2>&1; then
  # -U writes each packet to the file as it arrives, so a fast, short-lived run
  # can't leave captured packets stuck in a buffer that never gets flushed.
  tcpdump -i any -s 96 -U -w "$PCAP" 'tcp port 5432 or tcp portrange 1024-65535' \
    >/out/tcpdump.log 2>&1 &
  TCPDUMP_PID=$!
  # Give tcpdump time to start sniffing before the first connection. If it died
  # immediately (e.g. no permission), don't keep a dangling PID around.
  sleep 2
  if ! kill -0 "$TCPDUMP_PID" 2>/dev/null; then
    echo "tcpdump exited early; continuing without packet capture" >&2
    TCPDUMP_PID=""
  fi
fi

# Run the proofs under a hard timeout so the container can never hang CI. Tee the
# full output so it can be attached as an artifact; preserve the proof exit code.
timeout --signal=KILL 180 node proofs/index.js 2>&1 | tee /out/proof-output.txt
code=${PIPESTATUS[0]}
if [ "$code" = "137" ]; then
  echo "ERROR: proofs exceeded the 180s timeout and were killed" | tee -a /out/proof-output.txt
fi

# Stop the capture and let tcpdump flush its buffer to the .pcap. A plain SIGTERM
# makes tcpdump write out what it captured and exit cleanly; we bound the wait so
# the container can never hang, then force-kill only if it is still alive.
if [ -n "$TCPDUMP_PID" ]; then
  kill -TERM "$TCPDUMP_PID" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$TCPDUMP_PID" 2>/dev/null || break
    sleep 0.5
  done
  kill -9 "$TCPDUMP_PID" 2>/dev/null || true
fi

exit "$code"
