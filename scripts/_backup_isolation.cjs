const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.production.local', override: true });

const OUT_DIR = 'C:/Users/julio/AppData/Local/Temp/opencode/backup_isolamento';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const backup = async (table, sql, args, file) => {
    const r = await c.query(sql, args);
    const rows = r.rows.map((x) => {
      const o = {};
      for (const [k, v] of Object.entries(x)) o[k] = (v instanceof Date) ? v.toISOString() : v;
      return o;
    });
    fs.writeFileSync(`${OUT_DIR}/${file}.json`, JSON.stringify(rows, null, 2));
    console.log(`${table.padEnd(30)} backup ${rows.length} rows -> ${file}.json`);
  };

  console.log('== BACKUP MAINLAND (DELETE) ==');
  await backup('Cliente', `SELECT * FROM "Cliente" WHERE "id" = ANY($1::int[])`, [[2571, 2572, 2573, 2574]], 'delete_cliente');
  await backup('Navio', `SELECT * FROM "Navio" WHERE "id" = ANY($1::int[])`, [[14937, 14938, 14939, 14940, 14941]], 'delete_navio');
  await backup('Jangada', `SELECT * FROM "Jangada" WHERE "id" = ANY($1::int[])`, [[2138, 2139, 2140, 2141, 2142]], 'delete_jangada');
  await backup('ServiceStationQueue', `SELECT * FROM "ServiceStationQueue" WHERE "id" = ANY($1::int[])`, [[142, 143, 144, 145]], 'delete_queue');
  await backup('Stock', `SELECT * FROM "Stock" WHERE "id" = ANY($1::int[])`, [[358,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,380,381,382,569,570,565,566,567,568,571,572,573,574,575,576,577,578,579,580]], 'delete_stock');
  await backup('Tecnico', `SELECT * FROM "Tecnico" WHERE "id" = ANY($1::int[])`, [[5, 6, 9, 10, 11]], 'delete_tecnico');

  console.log('\n== BACKUP UPDATE-NULL->ACORES (situacao antes) ==');
  // Atribuicoes planeadas (o backup guarda estado atual, que sera sobrescrito)
  const naviosNullLinks = await c.query(`
    SELECT n.* FROM "Navio" n
    WHERE n."serviceStationId" IS NULL
      AND (EXISTS (SELECT 1 FROM "Jangada" j WHERE j."shipId" = n."id")
           OR EXISTS (SELECT 1 FROM "Inspecao" i WHERE i."navioId" = n."id"))`);
  fs.writeFileSync(`${OUT_DIR}/update_navio_null.json`, JSON.stringify(naviosNullLinks.rows.map((x) => ({ ...x, serviceStationId: null })), null, 2));
  console.log(`Navio NULL com ligacoes (preview ${naviosNullLinks.rows.length}):`);
  for (const n of naviosNullLinks.rows) console.log(`   ${n.id} | ${n.nome} | cliente=${n.clienteId}`);

  const cliNull = await c.query(`SELECT "id","nome" FROM "Cliente" WHERE "serviceStationId" IS NULL ORDER BY "id"`);
  fs.writeFileSync(`${OUT_DIR}/update_cliente_null.json`, JSON.stringify(cliNull.rows, null, 2));
  console.log(`Cliente NULL (${cliNull.rows.length}):`, cliNull.rows.map((x) => `${x.id}:${x.nome}`).join(' | '));

  const janNull = await c.query(`SELECT "id","serial","shipId" FROM "Jangada" WHERE "serviceStationId" IS NULL ORDER BY "id"`);
  fs.writeFileSync(`${OUT_DIR}/update_jangada_null.json`, JSON.stringify(janNull.rows, null, 2));
  console.log(`Jangada NULL (${janNull.rows.length}):`, janNull.rows.map((x) => `${x.id}:${x.serial}`).join(' | '));

  const qNull = await c.query(`SELECT q.* FROM "ServiceStationQueue" q WHERE q."serviceStationId" IS NULL`);
  fs.writeFileSync(`${OUT_DIR}/update_queue_null.json`, JSON.stringify(qNull.rows.map((x) => ({ ...x, serviceStationId: null })), null, 2));
  console.log(`ServiceStationQueue NULL (${qNull.rows.length}):`, qNull.rows.map((x) => `${x.id}`).join(', '));
  await backup('MovimentacaoStock NULL', `SELECT * FROM "MovimentacaoStock" WHERE "serviceStationId" IS NULL`, [], 'keep_movimentacao_null');
  await backup('PedidoReposicaoLinha NULL', `SELECT * FROM "PedidoReposicaoLinha" WHERE "serviceStationId" IS NULL`, [], 'keep_pedlinha_null');
  await backup('CustomPackTypeItem NULL', `SELECT * FROM "CustomPackTypeItem" WHERE "serviceStationId" IS NULL`, [], 'keep_custompack_null');

  await c.end();
  console.log('\nBackup completo em ' + OUT_DIR);
})().catch((e) => { console.error(e); process.exit(1); });