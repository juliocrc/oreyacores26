import React from 'react';
import { getAuthSession } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import JangadaDetailPageClient from './JangadaDetailPageClient';
import type { JangadaFormData } from './JangadaDetailPageClient';

export default async function JangadaInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();

  if (!session) {
    redirect('/api/auth/signin');
  }

  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    redirect('/jangadas');
  }

  const jangadaRaw = await prisma.jangada.findUnique({
    where: { id: numericId },
    include: {
      artigos: true,
      serviceStation: true,
    },
  });

  if (!jangadaRaw) {
    redirect('/jangadas');
  }

  const [inspecoes, ship] = await Promise.all([
    prisma.inspecao.findMany({
      where: { jangadaId: numericId },
      orderBy: { dataInspecao: 'desc' },
    }),
    jangadaRaw.shipId ? prisma.navio.findUnique({ where: { id: jangadaRaw.shipId }, include: { cliente: true } }) : null,
  ]);

  const cliente = ship?.cliente || null;

  function nullToUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) return undefined as T;
    if (Array.isArray(obj)) return obj.map(nullToUndefined) as T;
    if (typeof obj === 'object') {
      // Never recurse into Date (or any non-plain object) — it would be
      // shredded into {}. Dates (e.g. artigo validade) must pass through.
      if (obj instanceof Date) return obj as T;
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) return obj as T;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = v === null ? undefined : (typeof v === 'object' && v !== null ? nullToUndefined(v) : v);
      }
      return out as T;
    }
    return obj;
  }

  const jangada = nullToUndefined({
    ...jangadaRaw,
    ship,
    cliente,
    inspecoes,
  });

  const ships = (await prisma.navio.findMany({
    select: {
      id: true,
      nome: true,
      matricula: true,
      cliente: {
        select: {
          id: true,
          nome: true,
          telmovel: true,
          telefone: true,
        },
      },
    },
    orderBy: {
      nome: 'asc',
    },
  })).map((s) => ({
    id: s.id,
    nome: s.nome,
    matricula: s.matricula,
    cliente: s.cliente ? { id: s.cliente.id, nome: s.cliente.nome, telmovel: s.cliente.telmovel, telefone: s.cliente.telefone } : undefined,
  }));

  return (
    <JangadaDetailPageClient
      jangadaId={numericId}
      initialData={jangada as unknown as JangadaFormData}
      ships={ships}
    />
  );
}
