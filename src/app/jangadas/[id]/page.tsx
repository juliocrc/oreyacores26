import React from 'react';
import { getAuthSession } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import JangadaDetailPageClient from './JangadaDetailPageClient';

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

  const jangada = {
    ...jangadaRaw,
    ship,
    cliente,
    inspecoes,
  };

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
      initialData={jangada}
      ships={ships}
    />
  );
}
