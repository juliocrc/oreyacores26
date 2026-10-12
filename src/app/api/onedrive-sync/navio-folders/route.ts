import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { ensureNavioFoldersToOneDrive } from "@/lib/onedrive-sync";

export const runtime = "nodejs";

async function loadShipNamesWithJangadas() {
  const rows = await prisma.jangada.findMany({
    where: { shipId: { not: null } },
    select: { shipId: true },
    distinct: ["shipId"],
  });
  const ids = rows.map((r) => r.shipId).filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return [];
  const navios = await prisma.navio.findMany({
    where: { id: { in: ids }, nome: { not: "" } },
    select: { nome: true },
    orderBy: { nome: "asc" },
  });
  return navios.map((n) => n.nome).filter(Boolean);
}

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const shipNames = await loadShipNamesWithJangadas();
    return NextResponse.json({ totalNavios: shipNames.length, ships: shipNames });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao listar navios com jangadas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

    const shipNames = await loadShipNamesWithJangadas();
    const result = await ensureNavioFoldersToOneDrive({ shipNames });

    return NextResponse.json({ totalNavios: shipNames.length, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao criar pastas dos navios no OneDrive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
