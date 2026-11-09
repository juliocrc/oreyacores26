import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function requireStaff() {
  const session = await getAuthSession();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 }) };
  if (session.user.role !== "ADMIN" && session.user.role !== "USER") {
    return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  }
  return { session };
}

// GET /api/clientes/[id]/portal-devices — lista os dispositivos do cliente.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStaff();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) return json({ error: "Cliente inválido." }, 400);

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, portalAtivo: true, portalSessionVersion: true },
    });
    if (!cliente) return json({ error: "Cliente não encontrado." }, 404);

    const devices = await prisma.portalDevice.findMany({
      where: { clienteId },
      orderBy: [{ revogado: "asc" }, { ultimoAcesso: "desc" }],
      select: {
        id: true,
        deviceId: true,
        app: true,
        modelo: true,
        osVersion: true,
        appVersion: true,
        serviceStationId: true,
        ultimoAcesso: true,
        revogado: true,
        revogadoEm: true,
        criadoEm: true,
      },
    });

    return json({ cliente, devices });
  } catch (error) {
    console.error("portal-devices GET error:", error);
    return json({ error: "Erro interno." }, 500);
  }
}

// PATCH /api/clientes/[id]/portal-devices
// body: { deviceId: string, acao: "revogar" | "reativar" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireStaff();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const clienteId = Number(id);
    if (!Number.isInteger(clienteId)) return json({ error: "Cliente inválido." }, 400);

    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 80);
    const acao = String(body.acao ?? "");
    if (!deviceId || (acao !== "revogar" && acao !== "reativar")) {
      return json({ error: "Indique o dispositivo e a ação (revogar/reativar)." }, 400);
    }

    const existing = await prisma.portalDevice.findUnique({
      where: { clienteId_deviceId: { clienteId, deviceId } },
    });
    if (!existing) return json({ error: "Dispositivo não encontrado." }, 404);

    if (acao === "revogar") {
      await prisma.portalDevice.update({
        where: { clienteId_deviceId: { clienteId, deviceId } },
        data: {
          revogado: true,
          revogadoEm: new Date(),
          // Incrementar a versão da sessão do dispositivo invalida só ele.
          sessionVersion: { increment: 1 },
        },
      });
    } else {
      await prisma.portalDevice.update({
        where: { clienteId_deviceId: { clienteId, deviceId } },
        data: { revogado: false, revogadoEm: null },
      });
    }

    const devices = await prisma.portalDevice.findMany({
      where: { clienteId },
      orderBy: [{ revogado: "asc" }, { ultimoAcesso: "desc" }],
      select: {
        id: true,
        deviceId: true,
        app: true,
        modelo: true,
        osVersion: true,
        appVersion: true,
        serviceStationId: true,
        ultimoAcesso: true,
        revogado: true,
        revogadoEm: true,
        criadoEm: true,
      },
    });

    return json({ ok: true, devices });
  } catch (error) {
    console.error("portal-devices PATCH error:", error);
    return json({ error: "Erro interno." }, 500);
  }
}
