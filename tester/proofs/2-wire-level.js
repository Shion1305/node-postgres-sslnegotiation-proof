// PROOF 2 — Wire-level proof that direct and traditional take different paths.
//
// Using a transparent byte-relay proxy (no TLS termination), capture the FIRST
// bytes node-postgres sends on the socket:
//   * direct      -> a TLS ClientHello record: 0x16 0x03 ...  (NO SSLRequest)
//   * traditional -> the PostgreSQL SSLRequest packet: 00 00 00 08 04 d2 16 2f
const { Client } = require('pg')
const { env, SSLREQUEST_HEX, startCapturingProxy, logResult } = require('./lib')

async function firstBytesFor(sslnegotiation) {
  let captured = null
  const proxy = await startCapturingProxy(env.host, env.port, (hex) => (captured = hex))
  const client = new Client({
    host: '127.0.0.1',
    port: proxy.port,
    user: env.user,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    sslnegotiation,
  })
  await client.connect()
  await client.query('SELECT 1')
  await client.end()
  await proxy.close()
  return captured
}

module.exports = async function proofWireLevel() {
  const directBytes = await firstBytesFor('direct')
  const tradBytes = await firstBytesFor('postgres')

  // TLS handshake record: type 0x16 (handshake), record version 0x03 0x0x.
  const directIsTLS = /^1603/.test(directBytes)
  const directIsSSLReq = directBytes.startsWith(SSLREQUEST_HEX)
  const tradIsSSLReq = tradBytes.startsWith(SSLREQUEST_HEX)

  console.log(`\n       direct first16  : ${directBytes}`)
  console.log(`       traditional f16 : ${tradBytes}`)
  console.log(`       SSLRequest sig  : ${SSLREQUEST_HEX}`)

  const ok =
    logResult('Direct mode sends a TLS ClientHello first (0x16 03 ..)', directIsTLS) &&
    logResult('Direct mode does NOT send the SSLRequest packet', !directIsSSLReq) &&
    logResult('Traditional mode DOES send the SSLRequest packet', tradIsSSLReq)

  return ok
}
