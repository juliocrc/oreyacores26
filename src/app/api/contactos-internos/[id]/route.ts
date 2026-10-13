import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { normalizeOptionalString, normalizePhone } from "@/lib/validators";

type ContactoInternoInput = Record<string, unknown> | null | undefined;

type SanitizedContactoInternoPayload = {
  categoria?: string;
  empresa?: string | null;
  localizacao?: string | null;
  nome?: string;
  email?: string | null;
  telemovel?: string | null;
  telefoneFixo?: string | null;
  extensaoNos?: string | null;
  extensaoVodafone?: string | null;
  observacoes?: string | null;
  ativo?: boolean;
  fonte?: string | null;
  tecnicoId?: number | null;
};

type ContactoInternoRecord = {
  id: number;
  nome: string;
  categoria: string;
  empresa: string | null;
  localizacao: string | null;
  email: string | null;
  telemovel: string | null;
  telefoneFixo: string | null;
  extensaoNos: string | null;
  extensaoVodafone: string | null;
  observacoes: string | null;
  ativo: boolean;
  fonte: string | null;
};

type ContactoInternoDelegate = {
  findUnique(args: unknown): Promise<ContactoInternoRecord | null>;
  update(args: unknown): Promise<ContactoInternoRecord>;
  delete(args: unknown): Promise<ContactoInternoRecord>;
};

const contactoInternoModel = (
  prisma as unknown as { contactoInterno: ContactoInternoDelegate }
).contactoInterno;

function normalizeOptionalPhoneField(data: ContactoInternoInput, key: "telemovel" | "telefoneFixo") {
  if (!data || !Object.prototype.hasOwnProperty.call(data, key)) {
    return undefined;
  }

  const value = data[key];
  return typeof value === "string" || value == null ? normalizePhone(value) : null;
}

function sanitizeContactoInternoPayload(data: ContactoInternoInput): SanitizedContactoInternoPayload {
  return {
    categoria:
      typeof data?.categoria === "string" && data.categoria.trim()
        ? data.categoria.trim()
        : undefined,
    empresa: normalizeOptionalString(data?.empresa),
    localizacao: normalizeOptionalString(data?.localizacao),
    nome: typeof data?.nome === "string" ? data.nome.trim() : undefined,
    email:
      typeof data?.email === "string"
        ? data.email
            .split("/")
            .map((item: string) => item.trim().toLowerCase())
            .filter(Boolean)
            .join(" / ") || null
        : undefined,
    telemovel: normalizeOptionalPhoneField(data, "telemovel"),
    telefoneFixo: normalizeOptionalPhoneField(data, "telefoneFixo"),
    extensaoNos: normalizeOptionalString(data?.extensaoNos),
    extensaoVodafone: normalizeOptionalString(data?.extensaoVodafone),
    observacoes: normalizeOptionalString(data?.observacoes),
    ativo: typeof data?.ativo === "boolean" ? data.ativo : undefined,
    fonte: normalizeOptionalString(data?.fonte),
    tecnicoId:
      data && Object.prototype.hasOwnProperty.call(data, "tecnicoId")
        ? data.tecnicoId === "" || data.tecnicoId == null
          ? null
          : Number.isFinite(Number(data.tecnicoId))
            ? Number(data.tecnicoId)
            : null
        : undefined,
  };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);

  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const contacto = await contactoInternoModel.findUnique({
    where: { id },
    include: { tecnico: { select: { id: true, nome: true, email: true } } },
  });
  if (!contacto) {
    return NextResponse.json({ error: "Contacto interno não encontrado." }, { status: 404 });
  }

  return NextResponse.json(contacto);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);

  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: ContactoInternoInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no corpo da requisição." }, { status: 400 });
  }

  const data = sanitizeContactoInternoPayload(body);
  Object.keys(data).forEach((key) => {
    if (data[key as keyof SanitizedContactoInternoPayload] === undefined) {
      delete data[key as keyof SanitizedContactoInternoPayload];
    }
  });

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Sem dados para atualizar." }, { status: 400 });
  }

  if (typeof data.nome === "string" && !data.nome.trim()) {
    return NextResponse.json({ error: "Nome do contacto é obrigatório." }, { status: 400 });
  }

  try {
    const antes = await contactoInternoModel.findUnique({ where: { id } });
    if (!antes) {
      return NextResponse.json({ error: "Contacto interno não encontrado." }, { status: 404 });
    }

    const contacto = await contactoInternoModel.update({
      where: { id },
      data,
    });

    await logAuditoria({
      tabela: "ContactoInterno",
      tipoOperacao: "UPDATE",
      idRegisto: id,
      descricao: `Atualização do contacto interno ${contacto.nome}`,
      dadosAntes: antes,
      dadosDepois: contacto,
    });

    return NextResponse.json(contacto);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar contacto interno.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);

  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  try {
    const antes = await contactoInternoModel.findUnique({ where: { id } });
    if (!antes) {
      return NextResponse.json({ error: "Contacto interno não encontrado." }, { status: 404 });
    }

    await contactoInternoModel.delete({ where: { id } });
    await logAuditoria({
      tabela: "ContactoInterno",
      tipoOperacao: "DELETE",
      idRegisto: id,
      descricao: `Exclusão do contacto interno ${antes.nome}`,
      dadosAntes: antes,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir contacto interno.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
