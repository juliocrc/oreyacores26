// Verification only: no Prisma, database mutations, session creation or uploads.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const dotenv = require('dotenv');

async function main() {
  const root = path.resolve(__dirname, '..');
  const configPath = path.join(root, '.env.production.local');
  if (!fs.existsSync(configPath)) throw new Error('PRODUCTION_CONFIG_MISSING');
  const config = dotenv.parse(fs.readFileSync(configPath));
  let url;
  try { url = new URL(config.DATABASE_URL); } catch { throw new Error('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_PROTOCOL');
  const client = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 15000,
    application_name: 'verify-marinha-history-read-only' });
  const serials = ['5017210100016', '5017210100018'];
  const report = { configSource: '.env.production.local', readOnly: true };
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    report.transactionReadOnly = (await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
    report.ships = (await client.query(`SELECT n.id, n.nome, n.matricula, n."serviceStationId",
      s.codigo AS "stationCode", s.nome AS "stationName" FROM "Navio" n
      LEFT JOIN "ServiceStation" s ON s.id = n."serviceStationId"
      WHERE regexp_replace(upper(n.nome), '[^A-Z0-9]', '', 'g') LIKE '%' || $1 || '%'
      OR regexp_replace(upper(n.matricula), '[^A-Z0-9]', '', 'g') = $1
      OR n.nome ILIKE '%Nossa Senhora da Concei%'
      ORDER BY n.id`, ['ESVHOR'])).rows;
    report.rafts = (await client.query(`SELECT j.id, j.serial, j."shipId", j."shipNameManual",
      j."serviceStationId", s.codigo AS "stationCode", s.nome AS "stationName",
      n.nome AS "linkedShipName", j."dataInspecao", j."dataProxInspecao"
      FROM "Jangada" j LEFT JOIN "Navio" n ON n.id = j."shipId"
      LEFT JOIN "ServiceStation" s ON s.id = j."serviceStationId"
      WHERE regexp_replace(j.serial, '[^0-9]', '', 'g') = ANY($1::text[]) ORDER BY j.id`, [serials])).rows;
    if (process.argv.includes('--association-only')) {
      const rawPreset = config.NEXT_PUBLIC_APP_REGION_PRESET?.trim().toUpperCase();
      const preset = ['NORTE', 'ALGARVE', 'LISBOA'].includes(rawPreset) ? rawPreset : 'ACORES';
      report.appConfig = {
        preset,
        theme: config.NEXT_PUBLIC_APP_THEME?.trim() || (preset === 'ACORES' ? 'azores' : 'deluxe'),
        defaultServiceStationCode: config.NEXT_PUBLIC_DEFAULT_SERVICE_STATION_CODE?.trim() ||
          ({ ACORES: 'ACORES', NORTE: 'AVELEDA', ALGARVE: 'ALCATARILHA', LISBOA: 'LISBOA' })[preset],
        activeSessionStation: 'not-inspected-no-authenticated-session',
      };
      report.stations = (await client.query(`SELECT id, codigo, nome, ativo, "territorioTipo"
        FROM "ServiceStation" ORDER BY id`)).rows;
      report.inspectionCount = Number((await client.query(`SELECT count(*) FROM "Inspecao"
        WHERE "jangadaId" = ANY($1::int[]) OR "jangadaSerial" = ANY($2::text[])`,
      [report.rafts.map(r => r.id), serials])).rows[0].count);
      await client.query('ROLLBACK');
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    report.inspections = (await client.query(`SELECT id, "jangadaId", "jangadaSerial", "navioId", "navioNome",
      "certificadoNumero", "dataInspecao", "dataProxInspecao", status,
      ("checklistSnapshot" IS NOT NULL) AS "hasChecklistSnapshot"
      FROM "Inspecao" WHERE "jangadaId" = ANY($1::int[]) OR "jangadaSerial" = ANY($2::text[])
      ORDER BY "jangadaId", "dataInspecao", id`, [report.rafts.map(r => r.id), serials])).rows;
    report.extractedCertificates = (await client.query(`SELECT id, "raftSerial", "shipName", "certificadoNumero",
      "dataInspecao", "dataProxInspecao", "hasQuadro", "validitiesCount"
      FROM "CertificadoExtraido" WHERE "raftSerial" = ANY($1::text[]) ORDER BY id`, [serials])).rows;
    report.snapshots = [];
    for (const inspection of report.inspections) {
      const relative = `_meta/inspecoes-snapshots/${inspection.certificadoNumero.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      let snapshot = null;
      let source = 'unavailable';
      if (config.BLOB_READ_WRITE_TOKEN) {
        const { list } = require('@vercel/blob');
        const target = `auditorias-documentos/${relative}`;
        const result = await list({ prefix: target, token: config.BLOB_READ_WRITE_TOKEN });
        const blob = result.blobs.find(b => b.pathname === target);
        source = 'production-blob';
        if (blob) {
          const response = await fetch(blob.url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
          if (!response.ok) throw new Error('SNAPSHOT_READ_FAILED');
          snapshot = await response.json();
        }
      } else {
        const local = path.join(root, 'auditorias_documentos', relative);
        source = 'local-only-not-production-proof';
        if (fs.existsSync(local)) snapshot = JSON.parse(fs.readFileSync(local, 'utf8'));
      }
      const raft = report.rafts.find(r => r.id === inspection.jangadaId);
      const dateKey = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
      const valid = Boolean(snapshot && raft && snapshot.id === raft.id && snapshot.serial === raft.serial &&
        (!inspection.jangadaSerial || snapshot.serial === inspection.jangadaSerial) &&
        snapshot.ultimoCertificadoNumero === inspection.certificadoNumero &&
        (inspection.navioId == null || snapshot.shipId === inspection.navioId) &&
        (snapshot.shipDetails?.id == null || snapshot.shipDetails.id === snapshot.shipId) &&
        inspection.dataInspecao && dateKey(inspection.dataInspecao) &&
        dateKey(snapshot.dataInspecao) === dateKey(inspection.dataInspecao) &&
        Array.isArray(snapshot.artigos) && snapshot.artigos.every(a => a && typeof a === 'object' && !Array.isArray(a)) &&
        Number.isSafeInteger(snapshot.serviceStationId ?? snapshot.shipDetails?.serviceStationId) &&
        (snapshot.serviceStationId ?? snapshot.shipDetails?.serviceStationId) > 0);
      report.snapshots.push({ inspectionId: inspection.id, source, found: Boolean(snapshot), routeDataChecksPass: valid });
    }
    await client.query('ROLLBACK');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(error => {
  // Driver messages can contain connection details; output only allowlisted codes.
  const code = String(error.code || error.message || 'UNKNOWN');
  const allowed = /^(?:[A-Z][A-Z0-9_]{2,60}|[0-9A-Z]{5})$/;
  console.error(JSON.stringify({ verificationFailed: true, code: allowed.test(code) ? code : 'REDACTED_ERROR' }));
  process.exitCode = 1;
});
