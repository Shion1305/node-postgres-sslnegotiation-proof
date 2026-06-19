// Orchestrator: run every proof, print a human-readable verdict, AND write a
// machine-readable evidence file (/certs/evidence.json on the shared volume) so
// CI can render a Job Summary table without anyone reading this code.
const fs = require('fs')

const EVIDENCE_PATH = process.env.EVIDENCE_PATH || '/certs/evidence.json'

function meta() {
  const pgPkg = require('pg/package.json')
  let head = null
  try {
    head = fs.readFileSync('/app/NODE_POSTGRES_HEAD', 'utf8').trim()
  } catch {}
  const connSrc = fs.readFileSync(require.resolve('pg/lib/connection.js'), 'utf8')
  const csSrc = fs.readFileSync(require.resolve('pg-connection-string'), 'utf8')
  return {
    pgVersion: pgPkg.version,
    nodePostgresHead: head,
    pgHasAlpn: connSrc.includes('ALPNProtocols'),
    connStringHasMerge: csSrc.includes('sslnegotiation'),
    nodeVersion: process.version,
  }
}

function banner(m) {
  console.log('========================================================')
  console.log(' node-postgres sslnegotiation=direct — objective proof')
  console.log('========================================================')
  console.log(`  pg version            : ${m.pgVersion}`)
  if (m.nodePostgresHead) console.log(`  built from commit     : ${m.nodePostgresHead}`)
  console.log(`  pg has ALPNProtocols  : ${m.pgHasAlpn}`)
  console.log(`  conn-string has merge : ${m.connStringHasMerge}`)
  console.log(`  node version          : ${m.nodeVersion}`)
  console.log('--------------------------------------------------------')
}

;(async () => {
  const m = meta()
  banner(m)

  // Each proof returns { ok: boolean, evidence: object }.
  const proofs = [
    ['end-to-end', 'End-to-end + server-side (pg_stat_ssl)', require('./1-end-to-end')],
    ['wire-level', 'Wire-level (SSLRequest vs TLS ClientHello)', require('./2-wire-level')],
    ['connection-string', 'Connection-string path (merged pg-connection-string)', require('./3-connection-string')],
    ['direct-only-front', 'Direct-SSL-only endpoint (PR claim: traditional rejected)', require('./4-direct-only-front')],
  ]

  const results = []
  for (const [id, name, fn] of proofs) {
    console.log(`\n### ${name}`)
    try {
      const r = await fn()
      results.push({ id, name, ok: !!r.ok, evidence: r.evidence || {} })
    } catch (e) {
      console.error('       threw:', e && e.stack ? e.stack : e)
      results.push({ id, name, ok: false, evidence: { error: e && e.message } })
    }
  }

  const allOk = results.every((r) => r.ok)

  console.log('\n========================================================')
  console.log(' VERDICT')
  console.log('--------------------------------------------------------')
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
  console.log('========================================================')
  console.log(allOk ? '  ALL PROOFS PASSED' : '  SOME PROOFS FAILED')
  console.log('========================================================')

  // Write machine-readable evidence for the CI Job Summary + artifact.
  const out = { allOk, meta: m, proofs: results, generatedAt: new Date().toISOString() }
  try {
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(out, null, 2))
    console.log(`\nwrote evidence -> ${EVIDENCE_PATH}`)
  } catch (e) {
    console.error('could not write evidence file:', e.message)
  }

  process.exit(allOk ? 0 : 1)
})()
