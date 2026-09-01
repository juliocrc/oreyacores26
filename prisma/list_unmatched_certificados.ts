import fs from 'fs'
import path from 'path'

function latestFile(dir: string, pattern: RegExp) {
  const files = fs.readdirSync(dir).filter(f => pattern.test(f))
  if (files.length === 0) return null
  files.sort()
  return path.join(dir, files[files.length - 1])
}

async function main() {
  const logs = path.join(process.cwd(), 'prisma', 'logs')
  if (!fs.existsSync(logs)) {
    console.error('Logs folder not found:', logs)
    process.exit(1)
  }

  const certFile = latestFile(logs, /^backup_certificados_extraidos_.*\.json$/)
  if (!certFile) { console.error('No certificado backup found'); process.exit(1) }
  const certs: any[] = JSON.parse(fs.readFileSync(certFile, 'utf8'))

  // pick the most recent reassociation audit (advanced if present)
  const auditFile = latestFile(logs, /^reassociate_jangadas_advanced_.*\.json$/) || latestFile(logs, /^reassociate_jangadas_permissive_.*\.json$/) || latestFile(logs, /^reassociate_jangadas_.*\.json$/)
  const updatedIds = new Set<number>()
  if (auditFile) {
    try {
      const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'))
      const details = audit.audit?.details || audit.details || []
      for (const d of details) {
        if (d && typeof d.id === 'number') updatedIds.add(d.id)
      }
    } catch (e) { console.error('Failed reading audit file:', auditFile, e) }
  }

  const unmatched = certs.filter(c => !updatedIds.has(c.id)).map(c => ({ id: c.id, fileName: c.fileName, raftSerial: c.raftSerial, shipName: c.shipName, certificadoNumero: c.certificadoNumero }))

  const out = path.join(logs, `unmatched_certificados_${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), total: certs.length, updatedCount: updatedIds.size, unmatchedCount: unmatched.length, unmatched }, null, 2))
  console.log('Wrote unmatched list to', out)
}

main().catch(e => { console.error(e); process.exit(1) })
