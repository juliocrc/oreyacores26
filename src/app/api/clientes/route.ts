import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { logAuditoria } from "@/lib/auditoria";
import { isValidNif, normalizePhone } from "@/lib/validators";
import { deriveClienteAddressFields } from "@/lib/client-address";
import { apiStationScope, requireApiAccess } from "@/lib/api-access";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";
import { normalizeClienteIslandValue } from "@/lib/azores-islands";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

class ClientBatchScopeError extends Error {}

async function syncClienteIslandToNavios(clienteId: number, ilha: string | null, scope: ReturnType<typeof apiStationScope>) {
  if (!ilha) return;
  await prisma.navio.updateMany({
    where: { clienteId, ...scope },
    data: { ilha },
  });
}

function sanitizeClientePayload(data: unknown) {
  const rec = (data ?? {}) as Record<string, unknown>;
  const address = deriveClienteAddressFields({
    morada: rec.morada,
    moradaNumero: rec.moradaNumero,
    codigoPostal: rec.codigoPostal,
    localidade: rec.localidade,
  });

  return {
    nome: typeof rec.nome === "string" ? rec.nome.trim() : undefined,
    numeroCliente: typeof rec.numeroCliente === "string" ? rec.numeroCliente.trim() || null : null,
    modoPagamento: typeof rec.modoPagamento === "string" ? rec.modoPagamento.trim() || null : null,
    ilha: normalizeClienteIslandValue({
      ilha: rec.ilha,
      morada: address.morada,
      localidade: address.localidade,
      codigoPostal: address.codigoPostal,
    }),
    morada: address.morada,
    moradaNumero: address.moradaNumero,
    codigoPostal: address.codigoPostal,
    localidade: address.localidade,
    nif: typeof rec.nif === "string" ? rec.nif.trim() || null : null,
    email: typeof rec.email === "string" ? rec.email.trim() || null : null,
    telefone: normalizePhone(rec.telefone as string | null | undefined),
    telmovel: normalizePhone(rec.telmovel as string | null | undefined),
    observacoes: typeof rec.observacoes === "string" ? rec.observacoes.trim() || null : null,
  };
}

// DELETE em lote: recebe { ids: number[] }
export async function DELETE(req: NextRequest) {
  try {
    const { access, error } = await requireApiAccess("/clientes", { write: true });
    if (error) return error;
    const scope = apiStationScope(access, resolveActiveServiceStationId(req, access));
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    // Exclusão individual via querystring: /api/clientes?id=123
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ error: "ID inválido." }, { status: 400 });
      }

      const existing = await prisma.cliente.findFirst({ where: { id, ...scope }, select: { id: true } });
      if (!existing) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      await prisma.cliente.delete({ where: { id, ...scope } });
      await logAuditoria({
        tabela: "Cliente",
        tipoOperacao: "DELETE",
        idRegisto: id,
        descricao: `Exclusão do cliente ID ${id}`,
      });
      return NextResponse.json({ success: true });
    }

    // Exclusão em lote via body: { ids: number[] }
    const rawBody = await req.text();
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const ids: number[] = Array.isArray(parsedBody?.ids) ? parsedBody.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Envie um ID (?id=) ou um array de IDs para exclusão em lote." }, { status: 400 });
    }
    if (ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "IDs inválidos ou repetidos (máximo 500)." }, { status: 400 });
    }

    const where = { id: { in: ids }, ...scope };
    const existentes = await prisma.$transaction(async tx => {
      const records = await tx.cliente.findMany({ where, omit: { verificationCode: true, verificationCodeExpires: true } });
      if (records.length !== ids.length) throw new ClientBatchScopeError();
      const deleted = await tx.cliente.deleteMany({ where });
      // A station reassignment between the read and write must roll back the
      // entire batch, rather than committing a partial deletion.
      if (deleted.count !== ids.length) throw new ClientBatchScopeError();
      return records;
    });
    await Promise.all(
      existentes.map((item) =>
        logAuditoria({
          tabela: "Cliente",
          tipoOperacao: "DELETE",
          idRegisto: item.id,
          descricao: `Exclusão em lote do cliente ${item.nome}`,
          dadosAntes: item,
        })
      )
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ClientBatchScopeError) {
      return NextResponse.json({ error: "Um ou mais clientes não estão disponíveis nesta estação." }, { status: 404 });
    }
    return NextResponse.json({ error: (error as Error)?.message || "Erro ao excluir clientes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { access, error } = await requireApiAccess("/clientes", { write: true });
    if (error) return error;

    const body = await req.json();
    const data = sanitizeClientePayload(body);

    if (!data.nome || !data.nome.trim()) {
      return NextResponse.json({ error: "Nome do cliente é obrigatório." }, { status: 400 });
    }

    if (data.nif && !isValidNif(data.nif)) {
      return NextResponse.json({ error: "NIF inválido. Deve ter 9 dígitos." }, { status: 400 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    const enforcedServiceStationId = activeStationId || access.stationId || access.allowedStationIds[0] || null;
    if (!access.isAdmin && !enforcedServiceStationId) {
      return NextResponse.json({ error: "Estação autorizada obrigatória." }, { status: 403 });
    }
    const existingCliente = await prisma.cliente.findFirst({
      where: { nome: data.nome, ...apiStationScope(access, enforcedServiceStationId) },
      select: { id: true },
    });
    if (existingCliente) {
      return NextResponse.json({ error: "Já existe um cliente com esse nome registado nesta estação." }, { status: 400 });
    }

    const cliente = await prisma.cliente.create({
      data: {
        nome: data.nome,
        numeroCliente: data.numeroCliente,
        modoPagamento: data.modoPagamento,
        ilha: data.ilha,
        morada: data.morada,
        moradaNumero: data.moradaNumero,
        codigoPostal: data.codigoPostal,
        localidade: data.localidade,
        nif: data.nif,
        email: data.email,
        telefone: data.telefone,
        telmovel: data.telmovel,
        serviceStationId: enforcedServiceStationId,
      },
    });

    await logAuditoria({
      tabela: "Cliente",
      tipoOperacao: "CREATE",
      idRegisto: cliente.id,
      descricao: `Criação do cliente ${cliente.nome}`,
      dadosDepois: cliente,
    });

    return NextResponse.json(cliente, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || "Erro ao criar cliente." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { access, error } = await requireApiAccess("/clientes", { write: true });
    if (error) return error;
    const scope = apiStationScope(access, resolveActiveServiceStationId(req, access));

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "JSON inválido no corpo da requisição." }, { status: 400 });
    }

    const data = sanitizeClientePayload(body);
    if (data.nif && !isValidNif(data.nif)) {
      return NextResponse.json({ error: "NIF inválido. Deve ter 9 dígitos." }, { status: 400 });
    }

    Object.keys(data).forEach((key) => {
      if ((data as Record<string, unknown>)[key] === undefined) {
        delete (data as Record<string, unknown>)[key];
      }
    });

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Sem dados para atualizar." }, { status: 400 });
    }

    const antes = await prisma.cliente.findFirst({ where: { id, ...scope }, omit: { verificationCode: true, verificationCodeExpires: true } });
    if (!antes) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    const activeStationId = resolveActiveServiceStationId(req, access);
    if (activeStationId && antes.serviceStationId && antes.serviceStationId !== activeStationId) {
      return NextResponse.json({ error: "Sem acesso a este cliente noutra estação." }, { status: 403 });
    }

    const cliente = await prisma.cliente.update({
      where: { id, ...scope },
      data,
      omit: { verificationCode: true, verificationCodeExpires: true },
    });

    await syncClienteIslandToNavios(cliente.id, cliente.ilha, scope);

    await logAuditoria({
      tabela: "Cliente",
      tipoOperacao: "UPDATE",
      idRegisto: id,
      descricao: `Atualização do cliente ${cliente.nome}`,
      dadosAntes: antes,
      dadosDepois: cliente,
    });

    return NextResponse.json(cliente);
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || "Erro ao atualizar cliente." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { access, error } = await requireApiAccess("/clientes");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const where: Prisma.ClienteWhereInput = {};

  const nome = searchParams.get("nome"); if (nome) where.nome = { contains: nome };
  const numeroCliente = searchParams.get("numeroCliente"); if (numeroCliente) where.numeroCliente = { contains: numeroCliente };
  const nif = searchParams.get("nif"); if (nif) where.nif = { contains: nif };
  const ilhaRaw = searchParams.get("ilha");
  if (ilhaRaw) {
    const ilhaCanon = getCanonicalNavioLocationLabel(ilhaRaw) || ilhaRaw;
    where.ilha = { contains: ilhaCanon };
  }
  const email = searchParams.get("email"); if (email) where.email = { contains: email };
  const telefone = searchParams.get("telefone"); if (telefone) where.telefone = { contains: telefone };
  const telmovel = searchParams.get("telmovel"); if (telmovel) where.telmovel = { contains: telmovel };
  if (searchParams.get("missingContacts") === "true") {
    where.OR = [
      { email: null },
      { telefone: null },
      { telmovel: null },
    ];
  }

  // Leitura global por pedido do utilizador: permitir visualização de clientes de
  // qualquer estação. As escritas mantêm-se escopadas.
  const clientes = await prisma.cliente.findMany({
    where,
    omit: { verificationCode: true, verificationCodeExpires: true },
    include: {
      navios: {
        select: {
          id: true,
          nome: true,
          matricula: true,
          ilha: true,
          tipoPesca: true,
          serviceStationId: true,
        },
      },
    },
  });

  return NextResponse.json(clientes);
}
