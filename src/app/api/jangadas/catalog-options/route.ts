import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { raftModelData } from "@/modules/rafts/raftModelData";
import { buildDatabaseErrorResponse } from "@/lib/database-errors";
import { canonicalizeRaftBrand, canonicalizeRaftModel } from "@/lib/text-normalization";

type CatalogSource = "catalogo" | "departamentoTecnico" | "baseDados";

type CatalogOption = {
  marca: string;
  modelo: string;
  fabricante: string;
  source: CatalogSource;
};

function isMissingCatalogTableError(error: unknown): boolean {
  const err = error as { code?: string; meta?: { code?: string }; message?: string } | null;
  const sqlCode = err?.meta?.code || err?.code;
  const msg = String(err?.message || "").toLowerCase();

  return (
    sqlCode === "42P01" ||
    (msg.includes('relation "catalogmarcamodelo" does not exist') ||
      (msg.includes("catalogmarcamodelo") && msg.includes("does not exist")))
  );
}

function normalizeCatalogPair(brand: unknown, model: unknown): { marca: string; modelo: string } | null {
  const marca = canonicalizeRaftBrand(brand);
  const modelo = canonicalizeRaftModel(model, marca);

  if (!marca || !modelo) return null;
  return { marca, modelo };
}

function normalizeFabricante(value: unknown, fallbackBrand: string): string {
  const normalized = canonicalizeRaftBrand(value);
  return normalized || fallbackBrand;
}

function pushUniqueOption(
  target: Map<string, CatalogOption>,
  source: CatalogSource,
  brand: unknown,
  model: unknown,
  fabricante?: unknown
) {
  const normalized = normalizeCatalogPair(brand, model);
  if (!normalized) return;

  const key = `${normalized.marca}::${normalized.modelo}`;
  if (target.has(key)) return;

  target.set(key, {
    marca: normalized.marca,
    modelo: normalized.modelo,
    fabricante: normalizeFabricante(fabricante, normalized.marca),
    source,
  });
}

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const optionsMap = new Map<string, CatalogOption>();

    for (const [brand, models] of Object.entries(raftModelData)) {
      for (const model of models || []) {
        pushUniqueOption(optionsMap, "departamentoTecnico", brand, model?.name);
      }
    }

    const loadCatalogRows = async (): Promise<Array<{ marca: string | null; modelo: string | null; fabricante: string | null }>> => {
      try {
        return await prisma.$queryRaw<Array<{ marca: string | null; modelo: string | null; fabricante: string | null }>>`
          SELECT "marca", "modelo", COALESCE("fabricante", "marca") as "fabricante"
          FROM "CatalogMarcaModelo"
          WHERE "tipo" = 'JANGADA'
        `;
      } catch (error) {
        if (isMissingCatalogTableError(error)) {
          return [];
        }

        const err = error as { code?: string; message?: string } | null;
        const sqlCode = err?.code;
        const message = String(err?.message || '').toLowerCase();
        const missingFabricanteColumn = sqlCode === '42703' || message.includes('fabricante');

        if (!missingFabricanteColumn) {
          throw error;
        }

        return prisma
          .$queryRaw<Array<{ marca: string | null; modelo: string | null }>>`
            SELECT "marca", "modelo"
            FROM "CatalogMarcaModelo"
            WHERE "tipo" = 'JANGADA'
          `
          .then((rows) => rows.map((row) => ({ ...row, fabricante: row.marca || null })))
          .catch((fallbackError) => {
            if (isMissingCatalogTableError(fallbackError)) {
              return [] as Array<{ marca: string | null; modelo: string | null; fabricante: string | null }>;
            }
            throw fallbackError;
          });
      }
    };

    const catalogRowsPromise = loadCatalogRows();

    const [catalogRows, dbRows] = await Promise.all([
      catalogRowsPromise,
      prisma.jangada.findMany({
        where: access.isAdmin
          ? undefined
          : {
              serviceStationId: access.allowedStationIds.length ? { in: access.allowedStationIds } : -1,
            },
        select: { brand: true, model: true },
      }),
    ]);

    for (const row of catalogRows) {
      pushUniqueOption(optionsMap, "catalogo", row?.marca, row?.modelo, row?.fabricante);
    }

    for (const row of dbRows) {
      pushUniqueOption(optionsMap, "baseDados", row.brand, row.model, row.brand);
    }

    const options = Array.from(optionsMap.values()).sort((a, b) => {
      const brandOrder = a.marca.localeCompare(b.marca, "pt-PT");
      if (brandOrder !== 0) return brandOrder;
      return a.modelo.localeCompare(b.modelo, "pt-PT");
    });

    const response = NextResponse.json({
      options,
      sources: {
        catalogo: catalogRows.length,
        departamentoTecnico: Object.values(raftModelData).reduce((acc, models) => acc + (models?.length || 0), 0),
        baseDados: dbRows.length,
      },
    });
    response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao carregar opções de catálogo de jangadas.";
    return buildDatabaseErrorResponse(error, message);
  }
}
