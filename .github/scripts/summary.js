// Render the proof's evidence.json as a GitHub Actions Job Summary (Markdown).
// Reviewers read this table instead of the proof source.
const fs = require('fs')

const path = process.argv[2]
const e = JSON.parse(fs.readFileSync(path, 'utf8'))
const m = e.meta || {}
const out = []

const verdict = e.allOk ? '✅ ALL PROOFS PASSED' : '❌ SOME PROOFS FAILED'
out.push(`## node-postgres \`sslnegotiation=direct\` — ${verdict}`)
out.push('')
out.push('| | |')
out.push('|---|---|')
out.push(`| node-postgres commit | \`${m.nodePostgresHead || 'unknown'}\` |`)
out.push(`| pg version | \`${m.pgVersion}\` |`)
out.push(`| merged code present | pg.ALPNProtocols=\`${m.pgHasAlpn}\`, pg-connection-string.sslnegotiation=\`${m.connStringHasMerge}\` |`)
out.push(`| node | \`${m.nodeVersion}\` |`)
out.push('')

out.push('| Proof | Result | Evidence (server- / wire-level, not our assertions) |')
out.push('|---|:---:|---|')
for (const p of e.proofs || []) {
  const ev = p.evidence || {}
  const evStr = Object.entries(ev)
    .map(([k, v]) => `\`${k}\`: ${String(v).replace(/\|/g, '\\|')}`)
    .join('<br>')
  out.push(`| ${p.name} | ${p.ok ? '✅' : '❌'} | ${evStr} |`)
}
out.push('')

// Spell out the wire-level crux so it's legible at a glance.
const wire = (e.proofs || []).find((p) => p.id === 'wire-level')
if (wire && wire.evidence) {
  out.push('### Wire-level crux')
  out.push('')
  out.push('```')
  out.push(`direct      first 16 bytes : ${wire.evidence.directFirst16}   (TLS ClientHello: 16 03 ..)`)
  out.push(`traditional first 16 bytes : ${wire.evidence.traditionalFirst16}`)
  out.push(`PostgreSQL SSLRequest sig  : ${wire.evidence.sslRequestSignature}   (len=8, code 80877103)`)
  out.push('```')
  out.push('')
}

out.push('> Download the **`sslnegotiation-proof-evidence`** artifact for the raw `capture.pcap` (open in Wireshark), the PostgreSQL server log, `evidence.json`, and the full proof output.')

console.log(out.join('\n'))
