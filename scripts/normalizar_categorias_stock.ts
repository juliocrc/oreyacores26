/**
 * Normalização de categorias de stock + report.
 *
 * - Só atua em linhas com associavelJangada=true (componentes do catálogo
 *   já elegíveis para jangadas) e numa lista curada de refs sabidamente mal
 *   categorizadas (categorias corrompidas na importação).
 * - Preview por omissão (imprime o report completo + o que seria alterado);
 *   --apply grava.
 *
 *   npx tsx scripts/normalizar_categorias_stock.ts            # preview (report)
 *   npx tsx scripts/normalizar_categorias_stock.ts --apply     # grava
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

// Mapa curado por referencia (verificado contra o catálogo real).
const CURATED: Record<string, string> = {
  "30203172": "CABEÇAS DE DISPARO", // antes "RFD"
  "31301094": "VÁLVULAS", // antes "LKAFIELDve"
  "31301018": "ANILHAS / VEDAÇÕES", // antes "FGBERket 15x"
  "31301022": "ANILHAS / VEDAÇÕES", // antes "FGBER"
  "31301060": "ANILHAS / VEDAÇÕES", // antes "GASKET  DE X X"
  "31301061": "ANILHAS / VEDAÇÕES", // antes "TETX10A,"
  "31301064": "ANILHAS / VEDAÇÕES", // antes "CCPPERket 15x"
  "31301133": "ANILHAS / VEDAÇÕES", // antes "PGINTER"
  "31301073": "CABEÇAS DE DISPARO", // antes "DKHperating"
  "30203076": "CABEÇAS DE DISPARO", // antes null
  "20402034": "CABEÇAS DE DISPARO", // antes null
  "31301059": "PROTEÇÕES", // antes "HEADP"
  "31301069": "PROTEÇÕES", // antes null
  "31301098": "LUBRIFICANTES", // antes "MOLYKOTEH"
};

function looksGarbled(cat: string | null): boolean {
  const v = String(cat || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!v || v.toLowerCase() === "null") return true;
  const compact = v.replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "");
  return /[A-Za-z]{2,}\d+[A-Za-z]/.test(compact);
}

async function main() {
  const rows = await prisma.stock.findMany({
    select: { id: true, referencia: true, descricao: true, categoria: true, associavelJangada: true },
    orderBy: [{ associavelJangada: "desc" }, { referencia: "asc" }],
  });

  const associated = rows.filter((r) => r.associavelJangada);
  const suspicious = associated.filter((r) => looksGarbled(r.categoria));

  console.log(`Stock total: ${rows.length} | associavel=true: ${associated.length} | categorias suspeitas: ${suspicious.length}`);
  console.log("\n===== REPORT — categorias suspeitas (associavelJangada=true) =====");
  for (const r of suspicious) {
    const flag = r.categoria && String(r.categoria).toLowerCase() !== "null"
      ? "corrompida" : "vazia/null";
    console.log(`  #${r.id} ${r.referencia} | ${r.descricao} | categoria="${r.categoria || "(vazio)"}" → ${flag}`);
  }

  const toFix: typeof rows = [];
  for (const r of rows) {
    const target = CURATED[r.referencia];
    if (target && r.categoria !== target) toFix.push(r);
  }
  console.log(`\n===== A corrigir (mapa curado) — ${toFix.length} =====`);
  for (const r of toFix) {
    console.log(`  #${r.id} ${r.referencia} | ${r.descricao} | "${r.categoria || "(vazio)"}" → "${CURATED[r.referencia]}"`);
  }

  const genericNull = rows.filter((r) => r.categoria !== null && String(r.categoria).toLowerCase() === "null");
  console.log(`\n===== A corrigir (string "null" → vazio) — ${genericNull.length} =====`);
  for (const r of genericNull) {
    console.log(`  #${r.id} ${r.referencia} | ${r.descricao}`);
  }

  if (!APPLY) {
    console.log("\n[preview] Aplicar com --apply para gravar (categorias curadas + \"null\"→vazio).");
    return;
  }

  let changed = 0;
  for (const r of toFix) {
    await prisma.stock.update({ where: { id: r.id }, data: { categoria: CURATED[r.referencia] } });
    changed++;
  }
  for (const r of genericNull) {
    await prisma.stock.update({ where: { id: r.id }, data: { categoria: null } });
    changed++;
  }
  console.log(`\n[apply] total: ${changed} linha(s) atualizada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });