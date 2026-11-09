import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getDashboardScope } from '@/lib/dashboard-access';
import { getLocalDateKey } from '@/lib/date-utils';
import { collectNotificationSources, notificationDateKey, type NotificacaoItem } from '@/lib/notificacoes';

export async function GET(request: NextRequest) {
  try {
    const scope = await getDashboardScope(request);
    if (scope.error) return scope.error;
    const { where, access, stationId } = scope;
    const unrestricted = access.isAdmin && stationId === null;
    const today = getLocalDateKey();
    const start = new Date(`${today}T00:00:00Z`);
    // A broad instant range followed by civil-date checks also covers DST days.
    const tomorrow = new Date(start.getTime() + 26 * 60 * 60 * 1000);
    const limit = new Date(`${today}T12:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + 30);
    const limitKey = getLocalDateKey(limit);

    const payload = await collectNotificationSources([
      { label: 'alertas de validade', load: async () => {
        const ships = unrestricted ? [] : await prisma.navio.findMany({ where, select: { id: true } });
        const shipWhere = unrestricted ? {} : { shipId: { in: ships.map(row => row.id) } };
        const [rafts, certificates, epirbs, extinguishers, suits] = await Promise.all([
          prisma.jangada.findMany({ where, select: { id: true, serial: true, dataProxInspecao: true } }),
          prisma.certificadoExtraido.findMany({ where: { jangada: where, isMaisRecente: true }, select: { id: true, certificadoNumero: true, dataProxInspecao: true } }),
          prisma.epirb.findMany({ where: { ...shipWhere, estado: 'Ativo' }, select: { id: true, serial: true, dataProxInspecao: true, dataValidadeBateria: true } }),
          prisma.extintor.findMany({ where: { ...shipWhere, estado: 'Ativo' }, select: { id: true, serial: true, dataProxRecarga: true, dataProxTesteHidraulico: true } }),
          prisma.fatoImersao.findMany({ where: { ...shipWhere, estado: 'Ativo' }, select: { id: true, serial: true, dataProxInspecao: true } }),
        ]);
        const alerts: NotificacaoItem[] = [];
        const add = (tipo: string, id: number, reference: string | null, dates: (string | null)[]) => {
          const date = dates.map(notificationDateKey).filter(key => key && key >= today && key <= limitKey).sort()[0];
          if (date) alerts.push({ id: `alert_${tipo}_${id}`, tipo: 'alerta', titulo: `Validade: ${tipo} ${reference || `#${id}`}`,
            descricao: `Validade a terminar em ${date}`, data: date, link: '/alertas' });
        };
        rafts.forEach(row => add('jangada', row.id, row.serial, [row.dataProxInspecao]));
        certificates.forEach(row => add('certificado', row.id, row.certificadoNumero, [row.dataProxInspecao]));
        epirbs.forEach(row => add('epirb', row.id, row.serial, [row.dataProxInspecao, row.dataValidadeBateria]));
        extinguishers.forEach(row => add('extintor', row.id, row.serial, [row.dataProxRecarga, row.dataProxTesteHidraulico]));
        suits.forEach(row => add('fato', row.id, row.serial, [row.dataProxInspecao]));
        return alerts.sort((a, b) => a.data.localeCompare(b.data)).slice(0, 20);
      } },
      { label: 'comunicações recebidas', load: async () => {
        // Comunicacao has scalar references, not Prisma relations. Unlinked messages
        // are visible only in the administrator's unrestricted view.
        const [rafts, orders] = unrestricted ? [[], []] : await Promise.all([
          prisma.jangada.findMany({ where, select: { id: true } }),
          prisma.ordemServico.findMany({ where, select: { id: true } }),
        ]);
        const raftIds = rafts.map(row => row.id);
        const orderIds = orders.map(row => row.id);
        const rows = await prisma.comunicacao.findMany({
          where: { status: 'recebido', respondidoEm: null, ...(unrestricted ? {} : { AND: [
            { OR: [{ jangadaId: { in: raftIds } }, { ordemServicoId: { in: orderIds } }] },
            { OR: [{ jangadaId: null }, { jangadaId: { in: raftIds } }] },
            { OR: [{ ordemServicoId: null }, { ordemServicoId: { in: orderIds } }] },
          ] }) },
          select: { id: true, tipo: true, mensagem: true, enviadoEm: true, status: true },
          orderBy: [{ enviadoEm: 'desc' }, { id: 'desc' }], take: 15,
        });
        return rows.map(row => ({ id: `comm_${row.id}`, tipo: 'whatsapp', titulo: `Comunicação ${row.tipo} recebida`,
          descricao: row.mensagem, data: row.enviadoEm.toISOString(), status: row.status, link: '/comunicacoes' }));
      } },
      { label: 'pedidos de assistência', load: async () => {
        const assistanceScope = access.isAdmin && stationId !== null
          ? { OR: [where, { serviceStationId: null, origem: 'portal_acesso' }] } : where;
        const rows = await prisma.pedidoAssistencia.findMany({ where: { ...assistanceScope, estado: { in: ['novo', 'em_atendimento'] } },
          select: { id: true, nome: true, descricao: true, estado: true, origem: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 15 });
        return rows.map(row => ({ id: `ast_${row.id}`, tipo: 'assistencia', titulo: row.origem === 'portal_acesso'
          ? `Pedido de acesso ao portal #${row.id} (${row.estado})` : `Pedido de Assistência #${row.id} (${row.estado})`,
          descricao: `${row.nome || 'Cliente'}: ${row.descricao}`, data: row.createdAt.toISOString(), status: row.estado, link: '/pedidos-assistencia' }));
      } },
      { label: 'agendamentos de hoje', load: async () => {
        const rows = await prisma.agendaEvento.findMany({ where: { ...where, date: { gte: start, lt: tomorrow },
          status: { in: ['scheduled', 'confirmed', 'in_progress', 'testing', 'paused'] } },
          select: { id: true, title: true, date: true, raftSerial: true, status: true }, orderBy: { date: 'asc' } });
        return rows.filter(row => notificationDateKey(row.date) === today).map(row => ({ id: `agenda_${row.id}`, tipo: 'agendamento',
          titulo: `Hoje: ${row.title}`, descricao: row.raftSerial, data: row.date.toISOString(), status: row.status, link: '/agenda' }));
      } },
      { label: 'aprovações de orçamento', load: async () => {
        const rows = await prisma.ordemServico.findMany({ where: { ...where, orcamentoStatus: { in: ['Enviado', 'Pendente', 'Emitido'] },
          status: { notIn: ['cancelada', 'faturada'] } }, select: { id: true, numeroOrdem: true, orcamentoStatus: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 15 });
        return rows.map(row => ({ id: `quote_${row.id}`, tipo: 'orcamento', titulo: `Orçamento em análise: ${row.numeroOrdem}`,
          descricao: 'Aguarda decisão de aprovação.', data: row.updatedAt.toISOString(), status: row.orcamentoStatus, link: '/orcamentos' }));
      } },
    ]);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Erro nas notificações:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as notificações.' }, { status: 500 });
  }
}
