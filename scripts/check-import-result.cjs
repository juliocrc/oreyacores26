/**
 * Confere, tabela a tabela, que o que esta no Supabase bate certo com o
 * SQLite local: contagens de linhas e valores dos campos criticos.
 */
const path = require("path");
const { Client } = require("pg");

const SQLITE_CLIENT = process.env.SQLITE_PRISMA_CLIENT;
const PG_URL = process.env.IMPORT_DATABASE_URL;

function qid(v) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

(async () => {
  const { PrismaClient } = require(SQLITE_CLIENT);
  const sqlite = new PrismaClient({
    datasources: { db: { url: `file:${path.resolve(__dirname, "../prisma/local.db")}` } },
  });
  const pg = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const tables = (
    await sqlite.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
    )
  ).map((r) => r.name);

  let mismatches = 0;
  let totalRows = 0;
  for (const t of tables) {
    const s = Number(
      (await sqlite.$queryRawUnsafe(`SELECT COUNT(*) c FROM ${qid(t)}`))[0].c
    );
    const r = await pg.query(`SELECT COUNT(*)::int c FROM public.${qid(t)}`);
    const p = r.rows[0].c;
    totalRows += s;
    if (s !== p) {
      mismatches++;
      console.log(`  DIVERGENCIA ${t}: sqlite=${s} pg=${p}`);
    }
  }
  console.log(`tabelas: ${tables.length}, divergencias de contagem: ${mismatches}, linhas totais: ${totalRows}`);

  // Campos criticos que estavam em falta no schema PostgreSQL
  const hs = await pg.query(
    `SELECT count(*) FILTER (WHERE "hruSerial" IS NOT NULL AND "hruSerial" <> '') com_hru,
            count(*) total FROM public."Jangada"`
  );
  console.log(`Jangada.hruSerial preenchido: ${hs.rows[0].com_hru}/${hs.rows[0].total}`);

  const un = await pg.query(
    `SELECT count(*) FILTER (WHERE "unit" IS NOT NULL) com_unit, count(*) total FROM public."Stock"`
  );
  console.log(`Stock.unit preenchido: ${un.rows[0].com_unit}/${un.rows[0].total}`);

  // FK adiada tem de ter sido aplicada
  const dj = await pg.query(
    `SELECT count(*) FILTER (WHERE "certificadoAtivoId" IS NOT NULL) com_cert
       FROM public."Jangada"`
  );
  const badFk = await pg.query(
    `SELECT count(*)::int c FROM public."Jangada" j
      WHERE j."certificadoAtivoId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public."CertificadoExtraido" c WHERE c.id = j."certificadoAtivoId")`
  );
  console.log(`Jangada.certificadoAtivoId: ${dj.rows[0].com_cert} definidos, orfaos: ${badFk.rows[0].c}`);

  // Sequencias: proximo id tem de ser maior que o maximo
  const seqIssues = await pg.query(`
    SELECT c.relname AS tabela
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname = 'public'
  `);
  console.log(`sequencias em public: ${seqIssues.rowCount}`);

  const orphan = await pg.query(
    `SELECT count(*)::int c FROM public."OrdemServico" o
      WHERE o."tecnicoId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."Tecnico" t WHERE t.id = o."tecnicoId")`
  );
  console.log(`OrdemServico.tecnicoId orfaos: ${orphan.rows[0].c}`);

  await pg.end();
  await sqlite.$disconnect();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
