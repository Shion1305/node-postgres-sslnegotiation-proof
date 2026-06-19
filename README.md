# node-postgres sslnegotiation=direct proof

[![sslnegotiation proof](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml/badge.svg)](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml)

A containerized test that checks whether the `master` branch of
[node-postgres](https://github.com/brianc/node-postgres) works with PostgreSQL 17's
`sslnegotiation=direct`, the parameter added in
[PR #3688](https://github.com/brianc/node-postgres/pull/3688). The PR is merged
([`882fc308`](https://github.com/brianc/node-postgres/commit/882fc308cce7bf136cd1448e00395f760dad3e00))
but not yet on npm, so the test builds `pg` from source.

The whole thing runs under `docker compose`, and CI runs the same command you
would run locally.

## Background

`sslnegotiation` controls how the TLS handshake starts:

- `postgres` (default): the client sends an `SSLRequest` packet, waits for the
  server's `S`/`N` reply, and then begins the TLS handshake.
- `direct`: the client begins the TLS handshake immediately after connecting,
  advertising the `postgresql` ALPN protocol. This saves a round trip and
  requires SSL. PostgreSQL 17 or newer.

## Running it

```bash
docker compose up --build --abort-on-container-exit --exit-code-from tester
```

Exit code 0 means all checks passed. To test a different ref of node-postgres:

```bash
NODE_POSTGRES_REF=<branch|tag|commit> \
  docker compose up --build --abort-on-container-exit --exit-code-from tester
```

## What it checks

The tester runs four checks and exits non-zero if any of them fail.

1. End-to-end. A `sslnegotiation: 'direct'` connection runs a query, and the
   server's `pg_stat_ssl` view confirms the session is TLS 1.3. The traditional
   path is checked too, to catch regressions.
2. Wire level. A transparent byte-relay (it does not terminate TLS) records the
   first bytes each mode puts on the socket. Direct mode sends a TLS ClientHello;
   traditional mode sends the `SSLRequest` packet. This is what distinguishes the
   two code paths.
3. Connection string. `?sslnegotiation=direct` goes through the merged
   `pg-connection-string`, which auto-enables SSL. A live `verify-full`
   connection then succeeds against the test CA.
4. Direct-only endpoint. A TLS-only listener (ALPN `postgresql`) in front of
   Postgres accepts the direct client and rejects the traditional one, which is
   the behavior the PR describes.

Connections verify the server certificate against a private CA with
`rejectUnauthorized: true`. The client connects by the name `localhost.shion.dev`
(public DNS, resolves to `127.0.0.1`), so node-postgres sends it as the TLS SNI
and validates the certificate against it.

## Verifying a run

The badge reflects the latest run. To check the details, open a run under
[Actions](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml):

- The job summary has a pass/fail table with the commit tested, the first bytes
  seen on the wire, and the `pg_stat_ssl` values.
- The `sslnegotiation-proof-evidence` artifact contains the raw evidence:
  - `capture.pcap` — a tcpdump capture you can open in Wireshark
  - `postgres-server.log` — the server's own log of the connections
  - `evidence.json` — the data behind the summary table
  - `proof-output.txt` — the full proof log

In the capture, the two modes look like this on the wire:

```
postgres:  00 00 00 08 04 d2 16 2f    SSLRequest packet (request code 80877103)
direct:    16 03 01 ...               TLS ClientHello
```

Direct mode never sends the `SSLRequest` packet.

## Building pg from source

The current npm releases of `pg` and `pg-connection-string` do not include
PR #3688. master's `pg-connection-string` even shares the version number
`2.13.0` with the published one while carrying new code, so a registry install
would silently use the old parser. The tester image clones node-postgres at
`NODE_POSTGRES_REF` (default `master`), packs the `pg` and `pg-connection-string`
packages, and installs those tarballs. The build aborts if the merged code
(`ALPNProtocols`, `sslnegotiation`) is missing, and each run prints the commit it
built from.

## Layout

```
docker-compose.yml              certgen + postgres:17 (ssl=on) + tester
certs/gen-certs.sh              generates a test CA and certs for localhost.shion.dev
tester/
  Dockerfile                    clones node-postgres, builds pg + pg-connection-string
  run.sh                        captures the pcap, runs the proofs, writes evidence
  proofs/
    index.js                    orchestrator; writes evidence.json
    1-end-to-end.js
    2-wire-level.js
    3-connection-string.js
    4-direct-only-front.js
    lib.js
.github/workflows/proof.yml     build, run, collect artifacts, render the summary
.github/scripts/summary.js      turns evidence.json into the job summary
```

## License

MIT
