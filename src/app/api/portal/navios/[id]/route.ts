import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";

function parseJson(value: string | null) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function canAccessShip(id: number, session: Awaited<ReturnType<typeof getAuthSession>>) {
  const ship = await prisma.navio.findUnique({ where: { id } });
  if (!ship) return null;
  if (session?.user?.role === "ADMIN") return ship;
  if (session?.user?.clienteId == null || ship.clienteId !== Number(session.user.clienteId)) return null;
  return ship;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  const id = Number((await context.params).id);
  const ship = await canAccessShip(id, session);
  if (!ship) return NextResponse.json({ error: "Navio não encontrado ou sem acesso." }, { status: 404 });

  const [coletes, fatos, epirbs, extintores, documentos] = await Promise.all([
    prisma.colete.findMany({ where: { shipId: id }, select: { id: true, serial: true, marca: true, modelo: true, estado: true, dataProxInspecao: true, luzValidade: true, apitoValidade: true, pastilhaValidade: true } }),
    prisma.fatoImersao.findMany({ where: { shipId: id }, select: { id: true, serial: true, marca: true, modelo: true, estado: true, dataProxInspecao: true, luzValidade: true, apitoValidade: true } }),
    prisma.epirb.findMany({ where: { shipId: id }, select: { id: true, serial: true, marca: true, modelo: true, estado: true, dataProxInspecao: true, dataValidadeBateria: true } }),
    prisma.extintor.findMany({ where: { shipId: id }, select: { id: true, serial: true, marca: true, modelo: true, estado: true, dataProxRecarga: true, dataProxTesteHidraulico: true } }),
    prisma.auditoria.findMany({ where: { tabela: "NavioDocumento", idRegisto: id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  return NextResponse.json({
    navio: { ...ship, pirotecnicosBordo: parseJson(ship.pirotecnicosBordoJson) },
    equipamentos: { coletes, fatos, epirbs, extintores },
    documentos: documentos.map((documento) => ({ id: documento.id, descricao: documento.descricao, dados: parseJson(documento.dadosDepois), createdAt: documento.createdAt })),
  });
}
