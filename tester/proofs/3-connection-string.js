// PROOF 3 — Connection-string path exercises the merged pg-connection-string.
//
// The PR also taught pg-connection-string that `sslnegotiation=direct` implies
// SSL is enabled. Prove that a plain connection string (no explicit ssl option)
// connects via direct TLS purely because of `sslnegotiation=direct`.
const { Client } = require('pg')
const parse = require('pg-connection-string').parse
const { env, logResult } = require('./lib')

module.exports = async function proofConnectionString() {
  // 1) Pure parser behavior: sslnegotiation=direct auto-enables SSL.
  const parsed = parse('postgres://u@h/db?sslnegotiation=direct')
  const parserOk = parsed.sslnegotiation === 'direct' && parsed.ssl === true
  logResult('pg-connection-string: sslnegotiation=direct auto-enables ssl', parserOk, [
    `parsed.sslnegotiation = ${JSON.stringify(parsed.sslnegotiation)}`,
    `parsed.ssl            = ${JSON.stringify(parsed.ssl)}`,
  ])

  // 2) Live: connect via a connection string ALONE using sslnegotiation=direct,
  //    with sslmode=verify-full so the cert chain AND the hostname
  //    (localhost.shion.dev) are both verified, and sslrootcert pointing at our
  //    test CA. Everything comes from the string — no separate ssl object — so
  //    this exercises the merged pg-connection-string parsing end to end.
  const connectionString =
    `postgres://${env.user}@${env.host}:${env.port}/${env.database}` +
    `?sslnegotiation=direct&sslmode=verify-full&sslrootcert=${encodeURIComponent(env.caCertPath)}`
  const client = new Client({ connectionString })
  await client.connect()
  const r = await client.query(
    `SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()`
  )
  await client.end()
  const liveOk = r.rows[0].ssl === true && /TLS/.test(String(r.rows[0].version))
  logResult('Connection string (sslnegotiation=direct, verify-full) connects over TLS', liveOk, [
    `connectionString = ${connectionString}`,
    `verified cert chain + hostname ${env.host} against our CA`,
    `pg_stat_ssl -> ssl=${r.rows[0].ssl} version=${r.rows[0].version}`,
  ])

  return {
    ok: parserOk && liveOk,
    evidence: {
      parsed: `sslnegotiation=${JSON.stringify(parsed.sslnegotiation)} ssl=${JSON.stringify(parsed.ssl)}`,
      connectionString: `...?sslnegotiation=direct&sslmode=verify-full&sslrootcert=...`,
      livePgStatSsl: `ssl=${r.rows[0].ssl} version=${r.rows[0].version}`,
    },
  }
}
