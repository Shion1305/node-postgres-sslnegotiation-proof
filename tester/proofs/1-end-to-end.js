// PROOF 1 — End-to-end + server-side confirmation.
//
// Connect to a real PostgreSQL 17 server using sslnegotiation=direct, run a
// query, and ask the SERVER (via pg_stat_ssl) to confirm the connection is
// genuinely encrypted. Also confirm the traditional path still works.
const { Client } = require('pg')
const { env, logResult } = require('./lib')

async function connectAndInspect(sslnegotiation) {
  const client = new Client({
    host: env.host,
    port: env.port,
    user: env.user,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    sslnegotiation,
  })
  await client.connect()
  const select1 = await client.query('SELECT 1 AS ok')
  const ssl = await client.query(
    `SELECT ssl, version, cipher, bits
       FROM pg_stat_ssl
      WHERE pid = pg_backend_pid()`
  )
  await client.end()
  return { select1: select1.rows[0], ssl: ssl.rows[0] }
}

module.exports = async function proofEndToEnd() {
  // Direct negotiation must connect and the server must report SSL=true.
  const direct = await connectAndInspect('direct')
  const directOk =
    direct.select1.ok === 1 && direct.ssl.ssl === true && /TLS/.test(String(direct.ssl.version))

  logResult('Direct negotiation connects and server confirms TLS', directOk, [
    `SELECT 1 -> ${JSON.stringify(direct.select1)}`,
    `pg_stat_ssl -> ssl=${direct.ssl.ssl} version=${direct.ssl.version} cipher=${direct.ssl.cipher} bits=${direct.ssl.bits}`,
  ])

  // Traditional negotiation must also still work (no regression).
  const trad = await connectAndInspect('postgres')
  const tradOk = trad.select1.ok === 1 && trad.ssl.ssl === true

  logResult('Traditional negotiation still works (no regression)', tradOk, [
    `pg_stat_ssl -> ssl=${trad.ssl.ssl} version=${trad.ssl.version}`,
  ])

  return directOk && tradOk
}
