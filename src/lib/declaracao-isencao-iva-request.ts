import { getAuthSession } from "@/auth";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath, canViewPath } from "@/lib/user-permissions";
import prisma from "@/lib/prisma";
import { DeclaracaoIvaError, emitirDeclaracaoIsencaoIva, type DeclaracaoIsencaoIvaEmitida } from "./declaracao-isencao-iva";
import { getIsencaoIvaInfo } from "./iva-isencao-codes";
import { signedIvaDisplay } from "./iva-signed-metadata";

export type IvaSnapshot = {
  version: 1 | 2;
  clienteMorada: string;
  tipoPesca: string;
  navioCfr: string | null;
  localEmissao: string;
  serviceStationId: number | null;
  isencaoInfo: NonNullable<ReturnType<typeof getIsencaoIvaInfo>>;
};

export function declarationSnapshot(row: DeclaracaoIsencaoIvaEmitida): IvaSnapshot {
  if (!row.snapshotJson) throw new DeclaracaoIvaError("Declaracao historica sem snapshot; nao e possivel reconstruir o original.", 409);
  const snapshot = JSON.parse(row.snapshotJson) as IvaSnapshot;
  if (snapshot.version !== 1 && snapshot.version !== 2) throw new DeclaracaoIvaError("Snapshot nao suportado.", 409);
  return snapshot;
}

export async function resolveIvaDeclaration(params: URLSearchParams, post: boolean, signedUpload = false) {
  const session = await getAuthSession();
  if (!session?.user?.id) throw new DeclaracaoIvaError("Sessao obrigatoria.", 401);
  const user = session.user;
  const access = user.role === "CLIENTE" ? null : await getAccessContext();
  if (user.role !== "CLIENTE" && !access) throw new DeclaracaoIvaError("Sem acesso.", 403);
  const id = params.get("declaracaoId");
  if (post && id) throw new DeclaracaoIvaError("Use GET para reimprimir.", 400);
  const saved = id ? await prisma.declaracaoIsencaoIva.findUnique({ where: { id: positiveId(id) } }) : null;
  if (id && !saved) throw new DeclaracaoIvaError("Declaracao nao encontrada.", 404);
  // Legacy declarations have no trustworthy ownership IDs. Never infer ownership from names.
  if (saved && (!saved.navioId || !saved.clienteId)) throw new DeclaracaoIvaError("Declaracao historica sem associacao verificavel.", 409);
  const navioId = saved?.navioId ?? positiveId(params.get("navioId"));
  const navio = await prisma.navio.findUnique({ where: { id: navioId }, include: { cliente: true } });
  if (!navio?.cliente) throw new DeclaracaoIvaError("Navio sem cliente associado.", 404);
  if (params.has("clienteId") && positiveId(params.get("clienteId")) !== navio.clienteId) {
    throw new DeclaracaoIvaError("O cliente nao corresponde ao navio.", 403);
  }
  if (user.role === "CLIENTE") {
    const ownId = Number(user.clienteId);
    if (!ownId || navio.clienteId !== ownId || (saved && saved.clienteId !== ownId)) {
      throw new DeclaracaoIvaError("O navio nao pertence ao cliente autenticado.", 403);
    }
  } else if (!access!.isAdmin) {
    const allowed = access!.allowedStationIds;
    if (!allowed.includes(navio.serviceStationId ?? 0) ||
      !(!post && !signedUpload && (id || params.get("historico") === "1") ? canViewPath(access!.permissions, "/relatorios") : canEditPath(access!.permissions, "/relatorios")) ||
      (saved && !allowed.includes(declarationSnapshot(saved).serviceStationId ?? 0))) {
      throw new DeclaracaoIvaError("Sem permissao para esta estacao ou declaracao.", 403);
    }
  }
  if (saved) return { declaration: saved, snapshot: declarationSnapshot(saved), ...(signedUpload ? { actor: String(user.id) } : {}) };
  if (signedUpload) throw new DeclaracaoIvaError("Indique uma declaracao emitida.", 400);
  if (!post && params.get("historico") === "1") {
    const rows = await prisma.declaracaoIsencaoIva.findMany({
      where: { navioId, clienteId: navio.clienteId, snapshotJson: { not: null } },
      orderBy: [{ dataEmissao: "desc" }, { id: "desc" }], take: 100,
    });
    return { history: rows.filter(row => !access || access.isAdmin || access.allowedStationIds.includes(declarationSnapshot(row).serviceStationId ?? 0))
      .map(row => ({ id: row.id, numeroCompleto: row.numeroCompleto, dataEmissao: row.dataEmissao, navioNome: row.navioNome,
        pdfAssinado: signedIvaDisplay(row.pdfAssinadoMeta) })) };
  }
  // The shipped GET download remains usable, but repeated old links reuse one persisted request.
  const codigoIsencaoIva = params.get("codigoIsencaoIva")?.trim().toUpperCase() || "M05";
  if (!getIsencaoIvaInfo(codigoIsencaoIva)) throw new DeclaracaoIvaError("Codigo de isencao invalido.", 400);
  if (post && params.has("origem") && !["cliente", "relatorios"].includes(params.get("origem")!)) {
    throw new DeclaracaoIvaError("Origem invalida.", 400);
  }
  const origem = post && params.get("origem") === "relatorios" ? "relatorios" : "cliente";
  const key = post ? params.get("idempotencyKey") : `legacy-iva:${user.id}:${navioId}:${codigoIsencaoIva}`;
  if (!key || key.length > 200 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw new DeclaracaoIvaError("Chave de idempotencia obrigatoria ou invalida.", 400);
  if (post && key.startsWith("legacy-iva:")) throw new DeclaracaoIvaError("Chave reservada.", 400);
  const previous = await prisma.declaracaoIsencaoIva.findUnique({ where: { idempotencyKey: key } });
  const input = { clienteId: navio.clienteId, navioId, codigoIsencaoIva, origem, emitidoPorId: String(user.id), idempotencyKey: key };
  // Resolve retries before revalidating mutable vessel data, including eligibility.
  if (previous) {
    if (previous.clienteId !== input.clienteId || previous.navioId !== navioId || previous.codigoIsencaoIva !== codigoIsencaoIva ||
      previous.emitidoPorId !== input.emitidoPorId || previous.origem !== origem) throw new DeclaracaoIvaError("Chave reutilizada com outro pedido.", 409);
    const snapshot = declarationSnapshot(previous);
    if (access && !access.isAdmin && !access.allowedStationIds.includes(snapshot.serviceStationId ?? 0)) throw new DeclaracaoIvaError("Sem acesso a estacao original.", 403);
    return { declaration: previous, snapshot };
  }
  const tipoPesca = navio.tipoPesca.trim();
  if (!tipoPesca || ["não aplicável", "outro", "n/d", "nd"].includes(tipoPesca.toLowerCase())) {
    throw new DeclaracaoIvaError("A declaracao de isencao de IVA so pode ser emitida para embarcacoes de pesca.", 400);
  }
  const snapshot: IvaSnapshot = { version: 2, clienteMorada: navio.cliente.morada || "", tipoPesca,
    navioCfr: navio.cfr, localEmissao: "Cabouco", serviceStationId: navio.serviceStationId,
    isencaoInfo: getIsencaoIvaInfo(codigoIsencaoIva)! };
  const declaration = await emitirDeclaracaoIsencaoIva({ ...input, clienteNome: navio.cliente.nome,
    clienteNif: navio.cliente.nif, navioNome: navio.nome, navioMatricula: navio.matricula, snapshotJson: JSON.stringify(snapshot) });
  return { declaration, snapshot: declarationSnapshot(declaration) };
}

function positiveId(value: string | null) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new DeclaracaoIvaError("ID invalido.", 400);
  return id;
}
