import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDashboardScope } from '@/lib/dashboard-access';
import { buildBrandRaftStatistics, buildMonthlyTrend, classifyInspectionStatus, classifyTestResult } from '@/lib/estatisticas';

export async function GET(request: NextRequest) {
  try {
    const scope = await getDashboardScope(request);
    if (scope.error) return scope.error;
    const { access, where, stationId } = scope;
    const unrestricted = access.isAdmin && stationId === null;
    const rafts = await prisma.jangada.findMany({ where,
      select: { id: true, brand: true, model: true, capacity: true, packType: true, serial: true } });
    const [totalNavios, totalStock, totalOrdens, inspections, stations] = await Promise.all([
      prisma.navio.count({ where }),
      prisma.stock.count({ where }),
      prisma.ordemServico.count({ where }),
      prisma.inspecao.findMany({
        where: unrestricted ? {} : { jangadaId: { in: rafts.map(row => row.id) } },
        select: { status: true, dataInspecao: true, testeWP: true, testeNAP: true, testeFS: true, testeGI: true, testeDL: true },
      }),
      prisma.serviceStation.findMany({
        where: access.isAdmin ? {} : { id: { in: access.allowedStationIds } },
        select: { id: true, nome: true, codigo: true }, orderBy: { nome: 'asc' },
      }),
    ]);
    let concluidas = 0;
    let rascunhos = 0;
    let condenadas = 0;
    let outros = 0;
    const tests = { wp: { pass: 0, fail: 0, na: 0 }, nap: { pass: 0, fail: 0, na: 0 },
      fs: { pass: 0, fail: 0, na: 0 }, gi: { pass: 0, fail: 0, na: 0 }, dl: { pass: 0, fail: 0, na: 0 } };
    for (const inspection of inspections) {
      const state = classifyInspectionStatus(inspection.status);
      if (state === 'completed') concluidas++;
      else if (state === 'draft') rascunhos++;
      else if (state === 'condemned') condenadas++;
      else outros++;
      // Provisional draft results are not final technical outcomes.
      if (state !== 'completed' && state !== 'condemned') continue;
      for (const [key, field] of [['wp', 'testeWP'], ['nap', 'testeNAP'], ['fs', 'testeFS'], ['gi', 'testeGI'], ['dl', 'testeDL']] as const) {
        tests[key][classifyTestResult(inspection[field])]++;
      }
    }
    return NextResponse.json({
      kpis: { totalInspecoes: inspections.length, concluidas, rascunhos, condenadas, outros, totalJangadas: rafts.length, totalNavios, totalStock, totalOrdens },
      tests,
      brandBreakdown: buildBrandRaftStatistics(rafts),
      monthlyTrend: buildMonthlyTrend(inspections.map(row => row.dataInspecao)), stations, selectedStationId: stationId,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as estatísticas.' }, { status: 500 });
  }
}
