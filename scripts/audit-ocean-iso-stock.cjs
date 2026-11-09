const fs = require('fs');
const dotenv = require('dotenv');
const { Client } = require('pg');

async function main() {
  const env = dotenv.parse(fs.readFileSync('.env.production.local'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const station = await client.query('SELECT id, nome, codigo FROM "ServiceStation" WHERE id = $1', [1]);
    const counts = await client.query('SELECT "serviceStationId", count(*)::integer AS total FROM "Stock" GROUP BY "serviceStationId"');
    const result = await client.query('SELECT id, referencia, descricao, "serviceStationId", "codigoFabricante", foto, quantidade, "precoVenda" FROM "Stock" WHERE referencia ILIKE $1 OR referencia ILIKE $2 OR "codigoFabricante" ILIKE $1 OR "codigoFabricante" ILIKE $2 OR descricao ILIKE $3 ORDER BY referencia, id', ['%OSL%', '%OSS%', '%ocean safety%']);
    console.log(JSON.stringify({ station: station.rows, counts: counts.rows, items: result.rows }, null, 2));
  } finally { await client.end(); }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
