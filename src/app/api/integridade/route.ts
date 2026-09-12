import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { computeInspectionDigest } from "@/lib/integrity-stamp";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const rows = await prisma.inspecao.findMany({
      where: {
        OR: [{ certificadoNumero: { not: "" } }, { integrityHash: { not: null } }],
      },
      include: { artigos: true },
      orderBy: [{ dataInspecao: "desc" }],
    });

    const items = rows.map((r) => {
      const recomputed = computeInspectionDigest(r, r.artigos);
      const stamped = Boolean(r.integrityHash);
      return {
        id: r.id,
        certificadoNumero: r.certificadoNumero,
        navioNome: r.navioNome,
        jangadaSerial: r.jangadaSerial,
        dataInspecao: r.dataInspecao,
        dataProxInspecao: r.dataProxInspecao,
        status: r.status,
        stamped,
        valid: stamped ? recomputed === r.integrityHash : null,
        integrityHash: r.integrityHash,
        integrityTimestamp: r.integrityTimestamp,
      };
    });

    const valid = items.filter((i) => i.valid === true).length;
    const invalid = items.filter((i) => i.valid === false).length;
    const unstamped = items.filter((i) => !i.stamped).length;

    return NextResponse.json({ total: items.length, valid, invalid, unstamped, items });
  } catch (err: unknown) {
    return buildDatabaseErrorResponse(err, err instanceof Error ? err.message : "Erro ao verificar integridade");
  }
}