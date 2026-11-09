import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { canEditPath } from "@/lib/user-permissions";
import { marinhaCatalogue, normalizeMarinhaIdentity, isMarinhaAssociation } from "@/lib/marinha-associations";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { logAuditoria } from "@/lib/auditoria";

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function context(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) throw new RequestError("Sessao obrigatoria.", 401);
  const stationId = resolveActiveServiceStationId(req, access);
  if (!stationId) throw new RequestError("Selecione uma estacao de servico para gerir a Marinha.", 400);
  if ((!access.isAdmin || access.allowedStationIds.length > 0) && !access.allowedStationIds.includes(stationId)) {
    throw new RequestError("Sem permissao para esta estacao.", 403);
  }
  const station = await prisma.serviceStation.findFirst({ where: { id: stationId, ativo: true }, select: { id: true } });
  if (!station) throw new RequestError("Estacao de servico indisponivel.", 403);
  return { access, stationId };
}

function errorResponse(error: unknown) {
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (typeof error === "object" && error !== null && "code" in error && ["P2021", "P2022"].includes(String(error.code))) {
    return NextResponse.json({ error: "Schema da base de dados desatualizado. A administracao deve sincronizar o schema antes de gerir associacoes.", code: "SCHEMA_MISMATCH" }, { status: 503 });
  }
  return buildDatabaseErrorResponse(error, "Erro ao gerir os navios da Marinha.");
}

// Read-only, deliberately unpaginated and limited to selector fields, not inspection data.
export async function GET(req: NextRequest) {
  try {
    const { access, stationId } = await context(req);
    if (req.nextUrl.searchParams.get("permissions") === "1") {
      return NextResponse.json({ canSync: access.isAdmin || canEditPath(access.permissions, "/navios") }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const scope = access.isAdmin
      ? access.allowedStationIds.length ? { OR: [{ serviceStationId: { in: access.allowedStationIds } }, { serviceStationId: null }] } : {}
      : { serviceStationId: stationId };
    const [navios, jangadas] = await Promise.all([
      prisma.navio.findMany({ where: scope, select: { id: true, nome: true, matricula: true, serviceStationId: true } }),
      prisma.jangada.findMany({
        where: scope,
        select: { id: true, serial: true, brand: true, model: true, capacity: true, shipId: true, shipNameManual: true, serviceStationId: true, dataFabrico: true, dataProxInspecao: true },
        orderBy: { serial: "asc" },
      }),
    ]);
    const linkedIds = [...new Set(jangadas.flatMap(j => j.shipId ? [j.shipId] : []))];
    const linked = linkedIds.length ? await prisma.navio.findMany({
      where: { id: { in: linkedIds }, ...scope },
      select: { id: true, nome: true },
    }) : [];
    const names = new Map(linked.map(n => [n.id, n.nome]));
    return NextResponse.json({
      navios,
      stationId,
      jangadas: jangadas.map(j => ({ ...j, requiresStationTransfer: j.serviceStationId !== stationId, linkedShipName: j.shipId ? names.get(j.shipId) || `Navio #${j.shipId}` : null })),
      canSync: access.isAdmin || canEditPath(access.permissions, "/navios"),
      canAssociate: access.isAdmin || canEditPath(access.permissions, "/jangadas"),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    const { access, stationId } = await context(req);
    const body = await req.json();
    if (body.expectedActiveStationId !== undefined && body.expectedActiveStationId !== stationId) throw new RequestError("A estacao ativa mudou. Atualize a lista antes de continuar.", 409);
    if (!["sync", "associate", "disassociate"].includes(body.action)) throw new RequestError("Acao invalida.", 400);
    const canSync = access.isAdmin || canEditPath(access.permissions, "/navios");
    if (body.action === "sync" ? !canSync : !(access.isAdmin || canEditPath(access.permissions, "/jangadas"))) {
      throw new RequestError("Sem permissao para esta operacao.", 403);
    }
    const target = marinhaCatalogue.find(n => n.numero === body.numero);
    if (body.action !== "sync" && (!target || !Number.isInteger(body.jangadaId) || body.jangadaId <= 0)) {
      throw new RequestError("Navio ou jangada invalido.", 400);
    }

    // Serializable prevents concurrent imports creating duplicate hulls (matricula is not unique).
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await prisma.$transaction(async tx => {
          const existing = await tx.navio.findMany({ select: { id: true, matricula: true, serviceStationId: true } });
          const resolveShip = async (navio: typeof marinhaCatalogue[number]) => {
            const matches = existing.filter(n => normalizeMarinhaIdentity(n.matricula) === normalizeMarinhaIdentity(navio.numero));
            if (matches.length > 1) throw new RequestError(`Matricula ambigua: ${navio.numero}. Corrija os duplicados antes de continuar.`, 409);
            const match = matches[0];
            if (match && match.serviceStationId !== stationId) {
              throw new RequestError(`${navio.numero} ja existe noutra estacao ou sem estacao. Corrija a estacao do registo existente.`, 409);
            }
            if (match) return match;
            if (!canSync) throw new RequestError("Importe primeiro o catalogo com permissao de edicao de navios.", 403);
            return tx.navio.create({
              data: { nome: navio.nome, matricula: navio.numero, serviceStationId: stationId, ilha: "", tipoPesca: "", tipoNavio: navio.tipo, bandeira: "Portugal", proprietario: "Marinha Portuguesa" },
              select: { id: true, matricula: true, serviceStationId: true },
            });
          };
          if (body.action === "sync") {
            const ships = [];
            const conflicts: string[] = [];
            for (const navio of marinhaCatalogue) {
              try { ships.push(await resolveShip(navio)); }
              catch (error) {
                if (!(error instanceof RequestError) || error.status !== 409) throw error;
                conflicts.push(error.message);
              }
            }
            return { count: ships.length, conflicts };
          }
          const raft = await tx.jangada.findUnique({ where: { id: body.jangadaId }, select: { id: true, serviceStationId: true, shipId: true, shipNameManual: true } });
          if (!raft) throw new RequestError("Jangada nao encontrada.", 404);
           const transferringStation = raft.serviceStationId !== stationId;
           if (transferringStation) {
             if (!access.isAdmin || (raft.serviceStationId !== null && access.allowedStationIds.length > 0 && !access.allowedStationIds.includes(raft.serviceStationId))) throw new RequestError("Sem permissao para a estacao desta jangada.", 403);
             if (body.action !== "associate" || body.confirmStationTransfer !== true) throw new RequestError("Confirme a transferencia da jangada para a estacao ativa.", 409);
           }
           if ((transferringStation || body.expectedServiceStationId !== undefined) && body.expectedServiceStationId !== raft.serviceStationId) throw new RequestError("A estacao da jangada mudou. Atualize a lista.", 409);
          if (body.expectedShipId !== raft.shipId || body.expectedShipNameManual !== raft.shipNameManual) {
            throw new RequestError("A associacao mudou. Atualize a lista e tente novamente.", 409);
          }
          const matches = existing.filter(n => normalizeMarinhaIdentity(n.matricula) === normalizeMarinhaIdentity(target!.numero));
           const currentShip = matches.length === 1 ? matches[0] : null;
          let shipId: number | null = null;
          if (body.action === "disassociate") {
            if (!isMarinhaAssociation(raft, target!, currentShip?.id ?? null)) throw new RequestError("A jangada nao esta associada a este navio.", 409);
          } else {
            const moving = (raft.shipId !== null || Boolean(raft.shipNameManual?.trim())) && !isMarinhaAssociation(raft, target!, currentShip?.id ?? null);
            if (moving && body.confirmReassign !== true) throw new RequestError("Confirme a transferencia da jangada de outro navio.", 409);
            shipId = (await resolveShip(target!)).id;
          }
          const updated = await tx.jangada.updateMany({
             where: { id: raft.id, serviceStationId: raft.serviceStationId, shipId: raft.shipId, shipNameManual: raft.shipNameManual },
             data: { shipId, shipNameManual: "", ...(transferringStation ? { serviceStationId: stationId } : {}) },
          });
          if (updated.count !== 1) throw new RequestError("A associacao mudou. Atualize a lista.", 409);
          return { jangadaId: raft.id, shipId };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
        break;
      } catch (error) {
        if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") continue;
        throw error;
      }
    }
    await logAuditoria({ tabela: body.action === "sync" ? "Navio" : "Jangada", tipoOperacao: "UPDATE", idRegisto: body.action === "sync" ? stationId : body.jangadaId, descricao: `Marinha: ${body.action}`, dadosDepois: result });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
