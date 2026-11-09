// Manual Ocean ISO 02/2020 and price list 2021. No updates to existing stock.
const fs = require('fs');
const dotenv = require('dotenv');
const { Client } = require('pg');
const GBP_PER_EUR = 0.83785; // ECB 28 October 2026
const items = [
  ['OSL8015S', 'Ocean ISO Ultralite Service Kit Small 6/8P', 82.75, 57.93],
  ['OSL8015L', 'Ocean ISO Ultralite Service Kit Large 10/12P', 91.73, 64.21],
  ['OSL8080', 'Ocean ISO Container Seal Tape', 52.57, 36.80],
  ['OSL0150', 'OS-VAR A6 Relief Valve Brown', 18.11, 12.67],
  ['OSL0160', 'OS-VAR A10 Relief Valve Brown', 23.31, 16.31],
  ['OSL0165', 'B10 Pressure Relief Valve Brown', 29.20, 20.44],
  ['OSL0168', 'A8 Top Up Valve', 17.52, 12.27],
  ['OSL0175', 'OS-VAR A10 Relief Valve Bung', 1.75, 1.23],
  ['OSL0177', 'OS-VAR B10 Relief Valve Bung', 2.27, 1.59],
  ['OSL0190', 'OS ISO Airflow Transfer Valve', 5.26, 3.68],
  ['OSL0195', 'OS ISO Airflow Top Up Valve', 9.06, 6.34],
  ['CYL2116', 'OS ISO GIS Disc Plug 400 Bar Air', 16.53, 11.57],
  ['CYL2380', 'GIS Operating Head Firing Wire', 11.34, 7.94],
  ['CYL2385', 'OS ISO GIS Operating Head O-Ring', 1.18, 0.83],
  ['CYL2390', 'OS ISO GIS Cutter', 28.62, 20.03],
  ['OSL0102', 'OS ISO GIST Operating Head O-Ring', 0.64, 0.45],
  ['OSL0115', 'GIST Cylinder Valve Assembly 250 Bar', 74.55, 52.19],
  ['OSL0513', 'OS VAR Vacuum Bag Firing Line Clip', 5.83, 4.08],
  ['OSL0130', 'OS ISO 546mm HP Hose with Connector', 35.58, 24.90],
  ['OSL0135', 'OS ISO 546mm HP Hose', 24.54, 17.18],
  ['OSL0137', 'GIST O-Ring for Hose and Fill Bung', 0.55, 0.39],
  ['OSL0140', 'GIS Valve Assembly M18 450 Bar', 62.73, 43.91],
  ['OSL0142', 'GIS Operating Head with Vacuum Bag Securing Nut', 73.01, 51.11],
  ['OSL0400', 'OS ISO Painter Line Assembly', 10.21, 7.15],
  ['OSL8100', 'OS ISO 4 Person Valise', 89.89, 62.92],
  ['OSL8102', 'OS ISO 6/8 Person Valise', 96.90, 67.83],
  ['OSL8103', 'OS ISO 10 Person Valise', 102.50, 71.75],
  ['OSL8110', 'OS ISO Ultralite 6/8 Person Valise', 321.24, 224.87],
  ['OSL8115', 'OS ISO Ultralite 10/12 Person Valise', 321.24, 224.87],
];
const eur = n => Number((n / GBP_PER_EUR).toFixed(2));

async function main() {
  const env = dotenv.parse(fs.readFileSync('C:/Users/julio/AppData/Local/Temp/opencode/ocean-vercel-production.env'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const station = await client.query('SELECT codigo FROM "ServiceStation" WHERE id = $1', [1]);
    if (station.rows[0]?.codigo !== 'ACORES') throw new Error('Estação Açores não confirmada.');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [20211029]);
    const result = [];
    for (const [ref, desc, rrp, cost] of items) {
      const existing = await client.query('SELECT id, referencia, descricao, "serviceStationId" FROM "Stock" WHERE upper(trim(referencia)) = $1 OR upper(trim(coalesce("codigoFabricante", \'\'))) = $1', [ref]);
      if (existing.rows.length) { result.push({ ref, status: 'existente ou possível duplicado', existing: existing.rows }); continue; }
      const files = ['jpeg', 'jpg', 'png', 'webp'].filter(ext => fs.existsSync(`public/ocean-safety-spares/${ref}.${ext}`));
      let photo = null;
      if (files.length === 1) {
        const candidate = `/ocean-safety-spares/${ref}.${files[0]}`;
        const response = await fetch(`https://oreyacoresdeluxe.vercel.app${candidate}`, { method: 'HEAD' });
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) photo = candidate;
      }
      const observation = `Ocean ISO manual 02/2020; Service Station Spares 2021: RRP GBP ${rrp.toFixed(2)}, estação GBP ${cost.toFixed(2)}. Conversão BCE 2026-10-28: 1 EUR = GBP 0.83785; preços históricos indicativos, confirmar vigência, impostos e preço antes de faturar. Quantidade 0 inicial sem contagem física. Confirmar compatibilidade por modelo, ano e configuração.`;
      const row = { ref, desc, compra: eur(cost), venda: eur(rrp), foto: photo };
      if (process.argv.includes('--apply')) {
        const inserted = await client.query('INSERT INTO "Stock" (referencia, "serviceStationId", descricao, "estadoArtigo", categoria, "associavelJangada", "aplicavelMarcaJangada", "codigoFabricante", "precoCompra", "precoVenda", quantidade, foto, observacoes, "updatedAt") VALUES ($1, 1, $2, $3, $4, true, $5, $1, $6, $7, 0, $8, $9, NOW()) RETURNING id', [ref, desc, 'ATIVO', 'SPARE', 'OCEAN SAFETY', row.compra, row.venda, photo, observation]);
        row.id = inserted.rows[0].id;
      }
      result.push(row);
    }
    await client.query(process.argv.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'aplicado' : 'simulação', rate: GBP_PER_EUR, result }, null, 2));
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { await client.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
