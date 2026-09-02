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

  const jangada = await prisma.jangada.findUnique({
    where: { id: numericId },
    include: {
      ship: true,
      inspecoes: {
        orderBy: { dataInspecao: 'desc' },
      },
      artigos: true,
    },
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
  })).map((ship) => ({
    id: ship.id,
    nome: ship.nome,
    matricula: ship.matricula,
    cliente: ship.cliente ? { id: ship.cliente.id, nome: ship.cliente.nome, telmovel: ship.cliente.telmovel, telefone: ship.cliente.telefone } : undefined,
  }));

  return (
    <JangadaDetailPageClient
      jangadaId={numericId}
      initialData={jangada}
      ships={ships}
    />
  );
}
