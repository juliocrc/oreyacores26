import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { canEditPath } from "@/lib/user-permissions";
import { isKnownPackTypeName } from "@/lib/custom-pack-types";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { toCanonicalDateStr } from "@/lib/date-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const STRING_FIELDS = [
  "brand",
  "model",
  "fabricType",
  "packType",
  "owner",
  "shipNameManual",
  "cylinderSerial",
  "cylinderCo2",
  "cylinderN2",
  "cylinderTara",
  "cylinderPesoBruto",
  "cylinderSistema",
  "cylinderCabecaDisparoRef",
  "cylinderCabecaDisparoSerial",
  "cylinderCabecaDisparoDescricao",
  "painterLength",
  "maxStowageHeight",
  "containerModel",
  "containerSize",
] as const;

function has(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeMonthYear(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const mmYyyy = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${mmYyyy[2]}`;
  }

  const yyyyMm = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (yyyyMm) {
    const month = Number(yyyyMm[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${yyyyMm[1]}`;
  }

  const ddMmYyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) {
    const month = Number(ddMmYyyy[2]);
    if (month >= 1 && month <= 12) return `${String(month).padStart(2, "0")}/${ddMmYyyy[3]}`;
  }

  return null;
}

function normalizeArtigos(raw: unknown) {
  if (!Array.isArray(raw)) return [] as Array<{
    name: string;
    quantidade: number;
    validade: Date | null;
    referencia: string | null;
    codigoFabricante: string | null;
  }>;

  return raw
    .map((item) => {
      const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const name = String(entry.name || "").trim();
      if (!name) return null;

      const quantidadeNum = Number(entry.quantidade);
      const quantidade = Number.isFinite(quantidadeNum) ? Math.max(0, Math.round(quantidadeNum)) : 1;

      const validadeRaw = String(entry.validade || "").trim();
      // normalizeArtigoValidade interpreta DD/MM/AAAA, MM/AAAA, MM/AA e ISO sem
      // trocar dia/mês (ao contrário de Date.parse, que lê "05/06/2026" como MM/DD).
      const validade = validadeRaw ? normalizeArtigoValidade(validadeRaw) : null;

      const referencia = entry.referencia ? String(entry.referencia).trim() : null;
      const codigoFabricante = entry.codigoFabricante ? String(entry.codigoFabricante).trim() : null;

      return { name, quantidade, validade, referencia, codigoFabricante };
    })
    .filter((item): item is {
      name: string;
      quantidade: number;
      validade: Date | null;
      referencia: string | null;
      codigoFabricante: string | null;
    } => item !== null);
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const existing = await prisma.jangada.findUnique({
      where: { id },
      select: { id: true, serviceStationId: true },
    });
    if (!existing) return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });

    if (!access.isAdmin && !access.allowedStationIds.includes(Number(existing.serviceStationId || 0))) {
      return NextResponse.json({ error: "Sem permissão para editar esta jangada." }, { status: 403 });
    }
    if (!access.isAdmin && !canEditPath(access.permissions, "/jangadas")) {
      return NextResponse.json({ error: "Sem permissão para editar a página de jangadas." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    const appliedFields: string[] = [];

    for (const field of STRING_FIELDS) {
      if (!has(body, field)) continue;
      const value = String(body[field] ?? "").trim();
      if (!value) continue;
      data[field] = value;
      appliedFields.push(field);
    }

    if (has(body, "capacity")) {
      const n = Number(String(body.capacity ?? "").replace(",", "."));
      if (Number.isFinite(n) && n > 0 && n <= 200) {
        data.capacity = Math.floor(n);
        appliedFields.push("capacity");
      }
    }

    if (has(body, "dataFabrico")) {
      const my = normalizeMonthYear(body.dataFabrico);
      if (my) {
        data.dataFabrico = my;
        appliedFields.push("dataFabrico");
      }
    }

    for (const field of ["dataInspecao", "dataProxInspecao"] as const) {
      if (!has(body, field)) continue;
      const canonical = toCanonicalDateStr(String(body[field] ?? ""));
      if (canonical) {
        data[field] = canonical;
        appliedFields.push(field);
      }
    }

    if (data.packType) {
      const valid = await isKnownPackTypeName(String(data.packType), { includeInactiveCustom: true });
      if (!valid) {
        delete data.packType;
      }
    }

    let appliedShipId: number | null = null;
    if (has(body, "shipId")) {
      const shipIdNum = Number(body.shipId);
      if (Number.isFinite(shipIdNum) && shipIdNum > 0) {
        const navio = await prisma.navio.findUnique({ where: { id: shipIdNum }, select: { id: true, nome: true } });
        if (navio) {
          data.shipId = navio.id;
          data.shipNameManual = navio.nome;
          appliedShipId = navio.id;
          appliedFields.push("shipId");
        }
      } else if (body.shipId == null || String(body.shipId).trim() === "") {
        data.shipId = null;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.jangada.update({ where: { id }, data });
    }

    const artigosRaw = Array.isArray(body.artigos) ? body.artigos : null;
    let artigosAplicados = 0;
    if (artigosRaw) {
      const normalized = normalizeArtigos(artigosRaw);
      const substituir = body.substituirArtigos !== false;
      if (substituir) {
        await prisma.artigoJangada.deleteMany({ where: { jangadaId: id, inspecaoId: null } });
      }
      if (normalized.length > 0) {
        await prisma.artigoJangada.createMany({
          data: normalized.map((art) => ({ ...art, jangadaId: id })),
        });
        artigosAplicados = normalized.length;
      }
    }

    // Exemplo de treino: guarda o que a IA extraiu vs o que ficou corrigido/aplicado.
    if (body.extracted && typeof body.extracted === "object") {
      try {
        const safe = (value: unknown) => JSON.stringify(value ?? {}).slice(0, 200_000);
        await prisma.importacaoIaExemplo.create({
          data: {
            fileName: String(body.fileName || "documento").slice(0, 255),
            fileType: String(body.fileType || "unknown").slice(0, 20),
            documentKind: body.documentKind ? String(body.documentKind).slice(0, 64) : null,
            extractedJson: safe(body.extracted),
            correctedJson: safe(body.corrected ?? {}),
            jangadaId: id,
            shipId: appliedShipId,
            createdBy: access.email || String(access.userId),
          },
        });
      } catch (error) {
        console.error("[importar-documento] falha ao guardar exemplo de treino:", error);
      }
    }

    return NextResponse.json({ ok: true, appliedFields, artigosAplicados });
  } catch (error) {
    console.error("[POST /api/jangadas/[id]/importar-documento]", error);
    return NextResponse.json({ error: "Erro ao aplicar os dados do documento." }, { status: 500 });
  }
}
