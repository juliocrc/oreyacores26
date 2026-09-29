/**
 * Carimbo retroativo de inspeções finalizadas.
 *
 * Usa o mesmo `stampInspectionWithDigest` da aplicação, para que o digest
 * fique byte-a-byte igual ao que o sistema produz hoje. Reescrever o cálculo
 * aqui arriscaria carimbos que depois dariam "inválido" sem motivo.
 *
 * Exclui rascunhos de propósito: carimbar um rascunho trancá-lo-ia como se
 * fosse um documento assinado.
 */
import prisma from "@/lib/prisma";
import { stampInspectionWithDigest, verifyInspectionIntegrity } from "@/lib/integrity-stamp";
import { logAuditoria } from "@/lib/auditoria";

const CONCLUIDAS = ["CONCLUIDA", "CONCLUÍDA", "CONCLUIDO", "FINALIZADA", "ASSINADA"];

function normalizar(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

async function main() {
  const todas = await prisma.inspecao.findMany({
    select: { id: true, certificadoNumero: true, status: true, integrityHash: true },
    orderBy: { id: "asc" },
  });

  const jaCarimbadas = todas.filter((i) => i.integrityHash);
  const aCarimbar = todas.filter(
    (i) => !i.integrityHash && CONCLUIDAS.includes(normalizar(i.status))
  );
  const ignoradas = todas.filter(
    (i) => !i.integrityHash && !CONCLUIDAS.includes(normalizar(i.status))
  );

  console.log(`total:            ${todas.length}`);
  console.log(`ja carimbadas:    ${jaCarimbadas.length}`);
  console.log(`a carimbar:       ${aCarimbar.length}`);
  console.log(`ignoradas:        ${ignoradas.length} (nao finalizadas)`);
  for (const i of ignoradas) {
    console.log(`   - id ${i.id} cert=${i.certificadoNumero || "-"} status=${i.status || "(vazio)"}`);
  }

  let ok = 0;
  const falhas: Array<{ id: number; erro: string }> = [];

  for (const i of aCarimbar) {
    try {
      const r = await stampInspectionWithDigest(i.id);
      if (r?.integrityHash) ok++;
      else falhas.push({ id: i.id, erro: "carimbo vazio" });
    } catch (err) {
      falhas.push({ id: i.id, erro: err instanceof Error ? err.message : String(err) });
    }
    if (ok % 50 === 0 && ok > 0) console.log(`   ...${ok} carimbadas`);
  }

  console.log(`\ncarimbadas com sucesso: ${ok}`);
  if (falhas.length) {
    console.log(`falhas: ${falhas.length}`);
    for (const f of falhas.slice(0, 10)) console.log(`   - id ${f.id}: ${f.erro}`);
  }

  // Confirma que os carimbos validam de facto.
  const restantes = await prisma.inspecao.findMany({
    where: { integrityHash: { not: null } },
    select: { id: true },
  });
  let validas = 0;
  let invalidas = 0;
  const invalidasIds: number[] = [];
  for (const i of restantes) {
    const v = await verifyInspectionIntegrity(i.id);
    if (v.stamped && v.valid) validas++;
    else {
      invalidas++;
      if (invalidasIds.length < 10) invalidasIds.push(i.id);
    }
  }
  console.log(`\nverificacao: ${validas} validas, ${invalidas} invalidas`);
  if (invalidasIds.length) console.log(`ids invalidos: ${invalidasIds.join(", ")}`);

  await logAuditoria({
    tabela: "Inspecao",
    tipoOperacao: "UPDATE",
    idRegisto: 0,
    descricao:
      `Carimbo retroativo aplicado a ${ok} inspeção(ões) já finalizada(s) ` +
      `para as tornar inalteráveis. Operação de migração, sem alteração de conteúdo.`,
    usuario: "migracao-carimbo-retroativo",
    dadosDepois: { carimbadas: ok, falhas: falhas.length, verificadasValidas: validas },
  });

  await prisma.$disconnect();
  if (falhas.length || invalidas) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
