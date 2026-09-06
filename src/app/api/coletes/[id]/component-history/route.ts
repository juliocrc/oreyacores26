import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/auth";
import prisma from "@/lib/prisma";

interface ColeteComponentHistoryDelegate {
  findMany: (args: {
    where: { coleteId: number };
    orderBy: { createdAt: string };
    take: number;
  }) => Promise<Array<Record<string, unknown>>>;
  createMany: (args: { data: unknown[] }) => Promise<{ count: number }>;
}

const coleteComponentHistory = (prisma as unknown as {
  coleteComponentHistory: ColeteComponentHistoryDelegate;
}).coleteComponentHistory;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const coleteId = Number(id);

    try {
      const history = await coleteComponentHistory.findMany({
        where: { coleteId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ history });
    } catch {
      // Table may not exist yet in production DB
      return NextResponse.json({ history: [] });
    }
  } catch (error) {
    console.error("Erro ao buscar histórico de componentes:", error);
    return NextResponse.json({ history: [] });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const coleteId = Number(id);
    const body = await request.json();
    const { changes, changedById, changedByName } = body;

    if (!changes || typeof changes !== "object") {
      return NextResponse.json(
        { error: "Campo 'changes' é obrigatório" },
        { status: 400 }
      );
    }

    const entries = Object.entries(changes).map(([fieldName, change]) => {
      const c = change as Record<string, unknown>;
      return {
        coleteId,
        fieldName,
        oldValue: c.from ?? c.oldValue ?? null,
        newValue: c.to ?? c.newValue ?? null,
        changedById: changedById ?? (session.user as unknown as { id?: number })?.id ?? null,
        changedByName: changedByName ?? session.user?.name ?? session.user?.email ?? "Sistema",
      };
    });

    try {
      await coleteComponentHistory.createMany({
        data: entries,
      });
      return NextResponse.json({ success: true, count: entries.length });
    } catch {
      // Table may not exist yet — do not fail the parent save flow
      return NextResponse.json({ success: false, count: 0, skipped: true });
    }
  } catch (error) {
    console.error("Erro ao criar histórico de componentes:", error);
    return NextResponse.json({ success: false, count: 0, skipped: true });
  }
}