#!/usr/bin/env sh
# Generate a throwaway CA and two leaf certs, all for the hostname
# `localhost.shion.dev`, into the shared /certs volume. Idempotent.
#
#   * ca.crt / ca.key      — the test CA both server and client trust
#   * server.crt/.key      — PostgreSQL's cert (served on the postgres container)
#   * front.crt/.key       — the direct-SSL-only front in proof 4
#
# Using a real, DNS-resolvable hostname (localhost.shion.dev -> 127.0.0.1) means
# node-postgres genuinely sends it as the TLS SNI, and the client verifies the
# leaf certs against this CA with rejectUnauthorized=true.
set -eu

CN="localhost.shion.dev"
DIR=/certs
cd "$DIR"

if [ -f "$DIR/.done" ]; then
  echo "certs already generated for $CN"
  exit 0
fi

cat > san.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $CN
[v3]
subjectAltName = DNS:$CN
EOF

# 1) CA
openssl req -x509 -new -nodes -newkey rsa:2048 -days 3650 \
  -subj "/CN=sslnegotiation-proof test CA" \
  -keyout ca.key -out ca.crt >/dev/null 2>&1

# Helper: issue a leaf cert (args: name)
issue() {
  name="$1"
  openssl req -new -nodes -newkey rsa:2048 \
    -subj "/CN=$CN" -keyout "$name.key" -out "$name.csr" \
    -config san.cnf >/dev/null 2>&1
  openssl x509 -req -in "$name.csr" \
    -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days 3650 -extfile san.cnf -extensions v3 \
    -out "$name.crt" >/dev/null 2>&1
  rm -f "$name.csr"
}

# 2) server + front leaf certs, both for localhost.shion.dev
issue server
issue front

# PostgreSQL requires the key be readable only by its user (uid 999).
chmod 600 server.key front.key ca.key
chmod 644 server.crt front.crt ca.crt
chown -R 999:999 "$DIR" 2>/dev/null || true

touch "$DIR/.done"
echo "generated CA + server + front certs for CN=$CN in $DIR"
ls -la "$DIR"
