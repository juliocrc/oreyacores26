import { buildOreyCertificateArtifacts } from '../src/lib/orey-certificate-template';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();
for (const f of ['.env.vercel.prod', '.env.local', '.env.prod2', '.env.production.local']) {
  const p = path.resolve(f);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';

console.log('supabaseUrl:', supabaseUrl ? 'SIM' : 'NAO');
console.log('db host:', (() => { try { return new URL(databaseUrl.replace('postgresql://','postgres://')).host; } catch { return databaseUrl.split('@')[1]?.split('/')[0] || 'n/a'; } })());
console.log('supabaseKey:', supabaseKey ? 'SIM' : 'NAO');

async function main() {
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const jangadaId = Number(process.argv[2] || 2159);
  const jangada = (await client.query('SELECT * FROM "Jangada" WHERE id = $1', [jangadaId])).rows[0];
  console.log('jangada:', jangada ? jangada.serial : 'NAO ENCONTRADA');
  if (!jangada) { await client.end(); process.exit(1); }

  const inspecao = (await client.query('SELECT * FROM "Inspecao" WHERE "jangadaId" = $1 ORDER BY "dataInspecao" DESC LIMIT 1', [jangadaId])).rows[0];
  console.log('inspecao:', inspecao ? inspecao.certificadoNumero || inspecao.numeroObra : 'NAO ENCONTRADA');

  const payload = {
    certNumber: inspecao?.certificadoNumero || '',
    inspectionDate: inspecao?.dataInspecao || jangada.dataInspecao || '',
    nextInspectionDate: inspecao?.dataProxInspecao || jangada.dataProxInspecao || '',
    shipName: jangada.navioNome || '',
    brand: jangada.brand || '',
    raftModel: jangada.model || '',
    raftCapacity: jangada.capacity,
    raftSerial: jangada.serial,
    manufactureDate: jangada.dataFabrico || '',
    fabricType: jangada.fabricType || '',
    painterLength: jangada.painterLength || '',
    maxStowageHeight: jangada.maxStowageHeight || '',
    cylinderSerial: jangada.cylinderSerial || '',
    cylinderCo2: jangada.cylinderCo2 || '',
    cylinderN2: jangada.cylinderN2 || '',
    cylinderHydroTestDate: jangada.cylinderDataTeste || '',
    packType: jangada.packType || '',
    technician: inspecao?.responsavel || 'Técnico Autorizado',
    status: inspecao?.status || 'Concluída',
    checklist: {},
  };

  try {
    const out = await buildOreyCertificateArtifacts(payload as never);
    console.log('OK buffer:', (out.buffer as any).length, '| fileName:', out.fileName);
  } catch (e) {
    console.error('ERRO buildOreyCertificateArtifacts:');
    console.error(e);
    if (e && (e as any).stack) console.error((e as any).stack);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();