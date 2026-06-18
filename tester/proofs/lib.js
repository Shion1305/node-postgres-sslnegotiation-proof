// Shared helpers for the sslnegotiation proofs.
const net = require('net')

// The exact PostgreSQL frontend "SSLRequest" message: Int32 length = 8,
// Int32 request code = 80877103 (0x04D2162F).
const SSLREQUEST_HEX = '0000000804d2162f'

const env = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
}

// A dumb byte-relay TCP proxy that records the FIRST client->server chunk and
// transparently pipes both directions to an upstream. It does NOT terminate
// TLS, so it can observe exactly what bytes a client sends first.
//
// onFirst(hex16) is called with the first 16 bytes (hex) of the first chunk.
// Returns { port, close() }.
function startCapturingProxy(upstreamHost, upstreamPort, onFirst) {
  return new Promise((resolve) => {
    const server = net.createServer((client) => {
      const upstream = net.connect(upstreamPort, upstreamHost)
      let first = true
      client.on('data', (chunk) => {
        if (first) {
          first = false
          onFirst(chunk.subarray(0, 16).toString('hex'))
        }
        upstream.write(chunk)
      })
      upstream.on('data', (c) => client.write(c))
      client.on('end', () => upstream.end())
      upstream.on('end', () => client.end())
      client.on('error', () => upstream.destroy())
      upstream.on('error', () => client.destroy())
    })
    server.listen(0, () => {
      resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

// Pretty section logging with a clear PASS/FAIL contract.
function logResult(name, passed, details) {
  const tag = passed ? 'PASS' : 'FAIL'
  console.log(`\n[${tag}] ${name}`)
  if (details) for (const line of details) console.log('       ' + line)
  return passed
}

module.exports = { SSLREQUEST_HEX, env, startCapturingProxy, logResult }
