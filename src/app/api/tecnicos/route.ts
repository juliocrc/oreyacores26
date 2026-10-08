import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { buildVisibleServiceStationWhere } from "@/lib/service-station-visibility";
import { AZORES_TECHNICIANS } from "@/lib/agenda-technicians";
import { normalizeLooseText } from "@/lib/text-normalization";
import { normalizeEmail } from "@/lib/auth";

function normalizeText(value: unknown) {
  return normalizeLooseText(value || "");
}

function isAcoresStation(station: { codigo?: string | null; nome?: string | null }) {
  const code = normalizeText(station?.codigo);
  const name = normalizeText(station?.nome);
  return code === "acores" || name === "acores";
}

function buildAcoresFallbackTechnicians() {
  return AZORES_TECHNICIANS.map((tech, index) => ({
    id: -1000 - index,
    nome: tech.name,
    email: null,
    ativo: true,
    serviceStationId: null,
  }));
}

/**
 * As escritas são restritas a ADMIN. Um técnico não pode dar-se a si próprio
 * acesso a outra estação nem reativar-se depois de desativado, e o quadro
 * técnico decide quem entra na aplicação.
 */
async function requireAdminForWrite() {
  const access = await getAccessContext();
  if (!access) {
    return { erro: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }) };
  }
  if (!access.isAdmin) {
    return {
      erro: NextResponse.json(
        { error: "Apenas administradores podem gerir técnicos." },
        { status: 403 },
      ),
    };
  }
  return { access, erro: null };
}

type TecnicoWriteBody = {
  nome?: unknown;
  email?: unknown;
  serviceStationId?: unknown;
  ativo?: unknown;
  observacoes?: unknown;
};

type TecnicoWriteData = {
  nome?: string;
  email?: string | null;
  serviceStationId?: number | null;
  ativo?: boolean;
  observacoes?: string | null;
};

/**
 * `parcial` (PUT) só toca nos campos presentes no corpo: o `GET` do diretório
 * não devolve `observacoes`, por isso enviar um objeto parcial não pode
 * apagar o que já estava gravado. `POST` (não parcial) valida o mesmo conjunto
 * e aplica os omissos.
 */
async function validarPayloadTecnico(
  body: TecnicoWriteBody,
  idAtual: number | null,
  parcial: boolean,
): Promise<{ erro: NextResponse } | { dados: TecnicoWriteData }> {
  const dados: TecnicoWriteData = {};

  const nomeEnviado = body?.nome !== undefined;
  if (nomeEnviado || !parcial) {
    const nome = normalizeText(body?.nome);
    if (!nome) {
      return { erro: NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 }) };
    }
    dados.nome = nome;
  }

  if (body?.email !== undefined) {
    const email = normalizeEmail(normalizeText(body.email)) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { erro: NextResponse.json({ error: "Email inválido." }, { status: 400 }) };
    }

    if (email) {
      const existente = await prisma.tecnico.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existente && existente.id !== idAtual) {
        return {
          erro: NextResponse.json(
            { error: "Já existe um técnico com este email." },
            { status: 409 },
          ),
        };
      }
    }

    dados.email = email;
  } else if (!parcial) {
    dados.email = null;
  }

  if (body?.serviceStationId !== undefined) {
    const stationIdRaw = body.serviceStationId;
    if (stationIdRaw === null || stationIdRaw === "") {
      dados.serviceStationId = null;
    } else {
      const serviceStationId = Number(stationIdRaw);
      if (!Number.isInteger(serviceStationId) || serviceStationId <= 0) {
        return {
          erro: NextResponse.json({ error: "Estação inválida." }, { status: 400 }),
        };
      }
      const estacao = await prisma.serviceStation.findUnique({
        where: { id: serviceStationId },
        select: { id: true },
      });
      if (!estacao) {
        return {
          erro: NextResponse.json({ error: "Estação não encontrada." }, { status: 404 }),
        };
      }
      dados.serviceStationId = serviceStationId;
    }
  } else if (!parcial) {
    dados.serviceStationId = null;
  }

  if (body?.ativo !== undefined) {
    dados.ativo = !!body.ativo;
  } else if (!parcial) {
    dados.ativo = true;
  }

  if (body?.observacoes !== undefined) {
    dados.observacoes = normalizeText(body.observacoes) || null;
  } else if (!parcial) {
    dados.observacoes = null;
  }

  return { dados };
}

export async function POST(req: NextRequest) {
  const { erro } = await requireAdminForWrite();
  if (erro) return erro;

  try {
    const body = (await req.json()) as TecnicoWriteBody;
    const validacao = await validarPayloadTecnico(body, null, false);
    if ("erro" in validacao) return validacao.erro;

    // O `create` do Prisma exige todos os campos: o validador em modo não
    // parcial já os preencheu, por isso aqui só se converteem em definitivos.
    const { dados } = validacao;
    const tecnico = await prisma.tecnico.create({
      data: {
        nome: dados.nome as string,
        email: dados.email ?? null,
        serviceStationId: dados.serviceStationId ?? null,
        ativo: dados.ativo ?? true,
        observacoes: dados.observacoes ?? null,
      },
    });
    return NextResponse.json(tecnico, { status: 201 });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao criar técnico.");
  }
}

export async function PUT(req: NextRequest) {
  const { erro } = await requireAdminForWrite();
  if (erro) return erro;

  try {
    const id = Number(req.nextUrl.searchParams.get("id") || "");
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const existente = await prisma.tecnico.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existente) {
      return NextResponse.json({ error: "Técnico não encontrado." }, { status: 404 });
    }

    const body = (await req.json()) as TecnicoWriteBody;
    const validacao = await validarPayloadTecnico(body, id, true);
    if ("erro" in validacao) return validacao.erro;

    const tecnico = await prisma.tecnico.update({ where: { id }, data: validacao.dados });
    return NextResponse.json(tecnico);
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao atualizar técnico.");
  }
}

/**
 * Eliminar é recusado quando o técnico já tem histórico (ordens de serviço,
 * registos de tempos, certificações, ausências). Apagar esse registo deixaria
 * linhas órfãs ou perderia o histórico de quem executou o trabalho; nesses
 * casos a operação certa é desativar, que o `PUT` já resolve.
 */
export async function DELETE(req: NextRequest) {
  const { erro } = await requireAdminForWrite();
  if (erro) return erro;

  try {
    const id = Number(req.nextUrl.searchParams.get("id") || "");
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const existente = await prisma.tecnico.findUnique({
      where: { id },
      select: { id: true, nome: true },
    });
    if (!existente) {
      return NextResponse.json({ error: "Técnico não encontrado." }, { status: 404 });
    }

    const [ordensServico, tempos, logs, checklist, certificacoes, ausencias] =
      await Promise.all([
        prisma.ordemServico.count({ where: { tecnicoId: id } }),
        prisma.ordemServicoTempo.count({ where: { tecnicoId: id } }),
        prisma.ordemServicoLog.count({ where: { tecnicoId: id } }),
        prisma.ordemServicoChecklistItem.count({ where: { updatedById: id } }),
        prisma.certificacaoFabricanteTecnico.count({ where: { tecnicoId: id } }),
        prisma.tecnicoAusencia.count({ where: { tecnicoId: id } }),
      ]);

    const totalHistorico =
      ordensServico + tempos + logs + checklist + certificacoes + ausencias;

    if (totalHistorico > 0) {
      return NextResponse.json(
        {
          error:
            "Este técnico tem histórico associado e não pode ser eliminado. Desative-o em vez de o remover.",
          code: "TECNICO_COM_HISTORICO",
          historico: {
            ordensServico,
            tempos,
            logs,
            checklist,
            certificacoes,
            ausencias,
          },
        },
        { status: 409 },
      );
    }

    await prisma.tecnico.delete({ where: { id } });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao eliminar técnico.");
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }

    const searchParams = new URL(req.url).searchParams;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const search = String(searchParams.get("search") || "").trim();
    const activeStationId = resolveActiveServiceStationId(req, access);
    const tecnicoSearchWhere: Prisma.TecnicoWhereInput | undefined = search
      ? {
          OR: [
            { nome: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : undefined;

    const stationWhere = activeStationId
      ? { id: activeStationId }
      : access.isAdmin
        ? { ativo: true }
        : { id: { in: access.allowedStationIds.length ? access.allowedStationIds : [-1] }, ativo: true };

    const stations = await prisma.serviceStation.findMany({
      where: buildVisibleServiceStationWhere(stationWhere as unknown as Record<string, unknown>),
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      select: {
        id: true,
        codigo: true,
        nome: true,
        empresa: true,
        localizacao: true,
        territorioTipo: true,
        regiaoOperacional: true,
        tecnicos: {
          where: {
            ...(includeInactive ? {} : { ativo: true }),
            ...(tecnicoSearchWhere || {}),
          },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            serviceStationId: true,
            observacoes: true,
          },
        },
      },
    });

    const activeStation = activeStationId
      ? stations.find((station) => station.id === activeStationId) || null
      : null;

    const unassignedWhere = {
      serviceStationId: null,
      ...(includeInactive ? {} : { ativo: true }),
      ...(tecnicoSearchWhere || {}),
    } satisfies Prisma.TecnicoWhereInput;

    const unassigned = access.isAdmin && !activeStationId
      ? await prisma.tecnico.findMany({
          where: unassignedWhere,
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            serviceStationId: true,
            observacoes: true,
          },
        })
      : [];

    const fallbackTecnicos = buildAcoresFallbackTechnicians();
    const searchNormalized = normalizeText(search);

    const stationsWithFallback = stations.map((station) => {
      if (!isAcoresStation(station)) {
        return {
          ...station,
          totalTecnicos: station.tecnicos.length,
        };
      }

      const hasRealTecnicos = station.tecnicos.length > 0;
      if (hasRealTecnicos) {
        return {
          ...station,
          totalTecnicos: station.tecnicos.length,
        };
      }

      const filteredFallback = fallbackTecnicos.filter((tech) => {
        if (includeInactive || tech.ativo) {
          if (!searchNormalized) return true;
          return normalizeText(tech.nome).includes(searchNormalized);
        }
        return false;
      });

      return {
        ...station,
        tecnicos: filteredFallback,
        totalTecnicos: filteredFallback.length,
      };
    });

    return NextResponse.json({
      activeStationId,
      activeStation,
      canViewAllStations: access.isAdmin,
      stations: stationsWithFallback,
      unassigned: unassigned,
      totalTecnicos: stationsWithFallback.reduce((total, station) => total + station.tecnicos.length, 0) + unassigned.length,
    });
  } catch (error) {
    return buildDatabaseErrorResponse(error, "Erro ao listar técnicos.");
  }
}
