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
            { serial: { contains: q } },
            { brand: { contains: q } },
            { model: { contains: q } },
            { shipNameManual: { contains: q } },
            { owner: { contains: q } },
          ]
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.navio.findMany({
        where: {
          OR: [
            { nome: { contains: q } },
            { matricula: { contains: q } },
            { mmsi: { contains: q } },
            { imo: { contains: q } },
            { callSignal: { contains: q } },
          ],
        },
        take: 4,
        orderBy: { nome: 'asc' },
      }),
      prisma.cliente.findMany({
        where: {
          OR: [
            { nome: { contains: q } },
            { numeroCliente: { contains: q } },
            { nif: { contains: q } },
            { email: { contains: q } },
          ],
        },
        take: 4,
        orderBy: { nome: 'asc' },
      }),
      prisma.colete.findMany({
        where: {
          OR: [
            { serial: { contains: q } },
            { marca: { contains: q } },
            { modelo: { contains: q } },
            { estado: { contains: q } },
          ],
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.epirb.findMany({
        where: {
          OR: [
            { serial: { contains: q } },
            { marca: { contains: q } },
            { modelo: { contains: q } },
            { hexId: { contains: q } },
            { estado: { contains: q } },
          ],
        },
        take: 4,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.ordemServico.findMany({
        where: {
          OR: [
            { numeroOrdem: { contains: q } },
            { tecnicoResponsavel: { contains: q } },
            { descricao: { contains: q } },
            { status: { contains: q } },
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

