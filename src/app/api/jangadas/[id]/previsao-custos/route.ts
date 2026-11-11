import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { equipmentAccess } from '@/lib/jangada-equipment-access';
import { canEditPath, canViewPath } from '@/lib/user-permissions';
import { getValidityCoverageStatus } from '@/lib/stock-validity';
import { toDateKey } from '@/lib/date-utils';
import { getGiDateContext, getTestRecommendations } from '@/modules/rafts/testRules';
import { buildClosureSuggestions } from '@/modules/JangadaWizard/containerClosure';
import type { InspectionData } from '@/modules/JangadaWizard/types';
import { closureManualNotes, forecastClosureStraps } from '@/lib/raft-closure-forecast';
import { getRaftManualApplicability } from '@/lib/raft-manual-applicability';
import { isSosDocumentRaft } from '@/lib/raft-document-rules';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const guard = await equipmentAccess(id);
    if (guard.error) return guard.error;
    const access = guard.access!;
    if (!access.isAdmin && !canViewPath(access.permissions, '/jangadas') && !canEditPath(access.permissions, '/jangadas')) {
      return NextResponse.json({ error: 'Sem permissão para consultar jangadas.' }, { status: 403 });
    }
    const raft = await prisma.jangada.findUnique({ where: { id }, select: {
      id: true, serial: true, dataProxInspecao: true, brand: true, model: true, launchType: true,
      dataFabrico: true, capacity: true, packType: true, maxStowageHeight: true, containerModel: true, containerSize: true,
      hruReferencia: true, hruValidade: true,
      artigos: { select: { id: true, name: true, referencia: true, quantidade: true, validade: true,
        stock: { select: { precoVenda: true, serviceStationId: true } } } },
    } });
    if (!raft) return NextResponse.json({ error: 'Jangada não encontrada.' }, { status: 404 });
    const proxima = raft.dataProxInspecao ? toDateKey(raft.dataProxInspecao) : null;
    // A completed record with GI PASSOU is evidence of a GI, not evidence of
    // the precise moment of the test. Its inspection date is shown as such.
    const ultimoGi = await prisma.inspecao.findFirst({ where: { jangadaId: id, status: 'Concluída', testeGI: 'PASSOU',
      ...(proxima ? { dataInspecao: { lte: proxima } } : {}) }, orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }],
      select: { id: true, dataInspecao: true } });
    const giContext = ultimoGi ? getGiDateContext({ dataUltimoGi: ultimoGi.dataInspecao, referenceDate: proxima }) : null;
    const itens = raft.artigos.map(item => {
      const validade = item.validade ? toDateKey(item.validade) : null;
      const estado = getValidityCoverageStatus(validade, proxima);
      const stockAllowed = item.stock && guard.raft!.serviceStationId != null && item.stock.serviceStationId === guard.raft!.serviceStationId &&
        (access.isAdmin || access.allowedStationIds.includes(Number(item.stock.serviceStationId || 0)));
      const price = stockAllowed ? Number(item.stock!.precoVenda) : 0;
      const unitario = Number.isFinite(price) && price > 0 ? price : null;
      const quantidade = Math.max(0, item.quantidade);
      return { id: item.id, nome: item.name, referencia: item.referencia, quantidade, validade, estado, unitario,
        total: estado === 'replace' && unitario !== null ? Math.round(quantidade * unitario * 100) / 100 : null };
    });
    const substituir = itens.filter(item => item.estado === 'replace');
    const pendentes = itens.filter(item => item.estado === 'pending');

    // An installed HRU is recorded separately from pack articles. Never guess a price
    // from another station or choose arbitrarily between conflicting stock prices.
    if (!isSosDocumentRaft(raft) && (raft.hruReferencia?.trim() || raft.hruValidade?.trim())) {
      const referencia = raft.hruReferencia?.trim() || null;
      const hruValidDate = raft.hruValidade?.trim() || null;
      const hruEstado = getValidityCoverageStatus(hruValidDate, proxima);
      const stationId = guard.raft!.serviceStationId;
      const hruStock = referencia && stationId != null && (access.isAdmin || access.allowedStationIds.includes(stationId)) ? await prisma.stock.findMany({
        where: {
          referencia,
          serviceStationId: stationId,
        },
        select: { precoVenda: true, serviceStationId: true }
      }) : [];
      const hruPrices = [...new Set(hruStock.filter(row => row.serviceStationId === guard.raft!.serviceStationId)
        .map(row => Number(row.precoVenda)).filter(price => Number.isFinite(price) && price > 0))];
      const hruUnitario = hruPrices.length === 1 ? hruPrices[0] : null;
      const hruTotal = hruEstado === 'replace' && hruUnitario !== null ? Math.round(hruUnitario * 100) / 100 : null;
      const hruItem = {
        id: -999,
        nome: 'HRU (Libertador Hidrostático)',
        referencia,
        quantidade: 1,
        validade: hruValidDate,
        estado: hruEstado,
        unitario: hruUnitario,
        total: hruTotal
      };
      if (hruEstado === 'replace') substituir.unshift(hruItem);
      if (hruEstado === 'pending') pendentes.push(hruItem);
    }
    const testes = proxima ? getTestRecommendations({ serial: raft.serial, brand: raft.brand, model: raft.model,
      launchType: raft.launchType, dataFabrico: raft.dataFabrico, inspectionDate: proxima })
      .filter(test => test.status !== 'not-required') : [];
    const sugestoes = buildClosureSuggestions({ brand: raft.brand, model: raft.model, capacity: raft.capacity,
      packType: raft.packType, launchType: raft.launchType || '', maxStowageHeight: raft.maxStowageHeight || '' } as InspectionData)
      .filter(item => item.kind === 'autocolante');
    const cinta = forecastClosureStraps(raft);
    if (cinta) sugestoes.unshift({ key: 'cinta-prevista', kind: 'cinta', referencia: cinta.referencias.join(' / '),
      descricao: `Cintas de fecho (${cinta.certeza}${cinta.sources.length ? ` · páginas ${cinta.sources.join(', ')}` : ''})`,
      quantidade: cinta.quantidade, certainty: cinta.certeza === 'manual' ? 'exact' : 'operational' });
    const refs = [...new Set(sugestoes.filter(item => item.kind !== 'cinta').map(item => item.referencia).filter(Boolean))];
    const stock = refs.length ? await prisma.stock.findMany({ where: { referencia: { in: refs },
      ...(access.isAdmin ? {} : { serviceStationId: { in: access.allowedStationIds } }) },
      select: { referencia: true, precoVenda: true, serviceStationId: true } }) : [];
    const fecho = sugestoes.map(item => {
      const prices = [...new Set(stock.filter(row => row.referencia === item.referencia && row.serviceStationId === guard.raft!.serviceStationId)
        .map(row => Number(row.precoVenda)).filter(price => Number.isFinite(price) && price > 0))];
      const unitario = item.kind === 'cinta' ? 6 : prices.length === 1 ? prices[0] : null;
      return { ...item, unitario, total: unitario === null ? null : Math.round(unitario * item.quantidade * 100) / 100 };
    });
    const fechoConhecido = fecho.filter(item => item.kind === 'cinta').reduce((sum, item) => sum + (item.total ?? 0), 0);
    const artigosConhecidos = Math.round(substituir.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100) / 100;
    return NextResponse.json({ serial: raft.serial, proximaInspecao: proxima, itens: substituir, pendentes,
      testes, ultimoGi: ultimoGi && giContext?.origem === 'registada' ? { inspecaoId: ultimoGi.id,
        dataInspecao: giContext.ultimaGiDate, proximaEstimativa: giContext.proximaGiDate } : null,
      fecho, notasFecho: closureManualNotes(raft), aplicabilidade: getRaftManualApplicability(raft), cintaIdentificada: fecho.some(item => item.kind === 'cinta'),
      artigosConhecidos, fechoConhecido,
      subtotalConhecido: Math.round((artigosConhecidos + fechoConhecido) * 100) / 100,
      semPreco: substituir.filter(item => item.total === null).length + fecho.filter(item => item.total === null).length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[previsao-custos]', error);
    return NextResponse.json({ error: 'Não foi possível calcular a previsão.' }, { status: 500 });
  }
}
