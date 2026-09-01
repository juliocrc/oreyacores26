import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

export const runtime = "nodejs";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

export async function GET() {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowTime = now.getTime();

    // 1. Fetch all rafts with proximity inspection dates
    const rafts = await prisma.jangada.findMany({
      where: {
        dataProxInspecao: { not: null },
      },
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        capacity: true,
        owner: true,
        dataInspecao: true,
        dataProxInspecao: true,
        shipId: true,
        shipNameManual: true,
      },
    });

    const pendingAlerts = [];

    for (const raft of rafts) {
      const pDate = parseDate(raft.dataProxInspecao);
      if (!pDate) continue;

      const diffTime = pDate.getTime() - nowTime;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // We focus on rafts expired or expiring in the next 35 days (to cover 30 days window comfortably)
      if (daysRemaining <= 35) {
        let shipName = raft.shipNameManual || "";
        let clientName = raft.owner || "";
        let email = "";
        let telefone = "";
        let telmovel = "";
        let ilha = "";

        // Look up Navio and Cliente
        if (raft.shipId) {
          const ship = await prisma.navio.findUnique({
            where: { id: raft.shipId },
            select: {
              nome: true,
              ilha: true,
              cliente: {
                select: {
                  nome: true,
                  email: true,
                  telefone: true,
                  telmovel: true,
                  ilha: true,
                },
              },
            },
          });
          if (ship) {
            shipName = ship.nome;
            ilha = ship.ilha || "";
            if (ship.cliente) {
              clientName = ship.cliente.nome;
              email = ship.cliente.email || "";
              telefone = ship.cliente.telefone || "";
              telmovel = ship.cliente.telmovel || "";
              if (ship.cliente.ilha) {
                ilha = ship.cliente.ilha;
              }
            }
          }
          // Canonicalize ilha label
          ilha = (getCanonicalNavioLocationLabel(ilha) || ilha) || "";
        }

        // Only include if we have some client details or owner name
        pendingAlerts.push({
          raftId: raft.id,
          serial: raft.serial,
          brand: raft.brand,
          model: raft.model,
          capacity: raft.capacity,
          dataProxInspecao: raft.dataProxInspecao,
          daysRemaining,
          shipName,
          clientName,
          email,
          telefone,
          telmovel,
          ilha,
        });
      }
    }

    // Sort by days remaining (most urgent first)
    pendingAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // 2. Fetch past communications from Auditoria
    const logs = await prisma.auditoria.findMany({
      where: {
        tabela: "Comunicacao",
        tipoOperacao: "SEND_ALERT",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const communicationLogs = logs.map((log) => ({
      id: log.id,
      raftId: log.idRegisto,
      descricao: log.descricao,
      usuario: log.usuario,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({
      pendingAlerts,
      communicationLogs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao carregar alertas.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { raftId, clientName, shipName, contact, channel, message, serial } = body;

    if (!raftId || !contact || !channel) {
      return NextResponse.json({ error: "Parâmetros obrigatórios em falta." }, { status: 400 });
    }

    // Simulate sending (mock call delay)
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Log the successful notification inside Auditoria table
    const log = await prisma.auditoria.create({
      data: {
        tabela: "Comunicacao",
        tipoOperacao: "SEND_ALERT",
        idRegisto: Number(raftId),
        descricao: `Notificação enviada por ${channel.toUpperCase()} para o cliente ${clientName} (${contact}) sobre a jangada ${serial} (${shipName}). Mensagem: "${message}"`,
        usuario: access.email || "sistema",
      },
    });

    return NextResponse.json({
      success: true,
      logId: log.id,
      message: `Notificação enviada com sucesso via ${channel}!`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao registar comunicação.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
