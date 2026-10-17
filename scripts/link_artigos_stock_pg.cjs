/**
 * Liga ao catálogo de stock os artigos físicos das jangadas que ainda não
 * tenham stockId, diretamente em PostgreSQL (Supabase/produção ou qualquer PG).
 *
 * NÃO usa o Prisma Client (evita regenerar para o schema Postgres). Usa `pg`.
 * Não cria nem remove artigos — só resolve stockId e preenche a validade em
 * falta (nunca sobrescreve validade existente). Idempotente.
 *
 *   Preview (por omissão):
 *     set DATABASE_URL=<postgres-url> & node scripts/link_artigos_stock_pg.cjs
 *   Gravar:
 *     set DATABASE_URL=<postgres-url> & node scripts/link_artigos_stock_pg.cjs --apply
 */

const { Pool } = require("pg");

const PG_URL = process.env.IMPORT_DATABASE_URL || process.env.DATABASE_URL;
if (!PG_URL) {
  console.error("DATABASE_URL (ou IMPORT_DATABASE_URL) é obrigatório.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const connectionString = String(PG_URL)
  .replace(/([?&])sslmode=[^&]*/i, "$1")
  .replace(/[?&]$/, "");
const pool = new Pool({ connectionString, max: 5, ssl: { rejectUnauthorized: false } });

function normalizeRef(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function findStockForArticle(article, allStock) {
  const ref = normalizeRef(article.referencia);
  if (ref) {
    const byRef = allStock.find((s) => normalizeRef(s.referencia) === ref);
    if (byRef) return byRef.id;
  }
  const code = normalizeRef(article.codigofabricante);
  if (code) {
    const byCode = allStock.find((s) => normalizeRef(s.codigofabricante) === code);
    if (byCode) return byCode.id;
  }
  const name = normalizeText(article.name);
  if (name) {
    const exact = allStock.find((s) => normalizeText(s.descricao) === name);
    if (exact) return exact.id;
    const soft = allStock.find((s) => {
      const desc = normalizeText(s.descricao);
      if (!desc) return false;
      return desc.includes(name) || name.includes(desc);
    });
    if (soft) return soft.id;
  }
  return null;
}

async function main() {
  const stockRes = await pool.query(
    'SELECT id, referencia, descricao, "codigoFabricante" AS codigofabricante, validade FROM "Stock"'
  );
  const allStock = stockRes.rows;
  console.log(`Stock: ${allStock.length} registos.`);

  const beforeRes = await pool.query(
    'SELECT COUNT(*)::int AS n FROM "ArtigoJangada" WHERE "inspecaoId" IS NULL AND "stockId" IS NULL'
  );
  console.log(`Artigos físicos sem stockId (antes): ${beforeRes.rows[0].n}`);

  if (!APPLY) {
    console.log("[preview] Executar com --apply para ligar os artigos ao stock.");
    return;
  }

  const artRes = await pool.query(
    'SELECT id, name, referencia, "codigoFabricante" AS codigofabricante, validade FROM "ArtigoJangada" WHERE "inspecaoId" IS NULL AND "stockId" IS NULL'
  );
  const articles = artRes.rows;

  let linked = 0;
  let valFilled = 0;

  for (const art of articles) {
    const stockId = findStockForArticle(art, allStock);
    if (!stockId) continue;
    const stock = allStock.find((s) => s.id === stockId);

    const setParts = ['"stockId" = $1', '"updatedAt" = now()'];
    const params = [stockId];

    if (stock && stock.validade && !art.validade) {
      const v = new Date(stock.validade);
      if (!isNaN(v.getTime())) {
        params.push(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), 1)));
        setParts.push(`validade = $${params.length}`);
        valFilled++;
      }
    }

    params.push(art.id);
    await pool.query(
      `UPDATE "ArtigoJangada" SET ${setParts.join(", ")} WHERE id = $${params.length}`,
      params
    );
    linked++;
  }

  const afterRes = await pool.query(
    'SELECT COUNT(*)::int AS n FROM "ArtigoJangada" WHERE "inspecaoId" IS NULL AND "stockId" IS NULL'
  );
  console.log(
    `\n[apply] ${articles.length} candidatos, 🔗${linked} ligados, validades preenchidas: ${valFilled}.`
  );
  console.log(`Artigos físicos sem stockId (depois): ${afterRes.rows[0].n}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
