// Read-only comparison with the database specified by an explicitly supplied env file.
const fs = require('node:fs');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { execFileSync } = require('node:child_process');

async function main() {
  if (!process.argv[2]) throw new Error('Indique o ficheiro de ambiente de produção.');
  const env = dotenv.parse(fs.readFileSync(process.argv[2]));
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('[SENSITIVE]')) throw new Error('DATABASE_URL indisponível.');
  const inventory = JSON.parse(execFileSync(process.execPath, ['scripts/preview-certificados-2024.cjs'], { encoding: 'utf8', maxBuffer: 10000000 }));
  const normalize = value => String(value || '').trim().toUpperCase();
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    const serials = [...new Set(inventory.records.map(record => normalize(record.serial)).filter(Boolean))];
    const certificates = [...new Set(inventory.records.map(record => normalize(record.certificado)).filter(Boolean))];
    const rafts = (await pool.query('SELECT j.id, j.serial, j."shipNameManual", n.nome AS "navioAtual" FROM "Jangada" j LEFT JOIN "Navio" n ON n.id = j."shipId" WHERE upper(trim(j.serial)) = ANY($1::text[])', [serials])).rows;
    const inspections = (await pool.query('SELECT id, "jangadaId", "certificadoNumero", "dataInspecao" FROM "Inspecao" WHERE upper(trim("certificadoNumero")) = ANY($1::text[])', [certificates])).rows;
    const raftIds = [...new Set(rafts.map(raft => raft.id))];
    const history = (await pool.query('SELECT id, "jangadaId", "certificadoNumero", "dataInspecao" FROM "Inspecao" WHERE "jangadaId" = ANY($1::int[]) AND "dataInspecao" >= $2 AND "dataInspecao" < $3', [raftIds, '2024-01-01', '2025-01-01'])).rows;
    const summary = { total: inventory.records.length, semSerie: 0, semJangada: 0, umaJangada: 0, variasJangadas: 0, certificadoExistente: 0, conflitoCertificado: 0 };
    const details = inventory.records.map(record => {
      const matches = rafts.filter(raft => record.serial && normalize(raft.serial) === normalize(record.serial));
      const existing = inspections.filter(item => record.certificado && normalize(item.certificadoNumero) === normalize(record.certificado));
      if (!record.serial) summary.semSerie++;
      else if (!matches.length) summary.semJangada++;
      else if (matches.length === 1) summary.umaJangada++;
      else summary.variasJangadas++;
      if (existing.length) summary.certificadoExistente++;
      const conflict = matches.length === 1 && existing.some(item => item.jangadaId !== matches[0].id);
      if (conflict) summary.conflitoCertificado++;
      const duplicado = inventory.certificadosRepetidos.some(group => normalize(group.certificado) === normalize(record.certificado));
      const mesmaData = matches.length === 1 && record.dataInspecaoValidada.value
        ? history.filter(item => item.jangadaId === matches[0].id && String(item.dataInspecao).slice(0, 10) === record.dataInspecaoValidada.value) : [];
      return { ...record, jangadaIds: matches.map(item => item.id), navioAtual: matches.length === 1 ? (matches[0].navioAtual || matches[0].shipNameManual || '') : '', inspecoes: existing, inspecoesMesmaData: mesmaData, conflito: conflict, numeroRepetido: duplicado };
    });
    console.log(JSON.stringify({ summary, details }, null, 2));
  } finally { await pool.end(); }
}
main().catch(error => { console.error('Erro na comparação:', error.message); process.exitCode = 1; });
