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

  // 2) Live: connect using ONLY a connection string. Because the self-signed
  //    cert isn't a known CA, disable verification via the string too.
  const connectionString =
    `postgres://${env.user}@${env.host}:${env.port}/${env.database}` +
    `?sslnegotiation=direct&sslmode=no-verify`
  const client = new Client({ connectionString })
  await client.connect()
  const r = await client.query(
    `SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()`
  )
  await client.end()
  const liveOk = r.rows[0].ssl === true && /TLS/.test(String(r.rows[0].version))
  logResult('Connection string with sslnegotiation=direct connects over TLS', liveOk, [
    `connectionString = ${connectionString}`,
    `pg_stat_ssl -> ssl=${r.rows[0].ssl} version=${r.rows[0].version}`,
  ])

  return parserOk && liveOk
}
