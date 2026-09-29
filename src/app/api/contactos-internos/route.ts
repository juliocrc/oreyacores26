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
  findMany(args: unknown): Promise<ContactoInternoRecord[]>;
  create(args: unknown): Promise<ContactoInternoRecord>;
  findUnique(args: unknown): Promise<ContactoInternoRecord | null>;
  delete(args: unknown): Promise<ContactoInternoRecord>;
  deleteMany(args: unknown): Promise<unknown>;
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
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const categoria = searchParams.get("categoria")?.trim();
  const empresa = searchParams.get("empresa")?.trim();
  const localizacao = searchParams.get("localizacao")?.trim();
  const ativo = searchParams.get("ativo")?.trim();

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { nome: { contains: search } },
      { empresa: { contains: search } },
      { localizacao: { contains: search } },
      { email: { contains: search } },
      { observacoes: { contains: search } },
    ];
  }

  if (categoria) {
    where.categoria = { contains: categoria };
  }

  if (empresa) {
    where.empresa = { contains: empresa };
  }

  if (localizacao) {
    where.localizacao = { contains: localizacao };
  }

  if (ativo === "true") {
    where.ativo = true;
  }

  if (ativo === "false") {
    where.ativo = false;
  }

  const contactos = await contactoInternoModel.findMany({
    where,
    orderBy: [
      { categoria: "asc" },
      { empresa: "asc" },
      { localizacao: "asc" },
      { nome: "asc" },
    ],
  });

  return NextResponse.json(contactos);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = sanitizeContactoInternoPayload(body);

    if (!data.nome) {
      return NextResponse.json({ error: "Nome do contacto é obrigatório." }, { status: 400 });
    }

    const contacto = await contactoInternoModel.create({
      data: {
        categoria: data.categoria || "Colaborador",
        empresa: data.empresa,
        localizacao: data.localizacao,
        nome: data.nome,
        email: data.email,
        telemovel: data.telemovel,
        telefoneFixo: data.telefoneFixo,
        extensaoNos: data.extensaoNos,
        extensaoVodafone: data.extensaoVodafone,
        observacoes: data.observacoes,
        ativo: data.ativo ?? true,
        fonte: data.fonte,
      },
    });

    await logAuditoria({
      tabela: "ContactoInterno",
      tipoOperacao: "CREATE",
      idRegisto: contacto.id,
      descricao: `Criação do contacto interno ${contacto.nome}`,
      dadosDepois: contacto,
    });

    return NextResponse.json(contacto, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar contacto interno.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idParam = searchParams.get("id");

    if (idParam) {
      const id = Number(idParam);
      if (Number.isNaN(id)) {
        return NextResponse.json({ error: "ID inválido." }, { status: 400 });
      }

      const antes = await contactoInternoModel.findUnique({ where: { id } });
      await contactoInternoModel.delete({ where: { id } });

      if (antes) {
        await logAuditoria({
          tabela: "ContactoInterno",
          tipoOperacao: "DELETE",
          idRegisto: id,
          descricao: `Exclusão do contacto interno ${antes.nome}`,
          dadosAntes: antes,
        });
      }

      return NextResponse.json({ success: true });
    }

    const rawBody = await req.text();
    const parsedBody = rawBody ? (JSON.parse(rawBody) as ContactoInternoInput) : {};
    const ids = Array.isArray(parsedBody?.ids) ? parsedBody.ids.map(Number).filter((id: number) => !Number.isNaN(id)) : [];

    if (!ids.length) {
      return NextResponse.json(
        { error: "Envie um ID (?id=) ou um array de IDs para exclusão em lote." },
        { status: 400 }
      );
    }

    const existentes = await contactoInternoModel.findMany({ where: { id: { in: ids } } });
    await contactoInternoModel.deleteMany({ where: { id: { in: ids } } });

    await Promise.all(
      existentes.map((item: { id: number; nome: string }) =>
        logAuditoria({
          tabela: "ContactoInterno",
          tipoOperacao: "DELETE",
          idRegisto: item.id,
          descricao: `Exclusão em lote do contacto interno ${item.nome}`,
          dadosAntes: item,
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir contactos internos.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
