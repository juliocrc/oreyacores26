import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncPortoPontaDelgada } from "@/lib/porto-ponta-delgada";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await syncPortoPontaDelgada();
    const escalas = await prisma.portoEscala.findMany({
      orderBy: [{ dataChegada: "asc" }, { navioNome: "asc" }],
    });
    return NextResponse.json({ success: true, ...result, escalas });
  } catch (err) {
    console.error("[POST /api/porto-ponta-delgada/sync]", err);
    const message = err instanceof Error ? err.message : "Erro ao sincronizar escalas oficiais.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
