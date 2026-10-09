import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, _context: { params: Promise<{ id: string }> }) {
  // A aprovação de orçamentos é exclusiva do módulo de Orçamentos (/orcamentos).
  // Esta rota ficou obsoleta e é bloqueada por regra única.
  return NextResponse.json(
    { error: "Aprovação de orçamento centralizada no módulo de Orçamentos (/orcamentos)." },
    { status: 403 },
  );
}