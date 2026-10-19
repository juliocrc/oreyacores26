import prisma from "./prisma";

/** Estado das comunicações em fila: documentos prontos mas ainda não enviados. */
export const DOC_POR_ENVIAR_STATUS = "por_enviar";
/** Canal usado para marcar registos que estão apenas na fila interna. */
export const DOC_POR_ENVIAR_CANAL = "fila";

export type DocumentoPorEnviar = {
  id: number;
  jangadaId: number | null;
  clienteId: number | null;
  assunto: string | null;
  mensagem: string;
  status: string | null;
  enviadoEm: Date;
};

/**
 * Garante que existe um registo "por enviar" para a jangada após a inspeção
 * concluída. Idempotente: não duplica se já existir um pendente com o mesmo
 * assunto (por certificado).
 */
export async function ensureDocumentoPorEnviar(input: {
  jangadaId?: number | null;
  clienteId?: number | null;
  certificadoNumero?: string | null;
}): Promise<void> {
  const jangadaId = Number(input.jangadaId) || null;
  if (!jangadaId) return;

  const certificado = String(input.certificadoNumero || "").trim();
  const assunto = certificado
    ? `Documentos da inspeção ${certificado}`
    : "Documentos da inspeção";

  try {
    const existing = await prisma.comunicacao.findFirst({
      where: { jangadaId, status: DOC_POR_ENVIAR_STATUS, assunto },
      select: { id: true },
    });
    if (existing) return;

    let clienteId = input.clienteId ?? null;
    if (!clienteId) {
      const jangada = await prisma.jangada.findUnique({
        where: { id: jangadaId },
        select: { shipId: true },
      });
      if (jangada?.shipId) {
        const navio = await prisma.navio.findUnique({
          where: { id: jangada.shipId },
          select: { clienteId: true },
        });
        clienteId = navio?.clienteId ?? null;
      }
    }

    await prisma.comunicacao.create({
      data: {
        tipo: "EMAIL",
        canal: DOC_POR_ENVIAR_CANAL,
        status: DOC_POR_ENVIAR_STATUS,
        destinatario: null,
        assunto,
        mensagem: "Certificado e quadro de inspeção prontos a enviar ao armador.",
        refTipo: "Jangada",
        refId: jangadaId,
        jangadaId,
        clienteId,
        enviadoPor: "sistema",
      },
    });
  } catch (error) {
    console.error("[docs-por-enviar] Falha ao garantir pendente:", error);
  }
}

export async function listDocumentosPorEnviar(jangadaId: number): Promise<DocumentoPorEnviar[]> {
  if (!Number.isFinite(jangadaId) || jangadaId <= 0) return [];
  const items = await prisma.comunicacao.findMany({
    where: { jangadaId, status: DOC_POR_ENVIAR_STATUS },
    orderBy: [{ enviadoEm: "desc" }, { id: "desc" }],
    select: {
      id: true,
      jangadaId: true,
      clienteId: true,
      assunto: true,
      mensagem: true,
      status: true,
      enviadoEm: true,
    },
  });
  return items;
}

export async function atualizarDocumentoPorEnviar(
  id: number,
  jangadaId: number,
  status: string,
): Promise<boolean> {
  const res = await prisma.comunicacao.updateMany({
    where: { id, jangadaId },
    data: { status },
  });
  return res.count > 0;
}
