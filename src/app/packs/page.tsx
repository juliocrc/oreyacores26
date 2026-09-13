"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import React, { useEffect, useMemo, useState } from "react";
import {
  type CustomPack,
  type PackDraft,
  type PackItemDraft,
  type ResolvedPackItem,
  type StockCreatePayload,
  type StockRow,
  type StockSuggestion,
  EMPTY_DRAFT,
} from "@/types/packs-page";
import {
  matchesPathPrefix,
  normalizeText,
  normalizeReference,
  tokenizeSearchText,
  serializePackToDraft,
} from "@/lib/packs-page-helpers";

export default function PacksPage() {
  const { data: session, status } = useSession();
  const userRole = session?.user?.role === "ADMIN" ? "ADMIN" : "USER";
  const visiblePages = Array.isArray(session?.user?.permissions?.visiblePages)
    ? session?.user?.permissions?.visiblePages.map((item) => String(item))
    : [];
  const editablePages = Array.isArray(session?.user?.permissions?.editablePages)
    ? session?.user?.permissions?.editablePages.map((item) => String(item))
    : [];

  const canViewPacks = userRole === "ADMIN"
    || visiblePages.some((prefix) => matchesPathPrefix("/packs", prefix))
    || editablePages.some((prefix) => matchesPathPrefix("/packs", prefix));
  const canEditPacks = userRole === "ADMIN"
    || editablePages.some((prefix) => matchesPathPrefix("/packs", prefix));

  const [packs, setPacks] = useState<CustomPack[]>([]);
  const [availablePackOptions, setAvailablePackOptions] = useState<string[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [draft, setDraft] = useState<PackDraft>(EMPTY_DRAFT);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [stockSearch, setStockSearch] = useState("");
  const [packSearch, setPackSearch] = useState("");

  const filteredPacks = useMemo(() => {
    const query = normalizeText(packSearch);
    if (!query) return packs;
    return packs.filter((pack) => {
      const haystack = normalizeText(`${pack.name} ${pack.description || ""} ${pack.items.map((item) => item.stockDescription).join(" ")}`);
      return haystack.includes(query);
    });
  }, [packSearch, packs]);

  const canonicalOverridesByName = useMemo(() => {
    return new Map(packs.map((pack) => [normalizeText(pack.name), pack]));
  }, [packs]);

  const filteredCustomOnlyPacks = useMemo(() => {
    const canonicalOptionSet = new Set(availablePackOptions.map((pack) => normalizeText(pack)));
    return filteredPacks.filter((pack) => !canonicalOptionSet.has(normalizeText(pack.name)));
  }, [availablePackOptions, filteredPacks]);

  const filteredBuiltinPackOptions = useMemo(() => {
    const query = normalizeText(packSearch);

    return availablePackOptions.filter((packName) => {
      const normalizedPackName = normalizeText(packName);
      if (!normalizedPackName) return false;
      if (!query) return true;
      return normalizedPackName.includes(query);
    });
  }, [availablePackOptions, packSearch]);

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) || null,
    [packs, selectedPackId]
  );

  const saveButtonLabel = saving
    ? "A guardar…"
    : draft.id
      ? "Gravar alterações"
      : "Criar pack";

  const filteredStockRows = useMemo(() => {
    const query = normalizeText(stockSearch);
    const selectedRefs = new Set(draft.items.map((item) => item.stockReference.toUpperCase()));
    const rows = query
      ? stockRows.filter((row) => {
          const haystack = normalizeText(`${row.referencia} ${row.descricao} ${row.categoria || ""} ${row.codigoFabricante || ""}`);
          return haystack.includes(query);
        })
      : stockRows;

    return rows
      .filter((row) => !selectedRefs.has(String(row.referencia || "").trim().toUpperCase()))
      .slice(0, 60);
  }, [draft.items, stockRows, stockSearch]);

  const stockLookupByReference = useMemo(() => {
    const lookup = new Map<string, StockRow>();
    for (const row of stockRows) {
      const referenceKey = normalizeReference(row.referencia);
      if (referenceKey && !lookup.has(referenceKey)) {
        lookup.set(referenceKey, row);
      }
    }
    return lookup;
  }, [stockRows]);

  const stockLookupByManufacturerCode = useMemo(() => {
    const lookup = new Map<string, StockRow>();
    for (const row of stockRows) {
      const manufacturerKey = normalizeReference(row.codigoFabricante || "");
      if (manufacturerKey && !lookup.has(manufacturerKey)) {
        lookup.set(manufacturerKey, row);
      }
    }
    return lookup;
  }, [stockRows]);

  const resolveStockLink = (reference: string) => {
    const normalizedReference = normalizeReference(reference);
    if (!normalizedReference) return null;

    return stockLookupByReference.get(normalizedReference)
      || stockLookupByManufacturerCode.get(normalizedReference)
      || null;
  };

  const autoLinkDraftItems = (items: PackItemDraft[]) => {
    let changed = false;

    const nextItems = items.map((item) => {
      const linkedStock = resolveStockLink(item.stockReference);
      if (!linkedStock) return item;

      const nextItem: PackItemDraft = {
        ...item,
        stockId: linkedStock.id,
        stockReference: String(linkedStock.referencia || item.stockReference || "").trim(),
        stockDescription: String(linkedStock.descricao || item.stockDescription || "").trim(),
        stockCategory: linkedStock.categoria ? String(linkedStock.categoria).trim() : item.stockCategory,
      };

      if (
        nextItem.stockId !== item.stockId
        || nextItem.stockReference !== item.stockReference
        || nextItem.stockDescription !== item.stockDescription
        || nextItem.stockCategory !== item.stockCategory
      ) {
        changed = true;
        return nextItem;
      }

      return item;
    });

    return changed ? nextItems : items;
  };

  const suggestStockMatches = (item: PackItemDraft): StockSuggestion[] => {
    const referenceKey = normalizeReference(item.stockReference);
    const descriptionKey = normalizeText(item.stockDescription);
    const categoryKey = normalizeText(item.stockCategory || "");
    const descriptionTokens = tokenizeSearchText(item.stockDescription);

    return stockRows
      .map((row) => {
        const rowReference = normalizeReference(row.referencia);
        const rowManufacturer = normalizeReference(row.codigoFabricante || "");
        const rowDescription = normalizeText(row.descricao);
        const rowCategory = normalizeText(row.categoria || "");
        const rowBlob = `${rowReference} ${rowManufacturer} ${rowDescription} ${rowCategory}`;

        let score = 0;
        const reasons: string[] = [];

        if (referenceKey) {
          if (rowReference.includes(referenceKey) || rowManufacturer.includes(referenceKey)) {
            score += 90;
            reasons.push("referência semelhante");
          } else if ((rowReference && referenceKey.includes(rowReference)) || (rowManufacturer && referenceKey.includes(rowManufacturer))) {
            score += 70;
            reasons.push("código parcialmente coincidente");
          }
        }

        if (descriptionKey) {
          if (rowDescription === descriptionKey) {
            score += 80;
            reasons.push("descrição exata");
          } else if (rowDescription.includes(descriptionKey) || descriptionKey.includes(rowDescription)) {
            score += 50;
            reasons.push("descrição muito próxima");
          }
        }

        const matchingTokens = descriptionTokens.filter((token) => rowBlob.includes(token));
        if (matchingTokens.length > 0) {
          score += matchingTokens.length * 12;
          reasons.push(`${matchingTokens.length} termo${matchingTokens.length === 1 ? "" : "s"} em comum`);
        }

        if (categoryKey && rowCategory && categoryKey === rowCategory) {
          score += 10;
          reasons.push("mesma categoria");
        }

        if (score < 30) return null;

        return {
          stock: row,
          score,
          reason: reasons.join(" · "),
        };
      })
      .filter((suggestion): suggestion is StockSuggestion => Boolean(suggestion))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return String(left.stock.descricao || "").localeCompare(String(right.stock.descricao || ""), "pt-PT");
      })
      .slice(0, 3);
  };

  const draftItemSuggestions = useMemo(
    () => draft.items.map((item) => item.stockId ? [] : suggestStockMatches(item)),
    [draft.items, stockRows]
  );

  const unresolvedDraftItemsCount = useMemo(
    () => draft.items.filter((item) => !item.stockId).length,
    [draft.items]
  );

  const suggestedDraftItemsCount = useMemo(
    () => draft.items.reduce((count, item, index) => count + (!item.stockId && draftItemSuggestions[index]?.length ? 1 : 0), 0),
    [draft.items, draftItemSuggestions]
  );

  async function loadPacks(nextIncludeInactive = includeInactive) {
    if (!canViewPacks) return;
    setLoadingPacks(true);
    setError(null);
    try {
      const response = await fetch(`/api/pack-types?includeInactive=${nextIncludeInactive ? "true" : "false"}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível carregar os packs personalizados.");
      }

      const nextPacks = Array.isArray(payload?.packs) ? payload.packs : [];
      setWarning(typeof payload?.warning === "string" ? payload.warning : null);
      setPacks(nextPacks);

      if (draft.id) {
        const refreshed = nextPacks.find((pack: CustomPack) => pack.id === draft.id);
        if (refreshed) {
          const refreshedDraft = serializePackToDraft(refreshed);
          setDraft({
            ...refreshedDraft,
            canonicalSource: draft.canonicalSource,
            items: autoLinkDraftItems(refreshedDraft.items),
          });
          setSelectedPackId(refreshed.id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os packs personalizados.");
      setWarning(null);
      setPacks([]);
    } finally {
      setLoadingPacks(false);
    }
  }

  async function loadAvailablePackOptions() {
    if (!canViewPacks) return;
    try {
      const response = await fetch("/api/jangadas/pack-types", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível carregar os packs disponíveis nas jangadas.");
      }

      setAvailablePackOptions(
        Array.isArray(payload?.options)
          ? payload.options.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : []
      );
    } catch (err) {
      setAvailablePackOptions([]);
    }
  }

  async function loadStock() {
    if (!canEditPacks) return;
    setLoadingStock(true);
    try {
      const response = await fetch("/api/stock?take=5000", { cache: "no-store" });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error("Não foi possível carregar o catálogo de stock.");
      }
      setStockRows(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o catálogo de stock.");
      setStockRows([]);
    } finally {
      setLoadingStock(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated" || !canViewPacks) return;
    void loadPacks(includeInactive);
    void loadAvailablePackOptions();
  }, [status, canViewPacks, includeInactive]);

  useEffect(() => {
    if (status !== "authenticated" || !canEditPacks) return;
    void loadStock();
  }, [status, canEditPacks]);

  useEffect(() => {
    if (!stockRows.length) return;

    setDraft((current) => {
      const nextItems = autoLinkDraftItems(current.items);
      return nextItems === current.items ? current : { ...current, items: nextItems };
    });
  }, [draft.items, stockRows, stockLookupByManufacturerCode, stockLookupByReference]);

  const startNewPack = () => {
    setSelectedPackId(null);
    setDraft(EMPTY_DRAFT);
    setFeedback(null);
    setError(null);
  };

  const selectPack = (pack: CustomPack) => {
    setSelectedPackId(pack.id);
    setDraft((current) => {
      const nextDraft = serializePackToDraft(pack);
      const nextItems = autoLinkDraftItems(nextDraft.items);
      return {
        ...nextDraft,
        canonicalSource: current.canonicalSource && current.id === pack.id ? current.canonicalSource : false,
        items: nextItems,
      };
    });
    setFeedback(null);
    setError(null);
  };

  const selectCanonicalPack = async (packName: string) => {
    setFeedback(null);
    setError(null);

    const existingOverride = canonicalOverridesByName.get(normalizeText(packName));
    if (existingOverride) {
      setSelectedPackId(existingOverride.id);
      const existingDraft = serializePackToDraft(existingOverride);
      setDraft({
        ...existingDraft,
        canonicalSource: true,
        items: autoLinkDraftItems(existingDraft.items),
      });
      return;
    }

    try {
      const params = new URLSearchParams({ packType: packName });
      const response = await fetch(`/api/pack-types/resolve?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível carregar o pack canónico.");
      }

      const items = Array.isArray(payload?.items) ? payload.items as ResolvedPackItem[] : [];
      setSelectedPackId(null);
      const nextDraft: PackDraft = {
        id: null,
        name: packName,
        description: "Override de pack canónico.",
        isActive: true,
        canonicalSource: true,
        items: items.map((item, index) => ({
          stockId: null,
          stockReference: String(item.reference || `CANONICO-${index + 1}`),
          stockDescription: String(item.label || `Artigo ${index + 1}`),
          stockCategory: item.category ? String(item.category) : null,
          quantity: Math.max(1, Number(item.quantity || 1)),
        })),
      };
      setDraft({
        ...nextDraft,
        items: autoLinkDraftItems(nextDraft.items),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o pack canónico.");
    }
  };

  const addStockItem = (row: StockRow) => {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          stockId: row.id,
          stockReference: String(row.referencia || "").trim(),
          stockDescription: String(row.descricao || "").trim(),
          stockCategory: row.categoria ? String(row.categoria).trim() : null,
          quantity: 1,
        },
      ],
    }));
    setStockSearch("");
  };

  const updateDraftItem = (index: number, updates: Partial<PackItemDraft>) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    }));
  };

  const updateDraftItemReference = (index: number, nextReferenceInput: string) => {
    setDraft((current) => {
      const nextReference = String(nextReferenceInput || "").trim();
      const linkedStock = resolveStockLink(nextReference);

      return {
        ...current,
        items: current.items.map((item, itemIndex) => {
          if (itemIndex !== index) return item;

          if (linkedStock) {
            return {
              ...item,
              stockId: linkedStock.id,
              stockReference: String(linkedStock.referencia || nextReference).trim(),
              stockDescription: String(linkedStock.descricao || item.stockDescription || "").trim(),
              stockCategory: linkedStock.categoria ? String(linkedStock.categoria).trim() : null,
            };
          }

          return {
            ...item,
            stockId: null,
            stockReference: nextReference,
          };
        }),
      };
    });
  };

  const removeDraftItem = (index: number) => {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const linkSuggestedStock = (index: number, row: StockRow) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        return {
          ...item,
          stockId: row.id,
          stockReference: String(row.referencia || item.stockReference || "").trim(),
          stockDescription: String(row.descricao || item.stockDescription || "").trim(),
          stockCategory: row.categoria ? String(row.categoria).trim() : item.stockCategory,
        };
      }),
    }));
  };

  const linkAllSuggestedStock = () => {
    setDraft((current) => {
      let linkedCount = 0;

      const nextItems = current.items.map((item, index) => {
        if (item.stockId) return item;
        const bestSuggestion = draftItemSuggestions[index]?.[0];
        if (!bestSuggestion) return item;

        linkedCount += 1;
        return {
          ...item,
          stockId: bestSuggestion.stock.id,
          stockReference: String(bestSuggestion.stock.referencia || item.stockReference || "").trim(),
          stockDescription: String(bestSuggestion.stock.descricao || item.stockDescription || "").trim(),
          stockCategory: bestSuggestion.stock.categoria ? String(bestSuggestion.stock.categoria).trim() : item.stockCategory,
        };
      });

      if (linkedCount > 0) {
        setFeedback(`Ligação automática aplicada a ${linkedCount} artigo${linkedCount === 1 ? "" : "s"} com base nas melhores sugestões de stock.`);
        setError(null);
      }

      return linkedCount > 0 ? { ...current, items: nextItems } : current;
    });
  };

  const findStockByReference = async (reference: string) => {
    const normalizedReference = normalizeReference(reference);
    if (!normalizedReference) return null;

    const localMatch = resolveStockLink(normalizedReference);
    if (localMatch) return localMatch;

    const response = await fetch(`/api/stock?busca=${encodeURIComponent(normalizedReference)}&take=50`, { cache: "no-store" });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error("Não foi possível confirmar a referência no stock.");
    }

    const rows = Array.isArray(payload) ? payload as StockRow[] : [];
    return rows.find((row) => {
      const referenceKey = normalizeReference(row.referencia);
      const manufacturerKey = normalizeReference(row.codigoFabricante || "");
      return referenceKey === normalizedReference || manufacturerKey === normalizedReference;
    }) || null;
  };

  const createStockItemFromPackDraft = async (item: PackItemDraft) => {
    const payload: StockCreatePayload = {
      referencia: String(item.stockReference || "").trim(),
      descricao: String(item.stockDescription || "").trim() || "Artigo criado a partir do editor de packs",
      categoria: item.stockCategory,
      quantidade: 0,
      quantidadeMinima: null,
      associavelJangada: true,
    };

    const response = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const created = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(created?.error || `Não foi possível criar o artigo ${payload.referencia} no stock.`);
    }

    return created as StockRow;
  };

  const ensureDraftItemsExistInStock = async () => {
    const ensuredItems: PackItemDraft[] = [];
    let createdCount = 0;

    for (const item of draft.items) {
      if (item.stockId) {
        ensuredItems.push(item);
        continue;
      }

      const nextReference = String(item.stockReference || "").trim();
      if (!nextReference) {
        throw new Error("Todos os artigos do pack têm de ter uma referência antes de gravar.");
      }

      const existing = resolveStockLink(nextReference) || await findStockByReference(nextReference);
      if (existing) {
        ensuredItems.push({
          stockId: existing.id,
          stockReference: String(existing.referencia || nextReference).trim(),
          stockDescription: String(existing.descricao || item.stockDescription || "").trim(),
          stockCategory: existing.categoria ? String(existing.categoria).trim() : item.stockCategory,
          quantity: item.quantity,
        });
        continue;
      }

      const created = await createStockItemFromPackDraft(item);
      createdCount += 1;
      ensuredItems.push({
        stockId: created.id,
        stockReference: String(created.referencia || nextReference).trim(),
        stockDescription: String(created.descricao || item.stockDescription || "").trim(),
        stockCategory: created.categoria ? String(created.categoria).trim() : item.stockCategory,
        quantity: item.quantity,
      });
    }

    return { ensuredItems, createdCount };
  };

  const handleSave = async () => {
    if (!canEditPacks) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const { ensuredItems, createdCount } = await ensureDraftItemsExistInStock();

      const payload = {
        name: draft.name,
        description: draft.description,
        isActive: draft.isActive,
        items: ensuredItems.map((item) => ({
          stockId: item.stockId,
          stockReference: item.stockReference,
          stockDescription: item.stockDescription,
          stockCategory: item.stockCategory,
          quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
        })),
      };

      const response = await fetch(draft.id ? `/api/pack-types/${draft.id}` : "/api/pack-types", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(saved?.error || "Não foi possível guardar o pack.");
      }

      const normalized = saved as CustomPack;
      setFeedback(
        `${draft.id ? "Pack atualizado com sucesso." : "Pack criado com sucesso."}${createdCount > 0 ? ` ${createdCount} artigo${createdCount === 1 ? "" : "s"} criado${createdCount === 1 ? "" : "s"} automaticamente no stock.` : ""}`
      );
      setSelectedPackId(normalized.id);
      setDraft({
        ...serializePackToDraft(normalized),
        canonicalSource: draft.canonicalSource,
      });
      if (createdCount > 0) {
        await loadStock();
      }
      await loadPacks(includeInactive);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar o pack.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!canEditPacks || !draft.id) return;
    if (!window.confirm(`Desativar o pack "${draft.name}"?`)) return;

    setDeactivating(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(`/api/pack-types/${draft.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível desativar o pack.");
      }
      setFeedback("Pack desativado com sucesso.");
      await loadPacks(includeInactive);
      if (payload?.id) {
        setSelectedPackId(payload.id);
        setDraft(serializePackToDraft(payload as CustomPack));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar o pack.");
    } finally {
      setDeactivating(false);
    }
  };

  if (status === "loading") {
    return <div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-600">A carregar packs…</div>;
  }

  if (!canViewPacks) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Packs personalizados</h1>
          <p className="mt-3 text-sm text-slate-700">
            Esta área está reservada a administradores e utilizadores com acesso autorizado à página <code>/packs</code>.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/jangadas" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Voltar às jangadas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-r from-sky-900 via-blue-800 to-cyan-700 p-6 text-white shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-100">Configuração dinâmica</p>
              <h1 className="mt-2 text-3xl font-bold">Packs personalizados</h1>
              <p className="mt-2 max-w-3xl text-sm text-sky-100">
                Crie packs personalizados e edite packs canónicos através de overrides usando apenas artigos já existentes no catálogo/stock. Nada de artigos fantasmas — os piratas ficam para outra stack.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startNewPack}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                + Novo pack
              </button>
              <Link href="/jangadas" className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                Ver jangadas
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Biblioteca de packs</h2>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                />
                Mostrar inativos
              </label>
            </div>

            <input
              value={packSearch}
              onChange={(event) => setPackSearch(event.target.value)}
              placeholder="Pesquisar pack ou artigo"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {loadingPacks ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">A carregar packs…</div>
              ) : filteredCustomOnlyPacks.length === 0 && filteredBuiltinPackOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhum pack encontrado.
                </div>
              ) : (
                <>
                  {filteredCustomOnlyPacks.length > 0 ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Packs personalizados
                      </p>
                      {filteredCustomOnlyPacks.map((pack) => {
                        const active = pack.id === selectedPackId;
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => selectPack(pack)}
                            className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{pack.name}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pack.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                                    {pack.isActive ? "Ativo" : "Inativo"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-600">{pack.description || "Sem descrição."}</p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {pack.itemCount} artigo{pack.itemCount === 1 ? "" : "s"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {filteredBuiltinPackOptions.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Packs canónicos do dropdown das jangadas
                      </p>
                      {filteredBuiltinPackOptions.map((packName) => (
                        <div
                          key={packName}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{packName}</span>
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                  Canónico
                                </span>
                                {canonicalOverridesByName.has(normalizeText(packName)) ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    Override ativo
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                Disponível para seleção nas jangadas. Clique em editar para abrir este pack no editor e gravar um override.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void selectCanonicalPack(packName)}
                              className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {draft.id ? `Editar pack #${draft.id}` : "Novo pack"}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {draft.canonicalSource
                    ? "Está a editar um pack canónico através de um override persistido. A aplicação usará esta versão em vez do template base."
                    : "Este editor aceita artigos do catálogo real e também pode guardar overrides para packs canónicos."}
                </p>
              </div>
              {selectedPack ? (
                <div className="text-xs text-slate-500">
                  Atualizado em {new Date(selectedPack.updatedAt).toLocaleString("pt-PT")}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-sm text-blue-900">
                <span className="font-semibold">Terminou de editar?</span>{" "}
                Use este botão para gravar já as alterações do pack.
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEditPacks || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveButtonLabel}
              </button>
            </div>

            {feedback ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</div>
            ) : null}
            {warning ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Nome do pack
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  disabled={!canEditPacks}
                  placeholder="Ex.: Pack Orey Offshore Plus"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                  disabled={!canEditPacks}
                />
                Pack ativo para seleção nas jangadas
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Descrição
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                disabled={!canEditPacks}
                rows={3}
                placeholder="Breve nota operacional, âmbito, equivalências, etc."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Artigos do pack</h3>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        {draft.items.length} linha{draft.items.length === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                        {draft.items.length - unresolvedDraftItemsCount} ligado{draft.items.length - unresolvedDraftItemsCount === 1 ? "" : "s"}
                      </span>
                      <span className={`rounded-full px-3 py-1 ${unresolvedDraftItemsCount > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {unresolvedDraftItemsCount} por ligar
                      </span>
                      {suggestedDraftItemsCount > 0 ? (
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">
                          {suggestedDraftItemsCount} com sugestão
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={linkAllSuggestedStock}
                    disabled={!canEditPacks || suggestedDraftItemsCount === 0}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Ligar todos agora
                  </button>
                </div>

                {unresolvedDraftItemsCount > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {suggestedDraftItemsCount > 0
                      ? `Há ${unresolvedDraftItemsCount} artigo${unresolvedDraftItemsCount === 1 ? "" : "s"} sem ligação ao stock. Encontrei sugestões para ${suggestedDraftItemsCount}.`
                      : `Há ${unresolvedDraftItemsCount} artigo${unresolvedDraftItemsCount === 1 ? "" : "s"} sem ligação automática ao stock.`}
                  </div>
                ) : null}

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <div className="max-h-[70vh] overflow-auto">
                  <table className="min-w-full text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="sticky top-0 z-30 bg-slate-50 left-0 border-r border-slate-200 px-3 py-3">Referência</th>
                        <th className="sticky top-0 z-20 bg-slate-50 px-3 py-3">Descrição</th>
                        <th className="sticky top-0 z-20 bg-slate-50 px-3 py-3">Categoria</th>
                        <th className="sticky top-0 z-20 bg-slate-50 px-3 py-3 w-28">Qtd.</th>
                        <th className="sticky top-0 z-30 bg-slate-50 right-0 border-l border-slate-200 px-3 py-3 w-24">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                            Adicione artigos a partir do catálogo lateral.
                          </td>
                        </tr>
                      ) : (
                        draft.items.map((item, index) => {
                          const suggestions = draftItemSuggestions[index] || [];
                          const bestSuggestion = suggestions[0] || null;

                          return (
                          <tr key={`${item.stockReference || 'sem-ref'}-${index}`} className="border-t border-slate-200 bg-white align-top hover:bg-slate-50">
                            <td className="sticky left-0 z-10 bg-inherit border-r border-slate-200 px-3 py-3">
                              <input
                                value={item.stockReference}
                                disabled={!canEditPacks}
                                onChange={(event) => updateDraftItemReference(index, event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-700 disabled:bg-slate-100"
                                placeholder="Referência stock"
                              />
                              <div className={`mt-1 text-[11px] font-medium ${item.stockId ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {item.stockId ? 'Ligado ao artigo do stock' : 'Sem ligação automática ao stock'}
                              </div>
                              {!item.stockId && bestSuggestion ? (
                                <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[11px] text-violet-900">
                                  <div className="font-semibold">Sugestão automática</div>
                                  <div className="mt-1 font-mono text-[10px] text-violet-700">
                                    {bestSuggestion.stock.referencia}
                                    {bestSuggestion.stock.codigoFabricante ? ` · Fab. ${bestSuggestion.stock.codigoFabricante}` : ""}
                                  </div>
                                  <div className="mt-0.5 text-[11px]">{bestSuggestion.stock.descricao}</div>
                                  <div className="mt-0.5 text-[10px] text-violet-700">{bestSuggestion.reason}</div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => linkSuggestedStock(index, bestSuggestion.stock)}
                                      disabled={!canEditPacks}
                                      className="rounded-md border border-violet-300 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Ligar sugestão
                                    </button>
                                    {suggestions.length > 1 ? (
                                      <span className="self-center text-[10px] text-violet-700">
                                        +{suggestions.length - 1} alternativa{suggestions.length - 1 === 1 ? "" : "s"}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-slate-900">{item.stockDescription}</td>
                            <td className="px-3 py-3 text-slate-600">{item.stockCategory || "—"}</td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                disabled={!canEditPacks}
                                onChange={(event) => updateDraftItem(index, {
                                  quantity: Math.max(1, Math.trunc(Number(event.target.value || 1) || 1)),
                                })}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
                              />
                            </td>
                            <td className="sticky right-0 z-10 bg-inherit border-l border-slate-200 px-3 py-3">
                              <button
                                type="button"
                                onClick={() => removeDraftItem(index)}
                                disabled={!canEditPacks}
                                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        );})
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-slate-900">Adicionar do catálogo</h3>
                  {loadingStock ? <span className="text-xs text-slate-500">A carregar…</span> : null}
                </div>
                <input
                  value={stockSearch}
                  onChange={(event) => setStockSearch(event.target.value)}
                  placeholder="Pesquisar referência, descrição ou categoria"
                  disabled={!canEditPacks}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredStockRows.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                      Nenhum artigo disponível para esta pesquisa.
                    </div>
                  ) : (
                    filteredStockRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => addStockItem(row)}
                        disabled={!canEditPacks}
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-mono text-xs text-slate-500">{row.referencia}</div>
                            <div className="mt-1 text-sm font-medium text-slate-900">{row.descricao}</div>
                            <div className="mt-1 text-xs text-slate-600">
                              {row.categoria || "Sem categoria"}
                              {row.codigoFabricante ? ` · Fab. ${row.codigoFabricante}` : ""}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            <div>Stock: {row.quantidade ?? "—"}</div>
                            <div>Mín.: {row.quantidadeMinima ?? "—"}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEditPacks || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveButtonLabel}
              </button>
              <button
                type="button"
                onClick={startNewPack}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar editor
              </button>
              {draft.id ? (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={!canEditPacks || deactivating || !draft.isActive}
                  className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deactivating ? "A desativar…" : "Desativar pack"}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

