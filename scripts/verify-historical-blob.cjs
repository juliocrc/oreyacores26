// Read-only production archive probe. Never calls the application's fallback writer.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { list } = require('@vercel/blob');

async function main() {
  const configPath = process.argv[2];
  if (!configPath || !path.isAbsolute(configPath)) throw new Error('ABSOLUTE_CONFIG_PATH_REQUIRED');
  const { BLOB_READ_WRITE_TOKEN: token } = dotenv.parse(fs.readFileSync(configPath));
  if (!token) {
    console.log(JSON.stringify({ readOnly: true, blobCredentialAvailable: false, archiveVerified: false }));
    process.exitCode = 2;
    return;
  }
  const target = 'auditorias-documentos/_meta/inspecoes-snapshots/MAR1.json';
  let cursor;
  let blob;
  do {
    const page = await list({ prefix: target, token, ...(cursor ? { cursor } : {}) });
    blob = page.blobs.find(item => item.pathname === target);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (!blob && cursor);
  const report = {
    readOnly: true, blobCredentialAvailable: true, inspectionId: 2954,
    raftId: 2179, certificate: 'MAR1', archiveFound: Boolean(blob),
  };
  if (blob) {
    const response = await fetch(blob.url, { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error('SNAPSHOT_READ_FAILED');
    const snapshot = await response.json();
    const dateKey = value => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    };
    report.archiveContainsSnapshot = Boolean(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot));
    report.identityMatches = snapshot?.id === 2179 && snapshot?.serial === '5017210100016' && snapshot?.ultimoCertificadoNumero === 'MAR1';
    report.inspectionDateMatches = dateKey(snapshot?.dataInspecao) === '2026-07-01';
    report.nextInspectionDateMatches = dateKey(snapshot?.dataProxInspecao) === '2027-07-01';
    report.hasArchivedArticles = Array.isArray(snapshot?.artigos);
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  const code = String(error.code || error.message || 'UNKNOWN');
  console.error(JSON.stringify({ verificationFailed: true, code: /^[A-Z][A-Z0-9_]{2,60}$/.test(code) ? code : 'REDACTED_ERROR' }));
  process.exitCode = 1;
});
