import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getInspectionStatus } from "@/lib/inspection-status";
import { getAuthSession } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const nif = searchParams.get("nif")?.trim();
    const codigo = searchParams.get("codigo")?.trim();

    if (!nif && !codigo) {
      return NextResponse.json({ error: "Indique o NIF ou o Código de Cliente." }, { status: 400 });
    }

    const sessionClienteId = session.user.role === "CLIENTE" && session.user.clienteId
      ? Number(session.user.clienteId)
      : null;
    const cliente = sessionClienteId
      ? await prisma.cliente.findUnique({ where: { id: sessionClienteId }, select: {
          id: true, nome: true, nif: true, numeroCliente: true, morada: true, ilha: true,
        } })
      : await prisma.cliente.findFirst({
      where: nif ? { nif: { equals: nif } } : { numeroCliente: { equals: codigo, mode: "insensitive" } },
      select: {
        id: true,
        nome: true,
        nif: true,
        numeroCliente: true,
        morada: true,
        ilha: true,
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado com os dados fornecidos." }, { status: 404 });
    }

    const navios = await prisma.navio.findMany({
      where: { clienteId: cliente.id },
      select: { id: true, nome: true, tipoPesca: true },
    });
    const navioIds = navios.map(n => n.id);

    const jangadas = await prisma.jangada.findMany({
      where: {
        OR: [
          { owner: { equals: cliente.nome, mode: "insensitive" } },
          ...(navioIds.length > 0 ? [{ shipId: { in: navioIds } }] : []),
        ],
      },
    });

    const jangadaIds = jangadas.map(j => j.id);
    const inspecoes = jangadaIds.length > 0 ? await prisma.inspecao.findMany({
      where: { jangadaId: { in: jangadaIds } },
      orderBy: { dataInspecao: "desc" },
    }) : [];

    const jangadasFormatadas = jangadas.map((j) => {
      const ultimaInspecao = inspecoes.find(i => i.jangadaId === j.id) || null;
      const dataInspecao = ultimaInspecao?.dataInspecao ? new Date(ultimaInspecao.dataInspecao).toISOString() : j.dataInspecao;
      const dataProxInspecao = ultimaInspecao?.dataProxInspecao ? new Date(ultimaInspecao.dataProxInspecao).toISOString() : j.dataProxInspecao;
      const statusInfo = getInspectionStatus(dataProxInspecao);

      const certNum = ultimaInspecao?.certificadoNumero || j.ultimoCertificadoNumero || null;
      const navioObj = navios.find(n => n.id === j.shipId);
      const isPesca = Boolean(navioObj?.tipoPesca && navioObj.tipoPesca.toLowerCase() !== "não aplicável" && navioObj.tipoPesca.toLowerCase() !== "outro");

      return {
        id: j.id,
        serial: j.serial,
        brand: j.brand,
        model: j.model,
        capacity: j.capacity,
        owner: j.owner,
        navioId: j.shipId || null,
        navioNome: j.shipNameManual || navioObj?.nome || null,
        tipoPesca: navioObj?.tipoPesca || null,
        isPesca,
        dataInspecao,
        dataProxInspecao,
        status: statusInfo,
        diasParaProxima: statusInfo.daysLeft,
        ultimoCertificadoNumero: certNum,
        certificadoExternoNumero: j.certificadoExternoNumero,
        certificadoPdfUrl: certNum ? `/api/certificados/pdf?serial=${encodeURIComponent(j.serial)}` : null,
        hruReferencia: j.hruReferencia,
        hruValidade: j.hruValidade,
        radarReflector: j.radarReflector,
        radarReflectorValidade: j.radarReflectorValidade,
        cylinderSistema: j.cylinderSistema,
        cylinderDataTeste: j.cylinderDataTeste,
        cylinderDataProxTeste: j.cylinderDataProxTeste,
      };
    });

    const ordensServico = await prisma.ordemServico.findMany({
      where: { clienteId: cliente.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        numeroOrdem: true,
        status: true,
        orcamentoStatus: true,
        valorTotal: true,
        createdAt: true,
        dataConclusao: true,
        jangada: { select: { id: true, serial: true, brand: true, model: true } },
      },
    });

    const faturas = await prisma.fatura.findMany({
      where: { clienteId: cliente.id },
      orderBy: { dataEmissao: "desc" },
      take: 10,
      include: {
        notaCredito: true,
        recibos: { orderBy: { dataEmissao: "desc" } },
        ordemServicos: {
          include: {
            ordemServico: {
              select: {
                id: true,
                numeroOrdem: true,
                jangada: { select: { id: true, serial: true, brand: true, model: true } },
              },
            },
          },
        },
      },
    });

    const faturasFormatadas = faturas.map((f) => ({
      id: f.id,
      numeroFatura: f.numeroFatura,
      valorTotal: Number(f.valorTotal || 0),
      valorPago: f.recibos.reduce((acc, r) => acc + Number(r.valorPago || 0), 0),
      pagamentoStatus: f.pagamentoStatus,
      dataEmissao: f.dataEmissao ? new Date(f.dataEmissao).toISOString() : new Date().toISOString(),
      cancelada: f.cancelada,
      motivoCancelamento: f.motivoCancelamento,
      numeroNotaCredito: f.notaCredito?.numeroNotaCredito || null,
      numeroRecibo: f.recibos[0]?.numeroRecibo || null,
      faturaPdfUrl: `/api/ordens-servico/${f.ordemServicos[0]?.ordemServicoId || 1}/fatura-pdf`,
      ordemServicos: f.ordemServicos.map((os) => ({
        id: os.ordemServico.id,
        numeroOrdem: os.ordemServico.numeroOrdem || `#${os.ordemServico.id}`,
        jangada: os.ordemServico.jangada,
      })),
    }));

    let totalFaturado = 0;
    let totalRecebido = 0;
    for (const f of faturas) {
      if (!f.cancelada) {
        totalFaturado += Number(f.valorTotal || 0);
        totalRecebido += f.recibos.reduce((acc, r) => acc + Number(r.valorPago || 0), 0);
      }
    }

    return NextResponse.json({
      cliente,
      navios,
      jangadas: jangadasFormatadas,
      ordensServico: ordensServico.map(o => ({
        ...o,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
        dataConclusao: o.dataConclusao ? new Date(o.dataConclusao).toISOString() : null,
      })),
      faturas: faturasFormatadas,
      resumoFaturas: {
        totalFaturas: faturas.length,
        totalFaturado,
        totalRecebido,
        totalEmDivida: Math.max(0, totalFaturado - totalRecebido),
      },
    });
  } catch (err: any) {
    console.error("[GET /api/portal/cliente-auth]", err);
    return NextResponse.json({ error: err?.message || "Erro ao consultar portal do armador." }, { status: 500 });
  }
}
