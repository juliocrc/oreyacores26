import prisma from "@/lib/prisma";

type LogAuditoriaInput = {
  tabela: string;
  // "REABRIR" cobre a quebra controlada do carimbo de integridade de um
  // documento finalizado, para que essa quebra fique visível na auditoria.
  tipoOperacao: "CREATE" | "UPDATE" | "DELETE" | "REABRIR";
  idRegisto: number;
  descricao?: string;
  usuario?: string;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
};

export async function logAuditoria(input: LogAuditoriaInput) {
  try {
    await prisma.auditoria.create({
      data: {
        tabela: input.tabela,
        tipoOperacao: input.tipoOperacao,
        idRegisto: input.idRegisto,
        descricao: input.descricao,
        usuario: input.usuario || "sistema",
        dadosAntes: input.dadosAntes ? JSON.stringify(input.dadosAntes) : null,
        dadosDepois: input.dadosDepois ? JSON.stringify(input.dadosDepois) : null,
      },
    });
  } catch (error) {
    console.warn("Falha ao registar auditoria:", error);
  }
}
