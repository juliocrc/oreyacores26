import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

function compactLabel(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function normalizeSearch(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const qSearch = normalizeSearch(q);

  if (qSearch.length < 2) return NextResponse.json([]);

  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const [jangadas, navios, clientes, coletes, epirbs, fatosImersao, stockItems, faturas, ordensServico] = await Promise.all([
      prisma.jangada.findMany({ take: 5000, orderBy: { updatedAt: 'desc' } }),
      prisma.navio.findMany({ take: 5000, orderBy: { nome: 'asc' } }),
      prisma.cliente.findMany({ take: 5000, orderBy: { nome: 'asc' } }),
      prisma.colete.findMany({ take: 5000, orderBy: { updatedAt: 'desc' } }),
      prisma.epirb.findMany({ take: 5000, orderBy: { updatedAt: 'desc' } }),
      prisma.fatoImersao.findMany({ take: 5000, orderBy: { updatedAt: 'desc' } }),
      prisma.stock.findMany({ take: 5000, orderBy: { updatedAt: 'desc' } }),
      prisma.fatura.findMany({ take: 5000, orderBy: { dataEmissao: 'desc' }, include: { cliente: { select: { nome: true, numeroCliente: true } } } }),
      prisma.ordemServico.findMany({ take: 5000, orderBy: { updatedAt: 'desc' }, include: { jangada: { select: { serial: true } } } }),
    ]);

    const filteredJangadas = jangadas.filter((j) =>
      [j.serial, j.brand, j.model, j.shipNameManual, j.owner, j.ultimoCertificadoNumero, j.certificadoExternoNumero, j.radarReflector, j.cylinderSerial]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredNavios = navios.filter((n) =>
      [n.nome, n.matricula, n.mmsi, n.imo, n.callSignal, n.portoRegisto, n.bandeira, n.proprietario, n.territorioGrupo]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredClientes = clientes.filter((c) =>
      [c.nome, c.numeroCliente, c.nif, c.email, c.telefone, c.telmovel, c.morada, c.localidade, c.ilha, c.codigoPostal, c.observacoes]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredColete = coletes.filter((c) =>
      [c.serial, c.marca, c.modelo, c.estado]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredEpirb = epirbs.filter((e) =>
      [e.serial, e.marca, e.modelo, e.hexId, e.estado]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredFatos = fatosImersao.filter((f) =>
      [f.serial, f.marca, f.modelo, f.designNo, f.estado]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredStock = stockItems.filter((s) =>
      [s.referencia, s.descricao, s.codigoBarras, s.categoria, s.codigoFabricante]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredFaturas = faturas.filter((f) =>
      [f.numeroFatura, f.cliente?.nome, f.pagamentoStatus]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const filteredOs = ordensServico.filter((o) =>
      [o.numeroOrdem, o.tecnicoResponsavel, o.descricao, o.status]
        .some((val) => normalizeSearch(val).includes(qSearch))
    ).slice(0, 12);

    const results = [
      ...filteredJangadas.map((j) => ({
        type: "Jangada",
        label: compactLabel([j.serial, [j.brand, j.model].filter(Boolean).join(" ")]),
        href: `/jangadas/${j.id}`,
      })),
      ...filteredNavios.map((n) => ({
        type: "Navio",
        label: compactLabel([n.nome, n.matricula, n.portoRegisto]),
        href: `/navios/${n.id}`,
      })),
      ...filteredClientes.map((c) => ({
        type: "Cliente",
        label: compactLabel([c.nome, c.numeroCliente ? `Cód. ${c.numeroCliente}` : null, c.nif ? `NIF ${c.nif}` : null]),
        href: `/clientes/${c.id}`,
      })),
      ...filteredColete.map((c) => ({
        type: "Equipamento",
        label: compactLabel([c.serial, [c.marca, c.modelo].filter(Boolean).join(" "), c.estado]),
        href: `/coletes/${c.id}`,
      })),
      ...filteredEpirb.map((e) => ({
        type: "EPIRB",
        label: compactLabel([e.serial, [e.marca, e.modelo].filter(Boolean).join(" "), e.hexId]),
        href: `/epirbs/${e.id}`,
      })),
      ...filteredFatos.map((f) => ({
        type: "Fato de Imersão",
        label: compactLabel([f.serial, [f.marca, f.modelo].filter(Boolean).join(" ")]),
        href: `/fatos-imersao/${f.id}`,
      })),
      ...filteredStock.map((s) => ({
        type: "Stock",
        label: compactLabel([s.referencia, s.descricao, s.categoria]),
        href: `/stock/${s.id}`,
      })),
      ...filteredFaturas.map((f) => ({
        type: "Fatura",
        label: compactLabel([f.numeroFatura, f.cliente?.nome, `€ ${Number(f.valorTotal || 0).toFixed(2)}`, f.pagamentoStatus]),
        href: `/faturas`,
      })),
      ...filteredOs.map((o) => ({
        type: "Ordem de Serviço",
        label: compactLabel([o.numeroOrdem ? `OS ${o.numeroOrdem}` : null, o.jangada?.serial ? `Jangada ${o.jangada.serial}` : null, o.status]),
        href: `/ordens-servico/${o.id}`,
      })),
    ];

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[GET /api/search/global]", err);
    return NextResponse.json({ error: err?.message || "Erro na pesquisa global." }, { status: 500 });
  }
}
