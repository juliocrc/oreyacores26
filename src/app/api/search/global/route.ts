import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDashboardScope } from "@/lib/dashboard-access";
import { hasModulePermission, hasVisiblePathPermission } from "@/lib/permission-access";

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
    const scope = await getDashboardScope(request);
    if (scope.error) return scope.error;
    const { access, where } = scope;
    const permitted = (module: string, path: string) => access.isAdmin ||
      (hasModulePermission(access.permissions, module) && hasVisiblePathPermission(access.permissions, path));
    const needsShips = permitted("equipamentos", "/equipamentos") || permitted("epirbs", "/epirbs") || permitted("fatos-imersao", "/fatos-imersao");
    // Equipment has no station column: associate it only through visible ships.
    const restrictStation = where.serviceStationId !== undefined;
    const shipIds = needsShips && restrictStation ? (await prisma.navio.findMany({ where, select: { id: true } })).map(ship => ship.id) : [];
    const equipmentScope = restrictStation ? { shipId: { in: shipIds } } : {};

    const [jangadas, navios, clientes, coletes, epirbs, fatosImersao, stockItems, faturas, ordensServico] = await Promise.all([
      permitted("jangadas", "/jangadas") ? prisma.jangada.findMany({ where, take: 5000, orderBy: { updatedAt: 'desc' } }) : [],
      permitted("navios", "/navios") ? prisma.navio.findMany({ where, take: 5000, orderBy: { nome: 'asc' } }) : [],
      permitted("clientes", "/clientes") ? prisma.cliente.findMany({ where, take: 5000, orderBy: { nome: 'asc' } }) : [],
      permitted("equipamentos", "/equipamentos") ? prisma.colete.findMany({ where: equipmentScope, take: 5000, orderBy: { updatedAt: 'desc' } }) : [],
      permitted("epirbs", "/epirbs") ? prisma.epirb.findMany({ where: equipmentScope, take: 5000, orderBy: { updatedAt: 'desc' } }) : [],
      permitted("fatos-imersao", "/fatos-imersao") ? prisma.fatoImersao.findMany({ where: equipmentScope, take: 5000, orderBy: { updatedAt: 'desc' } }) : [],
      permitted("stock", "/stock") ? prisma.stock.findMany({ where, take: 5000, orderBy: { updatedAt: 'desc' } }) : [],
      permitted("faturacao", "/faturacao") ? prisma.fatura.findMany({ where: restrictStation ? { cliente: where } : {}, take: 5000, orderBy: { dataEmissao: 'desc' }, include: { cliente: { select: { nome: true, numeroCliente: true } } } }) : [],
      permitted("ordens-servico", "/ordens-servico") ? prisma.ordemServico.findMany({ where, take: 5000, orderBy: { updatedAt: 'desc' }, include: { jangada: { select: { serial: true } } } }) : [],
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

    return NextResponse.json(results, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("[GET /api/search/global]", err);
    return NextResponse.json({ error: "Erro na pesquisa global." }, { status: 500 });
  }
}
