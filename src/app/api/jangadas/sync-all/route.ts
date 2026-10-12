import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncRaftArticlesWithPackType } from "@/lib/checklist-sync";

const CHUNK_SIZE = 10;

type SyncSummary = {
  added: number;
  updated: number;
  removed: number;
  stockLinked: number;
};

type ResultOrError =
  | {
      success: true;
      message?: string;
      summary: SyncSummary;
      checklistDriven?: { added: number; updated: number; total: number };
    }
  | { success: false; error: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const linkStock = body.linkStock !== false;

    const jangadas = await prisma.jangada.findMany({
      select: { id: true },
    });

    const totals = {
      total: jangadas.length,
      ok: 0,
      errors: 0,
      added: 0,
      updated: 0,
      removed: 0,
      stockLinked: 0,
      checklistDriven: { added: 0, updated: 0, total: 0 },
    };

    const failures: Array<{ id: number; error: string }> = [];

    for (let i = 0; i < jangadas.length; i += CHUNK_SIZE) {
      const chunk = jangadas.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map(async (j): Promise<{ id: number; res: ResultOrError }> => {
          try {
            const res = (await syncRaftArticlesWithPackType(j.id, { linkStock })) as Exclude<ResultOrError, { success: false }>;
            return { id: j.id, res };
          } catch (err) {
            return {
              id: j.id,
              res: {
                success: false,
                error: err instanceof Error ? err.message : String(err),
              },
            };
          }
        }),
      );

      for (const { id, res } of results) {
        if (!res.success) {
          totals.errors += 1;
          failures.push({ id, error: res.error || "Falha desconhecida" });
          continue;
        }
        totals.ok += 1;
        totals.added += res.summary.added;
        totals.updated += res.summary.updated;
        totals.removed += res.summary.removed;
        totals.stockLinked += res.summary.stockLinked;
        const checklist = res.checklistDriven;
        if (checklist) {
          totals.checklistDriven.added += checklist.added;
          totals.checklistDriven.updated += checklist.updated;
          totals.checklistDriven.total += checklist.total;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: totals,
      ...(failures.length > 0 ? { failures } : {}),
    });
  } catch (error) {
    console.error("Erro ao sincronizar todas as jangadas:", error);
    return NextResponse.json(
      { error: "Erro interno ao sincronizar todas as jangadas" },
      { status: 500 },
    );
  }
}