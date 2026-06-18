// Orchestrator: run every proof and emit a single PASS/FAIL verdict.
const fs = require('fs')

function banner() {
  const pgPkg = require('pg/package.json')
  console.log('========================================================')
  console.log(' node-postgres sslnegotiation=direct — objective proof')
  console.log('========================================================')
  console.log(`  pg version            : ${pgPkg.version}`)
  // The exact node-postgres commit this pg was built from (written by build).
  try {
    const head = fs.readFileSync('/app/NODE_POSTGRES_HEAD', 'utf8').trim()
    console.log(`  built from commit     : ${head}`)
  } catch {}
  // Prove the merged code is actually present in what we loaded.
  const connSrc = fs.readFileSync(require.resolve('pg/lib/connection.js'), 'utf8')
  const csSrc = fs.readFileSync(require.resolve('pg-connection-string'), 'utf8')
  console.log(`  pg has ALPNProtocols  : ${connSrc.includes('ALPNProtocols')}`)
  console.log(`  conn-string has merge : ${csSrc.includes('sslnegotiation')}`)
  console.log(`  node version          : ${process.version}`)
  console.log('--------------------------------------------------------')
}

;(async () => {
  banner()

  const proofs = [
    ['End-to-end + server-side (pg_stat_ssl)', require('./1-end-to-end')],
    ['Wire-level (SSLRequest vs TLS ClientHello)', require('./2-wire-level')],
    ['Connection-string path (merged pg-connection-string)', require('./3-connection-string')],
    ['Direct-SSL-only endpoint (PR claim: traditional rejected)', require('./4-direct-only-front')],
  ]

  const results = []
  for (const [name, fn] of proofs) {
    console.log(`\n### ${name}`)
    try {
      results.push([name, await fn()])
    } catch (e) {
      console.error('       threw:', e && e.stack ? e.stack : e)
      results.push([name, false])
    }
  }

  console.log('\n========================================================')
  console.log(' VERDICT')
  console.log('--------------------------------------------------------')
  let allOk = true
  for (const [name, ok] of results) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
    allOk = allOk && ok
  }
  console.log('========================================================')
  console.log(allOk ? '  ALL PROOFS PASSED' : '  SOME PROOFS FAILED')
  console.log('========================================================')

  process.exit(allOk ? 0 : 1)
})()
