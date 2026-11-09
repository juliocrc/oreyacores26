import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAccessContext } from '@/lib/access-control';
import { syncOrderNumber, OrderNumberConflictError } from '@/lib/order-number';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: 'Sessao obrigatoria.' }, { status: 401 });
  if (!access.isAdmin) return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'ID invalido.' }, { status: 400 });
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || ('dryRun' in body && typeof body.dryRun !== 'boolean')) return NextResponse.json({ error: 'Pedido invalido.' }, { status: 400 });
    const dryRun = body.dryRun !== false;
    const result = await prisma.$transaction(async tx => {
      const order = await tx.ordemServico.findUnique({ where: { id } });
      if (!order) return null;
      if (!dryRun && (body.expectedNumber !== order.numeroOrdem || body.expectedInspectionId !== order.inspecaoId)) throw new OrderNumberConflictError('Ligacao ou numero alterado. Execute nova simulacao.');
      return { ...await syncOrderNumber(tx, id, dryRun), inspecaoId: order.inspecaoId, jangadaId: order.jangadaId };
    }, { isolationLevel: 'Serializable' });
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'OT nao encontrada.' }, { status: 404 });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : error instanceof OrderNumberConflictError || ['P2002', 'P2025', 'P2034'].includes((error as { code?: string })?.code || '') ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? 'Erro ao reparar referencia.' : error instanceof Error ? error.message : 'Conflito.' }, { status });
  }
}
