import type { Prisma } from '@prisma/client';

export class OrderNumberConflictError extends Error {}

type OrderLink = {
  numeroOrdem: string;
  inspecaoId: number | null;
  jangadaId: number | null;
  shipId: number | null;
  serviceStationId: number | null;
  status?: string;
};

export function resolveOrderNumber(input: {
  numeroOrdem: string;
  inspectionNumber?: string | null;
  raftNumber?: string | null;
  sameInspection: boolean;
  currentInspection: boolean;
}) {
  const stored = input.numeroOrdem.trim();
  if (!input.sameInspection) return stored;
  const inspection = input.inspectionNumber?.trim() || '';
  const raft = input.currentInspection ? input.raftNumber?.trim() || '' : '';
  const explicit = [inspection, raft].find(number => /^FO\d+$/i.test(number));
  // Explicit OT references and historical snapshots are never silently renamed.
  return (!stored || /^OS-\d{4}-\d+$/i.test(stored)) && explicit ? explicit : stored;
}

export async function canonicalOrderNumber(db: Prisma.TransactionClient, order: OrderLink) {
  if (['concluida', 'cancelada'].includes(order.status || '') || (order.numeroOrdem && !/^OS-\d{4}-\d+$/i.test(order.numeroOrdem))) return order.numeroOrdem;
  if (!order.inspecaoId || !order.jangadaId) return order.numeroOrdem;
  const inspection = await db.inspecao.findUnique({ where: { id: order.inspecaoId } });
  if (!inspection || inspection.jangadaId !== order.jangadaId) return order.numeroOrdem;
  if (inspection.navioId != null && inspection.navioId !== order.shipId) return order.numeroOrdem;
  const raft = await db.jangada.findUnique({ where: { id: order.jangadaId } });
  if (!raft || raft.shipId !== order.shipId || raft.serviceStationId !== order.serviceStationId) return order.numeroOrdem;
  const latest = await db.inspecao.findFirst({
    where: { jangadaId: raft.id },
    orderBy: [{ dataInspecao: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return resolveOrderNumber({
    numeroOrdem: order.numeroOrdem,
    inspectionNumber: inspection.numeroObra,
    raftNumber: raft.numeroObra,
    sameInspection: true,
    currentInspection: latest?.id === inspection.id && raft.dataInspecao === inspection.dataInspecao,
  });
}

// Caller owns the transaction. This function never touches invoice snapshots.
export async function syncOrderNumber(db: Prisma.TransactionClient, id: number, dryRun = false) {
  const order = await db.ordemServico.findUnique({ where: { id } });
  if (!order) throw new OrderNumberConflictError('OT nao encontrada.');
  const numeroOrdem = await canonicalOrderNumber(db, order);
  const changed = numeroOrdem !== order.numeroOrdem && !['concluida', 'cancelada'].includes(order.status);
  if (changed) {
    const conflict = await db.ordemServico.findUnique({ where: { numeroOrdem } });
    if (conflict && conflict.id !== id) throw new OrderNumberConflictError('Numero de obra ja utilizado por outra OT.');
    if (!dryRun) {
      let meta: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(order.metadados || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
      } catch { /* Preserve legacy free text. */ }
      if (meta.grupoNumeroOrdem === order.numeroOrdem) meta.grupoNumeroOrdem = numeroOrdem;
      await db.ordemServico.update({
        where: { id, updatedAt: order.updatedAt },
        data: { numeroOrdem, ...(order.metadados && meta.grupoNumeroOrdem === numeroOrdem ? { metadados: JSON.stringify(meta) } : {}) },
      });
      await db.ordemServicoLog.create({ data: {
        ordemServicoId: id, type: 'NUMERO_OBRA', user: 'sistema',
        message: `Referencia sincronizada: ${order.numeroOrdem} -> ${numeroOrdem}.`,
      } });
    }
  }
  return { id, dryRun, changed, previousNumber: order.numeroOrdem, numeroOrdem: changed ? numeroOrdem : order.numeroOrdem };
}
