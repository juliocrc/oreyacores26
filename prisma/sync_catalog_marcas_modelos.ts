import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { lifejacketModelData } from '../src/modules/lifejackets/lifejacketModelData';
import { raftModelData } from '../src/modules/rafts/raftModelData';

const prisma = new PrismaClient();
const XLS_PATH = process.env.CATALOGO_XLS_PATH || 'Marcas de jangadas.xls';

function normalizeKey(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function canonicalizeBrand(value: string | null | undefined): string {
  const upper = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const compact = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  if (compact === 'EURIVINIL') return 'EUROVINIL';
  if (compact === 'SEASAFE') return 'SEA-SAFE';

  return upper;
}

function canonicalizeModel(
  value: string | null | undefined,
  brand: string,
  tipo: CatalogTipoEquipamento
): string {
  const upper = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const signature = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
  const rfdSignature = signature.replace(/^RFD/, '');
  if (!signature) return upper;

  if (tipo === 'JANGADA' && brand.includes('RFD')) {
    if (rfdSignature.includes('SURVIVA') && (rfdSignature.includes('MKI') || rfdSignature.includes('MK1'))) return 'SURVIVA MKIV TO';
    if (rfdSignature.includes('SURVIVA') && (rfdSignature.includes('MKII') || rfdSignature.includes('MK2'))) return 'SURVIVA MKII';
    if (rfdSignature.includes('SURVIVA') && (rfdSignature.includes('MKIII') || rfdSignature.includes('MK3'))) return 'SURVIVA MKIII';
    if (rfdSignature.includes('SURVIVA') && (rfdSignature.includes('MKIV') || rfdSignature.includes('MK4'))) return 'SURVIVA MKIV';

    if (rfdSignature === 'MKI' || rfdSignature === 'MK1') return 'SURVIVA MKIV TO';
    if (rfdSignature === 'MKII' || rfdSignature === 'MK2') return 'SURVIVA MKII';
    if (rfdSignature === 'MKIII' || rfdSignature === 'MK3') return 'SURVIVA MKIII';
    if (rfdSignature === 'MKIV' || rfdSignature === 'MK4') return 'SURVIVA MKIV';
  }

  return upper;
}

type CatalogItem = {
  tipo: CatalogTipoEquipamento;
  marca: string;
  modelo: string;
  origem?: string | null;
  fabricante?: string | null;
};

type CatalogTipoEquipamento = 'COLETE' | 'JANGADA' | 'FATO_IMERSAO';

function cleanValue(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value: unknown): string {
  return normalizeKey(String(value || '')).replace(/[^A-Z0-9]+/g, '');
}

function inferTipoFromSheetName(sheetName: string): CatalogTipoEquipamento | null {
  const n = normalizeHeader(sheetName);
  if (n.includes('COLETE')) return 'COLETE';
  if (n.includes('JANGADA')) return 'JANGADA';
  if (n.includes('FATO') || n.includes('IMERSAO')) return 'FATO_IMERSAO';
  return null;
}

function findHeaderRow(rows: unknown[][]): { headerIndex: number; headers: string[] } | null {
  const maxScan = Math.min(rows.length, 40);
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const headers = row.map((cell) => normalizeHeader(cell));
    const hasModelo = headers.some((h) => h.includes('MODELO') || h.includes('MODEL'));
    const hasMarcaOrFabricante = headers.some(
      (h) => h.includes('MARCA') || h.includes('BRAND') || h.includes('FABRICANTE') || h.includes('MANUFACTURER')
    );
    if (hasModelo && hasMarcaOrFabricante) {
      return { headerIndex: i, headers };
    }
  }
  return null;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (candidates.some((c) => h.includes(c))) return i;
  }
  return -1;
}

function parseSheetRows(sheetName: string, rows: unknown[][]): CatalogItem[] {
  const inferredTipo = inferTipoFromSheetName(sheetName);
  if (!inferredTipo) return [];

  const header = findHeaderRow(rows);
  if (!header) return [];

  const { headerIndex, headers } = header;
  const tipoIdx = findColumnIndex(headers, ['TIPO', 'EQUIPAMENTO', 'EQUIPMENT']);
  const marcaIdx = findColumnIndex(headers, ['MARCA', 'BRAND']);
  const fabricanteIdx = findColumnIndex(headers, ['FABRICANTE', 'MANUFACTURER']);
  const modeloIdx = findColumnIndex(headers, ['MODELO', 'MODEL']);
  const origemIdx = findColumnIndex(headers, ['PAIS', 'ORIGEM', 'COUNTRY', 'ORIGIN']);

  if (modeloIdx < 0 || (marcaIdx < 0 && fabricanteIdx < 0)) return [];

  const parsed: CatalogItem[] = [];

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const explicitTipo = cleanValue(tipoIdx >= 0 ? row[tipoIdx] : '');

    const tipo = (() => {
      const t = normalizeHeader(explicitTipo);
      if (t.includes('COLETE')) return 'COLETE';
      if (t.includes('JANGADA')) return 'JANGADA';
      return inferredTipo;
    })();

    const marca = cleanValue(marcaIdx >= 0 ? row[marcaIdx] : '');
    const fabricanteRaw = cleanValue(fabricanteIdx >= 0 ? row[fabricanteIdx] : '');
    const modelo = cleanValue(modeloIdx >= 0 ? row[modeloIdx] : '');
    const origem = cleanValue(origemIdx >= 0 ? row[origemIdx] : '');

    const normalizedMarca = marca || fabricanteRaw;
    const fabricante = fabricanteRaw || normalizedMarca;

    if (!normalizedMarca || !modelo) continue;

    parsed.push({
      tipo,
      marca: normalizedMarca,
      modelo,
      fabricante: fabricante || null,
      origem: origem || `xls.${sheetName}`,
    });
  }

  return parsed;
}

function uniqueCatalogItems(items: CatalogItem[]): CatalogItem[] {
  const byKey = new Map<string, CatalogItem>();
  for (const item of items) {
    const marca = canonicalizeBrand(cleanValue(item.marca));
    const modelo = canonicalizeModel(cleanValue(item.modelo), marca, item.tipo);
    const fabricante = canonicalizeBrand(cleanValue(item.fabricante || '')) || marca;
    const origem = cleanValue(item.origem || '');
    const marcaKey = normalizeKey(marca);
    const modeloKey = normalizeKey(modelo);
    if (!marcaKey || !modeloKey) continue;

    const key = `${item.tipo}::${marcaKey}::${modeloKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...item,
        marca,
        modelo,
        fabricante,
        origem: origem || null,
      });
      continue;
    }

    byKey.set(key, {
      ...existing,
      marca: existing.marca || marca,
      modelo: existing.modelo || modelo,
      fabricante: cleanValue(existing.fabricante || '') || fabricante,
      origem: cleanValue(existing.origem || '') || origem || null,
    });
  }
  return Array.from(byKey.values());
}

async function loadFromDatabase(): Promise<CatalogItem[]> {
  const [coletes, jangadas] = await Promise.all([
    prisma.colete.findMany({ select: { marca: true, modelo: true } }),
    prisma.jangada.findMany({ select: { brand: true, model: true } }),
  ]);

  const coleteItems: CatalogItem[] = coletes
    .filter((row) => String(row.marca || '').trim() && String(row.modelo || '').trim())
    .map((row) => ({
      tipo: 'COLETE',
      marca: String(row.marca || '').trim(),
      modelo: String(row.modelo || '').trim(),
      fabricante: String(row.marca || '').trim(),
      origem: 'db.coletes',
    }));

  const jangadaItems: CatalogItem[] = jangadas
    .filter((row) => String(row.brand || '').trim() && String(row.model || '').trim())
    .map((row) => ({
      tipo: 'JANGADA',
      marca: String(row.brand || '').trim(),
      modelo: String(row.model || '').trim(),
      fabricante: String(row.brand || '').trim(),
      origem: 'db.jangadas',
    }));

  return [...coleteItems, ...jangadaItems];
}

function loadFromTechnicalCatalogs(): CatalogItem[] {
  const coleteItems: CatalogItem[] = lifejacketModelData.flatMap((brand) =>
    (brand.models || []).map((model) => ({
      tipo: 'COLETE',
      marca: brand.brand,
      modelo: model.model,
      fabricante: brand.brand,
      origem: 'catalog.lifejacketModelData',
    }))
  );

  const jangadaItems: CatalogItem[] = Object.entries(raftModelData).flatMap(([brand, models]) =>
    (models || []).map((model) => ({
      tipo: 'JANGADA',
      marca: brand,
      modelo: model.name,
      fabricante: brand,
      origem: 'catalog.raftModelData',
    }))
  );

  return [...coleteItems, ...jangadaItems];
}

function loadFromWorkbook(): CatalogItem[] {
  const absolute = path.isAbsolute(XLS_PATH) ? XLS_PATH : path.join(process.cwd(), XLS_PATH);
  if (!fs.existsSync(absolute)) {
    console.warn(`⚠️ XLS não encontrado em: ${absolute}`);
    return [];
  }

  const workbook = XLSX.readFile(absolute, { raw: false });
  const allItems: CatalogItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false }) as unknown[][];
    const parsed = parseSheetRows(sheetName, rows);
    if (parsed.length) {
      allItems.push(...parsed);
    }
  }

  return allItems;
}

async function ensureCatalogStructure() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'CatalogTipoEquipamento'
      ) THEN
        CREATE TYPE "CatalogTipoEquipamento" AS ENUM ('COLETE', 'JANGADA', 'FATO_IMERSAO');
      ELSE
        BEGIN
          ALTER TYPE "CatalogTipoEquipamento" ADD VALUE IF NOT EXISTS 'FATO_IMERSAO';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CatalogMarcaModelo" (
      "id" SERIAL PRIMARY KEY,
      "tipo" "CatalogTipoEquipamento" NOT NULL,
      "marca" TEXT NOT NULL,
      "modelo" TEXT NOT NULL,
      "marcaKey" TEXT NOT NULL,
      "modeloKey" TEXT NOT NULL,
      "origem" TEXT NULL,
      "fabricante" TEXT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_marcaKey_modeloKey_key"
    ON "CatalogMarcaModelo" ("tipo", "marcaKey", "modeloKey");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_marca_idx"
    ON "CatalogMarcaModelo" ("tipo", "marca");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CatalogMarcaModelo_tipo_modelo_idx"
    ON "CatalogMarcaModelo" ("tipo", "modelo");
  `);

  await prisma.$executeRawUnsafe(`ALTER TABLE "CatalogMarcaModelo" ADD COLUMN IF NOT EXISTS "origem" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "CatalogMarcaModelo" ADD COLUMN IF NOT EXISTS "fabricante" TEXT`);
}

async function run() {
  await ensureCatalogStructure();

  const workbookItems = loadFromWorkbook();
  const allItems = uniqueCatalogItems([
    ...workbookItems,
    ...loadFromTechnicalCatalogs(),
    ...(await loadFromDatabase()),
  ]);

  let upserted = 0;
  for (const item of allItems) {
    const marcaKey = normalizeKey(item.marca);
    const modeloKey = normalizeKey(item.modelo);

    if (!marcaKey || !modeloKey) continue;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "CatalogMarcaModelo" ("tipo", "marca", "modelo", "marcaKey", "modeloKey", "fabricante", "origem", "createdAt", "updatedAt")
      VALUES ($1::"CatalogTipoEquipamento", $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT ("tipo", "marcaKey", "modeloKey")
      DO UPDATE SET
        "marca" = EXCLUDED."marca",
        "modelo" = EXCLUDED."modelo",
        "fabricante" = COALESCE(EXCLUDED."fabricante", "CatalogMarcaModelo"."fabricante"),
        "origem" = COALESCE(EXCLUDED."origem", "CatalogMarcaModelo"."origem"),
        "updatedAt" = NOW()
      `,
      item.tipo,
      item.marca,
      item.modelo,
      marcaKey,
      modeloKey,
      item.fabricante || null,
      item.origem || null
    );
    upserted += 1;
  }

  const totals = await prisma.$queryRawUnsafe<Array<{ tipo: CatalogTipoEquipamento; total: number }>>(`
    SELECT "tipo", COUNT(*)::int as "total"
    FROM "CatalogMarcaModelo"
    GROUP BY "tipo"
    ORDER BY "tipo"
  `);

  console.log('✅ Sincronização concluída.');
  console.log(`Itens importados do XLS: ${workbookItems.length}`);
  console.log(`Upserts executados: ${upserted}`);
  for (const row of totals) {
    console.log(`- ${row.tipo}: ${row.total}`);
  }
}

run()
  .catch((error) => {
    console.error('❌ Erro ao sincronizar catálogo:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
