import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || 100)));
    const query = String(searchParams.get("q") || "").trim();
    const tabela = searchParams.get("tabela");
    const tipoOperacao = searchParams.get("tipoOperacao");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const andConditions: Prisma.AuditoriaWhereInput[] = [];

    if (query) {
      andConditions.push({
        OR: [
          { tabela: { contains: query } },
          { tipoOperacao: { contains: query } },
          { descricao: { contains: query } },
          { usuario: { contains: query } },
        ],
      });
    }

    if (tabela && tabela !== "TODOS") {
      andConditions.push({ tabela: { equals: tabela } });
    }

    if (tipoOperacao && tipoOperacao !== "TODOS") {
      andConditions.push({ tipoOperacao: { equals: tipoOperacao } });
    }

    if (startDate || endDate) {
      const dateCondition: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        dateCondition.gte = new Date(startDate);
      }
      if (endDate) {
        // Estender até o final do dia
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateCondition.lte = end;
      }
      andConditions.push({ createdAt: dateCondition });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : undefined;

    const rows = await prisma.auditoria.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao carregar auditorias" }, { status: 500 });
  }
}
