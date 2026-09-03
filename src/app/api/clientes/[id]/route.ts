import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { isValidNif, normalizePhone } from "@/lib/validators";
import { deriveClienteAddressFields } from "@/lib/client-address";
import { normalizeClienteIslandValue } from "@/lib/azores-islands";

async function syncClienteIslandToNavios(clienteId: number, ilha: string | null) {
  if (!ilha) return;
  await prisma.navio.updateMany({
    where: { clienteId },
    data: { ilha },
  });
}

function sanitizeClientePayload(data: unknown) {
  const rec = (data ?? {}) as Record<string, unknown>;
  const hasMorada = Object.prototype.hasOwnProperty.call(rec, "morada");
  const hasMoradaNumero = Object.prototype.hasOwnProperty.call(rec, "moradaNumero");
  const hasCodigoPostal = Object.prototype.hasOwnProperty.call(rec, "codigoPostal");
  const hasLocalidade = Object.prototype.hasOwnProperty.call(rec, "localidade");
  const address = hasMorada || hasMoradaNumero || hasCodigoPostal || hasLocalidade
    ? deriveClienteAddressFields({
        morada: rec.morada,
        moradaNumero: rec.moradaNumero,
        codigoPostal: rec.codigoPostal,
        localidade: rec.localidade,
      })
    : null;

  return {
    nome: typeof rec.nome === "string" ? rec.nome.trim() : undefined,
    numeroCliente: typeof rec.numeroCliente === "string" ? rec.numeroCliente.trim() || null : undefined,
    modoPagamento: typeof rec.modoPagamento === "string" ? rec.modoPagamento.trim() || null : undefined,
    ilha: (
      Object.prototype.hasOwnProperty.call(rec, "ilha")
      || address
    )
      ? normalizeClienteIslandValue({
          ilha: rec.ilha,
          morada: address ? address.morada : rec.morada,
          localidade: address ? address.localidade : rec.localidade,
          codigoPostal: address ? address.codigoPostal : rec.codigoPostal,
        })
      : undefined,
    morada: address ? address.morada : undefined,
    moradaNumero: address ? address.moradaNumero : undefined,
    codigoPostal: address ? address.codigoPostal : undefined,
    localidade: address ? address.localidade : undefined,
    nif: typeof rec.nif === "string" ? rec.nif.trim() || null : undefined,
    email: typeof rec.email === "string" ? rec.email.trim() || null : undefined,
    telefone: Object.prototype.hasOwnProperty.call(rec, "telefone") ? normalizePhone(rec.telefone as string | null | undefined) : undefined,
    telmovel: Object.prototype.hasOwnProperty.call(rec, "telmovel") ? normalizePhone(rec.telmovel as string | null | undefined) : undefined,
    observacoes: Object.prototype.hasOwnProperty.call(rec, "observacoes") ? (typeof rec.observacoes === "string" ? rec.observacoes.trim() || null : null) : undefined,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { navios: true },
  });

  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  return NextResponse.json(cliente);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no corpo da requisição." }, { status: 400 });
  }

  const data = sanitizeClientePayload(body);
  if (data.nif && !isValidNif(data.nif)) {
    return NextResponse.json({ error: "NIF inválido. Deve ter 9 dígitos." }, { status: 400 });
  }

  const record = data as Record<string, unknown>;
  Object.keys(record).forEach((key) => {
    if (record[key] === undefined) {
      delete record[key];
    }
  });

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sem dados para atualizar." }, { status: 400 });
  }

  try {
    const antes = await prisma.cliente.findUnique({ where: { id } });

    const cliente = await prisma.cliente.update({
      where: { id },
      data,
    });

    await syncClienteIslandToNavios(cliente.id, cliente.ilha);

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

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (Number.isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const antes = await prisma.cliente.findUnique({ where: { id } });
    await prisma.cliente.delete({ where: { id } });

    if (antes) {
      await logAuditoria({
        tabela: "Cliente",
        tipoOperacao: "DELETE",
        idRegisto: id,
        descricao: `Exclusão do cliente ${antes.nome}`,
        dadosAntes: antes,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error)?.message || "Erro ao excluir cliente." }, { status: 500 });
  }
}
