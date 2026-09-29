/**
 * Verificação final do bloqueio de inspeções, contra a base de dados real.
 */
import prisma from "@/lib/prisma";
import { isInspectionLocked, evaluateInspectionEdit } from "@/lib/inspecao-lock";
import { verifyInspectionIntegrity } from "@/lib/integrity-stamp";

async function main() {
  const rascunho = await prisma.inspecao.findFirst({ where: { status: "Rascunho" } });
  const carimbada = await prisma.inspecao.findFirst({
    where: { integrityHash: { not: null }, status: "Concluída" },
  });

  console.log("=== rascunho (deve ficar editavel) ===");
  if (rascunho) {
    console.log(`  id ${rascunho.id} cert=${rascunho.certificadoNumero}`);
    console.log(`  bloqueada: ${isInspectionLocked(rascunho)}`);
    const d = evaluateInspectionEdit({ bloqueada: isInspectionLocked(rascunho), isAdmin: true });
    console.log(`  edicao permitida: ${d.permitido}`);
  }

  console.log("\n=== inspecao finalizada (deve estar trancada) ===");
  if (carimbada) {
    console.log(`  id ${carimbada.id} cert=${carimbada.certificadoNumero}`);
    console.log(`  bloqueada: ${isInspectionLocked(carimbada)}`);

    const semPedido = evaluateInspectionEdit({
      bloqueada: true,
      isAdmin: true,
      certificadoNumero: carimbada.certificadoNumero,
    });
    console.log(`  edicao sem reabertura: ${semPedido.permitido}`);

    const semJustificacao = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: true,
    });
    console.log(`  reabertura sem justificacao: ${semJustificacao.permitido}`);

    const tecnico = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: false,
      justificacao: "Uma justificacao valida e suficientemente longa",
    });
    console.log(`  reabertura por tecnico: ${tecnico.permitido}`);

    const admin = evaluateInspectionEdit({
      bloqueada: true,
      reabrir: true,
      isAdmin: true,
      justificacao: "Erro de digitacao no numero de serie do cilindro",
    });
    console.log(`  reabertura por admin com justificacao: ${admin.permitido}`);

    const v = await verifyInspectionIntegrity(carimbada.id);
    console.log(`  integridade: stamped=${v.stamped} valid=${v.valid}`);
  }

  const contagens = {
    total: await prisma.inspecao.count(),
    carimbadas: await prisma.inspecao.count({ where: { integrityHash: { not: null } } }),
    rascunhos: await prisma.inspecao.count({ where: { integrityHash: null } }),
  };
  console.log("\n=== resumo ===");
  console.log(" ", contagens);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
