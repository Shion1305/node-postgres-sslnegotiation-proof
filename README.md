# Does node-postgres `master` really support PostgreSQL 17 `sslnegotiation=direct`?

**Yes — and this repo proves it on every CI run, with evidence you can inspect yourself.**

[![sslnegotiation proof](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml/badge.svg)](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml)

This repository is a self-contained, fully-containerized proof that the `master`
branch of [node-postgres](https://github.com/brianc/node-postgres) works with
PostgreSQL 17's `sslnegotiation=direct` — the feature added in
[PR #3688](https://github.com/brianc/node-postgres/pull/3688) (merged
[`882fc308`](https://github.com/brianc/node-postgres/commit/882fc308cce7bf136cd1448e00395f760dad3e00),
not yet released to npm).

---

## For a reviewer: how to confirm it works in 30 seconds

You do **not** need to read the proof source. The green badge above means the
latest run passed. To see *why* it passed:

1. **Open the latest run** → [Actions ▸ sslnegotiation proof](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml).
   The **Job Summary** shows a PASS/FAIL table with the raw evidence — the exact
   node-postgres commit tested, the first 16 bytes each negotiation mode put on
   the wire, and PostgreSQL's own `pg_stat_ssl` readout.
2. **Download the `sslnegotiation-proof-evidence` artifact** to check it with
   your own tools, trusting none of our code:
   | file | what it is |
   |---|---|
   | `capture.pcap` | tcpdump capture — open in Wireshark and *see* the bytes (below) |
   | `postgres-server.log` | PostgreSQL's own log of the encrypted connections |
   | `evidence.json` | machine-readable result behind the summary table |
   | `proof-output.txt` | the full human-readable proof log |
3. **Reproduce locally** — CI runs this exact command, nothing more:
   ```bash
   docker compose up --build --abort-on-container-exit --exit-code-from tester
   ```
   Exit code `0` = every proof passed.

### The one byte that settles it

In the `.pcap`, the two negotiation modes are visibly different on the wire:

```
traditional (sslnegotiation=postgres):  00 00 00 08 04 d2 16 2f   ← PostgreSQL SSLRequest packet
direct      (sslnegotiation=direct)  :  16 03 01 …                ← TLS ClientHello, no SSLRequest
```

`04 d2 16 2f` is request code `80877103` — the PostgreSQL `SSLRequest`. Direct
mode never sends it; it begins the TLS handshake immediately. That is the whole
feature, shown at the packet level.

---

## What the proof actually checks

The CI job builds two containers and runs four independent proofs. It fails
(non-zero exit, red badge) if any one of them fails.

| # | proof | what it establishes |
|---|---|---|
| 1 | **End-to-end + server-side** | `sslnegotiation: 'direct'` connects, runs a query, and PostgreSQL's `pg_stat_ssl` confirms the session is TLS 1.3 encrypted. Traditional mode still works (no regression). |
| 2 | **Wire-level** | A transparent byte-relay (no TLS termination) records the first bytes on the socket: `direct` → TLS ClientHello, `traditional` → the `SSLRequest` packet. Proves they are genuinely different code paths. |
| 3 | **Connection-string path** | `…?sslnegotiation=direct` exercises the merged `pg-connection-string`: it auto-enables SSL, and a live `verify-full` connection (CA-verified) succeeds. |
| 4 | **Direct-SSL-only endpoint** | A TLS-only front (ALPN `postgresql`) reproduces the PR's exact claim: a `direct` client connects; a `traditional` client is rejected. |

Connections are verified against a private CA with `rejectUnauthorized: true`,
and the client connects by the hostname **`localhost.shion.dev`** (a public DNS
name that resolves to `127.0.0.1`), so node-postgres genuinely sends it as the
TLS **SNI** and validates the certificate against it.

## Why this tests the real merged code (not a release)

npm's latest `pg` / `pg-connection-string` do **not** contain PR #3688 yet, and
master's `pg-connection-string` shares version `2.13.0` with npm while carrying
new code. So the `tester` image **clones node-postgres `master`, packs the `pg`
and `pg-connection-string` packages, and installs those tarballs.** The Docker
build fails fast if the merged markers (`ALPNProtocols`, `sslnegotiation`) are
absent, and every run prints the exact node-postgres commit it built from.

> Test any other ref (branch / tag / commit):
> ```bash
> NODE_POSTGRES_REF=<ref> docker compose up --build --abort-on-container-exit --exit-code-from tester
> ```

## Layout (everything a reviewer needs is small)

```
docker-compose.yml              # certgen + postgres:17 (ssl=on) + tester
certs/gen-certs.sh              # mints a throwaway CA + leaf certs for localhost.shion.dev
tester/
  Dockerfile                    # clones node-postgres master, installs pg + pg-connection-string
  run.sh                        # captures a .pcap, runs the proofs, writes evidence
  proofs/
    index.js                    #   orchestrator → verdict + evidence.json
    1-end-to-end.js  2-wire-level.js  3-connection-string.js  4-direct-only-front.js
    lib.js
.github/workflows/proof.yml     # build → run → collect artifacts → Job Summary
.github/scripts/summary.js      # renders evidence.json into the Job Summary table
```

## License

MIT
