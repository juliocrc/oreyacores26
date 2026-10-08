import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { getApiSessionToken } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { parsePedidoAssistenciaJangadaIds } from "@/lib/pedido-assistencia";
import {
  appendOrdemServicoLog,
  appendWorkflowTransition,
  parseOrdemServicoMeta,
  toOrdemServicoMetaJson,
} from "@/lib/ordens-servico";

export const runtime = "nodejs";

const ESTADOS_PEDIDO_ASSISTENCIA = [
  "novo",
  "em_atendimento",
  "concluido",
  "arquivado",
] as const;

function authWebhook(req: NextRequest): { ok: boolean; error?: NextResponse } {
  const envSecret = (process.env.ZAPIER_ASSISTENCIA_TOKEN || "").trim();
  if (!envSecret) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "ZAPIER_ASSISTENCIA_TOKEN não está configurado no ambiente." },
        { status: 503 },
      ),
    };
  }
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("token") || "";
  const authHeader = req.headers.get("authorization") || "";
  const ok = querySecret === envSecret || authHeader === `Bearer ${envSecret}`;
  if (!ok) {
    return { ok: false, error: NextResponse.json({ error: "Token inválido." }, { status: 403 }) };
  }
  return { ok: true };
}

function cleanString(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str ? str : undefined;
}

function cleanOptionalString(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str ? str.slice(0, 500) : undefined;
}

function parsePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function createInternalPedido(req: NextRequest, payload: Record<string, unknown>) {
  const token = await getApiSessionToken(req);
  if (!token?.sub && !token?.email) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  const tokenRole = String(token?.role || "USER");
  const role = tokenRole === "ADMIN" ? "ADMIN" : tokenRole === "CLIENTE" ? "CLIENTE" : "USER";
  if (role === "CLIENTE") {
    return NextResponse.json({ error: "Apenas utilizadores internos." }, { status: 403 });
  }

  const clienteId = parsePositiveInteger(payload.clienteId);
  if (!clienteId) {
    return NextResponse.json({ error: "Cliente obrigatório." }, { status: 400 });
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nome: true, email: true, telefone: true, telmovel: true },
  });
  if (!cliente) {
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  }

  const navioId = parsePositiveInteger(payload.navioId);
  if (!navioId) {
    return NextResponse.json({ error: "Navio obrigatório." }, { status: 400 });
  }

  const navio = await prisma.navio.findUnique({
    where: { id: navioId },
    select: { id: true, nome: true, clienteId: true },
  });
  if (!navio) {
    return NextResponse.json({ error: "Navio não encontrado." }, { status: 404 });
  }
  if (navio.clienteId !== clienteId) {
    return NextResponse.json({ error: "O navio selecionado não pertence ao cliente escolhido." }, { status: 400 });
  }

  const jangadaIds = parsePedidoAssistenciaJangadaIds(
    payload.jangadaIds ?? payload.jangadaIdsCsv ?? payload.jangadas ?? payload.jangadaId ?? payload.jangadaIdList,
  );
  if (jangadaIds.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos uma jangada." }, { status: 400 });
  }

  const jangadas = await prisma.jangada.findMany({
    where: { id: { in: jangadaIds }, shipId: navioId },
    select: { id: true, serial: true, shipId: true },
  });

  if (jangadas.length !== new Set(jangadaIds).size) {
    return NextResponse.json({ error: "Uma ou mais jangadas selecionadas não pertencem ao navio escolhido." }, { status: 400 });
  }

  const descricao = cleanString(payload.descricao ?? payload.mensagem ?? payload.message);
  if (!descricao) {
    return NextResponse.json({ error: "Descrição do pedido é obrigatória." }, { status: 400 });
  }

  const tipoAssistencia = cleanOptionalString(payload.tipoAssistencia ?? payload.tipo ?? payload.assistenciaTipo) || "outro";
  const nome = cleanOptionalString(payload.nome ?? payload.contactName) || cliente.nome;
  const email = cleanOptionalString(payload.email ?? payload.contactEmail) || cliente.email || undefined;
  const telefone = cleanOptionalString(payload.telefone ?? payload.contactPhone ?? payload.contactMobile) || cliente.telmovel || cliente.telefone || undefined;
  const dataPreferida = cleanOptionalString(payload.dataPreferida ?? payload.data);
  const serviceStationId = parsePositiveInteger(payload.serviceStationId);

  const metadados = {
    clienteId,
    navioId,
    jangadaIds,
    navioNome: navio.nome,
    origemInterna: true,
    requestSource: payload.requestSource ?? "interno",
  };

  const created = await prisma.pedidoAssistencia.create({
    data: {
      nome,
      email,
      telefone,
      navio: navio.nome,
      jangadaSerial: jangadas.map((jangada) => jangada.serial).filter(Boolean).join(", "),
      tipoAssistencia,
      descricao,
      dataPreferida,
      origem: "interno",
      serviceStationId,
      metadados: JSON.stringify(metadados),
    },
  });

  return NextResponse.json(
    {
      success: true,
      id: created.id,
      pedido: {
        id: created.id,
        nome: created.nome,
        email: created.email,
        telefone: created.telefone,
        navio: created.navio,
        jangadaSerial: created.jangadaSerial,
        tipoAssistencia: created.tipoAssistencia,
        estado: created.estado,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// POST /api/pedidos-assistencia
// Webhook para receber pedidos de assistência vindos do Zapier Forms.
// Autenticação: ?token=<ZAPIER_ASSISTENCIA_TOKEN> ou Authorization: Bearer <token>.
export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const params = new URLSearchParams(raw);
      payload = Object.fromEntries(params.entries());
    } else {
      payload = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const isInternalRequest =
    payload.origem === "interno" ||
    payload.internal === true ||
    payload.requestSource === "interno" ||
    payload.clienteId !== undefined ||
    payload.navioId !== undefined ||
    payload.jangadaIds !== undefined ||
    payload.jangadaIdsCsv !== undefined;

  if (isInternalRequest) {
    return createInternalPedido(req, payload);
  }

  const guard = authWebhook(req);
  if (!guard.ok) return guard.error;

  const descricao = cleanString(payload.descricao ?? payload.mensagem ?? payload.message);
  if (!descricao) {
    return NextResponse.json(
      { error: "Campo obrigatório em falta: descricao." },
      { status: 400 },
    );
  }

  const nome = cleanOptionalString(payload.nome ?? payload.name);
  const email = cleanOptionalString(payload.email);
  const telefone = cleanOptionalString(payload.telefone ?? payload.phone ?? payload.telemovel);
  const navio = cleanOptionalString(payload.navio ?? payload.ship ?? payload.embarcacao);
  const jangadaSerial = cleanOptionalString(
    payload.jangadaSerial ?? payload.jangada ?? payload.serial ?? payload.raftSerial,
  );
  const tipoAssistencia = cleanOptionalString(
    payload.tipoAssistencia ?? payload.tipo ?? payload.tipoAssistencia,
  );
  const dataPreferida = cleanOptionalString(payload.dataPreferida ?? payload.data);
  const origem = cleanOptionalString(payload.origem) || "zapier";
  const serviceStationIdRaw = Number(payload.serviceStationId);
  const serviceStationId = Number.isFinite(serviceStationIdRaw) && serviceStationIdRaw > 0
    ? serviceStationIdRaw
    : null;

  const knownKeys = new Set([
    "nome", "name", "email", "telefone", "phone", "telemovel", "navio", "ship",
    "embarcacao", "jangadaSerial", "jangada", "serial", "raftSerial", "tipoAssistencia",
    "tipo", "descricao", "mensagem", "message", "dataPreferida", "data", "origem",
    "serviceStationId", "submit", "Submit",
  ]);
  const metadados: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!knownKeys.has(key) && value !== undefined && value !== null && value !== "") {
      metadados[key] = value;
    }
  }

  try {
    const created = await prisma.pedidoAssistencia.create({
      data: {
        nome,
        email,
        telefone,
        navio,
        jangadaSerial,
        tipoAssistencia,
        descricao,
        dataPreferida,
        origem,
        serviceStationId,
        metadados: Object.keys(metadados).length > 0 ? JSON.stringify(metadados) : null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        id: created.id,
        pedido: {
          id: created.id,
          nome: created.nome,
          email: created.email,
          jangadaSerial: created.jangadaSerial,
          tipoAssistencia: created.tipoAssistencia,
          estado: created.estado,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/pedidos-assistencia]", error);
    return NextResponse.json({ error: "Não foi possível guardar o pedido." }, { status: 500 });
  }
}

// GET /api/pedidos-assistencia (admin) — lista pedidos, ?estado=novo&limite=50
export async function GET(req: NextRequest) {
  const token = await getApiSessionToken(req);
  if (!token?.sub && !token?.email) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  const tokenRole = String(token?.role || "USER");
  const role = tokenRole === "ADMIN" ? "ADMIN" : tokenRole === "CLIENTE" ? "CLIENTE" : "USER";
  if (role === "CLIENTE") {
    return NextResponse.json({ error: "Apenas utilizadores internos." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const estado = searchParams.get("estado")?.trim() || undefined;
  const limiteRaw = Number(searchParams.get("limite"));
  const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(500, Math.round(limiteRaw)) : 50;

  try {
    const where = estado ? { estado } : undefined;
    const pedidos = await prisma.pedidoAssistencia.findMany({
      where,
      include: {
        ordensServico: {
          select: { id: true, numeroOrdem: true, status: true },
          orderBy: { id: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    });
    const count = await prisma.pedidoAssistencia.count({ where });
    return NextResponse.json({ total: pedidos.length, count, pedidos });
  } catch (error) {
    console.error("[GET /api/pedidos-assistencia]", error);
    return NextResponse.json({ error: "Erro ao listar pedidos." }, { status: 500 });
  }
}

// PATCH /api/pedidos-assistencia (admin) — atualizar estado/dados de um pedido.
export async function PATCH(req: NextRequest) {
  const token = await getApiSessionToken(req);
  if (!token?.sub && !token?.email) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }
  const tokenRole = String(token?.role || "USER");
  const role = tokenRole === "ADMIN" ? "ADMIN" : tokenRole === "CLIENTE" ? "CLIENTE" : "USER";
  if (role === "CLIENTE") {
    return NextResponse.json({ error: "Apenas utilizadores internos." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const id = Number(payload.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Campo obrigatório em falta: id." }, { status: 400 });
  }

  const data: Prisma.PedidoAssistenciaUpdateInput = {};

  if (payload.estado !== undefined) {
    const estado = String(payload.estado).trim();
    if (!(ESTADOS_PEDIDO_ASSISTENCIA as readonly string[]).includes(estado)) {
      return NextResponse.json(
        { error: `Estado inválido. Válidos: ${ESTADOS_PEDIDO_ASSISTENCIA.join(", ")}.` },
        { status: 400 },
      );
    }
    data.estado = estado;
  }

  for (const field of [
    "nome",
    "email",
    "telefone",
    "navio",
    "jangadaSerial",
    "tipoAssistencia",
    "dataPreferida",
  ] as const) {
    if (payload[field] !== undefined && payload[field] !== null) {
      const value = cleanOptionalString(payload[field]);
      if (value !== undefined) data[field] = value;
    }
  }

  if (payload.descricao !== undefined && payload.descricao !== null) {
    const descricao = cleanString(payload.descricao);
    if (!descricao) {
      return NextResponse.json({ error: "Descrição não pode ficar vazia." }, { status: 400 });
    }
    data.descricao = descricao;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sem alterações para guardar." }, { status: 400 });
  }

  try {
    const updated = await prisma.pedidoAssistencia.update({ where: { id }, data });

    // Sincronização bidirecional: arquivar o pedido cancela as OTs ainda não concluídas.
    if (data.estado === "arquivado") {
      try {
        const ordensPendentes = await prisma.ordemServico.findMany({
          where: {
            pedidoAssistenciaId: id,
            status: { in: ["pendente", "agendada", "confirmada"] },
          },
          select: { id: true, metadados: true },
        });

        for (const ordem of ordensPendentes) {
          const ordemMeta = parseOrdemServicoMeta(ordem.metadados);
          const nextMeta = appendOrdemServicoLog(
            appendWorkflowTransition(ordemMeta, "cancelada", {
              origin: "pedido_assistencia",
              message: `Pedido de assistência #${id} arquivado; OT cancelada automaticamente.`,
              user: access.email || "sistema",
            }),
            {
              type: "STATUS",
              message: `Pedido de assistência #${id} arquivado — OT cancelada automaticamente.`,
              user: access.email || "sistema",
            },
          );

          await prisma.ordemServico.update({
            where: { id: ordem.id },
            data: { status: "cancelada", metadados: toOrdemServicoMetaJson(nextMeta) },
          });
        }
      } catch (syncError) {
        console.error("[PATCH /api/pedidos-assistencia] Erro ao arquivar OTs:", syncError);
      }
    }

    return NextResponse.json({ success: true, pedido: updated });
  } catch (error) {
    console.error("[PATCH /api/pedidos-assistencia]", error);
    return NextResponse.json({ error: "Não foi possível atualizar o pedido." }, { status: 500 });
  }
}
