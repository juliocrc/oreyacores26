import { PrismaClient } from "@prisma/client";
import { computeStockNeeds } from "../src/lib/stock-needs-engine";

const prisma = new PrismaClient();
const RATION_REF = "30202084";

async function main() {
  const failures: string[] = [];
  const ok = (label: string) => console.log(`  PASS  ${label}`);
  const fail = (label: string) => {
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  };

  console.log("== Motor de necessidades (scope=jangadas-ocean) ==");
  const result = await computeStockNeeds({ stockScope: "jangadas-ocean" } as any);

  const ration = result.needs.find((n: any) => String(n.referencia).includes(RATION_REF));
  if (!ration) {
    fail("Existe linha de necessidade para a ração 30202084");
  } else {
    ok("Existe linha de necessidade para a ração 30202084");
    const matched = Array.isArray(ration.stockMatched) ? ration.stockMatched : [];
    if (ration.stockAtual === 131 && matched.some((m: any) => String(m.ref) === RATION_REF && Number(m.qty) > 0)) {
      ok("Ração 30202084 casa com stock real (131) e já não devolve stock:0");
    } else {
      fail(`Ração 30202084 deveria casar com stock 131 (atual=${ration.stockAtual} matched=[${matched.map((m: any) => `${m.id}:${m.ref}:${m.qty}`).join(",")}])`);
    }
  }

  const repair = result.needs.find((n: any) => /jogo de repar/i.test(String(n.nome)));
  if (repair) {
    const refs = Array.isArray(repair.stockMatched) ? repair.stockMatched.map((m: any) => String(m.ref)) : [];
    if (refs.includes(RATION_REF)) {
      fail(`"${repair.nome}" NÃO pode resolver para a ração ${RATION_REF}`);
    } else {
      ok(`"${repair.nome}" não resolve para a ração ${RATION_REF} (refs=[${refs.join(",")}])`);
    }
  } else {
    ok("Sem linha de 'Jogo de Reparação' nesta base — teste de não-união ignorado");
  }

  console.log("");
  if (failures.length) {
    console.log(`RESULTADO: ${failures.length} falha(s)`);
    process.exitCode = 1;
  } else {
    console.log("RESULTADO: OK");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });