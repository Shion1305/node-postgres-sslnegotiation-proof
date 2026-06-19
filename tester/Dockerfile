# Tester image: installs `pg` from node-postgres master and runs the proofs.
FROM node:24-bookworm-slim

# git: clone node-postgres. postgresql-client: independent psql sanity checks.
# tcpdump: capture the raw first bytes each negotiation mode puts on the wire,
# saved as a .pcap artifact reviewers can open in Wireshark.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates postgresql-client tcpdump \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Which node-postgres ref to build pg from (master = the merged PR #3688).
ARG NODE_POSTGRES_REF=master
ENV NODE_POSTGRES_REF=${NODE_POSTGRES_REF}

# 1) Clone node-postgres and pack the two packages the PR changed.
#    master's pg-connection-string shares version 2.13.0 with npm but contains
#    NEW code, so we must install the local copy (npm's 2.13.0 lacks it).
RUN git clone --depth 1 --branch "${NODE_POSTGRES_REF}" \
      https://github.com/brianc/node-postgres.git /src \
  && git -C /src log -1 --pretty='%H %s' | tee /app/NODE_POSTGRES_HEAD \
  && (cd /src/packages/pg-connection-string && npm pack --silent && cp pg-connection-string-*.tgz /app/pg-connection-string.tgz) \
  && (cd /src/packages/pg && npm pack --silent && cp pg-*.tgz /app/pg.tgz)

# 2) Install pg from the local tarball; force pg-connection-string to the
#    master tarball via npm overrides so the merged parsing code is used.
COPY package.json /app/package.json
RUN npm install --no-audit --no-fund

# 3) Fail the build early if the merged code is somehow absent.
RUN node -e "const fs=require('fs'); \
  const a=fs.readFileSync('node_modules/pg/lib/connection.js','utf8'); \
  const b=fs.readFileSync('node_modules/pg-connection-string/index.js','utf8'); \
  if(!a.includes('ALPNProtocols')) throw new Error('pg missing ALPNProtocols (merged code absent)'); \
  if(!b.includes('sslnegotiation')) throw new Error('pg-connection-string missing sslnegotiation (merged code absent)'); \
  console.log('OK: merged sslnegotiation code present in installed packages');"

COPY proofs/ /app/proofs/
COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]
