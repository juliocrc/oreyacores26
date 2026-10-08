import { saveInspection } from '../src/app/inspecoes/actions';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();
for (const f of ['.env.vercel.prod', '.env.local', '.env.prod2', '.env.production.local']) {
  const p = path.resolve(f);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
}

async function main() {
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const jangadaId = Number(process.argv[2] || 2153);
  const jangada = (await client.query('SELECT * FROM "Jangada" WHERE id = $1', [jangadaId])).rows[0];
  console.log('jangada:', jangada ? jangada.serial : 'NAO ENCONTRADA');

  // payload típico que o wizard envia (rascunho: applyStockMovements true, final)
  const payload = {
    shipId: jangada.shipId,
    raftId: jangada.id,
    navioNome: jangada.shipNameManual || "CRUZEIRO DAS ILHAS",
    jangadaSerial: jangada.serial,
    date: jangada.dataInspecao || "2024-10-30",
    dataProxInspecao: jangada.dataProxInspecao || "2025-10-30",
    status: "Concluída",
    responsavel: "Teste",
    certificadoNumero: "AZ26-TESTE-2153",
    sourceFile: "checklist_quadro",
    applyStockMovements: false,
    checklistSnapshot: {},
    artigosSubstituidos: [],
  };

  try {
    const out = await saveInspection(payload as never);
    console.log('OK:', JSON.stringify(out));
  } catch (e) {
    console.error('ERRO saveInspection:');
    console.error(e);
    if (e && (e as any).stack) console.error((e as any).stack);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();