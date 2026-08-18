import prisma from "@/lib/prisma";
import {
  buildMandatoryPackItemsFromCustomArticles,
  getMandatoryPackItemsForRaft,
  type CustomMandatoryPackArticleInput,
  type MandatoryPackItem,
} from "@/modules/rafts/mandatoryPack";
import { getRecognizedPackTypeOptions, isRaftManagedPackArticleName, normalizarPackType, PACK_TEMPLATES } from "@/config/packTemplates";

function getCustomPackTypeModel() {
  return prisma.customPackType;
}

function hasCustomPackTypeModel() {
  const model = getCustomPackTypeModel();
  return Boolean(model && typeof model.findMany === "function");
}

function isCustomPackStorageUnavailableError(error: unknown) {
  const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  return (
    prismaCode === "P2021"
    || normalized.includes("cannot read properties of undefined")
    || normalized.includes("findmany")
    || normalized.includes("findfirst")
    || normalized.includes("findunique")
    || normalized.includes("custompacktype")
    || normalized.includes("table") && normalized.includes("does not exist")
    || normalized.includes("relation") && normalized.includes("does not exist")
  );
}

function ensureCustomPackStorageAvailable() {
  if (!hasCustomPackTypeModel()) {
    throw new Error("Os packs personalizados ainda não estão disponíveis no servidor. Reinicia a aplicação e confirma a migração da base de dados.");
  }
}

export type CustomPackTypeListItem = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  itemCount: number;
  items: Array<{
    id: number;
    stockId: number | null;
    stockReference: string;
    stockDescription: string;
    stockCategory: string | null;
    quantity: number;
  }>;
};

export type CustomPackUpsertInput = {
  name: string;
  description?: string | null;
  isActive?: boolean;
  items: Array<{
    stockId?: number | null;
    stockReference: string;
    stockDescription: string;
    stockCategory?: string | null;
    quantity: number;
  }>;
};

function normalizePackName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isCanonicalPackName(value: unknown) {
  const name = normalizePackName(value);
  if (!name) return false;

  const exactReserved = new Set(
    getRecognizedPackTypeOptions(Object.keys(PACK_TEMPLATES)).map((item) => item.toUpperCase())
  );

  return exactReserved.has(name.toUpperCase()) || normalizarPackType(name) !== null;
}

export function isReservedPackName() {
  return false;
}

export function normalizeCustomPackItems(items: CustomPackUpsertInput["items"]) {
  const deduped = new Map<string, CustomPackUpsertInput["items"][number]>();

  for (const rawItem of items || []) {
    const stockReference = String(rawItem?.stockReference || "").replace(/\s+/g, " ").trim();
    const stockDescription = String(rawItem?.stockDescription || "").replace(/\s+/g, " ").trim();
    const quantity = Math.max(1, Math.trunc(Number(rawItem?.quantity || 0)) || 0);
    if (!stockReference || !stockDescription || quantity <= 0) continue;
    if (isRaftManagedPackArticleName(stockDescription)) continue;

    deduped.set(stockReference.toUpperCase(), {
      stockId: rawItem?.stockId == null ? null : Number(rawItem.stockId),
      stockReference,
      stockDescription,
      stockCategory: rawItem?.stockCategory ? String(rawItem.stockCategory).trim() : null,
      quantity,
    });
  }

  return Array.from(deduped.values());
}

type CustomPackRow = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  items: Array<{
    id: number;
    stockId: number | null;
    stockReference: string;
    stockDescription: string;
    stockCategory: string | null;
    quantity: number;
  }>;
};

function serializeCustomPack(pack: CustomPackRow): CustomPackTypeListItem {
  const filteredItems = Array.isArray(pack.items)
    ? pack.items.filter((item) => !isRaftManagedPackArticleName(item?.stockDescription))
    : [];

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description ?? null,
    isActive: Boolean(pack.isActive),
    createdAt: pack.createdAt instanceof Date ? pack.createdAt.toISOString() : String(pack.createdAt),
    updatedAt: pack.updatedAt instanceof Date ? pack.updatedAt.toISOString() : String(pack.updatedAt),
    createdByUserId: pack.createdByUserId ?? null,
    updatedByUserId: pack.updatedByUserId ?? null,
    itemCount: filteredItems.length,
    items: filteredItems.map((item) => ({
      id: item.id,
      stockId: item.stockId ?? null,
      stockReference: item.stockReference,
      stockDescription: item.stockDescription,
      stockCategory: item.stockCategory ?? null,
      quantity: item.quantity,
    })),
  };
}

export async function listCustomPackTypes(options?: { includeInactive?: boolean }): Promise<CustomPackTypeListItem[]> {
  if (!hasCustomPackTypeModel()) return [];

  try {
    const rows = await getCustomPackTypeModel().findMany({
      where: options?.includeInactive ? undefined : { isActive: true },
      include: {
        items: {
          orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }],
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return rows.map(serializeCustomPack);
  } catch (error) {
    if (isCustomPackStorageUnavailableError(error)) return [];
    throw error;
  }
}

export async function findCustomPackTypeById(id: number) {
  if (!hasCustomPackTypeModel()) return null;

  try {
    const row = await getCustomPackTypeModel().findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }],
        },
      },
    });

    return row ? serializeCustomPack(row) : null;
  } catch (error) {
    if (isCustomPackStorageUnavailableError(error)) return null;
    throw error;
  }
}

export async function findCustomPackTypeByName(name: string, options?: { includeInactive?: boolean }) {
  const normalizedName = normalizePackName(name);
  if (!normalizedName) return null;
  if (!hasCustomPackTypeModel()) return null;

  try {
    const row = await getCustomPackTypeModel().findFirst({
      where: {
        name: { equals: normalizedName, mode: "insensitive" },
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: {
        items: {
          orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }],
        },
      },
    });

    return row ? serializeCustomPack(row as any) : null;
  } catch (error) {
    if (isCustomPackStorageUnavailableError(error)) return null;
    throw error;
  }
}

export async function upsertCustomPackType(options: {
  id?: number;
  data: CustomPackUpsertInput;
  userId?: number | null;
}) {
  ensureCustomPackStorageAvailable();
  const name = normalizePackName(options.data.name);
  const description = String(options.data.description || "").trim() || null;
  const items = normalizeCustomPackItems(options.data.items || []);

  if (!name) {
    throw new Error("Indique um nome para o pack.");
  }
  if (!items.length) {
    throw new Error("Adicione pelo menos um artigo ao pack.");
  }

  const duplicate = await getCustomPackTypeModel().findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(options.id ? { NOT: { id: options.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new Error("Já existe um pack personalizado com esse nome.");
  }

  const payload = {
    name,
    description,
    isActive: options.data.isActive !== false,
    updatedByUserId: options.userId ?? null,
  };

  try {
    const row = options.id
      ? await getCustomPackTypeModel().update({
        where: { id: options.id },
        data: {
          ...payload,
          items: {
            deleteMany: {},
            create: items,
          },
        },
        include: { items: { orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }] } },
      })
      : await getCustomPackTypeModel().create({
        data: {
          ...payload,
          createdByUserId: options.userId ?? null,
          items: {
            create: items,
          },
        },
        include: { items: { orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }] } },
      });

    return serializeCustomPack(row);
  } catch (error) {
    if (isCustomPackStorageUnavailableError(error)) {
      throw new Error("Os packs personalizados ainda não estão disponíveis na base de dados. Resolve a migração pendente e reinicia a aplicação.");
    }
    throw error;
  }
}

export async function deactivateCustomPackType(id: number, userId?: number | null) {
  ensureCustomPackStorageAvailable();

  try {
    const row = await getCustomPackTypeModel().update({
      where: { id },
      data: {
        isActive: false,
        updatedByUserId: userId ?? null,
      },
      include: { items: { orderBy: [{ stockDescription: "asc" }, { stockReference: "asc" }] } },
    });

    return serializeCustomPack(row);
  } catch (error) {
    if (isCustomPackStorageUnavailableError(error)) {
      throw new Error("Os packs personalizados ainda não estão disponíveis na base de dados. Resolve a migração pendente e reinicia a aplicação.");
    }
    throw error;
  }
}

export function buildCustomPackMandatoryItems(pack: CustomPackTypeListItem, capacity?: number | null): MandatoryPackItem[] {
  const items: CustomMandatoryPackArticleInput[] = pack.items.map((item) => ({
    name: item.stockDescription,
    quantity: item.quantity,
    reference: item.stockReference,
    category: item.stockCategory,
  }));

  return buildMandatoryPackItemsFromCustomArticles({
    packCode: pack.name,
    capacity,
    items,
  });
}

export async function resolveMandatoryPackItemsForRaftAsync(context: {
  brand?: string | null;
  model?: string | null;
  packType?: string | null;
  capacity?: number | null;
}) {
  const packType = normalizePackName(context.packType);
  if (packType) {
    const customPack = await findCustomPackTypeByName(packType, { includeInactive: true });
    if (customPack) {
      return {
        source: "custom" as const,
        customPack,
        items: buildCustomPackMandatoryItems(customPack, context.capacity),
      };
    }
  }

  return {
    source: "built-in" as const,
    customPack: null,
    items: getMandatoryPackItemsForRaft(context),
  };
}

export async function listAvailablePackTypeOptions() {
  const customPacks = await listCustomPackTypes({ includeInactive: false });
  return getRecognizedPackTypeOptions([
    ...Object.keys(PACK_TEMPLATES),
    ...customPacks.map((pack: CustomPackTypeListItem) => pack.name),
  ]);
}

export async function isKnownPackTypeName(packType: string, options?: { includeInactiveCustom?: boolean }) {
  const normalized = normalizePackName(packType);
  if (!normalized) return true;
  if (normalized === 'Sem pack') return true;
  if (normalizarPackType(normalized) !== null) return true;
  const customPack = await findCustomPackTypeByName(normalized, { includeInactive: options?.includeInactiveCustom === true });
  return Boolean(customPack);
}