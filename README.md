# node-postgres `sslnegotiation=direct` — objective proof

[![sslnegotiation proof](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml/badge.svg)](https://github.com/Shion1305/node-postgres-sslnegotiation-proof/actions/workflows/proof.yml)

This repository **objectively demonstrates, via GitHub Actions, that the `master`
branch of [node-postgres](https://github.com/brianc/node-postgres) works with
PostgreSQL 17's `sslnegotiation=direct`** — the feature added in
[PR #3688](https://github.com/brianc/node-postgres/pull/3688) (merged as
commit [`882fc308`](https://github.com/brianc/node-postgres/commit/882fc308cce7bf136cd1448e00395f760dad3e00),
not yet released to npm at the time of writing).

Every part of the proof runs **inside Docker containers**, so the GitHub Actions
run does exactly what you can run locally — byte-for-byte reproducible.

## What "direct SSL negotiation" is

| mode | behavior |
| --- | --- |
| `postgres` (default) | The client sends an 8-byte `SSLRequest` packet, waits for the server's `S`/`N` reply, **then** starts the TLS handshake. |
| `direct` | The client starts the TLS handshake **immediately** on TCP connect (like HTTPS), advertising the `postgresql` ALPN protocol. Saves one round-trip. Requires SSL. PostgreSQL 17+. |

## How the proof works

`docker compose` brings up two containers:

- **`postgres`** — the official `postgres:17` image. It generates a self-signed
  certificate on boot and starts with `ssl=on`. No host files involved.
- **`tester`** — a Node 24 image that **clones node-postgres `master`, packs the
  `pg` and `pg-connection-string` packages, and installs them** (so the code
  under test is genuinely the merged PR, not a published release — npm's
  `pg-connection-string@2.13.0` does *not* yet contain the change). The build
  fails fast if the merged code isn't present, and the run prints the exact
  node-postgres commit it built from.

The tester then runs four independent proofs and exits non-zero if any fail.

### The four proofs

1. **End-to-end + server-side.** Connect with `sslnegotiation: 'direct'`, run a
   query, and ask the *server* — via `pg_stat_ssl` — to confirm the connection
   is encrypted (`ssl=t, version=TLSv1.3`). Also confirms the traditional path
   still works (no regression).

2. **Wire-level.** A transparent byte-relay proxy (it does **not** terminate TLS)
   records the first bytes node-postgres puts on the socket:
   - `direct` → a TLS ClientHello record `16 03 01 …` — **no `SSLRequest`**.
   - `postgres` → exactly the PostgreSQL `SSLRequest` packet `00 00 00 08 04 d2 16 2f`
     (length `8`, request code `80877103` = `0x04D2162F`).

   This is the rigorous part: it proves `direct` is a *genuinely different code
   path*, not just "SSL works."

3. **Connection-string path.** Exercises the merged `pg-connection-string`:
   `postgres://…?sslnegotiation=direct` parses to `{ sslnegotiation: 'direct',
   ssl: true }` (direct implies SSL) and a live connection built from that string
   alone connects over TLS.

4. **Direct-SSL-only endpoint (reproduces the PR's exact claim).** A stock
   PostgreSQL 17 server actually accepts *both* negotiation styles, so to show
   that traditional clients genuinely *cannot* speak to a direct-only endpoint we
   put a TLS-only listener (ALPN `postgresql`) in front of Postgres:
   - `direct` client → handshake succeeds, query runs.
   - `postgres` client → its plaintext `SSLRequest` bytes are not valid TLS, so
     the connection is **rejected** — matching the `ECONNRESET` the PR describes.

## Run it yourself

```bash
docker compose up --build --abort-on-container-exit --exit-code-from tester
```

Test a different ref (branch / tag / commit) of node-postgres:

```bash
NODE_POSTGRES_REF=master \
  docker compose up --build --abort-on-container-exit --exit-code-from tester
```

## Sample output

```
========================================================
 node-postgres sslnegotiation=direct — objective proof
========================================================
  pg version            : 8.21.0
  built from commit     : 882fc308cce7bf136cd1448e00395f760dad3e00 Add support for sslnegotiation=direct (PostgreSQL 17) (#3688)
  pg has ALPNProtocols  : true
  conn-string has merge : true
  node version          : v24.16.0
--------------------------------------------------------
...
========================================================
 VERDICT
--------------------------------------------------------
  PASS  End-to-end + server-side (pg_stat_ssl)
  PASS  Wire-level (SSLRequest vs TLS ClientHello)
  PASS  Connection-string path (merged pg-connection-string)
  PASS  Direct-SSL-only endpoint (PR claim: traditional rejected)
========================================================
  ALL PROOFS PASSED
========================================================
```

## Layout

```
docker-compose.yml          # postgres:17 (ssl=on) + tester
tester/
  Dockerfile                # clones node-postgres master, installs pg + pg-connection-string
  package.json              # installs pg from local tarball; overrides pg-connection-string to master
  run.sh                    # generates the front cert, runs the proofs
  proofs/
    index.js                # orchestrator + verdict
    1-end-to-end.js
    2-wire-level.js
    3-connection-string.js
    4-direct-only-front.js
    lib.js
.github/workflows/proof.yml # runs `docker compose up --exit-code-from tester`
```

## License

MIT
