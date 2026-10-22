import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const activeStationId = resolveActiveServiceStationId(request, access);
    const antes = await prisma.calibracaoEquipamento.findUnique({ where: { id } });
    if (!antes) return NextResponse.json({ error: "Registo não encontrado" }, { status: 404 });
    if (!access.isAdmin && activeStationId && antes.serviceStationId && antes.serviceStationId !== activeStationId) {
      return NextResponse.json({ error: "Sem acesso a este registo noutra estação." }, { status: 403 });
    }

    const body = await request.json();
    const { nome, referencia, tipo, dataCalibracao, dataProxCalibracao, certificadoNum, observacoes, ativo, certificadoUrl } = body;

    const stationProvided = Object.prototype.hasOwnProperty.call(body, "serviceStationId");
    let requestedStationId: number | null | undefined;
    let nextStationId: number | null | undefined;
    if (stationProvided) {
      if (body.serviceStationId === null || body.serviceStationId === undefined || body.serviceStationId === "") {
        requestedStationId = null;
      } else {
        const parsed = Number(body.serviceStationId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return NextResponse.json({ error: "Estação inválida." }, { status: 400 });
        }
        requestedStationId = parsed;
      }

      nextStationId = requestedStationId;

      if (!access.isAdmin) {
        if (requestedStationId === null) {
          nextStationId = antes.serviceStationId ?? activeStationId ?? undefined;
        } else {
          const allowedStation =
            access.stationId === requestedStationId ||
            access.allowedStationIds.includes(requestedStationId);
          if (!allowedStation) {
            return NextResponse.json({ error: "Sem permissão para essa estação." }, { status: 403 });
          }
        }
      }

      if (nextStationId !== null && nextStationId !== undefined) {
        const station = await prisma.serviceStation.findUnique({
          where: { id: nextStationId },
          select: { id: true },
        });
        if (!station) {
          return NextResponse.json({ error: "Estação não encontrada." }, { status: 400 });
        }
      }
    }

    const nextDataCalibracao = dataCalibracao ? new Date(dataCalibracao) : antes.dataCalibracao;
    const nextDataProxCalibracao = dataProxCalibracao ? new Date(dataProxCalibracao) : antes.dataProxCalibracao;
    if (Number.isNaN(nextDataCalibracao.getTime()) || Number.isNaN(nextDataProxCalibracao.getTime())) {
      return NextResponse.json({ error: "Data de calibração inválida." }, { status: 400 });
    }

    const nextCertificadoNum =
      certificadoNum !== undefined ? (certificadoNum ? String(certificadoNum).trim() : null) : antes.certificadoNum;
    const nextCertificadoUrl =
      certificadoUrl !== undefined ? (certificadoUrl ? String(certificadoUrl).trim() : null) : antes.certificadoUrl;

    const calibracaoAlterada =
      nextDataCalibracao.getTime() !== antes.dataCalibracao.getTime() ||
      nextDataProxCalibracao.getTime() !== antes.dataProxCalibracao.getTime() ||
      nextCertificadoNum !== antes.certificadoNum ||
      nextCertificadoUrl !== antes.certificadoUrl;

    const equip = await prisma.$transaction(async (tx) => {
      if (calibracaoAlterada) {
        await tx.calibracaoHistorico.create({
          data: {
            calibracaoId: antes.id,
            serviceStationId: antes.serviceStationId,
            nome: antes.nome,
            referencia: antes.referencia,
            tipo: antes.tipo,
            dataCalibracao: antes.dataCalibracao,
            dataProxCalibracao: antes.dataProxCalibracao,
            certificadoNum: antes.certificadoNum,
            certificadoUrl: antes.certificadoUrl,
            observacoes: antes.observacoes,
            registadoPor: access.email || "sistema",
          },
        });
      }

      return tx.calibracaoEquipamento.update({
        where: { id },
        data: {
          nome: nome ? String(nome).trim() : undefined,
          referencia: referencia ? String(referencia).trim() : undefined,
          tipo: tipo ? String(tipo).trim() : undefined,
          dataCalibracao: dataCalibracao ? nextDataCalibracao : undefined,
          dataProxCalibracao: dataProxCalibracao ? nextDataProxCalibracao : undefined,
          certificadoNum: certificadoNum !== undefined ? nextCertificadoNum : undefined,
          certificadoUrl: certificadoUrl !== undefined ? nextCertificadoUrl : undefined,
          ativo: ativo !== undefined ? !!ativo : undefined,
          observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : undefined,
          serviceStationId: stationProvided
            ? nextStationId
            : antes.serviceStationId == null && activeStationId
              ? activeStationId
              : undefined,
        },
      });
    });

    return NextResponse.json(equip);
  } catch (error) {
    console.error('Error updating calibration equipment:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error updating calibration equipment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const activeStationId = resolveActiveServiceStationId(request, access);
    const antes = await prisma.calibracaoEquipamento.findUnique({ where: { id } });
    if (!antes) return NextResponse.json({ error: "Registo não encontrado" }, { status: 404 });
    if (activeStationId && antes.serviceStationId && antes.serviceStationId !== activeStationId) {
      return NextResponse.json({ error: "Sem acesso a este registo noutra estação." }, { status: 403 });
    }

    await prisma.calibracaoEquipamento.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting calibration equipment:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error deleting calibration equipment' }, { status: 500 });
  }
}
