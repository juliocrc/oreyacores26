import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

function compactLabel(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";

  if (q.length < 2) return NextResponse.json([]);

  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const [jangadas, navios, clientes, coletes, epirbs, ordensServico] = await Promise.all([
      prisma.jangada.findMany({
        where: {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { shipNameManual: { contains: q, mode: 'insensitive' } },
            { owner: { contains: q, mode: 'insensitive' } },
          ]
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.navio.findMany({
        where: {
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { matricula: { contains: q, mode: 'insensitive' } },
            { mmsi: { contains: q, mode: 'insensitive' } },
            { imo: { contains: q, mode: 'insensitive' } },
            { callSignal: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 4,
        orderBy: { nome: 'asc' },
      }),
      prisma.cliente.findMany({
        where: {
          OR: [
            { nome: { contains: q, mode: 'insensitive' } },
            { numeroCliente: { contains: q, mode: 'insensitive' } },
            { nif: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 4,
        orderBy: { nome: 'asc' },
      }),
      prisma.colete.findMany({
        where: {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { marca: { contains: q, mode: 'insensitive' } },
            { modelo: { contains: q, mode: 'insensitive' } },
            { estado: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.epirb.findMany({
        where: {
          OR: [
            { serial: { contains: q, mode: 'insensitive' } },
            { marca: { contains: q, mode: 'insensitive' } },
            { modelo: { contains: q, mode: 'insensitive' } },
            { hexId: { contains: q, mode: 'insensitive' } },
            { estado: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.ordemServico.findMany({
        where: {
          OR: [
            { numeroOrdem: { contains: q, mode: 'insensitive' } },
            { tecnicoResponsavel: { contains: q, mode: 'insensitive' } },
            { descricao: { contains: q, mode: 'insensitive' } },
            { status: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          numeroOrdem: true,
          status: true,
          jangada: {
            select: {
              serial: true,
            },
          },
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const results = [
      ...jangadas.map((j) => ({
        type: "Jangada",
        label: compactLabel([j.serial, [j.brand, j.model].filter(Boolean).join(" ")]),
        href: `/jangadas/${j.id}`,
      })),
      ...navios.map((n) => ({
        type: "Navio",
        label: compactLabel([n.nome, n.matricula, n.portoRegisto]),
        href: `/navios/${n.id}`,
      })),
      ...clientes.map((c) => ({
        type: "Cliente",
        label: compactLabel([c.nome, c.numeroCliente, c.ilha]),
        href: `/clientes/${c.id}`,
      })),
      ...coletes.map((c) => ({
        type: "Colete",
        label: compactLabel([c.serial, [c.marca, c.modelo].filter(Boolean).join(" "), c.estado]),
        href: `/equipamentos/${c.id}`,
      })),
      ...epirbs.map((e) => ({
        type: "EPIRB",
        label: compactLabel([e.serial, [e.marca, e.modelo].filter(Boolean).join(" "), e.hexId]),
        href: `/epirbs/${e.id}`,
      })),
      ...ordensServico.map((os: any) => ({
        type: "Ordem de Serviço",
        label: compactLabel([os.numeroOrdem, os.jangada?.serial ? `Jangada ${os.jangada.serial}` : null, os.status]),
        href: `/ordens-servico/${os.id}`,
      })),
    ];

    return NextResponse.json(results);
  } catch (error) {
    console.error("Erro na pesquisa global", error);
    return NextResponse.json({ error: "Falha ao pesquisar" }, { status: 500 });
  }
}

