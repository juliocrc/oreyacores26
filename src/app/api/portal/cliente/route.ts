import { NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isPortalInspectionCertified, portalInspectionMetadata } from '@/lib/portal-inspection-documents';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    }
    const clienteId = Number(session.user.clienteId);
    if (session.user.role !== "CLIENTE" || !Number.isSafeInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: "Sessao de cliente obrigatoria." }, { status: 403 });
    }
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, nome: true, email: true, telefone: true,
        navios: { select: { id: true, nome: true, bandeira: true, imo: true, callSignal: true } },
      },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });

    const jangadas = await prisma.jangada.findMany({
      where: { shipId: { in: cliente.navios.map((n) => n.id) } },
      select: {
        id: true, shipId: true, brand: true, model: true, serial: true, capacity: true,
        dataInspecao: true, dataProxInspecao: true, ultimoCertificadoNumero: true,
      },
    });
    const inspecoes = await prisma.inspecao.findMany({
      where: { jangadaId: { in: jangadas.map((j) => j.id) } },
      orderBy: [{ dataInspecao: "desc" }, { id: "desc" }],
      select: { id: true, jangadaId: true, certificadoNumero: true, status: true, dataInspecao: true, dataProxInspecao: true },
    });
    const ordensServico = await prisma.ordemServico.findMany({
      where: { clienteId }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, numeroOrdem: true, status: true, createdAt: true, dataConclusao: true },
    });
    const referenceDate = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      success: true,
      cliente: {
        ...cliente,
        navios: cliente.navios.map((navio) => ({
          ...navio,
          jangadas: jangadas.filter((j) => j.shipId === navio.id).map((j) => ({
            ...j, inspecoes: inspecoes.filter((i) => i.jangadaId === j.id).map(i => ({
              ...i, ...portalInspectionMetadata(i, inspecoes.find(candidate => candidate.jangadaId === j.id && isPortalInspectionCertified(candidate))?.id, referenceDate),
            })),
          })),
        })),
      },
      ordensServico,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[portal-cliente] Erro:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
