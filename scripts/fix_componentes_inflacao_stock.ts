/**
 * Associação de componentes do sistema de insuflação aos artigos de stock,
 * derivada DO MANUAL (raftModelData): as marcas/modelos cujos serviceItems/
 * spareParts declaram cada componente ficam como aplicáveis (aplicavelMarcaJangada/
 * aplicavelModeloJangada) e o artigo passa a associavelJangada=true.
 *
 * Famílias:
 *   - cabeça de disparo GIST / Leafield / OS-GIS
 *   - cabeças de disparo DK88 / DK94 / DK99 (Thanner)
 *   - tubos de alta pressão (HP hose / double bayonet / rapid hose)
 *   - válvulas de alívio (relief / PRV / OTS65)
 *   - válvulas de atestar (inlet / filling / check valve)
 *   - anilhas / o-rings de vedação do sistema GIST/DK/Thanner
 *   - adaptadores do sistema de insuflação
 *
 * Idempotente. Preview por omissão; usa --apply para gravar.
 *
 *   npx tsx scripts/fix_componentes_inflacao_stock.ts            # preview
 *   npx tsx scripts/fix_componentes_inflacao_stock.ts --apply     # grava
 */

import { PrismaClient } from "@prisma/client";
import { raftModelData } from "../src/modules/rafts/raftModelData";

const prisma = new PrismaClient();

function normText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

type FamilyDef = {
  key: string;
  label: string;
  stockRefs: string[];
  stockNameMatch: (desc: string, cat: string, ref: string) => boolean;
  manualRefs: string[];
  manualNameMatch: (name: string, ref: string) => boolean;
};

function normIn(tokens: string[], value: string): boolean {
  const v = normText(value);
  return tokens.some((t) => v.includes(normText(t)));
}

function nameIncludes(value: string, tokens: string[]): boolean {
  const v = normText(value);
  return tokens.some((t) => v.includes(normText(t)));
}

const FAMILIES: FamilyDef[] = [
  {
    key: "cabeça_gist",
    label: "Cabeça de disparo GIST",
    stockRefs: ["30203172", "20020400", "30410046"],
    stockNameMatch: (desc) => desc.includes("gist") && desc.includes("op head"),
    manualRefs: ["08426009", "08426010", "R08211009", "08211009", "OSL0104", "OSL0142"],
    manualNameMatch: (name) =>
      nameIncludes(name, ["OPERATING HEAD", "OP HEAD", "HEAD OPERATIONAL", "HEAD GIST", "CABECA DE DISPARO"]) &&
      nameIncludes(name, ["GIST", "LEAFIELD", "GIS"]),
  },
  {
    key: "cabeça_dk",
    label: "Cabeças de disparo DK88 / DK94 / DK99 (Thanner)",
    stockRefs: ["20020401", "31301073", "30203076"],
    stockNameMatch: (desc) =>
      desc.includes("cabeca de disparo dk") || desc.includes("dk99") || desc.includes("thanner"),
    manualRefs: ["Z63127", "08008009", "06721009"],
    manualNameMatch: (name) =>
      nameIncludes(name, ["OPERATING HEAD", "OP HEAD", "CABECA DE DISPARO", "DK99 HEAD B"]) &&
      nameIncludes(name, ["DK99", "DK 99", "DK94", "DK 94", "DK88", "DK 88"]),
  },
  {
    key: "tubo_alta_pressao",
    label: "Tubos de alta pressão",
    stockRefs: [
      "20020300", "20020310", "30202001", "30202044", "30203001", "30203005",
      "30203032", "30203035", "30203116", "30203117", "30203118", "30203119",
      "30410073", "30410074", "30410101", "30410116", "30420019", "30420022", "30420023",
    ],
    stockNameMatch: (desc, cat, ref) =>
      cat.includes("tubos de alta") || cat.includes("tubo de alta") ||
      (desc.includes("hose") && (desc.includes("alta") || desc.includes("pressao") || desc.includes("high pressure"))) ||
      desc.includes("tubo de alta pressao") || desc.includes("hp hose"),
    manualRefs: [
      "OSL0130", "OSL0135", "0855109", "06719009", "R08255009",
      "Z3106", "Z3205", "Z3202", "Z64529", "Z64660", "Z64528",
    ],
    manualNameMatch: (name) =>
      nameIncludes(name, ["HOSE", "TUBO", "MANGUEIRA"]) &&
      (nameIncludes(name, ["HIGH PRESSURE", "ALTA PRESSAO", "BAYONET", "RAPID", "INFLATION", "HP HOSE", "G3/8", "M16", "800MM", "SIPHON"])),
  },
  {
    key: "valvula_alivio",
    label: "Válvulas de alívio / PRV",
    stockRefs: ["30420032", "30420033", "30420068", "VAL-VA70"],
    stockNameMatch: (desc) =>
      desc.includes("ots65") ||
      nameIncludes(desc, ["ALIVIO", "ALÍVIO", "RELIEF", "SOBREPRESSAO", "PRV", "PRESSURE VALVE"]),
    manualRefs: [
      "VAL-THAN-OTS65", "R08152009", "0855009", "08554009", "08557009", "R08223009",
      "10359166", "VAL-PLASTIMO-RELIEF", "OSL0150", "OSL0160", "OSL0165", "OSL0170",
      "OSL0175", "OSL0177", "OSL1134", "OSL0531", "OSL0550", "Z2491", "Z63748",
    ],
    manualNameMatch: (name) =>
      nameIncludes(name, ["RELIEF", "ALIVIO", "ALÍVIO", "SOBREPRESSAO", "PRV", "PRESSURE RELIEF", "PRESSURE VALVE", "OTS65"]),
  },
  {
    key: "valvula_atestar",
    label: "Válvulas de atestar / inlet / filling",
    stockRefs: ["30202060", "31301094"],
    stockNameMatch: (desc, cat) =>
      !cat.includes("coletes") && !nameIncludes(desc, ["PAD", "PROTECT"]) &&
      nameIncludes(desc, ["ATESTAR", "FILLING VALVE", "INLET VALVE", "CHECK VALVE", "VALVE INLET"]),
    manualRefs: [
      "A10-INLET", "0871901", "08423009", "08424009", "R08209009", "R08210009",
      "OSL0124", "OSL0526", "OSL0527", "OSL0528",
    ],
    manualNameMatch: (name) =>
      nameIncludes(name, ["INLET", "FILLING", "CHECK VALVE", "ATESTAR", "ENCHIMENTO"]) &&
      !nameIncludes(name, ["PAD", "PROTECTION"]),
  },
  {
    key: "anilha_vedacao",
    label: "Anilhas / o-rings de vedação do sistema GIST/DK/Thanner",
    stockRefs: ["20020320", "30202042", "30410119", "31301017", "31301018", "31301022", "31301060", "31301061", "31301064"],
    stockNameMatch: (desc) =>
      nameIncludes(desc, ["ANILHA", "O-RING", "ORING", "GASKET", "VEDACAO"]) &&
      (nameIncludes(desc, ["GIST", "DK", "THANNER", "COBRE", "FIBER", "UNION"]) || nameIncludes(desc, ["DE COBRE"])),
    manualRefs: ["0871900", "0878700", "OSL0137", "OSL0102", "CYL2385"],
    manualNameMatch: (name) =>
      nameIncludes(name, ["O-RING", "ORING", "GASKET", "ANILHA", "VEDACAO", "SEAL", "WASHER"]) &&
      (nameIncludes(name, ["GIST", "LEAFIELD", "DK", "THANNER", "BAYONET", "UNION", "CYLINDER", "BUOYANCY", "FILLING"])) &&
      !nameIncludes(name, ["KIT", "PAD", "PROTECTION"]),
  },
  {
    key: "adaptador_inflacao",
    label: "Adaptadores do sistema de insuflação",
    stockRefs: ["20020321"],
    stockNameMatch: (desc, cat) =>
      !cat.includes("colete") &&
      nameIncludes(desc, ["ADAPTADOR", "ADAPTER"]) && !desc.includes("colete"),
    manualRefs: ["06721009", "08387009", "R08221009", "08221009"],
    manualNameMatch: (name) => nameIncludes(name, ["ADAPTER", "ADAPTADOR"]),
  },
];

export async function deriveFamilyApplicability() {
  const results: Record<string, { brands: string[]; models: string[]; sources: Array<{ brand: string; model: string; item: string }> }> = {};

  for (const family of FAMILIES) {
    const brands = new Set<string>();
    const models = new Set<string>();
    const sources: Array<{ brand: string; model: string; item: string }> = [];

    for (const [brand, modelsList] of Object.entries(raftModelData)) {
      for (const model of modelsList) {
        const items = [
          ...(model.serviceItems || []),
          ...(model.spareParts || []),
        ];
        const refs = new Set(family.manualRefs.map((r) => normText(r)));
        const hit = items.find((item) => {
          const ref = normText(item.reference);
          const name = normText(item.name);
          if (ref && refs.has(ref)) return true;
          return family.manualNameMatch(name, ref);
        });
        if (!hit) continue;
        brands.add(brand);
        models.add(model.name);
        sources.push({ brand, model: model.name, item: hit.name || hit.reference || "" });
        for (const alias of model.aliases || []) models.add(alias);
      }
    }

    results[family.key] = {
      brands: Array.from(brands).sort((a, b) => a.localeCompare(b, "pt")),
      models: Array.from(models).sort((a, b) => a.localeCompare(b, "pt")),
      sources,
    };
  }

  return results;
}

async function resolveFamiliesStockRefs() {
  const all = await prisma.stock.findMany({
    select: { id: true, referencia: true, descricao: true, categoria: true },
  });

  const byFamily: Record<string, number[]> = {};
  for (const family of FAMILIES) {
    const refs = new Set(family.stockRefs.map((r) => normText(r)));
    const ids = all
      .filter((s) => {
        const ref = normText(s.referencia);
        if (ref && refs.has(ref)) return true;
        return family.stockNameMatch(normText(s.descricao), normText(s.categoria), ref);
      })
      .map((s) => s.id);
    byFamily[family.key] = ids;
  }
  return byFamily;
}

const APPLY = process.argv.includes("--apply");

async function main() {
  const applicability = await deriveFamilyApplicability();

  for (const family of FAMILIES) {
    const app = applicability[family.key];
    console.log(`\n===== ${family.label} =====`);
    for (const s of app.sources) {
      console.log(`  MANUAL: ${s.brand} · ${s.model} — "${s.item}"`);
    }
    if (app.brands.length === 0) {
      console.log("  (nenhum modelo manual identifica esta família — não será aplicada)");
      continue;
    }
    console.log(`  Marcas:  ${app.brands.join(", ")}`);
    console.log(`  Modelos: ${app.models.join(", ")}`);
  }

  const stockByFamily = await resolveFamiliesStockRefs();

  console.log("\n===== Stock alvo =====\n");

  const rows = await prisma.stock.findMany({
    where: { id: { in: Array.from(new Set(Object.values(stockByFamily).flat())) } },
    select: { id: true, referencia: true, descricao: true, quantidade: true, associavelJangada: true, categoria: true },
    orderBy: { referencia: "asc" },
  });
  const rowMap = new Map(rows.map((r) => [r.id, r]));

  if (!APPLY) {
    for (const family of FAMILIES) {
      const app = applicability[family.key];
      if (app.brands.length === 0) continue;
      console.log(`[preview] ${family.label}:`);
      for (const id of stockByFamily[family.key]) {
        const r = rowMap.get(id);
        if (!r) continue;
        console.log(`  #${r.id} ${r.referencia} | ${r.descricao} | qty=${r.quantidade} assoc=${r.associavelJangada}`);
      }
    }
    console.log("\n[preview] Aplicar com --apply para gravar (associavelJangada=true + marcas/modelos do manual).");
    return;
  }

  let total = 0;
  for (const family of FAMILIES) {
    const app = applicability[family.key];
    if (app.brands.length === 0) continue;
    const ids = stockByFamily[family.key];
    if (ids.length === 0) continue;
    const patch = await prisma.stock.updateMany({
      where: { id: { in: ids } },
      data: {
        associavelJangada: true,
        aplicavelMarcaJangada: app.brands.join(", "),
        aplicavelModeloJangada: app.models.join(", "),
      },
    });
    total += patch.count;
    console.log(`[apply] ${family.label}: ${patch.count} linha(s) atualizada(s).`);
  }
  console.log(`\n[apply] total: ${total} linha(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });