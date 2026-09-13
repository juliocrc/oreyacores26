
"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { useSession } from "next-auth/react";
import { stockItemSupportsValidity } from "@/lib/stock-validity";
import {
  getStockCategoryLabel,
  getStockCategoryOptions,
} from "@/lib/stock-categories";
import { hasEditablePathPermission, hasVisiblePathPermission } from "@/lib/permission-access";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import WarehouseMapDialog from "@/components/stock/WarehouseMapDialog";
import BarcodeScanner from "@/components/shared/BarcodeScanner";
import { MapPin, ScanLine } from "lucide-react";
import type { ItemStock, ViewMode, MonthlyNeed, StockNeedRow, MonthlyArticleNeed, NeedsSummary, StockPriorityGroupKey, StockScope, StockPrioritySection, StockListColumnKey } from "@/types/stock-page";
import { STOCK_NEW_ITEM_DRAFT_KEY, STOCK_LIST_COLUMNS_KEY, STOCK_CATEGORY_ACCORDIONS_KEY, STOCK_SCOPE_KEY, STOCK_LIST_COLUMNS, INITIAL_STOCK_FORM, CRITICAL_VALIDITY_CATEGORY_KEYWORDS, STOCK_LIST_DENSITY_KEY } from "@/types/stock-page";
import { buildDefaultStockListColumns, escapeHtml, parseMonthYearToDate, normalizeStockLabelText } from "@/lib/stock-page-helpers";
import {
  STOCK_SHELVES,
  buildShelfSummary,
  formatShelfLabel,
  resolveShelfCode,
  shelfMatchesLocation,
} from "@/lib/stock-shelves";

export default function StockPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500">A carregar stock...</div>}>
      <StockPageContent />
    </Suspense>
  );
}

function StockPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const wizardAutoSaveTimeoutRef = useRef<number | null>(null);
  const fichaAutoSaveTimeoutRef = useRef<number | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [itens, setItens] = useState<ItemStock[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroCampo, setFiltroCampo] = useState<"" | StockListColumnKey>("");
  const [showFilters, setShowFilters] = useState(true);
  const [filtroPack, setFiltroPack] = useState<string>("");
  const [stockScope, setStockScope] = useState<StockScope>("all");
  const [filtroStockBaixo, setFiltroStockBaixo] = useState(false);
  const [filtroSemPreco, setFiltroSemPreco] = useState(false);
  const [filtroValidade, setFiltroValidade] = useState<"todos" | "vencidos" | "30dias" | "90dias">("todos");
  const [filtroPrateleira, setFiltroPrateleira] = useState<string>("");
  const [organizingShelves, setOrganizingShelves] = useState(false);
  const [formStep, setFormStep] = useState<"geral" | "comercial" | "aplicabilidade">("geral");
  const [fichaStep, setFichaStep] = useState<"resumo" | "comercial" | "aplicabilidade">("resumo");
  const [isActionsPanelExpanded, setIsActionsPanelExpanded] = useState(false);
  const [form, setForm] = useState<ItemStock>(INITIAL_STOCK_FORM);
  const [showWizard, setShowWizard] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [viewItem, setViewItem] = useState<ItemStock | null>(null);
  const [isFichaEditing, setIsFichaEditing] = useState(false);
  const [fichaDraft, setFichaDraft] = useState<ItemStock | null>(null);
  const [isWarehouseMapOpen, setIsWarehouseMapOpen] = useState(false);
  const [warehouseMapMode, setWarehouseMapMode] = useState<"view" | "select">("view");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [photoUploadTargetId, setPhotoUploadTargetId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [needsSummary, setNeedsSummary] = useState<NeedsSummary | null>(null);
  const [stockNeeds, setStockNeeds] = useState<StockNeedRow[]>([]);
  const [etiquetasPorFolha, setEtiquetasPorFolha] = useState<number>(24);
  const [colunasPorLinha, setColunasPorLinha] = useState<number>(3);
  const [folhaParcial, setFolhaParcial] = useState<boolean>(false);
  const [colunasUsadas, setColunasUsadas] = useState<number[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [listDensity, setListDensity] = useState<"default" | "compact">(() => {
    if (typeof window === "undefined") return "default";
    try {
      const raw = window.localStorage.getItem(STOCK_LIST_DENSITY_KEY);
      return raw === "compact" || raw === "default" ? raw : "default";
    } catch { return "default"; }
  });
  const [expandedStockCategories, setExpandedStockCategories] = useState<Record<string, boolean>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [scanStep, setScanStep] = useState<"item" | "jangada" | null>(null);
  const [scannedItem, setScannedItem] = useState<any>(null);
  const [visibleStockColumns, setVisibleStockColumns] = useState<Record<StockListColumnKey, boolean>>(
    buildDefaultStockListColumns()
  );
  const [fotosByItemId, setFotosByItemId] = useState<Record<number, string>>({});
  const queryItemId = Number(searchParams.get("itemId") || searchParams.get("id") || "0");
  const userRole = session?.user?.role === "ADMIN" ? "ADMIN" : "USER";
  const userPermissions = session?.user?.permissions;
  const canViewStock = userRole === "ADMIN"
    || hasVisiblePathPermission(userPermissions, "/stock")
    || hasEditablePathPermission(userPermissions, "/stock");
  const canEditStock = userRole === "ADMIN"
    || hasEditablePathPermission(userPermissions, "/stock");

  useEffect(() => {
    fetchItens();
  }, [stockScope]);

  useEffect(() => {
    fetchNeedsAnalysis();
  }, []);

  useEffect(() => {
    const tab = String(searchParams.get("tab") || "").toLowerCase();
    if (tab === "prateleiras" || tab === "mapa") {
      setWarehouseMapMode("view");
      setIsWarehouseMapOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("stockFilters");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        categoria?: string;
        marca?: string;
        modelo?: string;
      };
      const categoriaPersistida = String(parsed.categoria || "").trim();
      const categoriasValidas = new Set<string>(getStockCategoryOptions().map((option) => option.value));
      const isPossivelValorAntigoBugado =
        categoriaPersistida === "DIVERSOS" &&
        !String(parsed.marca || "").trim() &&
        !String(parsed.modelo || "").trim();

      if (
        categoriaPersistida &&
        categoriasValidas.has(categoriaPersistida) &&
        !isPossivelValorAntigoBugado
      ) {
        setFiltroCategoria(categoriaPersistida);
      } else {
        setFiltroCategoria("");
      }
      setFiltroMarca(String(parsed.marca || ""));
      setFiltroModelo(String(parsed.modelo || ""));
    } catch (e) { console.warn("[Stock] Failed to load persisted filters:", e); }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("stockViewMode");
    if (storedMode === "lista" || storedMode === "quadros" || storedMode === "detalhes") {
      setViewMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedScope = window.localStorage.getItem(STOCK_SCOPE_KEY);
    if (storedScope === "all" || storedScope === "jangadas-ocean") {
      setStockScope(storedScope);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "stockFilters",
      JSON.stringify({
        categoria: filtroCategoria,
        marca: filtroMarca,
        modelo: filtroModelo,
      })
    );
  }, [filtroCategoria, filtroMarca, filtroModelo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("stockViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STOCK_SCOPE_KEY, stockScope);
  }, [stockScope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STOCK_LIST_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<StockListColumnKey, boolean>>;
      const defaults = buildDefaultStockListColumns();
      const merged = { ...defaults };
      for (const col of STOCK_LIST_COLUMNS) {
        if (typeof parsed[col.key] === "boolean") {
          merged[col.key] = Boolean(parsed[col.key]);
        }
      }
      setVisibleStockColumns(merged);
    } catch (e) { console.warn("[Stock] Failed to load column config:", e); }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STOCK_CATEGORY_ACCORDIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (!parsed || typeof parsed !== "object") return;
      setExpandedStockCategories(parsed);
    } catch (e) { console.warn("[Stock] Failed to load accordion state:", e); }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STOCK_LIST_COLUMNS_KEY, JSON.stringify(visibleStockColumns));
    } catch (e) { console.warn("[Stock] Failed to persist column config:", e); }
  }, [visibleStockColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STOCK_LIST_DENSITY_KEY, listDensity);
    } catch (e) { console.warn("[Stock] Failed to persist density config:", e); }
  }, [listDensity]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STOCK_CATEGORY_ACCORDIONS_KEY, JSON.stringify(expandedStockCategories));
    } catch (e) { console.warn("[Stock] Failed to persist accordion state:", e); }
  }, [expandedStockCategories]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => itens.some((item) => item.id === id)));
  }, [itens]);

  // Funções de localStorage removidas - fotos agora persistem na base de dados

  async function fetchItens() {
    setLoading(true);
    setMessage(null);
    try {
      const query = stockScope === "jangadas-ocean" ? "?stockScope=jangadas-ocean" : "";
      const res = await fetch(`/api/stock${query}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Falha ao carregar stock (${res.status}): ${errText}`);
      }
      const data = await res.json();
      setItens(data);
    } catch (e: any) {
      console.error("[Stock] fetchItens error:", e);
      setItens([]);
      setMessage({ type: "error", text: e?.message || "Erro ao carregar stock." });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!itens.length) {
      setFotosByItemId({});
      return;
    }

    let cancelled = false;

    const loadFotos = async () => {
      const ids = itens.map((item) => item.id).filter((id) => Number.isFinite(id));
      const chunkSize = 20;
      const map: Record<number, string> = {};

      for (let i = 0; i < ids.length; i += chunkSize) {
        const batch = ids.slice(i, i + chunkSize);
        try {
          const res = await fetch(`/api/stock?includeFoto=true&ids=${batch.join(",")}`);
          if (!res.ok) continue;
          const rows = await res.json();
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            const id = Number(row?.id);
            const foto = String(row?.foto || "").trim();
            if (Number.isFinite(id) && foto) {
              map[id] = foto;
            }
          }
        } catch (e) {
          console.warn("[Stock] Failed to load photo batch:", e);
        }
      }

      if (!cancelled) {
        setFotosByItemId(map);
      }
    };

    loadFotos();
    return () => {
      cancelled = true;
    };
  }, [itens]);

  async function fetchNeedsAnalysis() {
    try {
      const res = await fetch("/api/stock/necessidades?stockScope=jangadas-ocean");
      if (!res.ok) throw new Error("Falha ao carregar análise de necessidades");
      const data = await res.json();
      setNeedsSummary(data?.summary || null);
      setStockNeeds(Array.isArray(data?.stockNeeds) ? data.stockNeeds : []);
    } catch {
      setNeedsSummary(null);
      setStockNeeds([]);
    }
  }

  function formatMonth(month: string) {
    const [y, m] = String(month || "").split("-");
    if (!y || !m) return month;
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString("pt-PT", { month: "short", year: "2-digit" });
  }

  function renderMonthlyPlan(mensal: MonthlyNeed[]) {
    if (!mensal || mensal.length === 0) {
      return <span className="text-gray-400">-</span>;
    }

    return (
      <div className="flex max-w-[340px] flex-wrap gap-1.5">
        {mensal.map((m) => (
          <span
            key={`${m.month}-${m.quantidade}`}
            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800"
            title={`${formatMonth(m.month)} · ${m.quantidade} unidade(s)`}
          >
            <span>{formatMonth(m.month)}</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">{m.quantidade}</span>
          </span>
        ))}
      </div>
    );
  }

  async function requestJson(url: string, options: RequestInit) {
    const res = await fetch(url, options);
    if (!res.ok) {
      let messageText = "Erro na operação de stock";
      try {
        const data = await res.json();
        messageText = data?.message || data?.error || messageText;
      } catch {}
      throw new Error(messageText);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function saveNewItemDraft(next: ItemStock) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STOCK_NEW_ITEM_DRAFT_KEY, JSON.stringify(next));
    } catch (e) { console.warn("[Stock] Failed to save draft:", e); }
  }

  function loadNewItemDraft(): ItemStock | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STOCK_NEW_ITEM_DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ItemStock;
    } catch {
      return null;
    }
  }

  function clearNewItemDraft() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(STOCK_NEW_ITEM_DRAFT_KEY);
    } catch (e) { console.warn("[Stock] Failed to clear draft:", e); }
  }

  function buildBarcodeDataUrl(reference: string) {
    try {
      const canvas = document.createElement("canvas");
      JsBarcode(canvas, reference, {
        format: "CODE128",
        displayValue: true,
        fontSize: 16,
        height: 65,
        width: 2.2,
        margin: 4,
      });
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  async function buildQrDataUrl(item: ItemStock): Promise<string | null> {
    try {
      const target = `${window.location.origin}/stock?id=${item.id}`;
      return await QRCode.toDataURL(target, { width: 140, margin: 1, errorCorrectionLevel: "M" });
    } catch {
      return null;
    }
  }

  async function printLabels(items: ItemStock[]) {
    const totalPorFolha = Math.max(1, Number(etiquetasPorFolha) || 24);
    const totalColunas = Math.max(1, Number(colunasPorLinha) || 3);

    const validItems = items.filter((item) => String(item.referencia || "").trim().length > 0);
    if (validItems.length === 0) {
      setMessage({ type: "error", text: "Nenhum artigo com referência válida para gerar etiqueta." });
      return;
    }

    const qrUrls = await Promise.all(validItems.map((item) => buildQrDataUrl(item)));

    const labelBlocks = validItems
      .map((item, idx) => {
        const referencia = String(item.referencia || "").trim();
        const nome = String(item.nome || item.descricao || "Sem nome").trim();
        const fotoRaw = String(fotosByItemId[item.id] || item.foto || "").trim();
        const fotoSrc = fotoRaw
          ? (fotoRaw.startsWith("http://") || fotoRaw.startsWith("https://") || fotoRaw.startsWith("data:")
              ? fotoRaw
              : `${window.location.origin}${fotoRaw.startsWith("/") ? fotoRaw : `/${fotoRaw}`}`)
          : "";
        const barcode = buildBarcodeDataUrl(referencia);
        const qr = qrUrls[idx] || null;
        if (!barcode) return "";

        return `
          <div class="label">
            <div class="photo-frame">
              ${fotoSrc ? `<img class="thumb" src="${escapeHtml(fotoSrc)}" alt="Foto do artigo ${escapeHtml(nome)}" />` : `<div class="thumb-placeholder">Sem foto</div>`}
            </div>
            <div class="ref">${escapeHtml(referencia)}</div>
            <div class="name">${escapeHtml(nome)}</div>
            <div class="codes">
              <img class="barcode" src="${barcode}" alt="Código de barras ${escapeHtml(referencia)}" />
              ${qr ? `<img class="qr" src="${qr}" alt="QR ${escapeHtml(referencia)}" />` : ""}
            </div>
          </div>
        `;
      })
      .filter(Boolean);

    if (labelBlocks.length === 0) {
      setMessage({ type: "error", text: "Não foi possível gerar etiquetas para impressão." });
      return;
    }

    if (folhaParcial && totalPorFolha < totalColunas) {
      setMessage({
        type: "error",
        text: "Para folha parcial, 'etiquetas por folha' deve ser maior ou igual ao nº de colunas.",
      });
      return;
    }

    let cursor = 0;
    const sheetHtmlBlocks: string[] = [];

    if (folhaParcial) {
      const used = new Set(
        colunasUsadas
          .map((c) => Number(c))
          .filter((c) => Number.isFinite(c) && c >= 1 && c <= totalColunas)
      );

      const firstSheetCells: string[] = [];
      for (let c = 1; c <= totalColunas; c++) {
        if (used.has(c)) {
          firstSheetCells.push('<div class="label empty used"></div>');
        } else if (cursor < labelBlocks.length) {
          firstSheetCells.push(labelBlocks[cursor++]);
        } else {
          firstSheetCells.push('<div class="label empty"></div>');
        }
      }

      const remainingSlots = totalPorFolha - totalColunas;
      for (let i = 0; i < remainingSlots && cursor < labelBlocks.length; i++) {
        firstSheetCells.push(labelBlocks[cursor++]);
      }

      sheetHtmlBlocks.push(`<div class="sheet page">${firstSheetCells.join("\n")}</div>`);
    }

    while (cursor < labelBlocks.length) {
      const cells: string[] = [];
      for (let i = 0; i < totalPorFolha && cursor < labelBlocks.length; i++) {
        cells.push(labelBlocks[cursor++]);
      }
      sheetHtmlBlocks.push(`<div class="sheet page">${cells.join("\n")}</div>`);
    }

    const sheetsHtml = sheetHtmlBlocks.join("\n");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiquetas de Artigos</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: Arial, sans-serif; margin: 0; }
            .sheet {
              display: grid;
              grid-template-columns: repeat(${totalColunas}, 1fr);
              gap: 8mm;
            }
            .page { page-break-after: always; }
            .page:last-child { page-break-after: auto; }
            .label {
              border: 1px solid #ccc;
              border-radius: 6px;
              padding: 6px;
              min-height: 56mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              break-inside: avoid;
            }
            .label.empty {
              border-style: dashed;
              background: #fafafa;
              min-height: 44mm;
            }
            .label.empty.used {
              border-color: #d1d5db;
              background: #f3f4f6;
            }
            .photo-frame {
              width: 100%;
              height: 14mm;
              border: 1px solid #e5e7eb;
              border-radius: 4px;
              background: #f9fafb;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              margin-bottom: 3px;
            }
            .thumb {
              width: 100%;
              height: 100%;
              object-fit: contain;
              object-position: center;
              display: block;
            }
            .thumb-placeholder {
              font-size: 10px;
              color: #9ca3af;
            }
            .ref { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
            .name {
              font-size: 11px;
              color: #222;
              margin-bottom: 4px;
              line-height: 1.2;
              min-height: 18px;
              overflow: hidden;
            }
            .barcode { width: 100%; height: 18mm; object-fit: contain; }
            .codes { display: flex; align-items: center; justify-content: center; gap: 4mm; }
            .codes .barcode { flex: 1; height: 16mm; }
            .qr { height: 16mm; width: 16mm; object-fit: contain; }
          </style>
        </head>
        <body>
          ${sheetsHtml}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    const popup = window.open("", "_blank");
    if (!popup) {
      setMessage({ type: "error", text: "Permita pop-ups para imprimir etiquetas." });
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();

    setMessage({ type: "success", text: `Etiquetas geradas: ${labelBlocks.length}.` });
  }

  function scheduleWizardAutoSave(itemId: number, payload: ItemStock) {
    if (wizardAutoSaveTimeoutRef.current) {
      window.clearTimeout(wizardAutoSaveTimeoutRef.current);
    }

    wizardAutoSaveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await requestJson(`/api/stock/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setMessage({ type: "success", text: "Alterações guardadas automaticamente." });
      } catch (error: any) {
        setMessage({ type: "error", text: error?.message || "Falha no autosave." });
      }
    }, 500);
  }

  function scheduleFichaAutoSave(itemId: number, payload: ItemStock) {
    if (fichaAutoSaveTimeoutRef.current) {
      window.clearTimeout(fichaAutoSaveTimeoutRef.current);
    }

    fichaAutoSaveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const updated = await requestJson(`/api/stock/${itemId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const normalizedUpdated = updated as ItemStock;
        setViewItem((prev) => (prev ? { ...prev, ...normalizedUpdated, foto: prev.foto } : prev));
        setItens((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...normalizedUpdated } : item)));
        setMessage({ type: "success", text: "Ficha guardada automaticamente." });
      } catch (error: any) {
        setMessage({ type: "error", text: error?.message || "Falha no autosave da ficha." });
      }
    }, 500);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type } = e.target;
    const checked = e.target.checked;
    setForm((prev) => {
      const next = {
        ...prev,
        [name]:
          type === "checkbox"
            ? checked
            : name === "precoCompra"
              ? (value === "" ? null : Number(value))
              : name === "quantidade" || name === "precoVenda" || name === "quantidadeMinima"
                ? (value === "" ? null : Number(value))
                : value,
      };

      if (name === "quantidade" && value === "") next.quantidade = 0;
      if (name === "precoVenda" && value === "") next.precoVenda = 0;
      if (name === "quantidadeMinima" && value === "") next.quantidadeMinima = null;

      if (editId) {
        scheduleWizardAutoSave(editId, next);
      } else {
        saveNewItemDraft(next);
      }

      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const resolvedNome = String(form.nome || form.descricao || form.referencia || "Sem nome").trim();
    if (!resolvedNome) return;
    setLoading(true);
    setMessage(null);
    try {
      const payload = { ...form, nome: resolvedNome };
      if (editId) {
        await requestJson(`/api/stock/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setEditId(null);
      } else {
        await requestJson("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        clearNewItemDraft();
      }

      setForm(INITIAL_STOCK_FORM);
      setFormStep("geral");
      setShowWizard(false);
      setIsActionsPanelExpanded(false);
      await fetchItens();
      setMessage({ type: "success", text: "Item de stock guardado com sucesso." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Não foi possível guardar o item." });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Tem certeza que deseja excluir este item?")) return;
    setLoading(true);
    setMessage(null);
    try {
      await requestJson(`/api/stock/${id}`, { method: "DELETE" });
      if (viewItem?.id === id) setViewItem(null);
      await fetchItens();
      setMessage({ type: "success", text: "Item desativado (histórico preservado)." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Não foi possível desativar o item." });
    } finally {
      setLoading(false);
    }
  }

  function toggleSelectItem(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]));
  }

  function selectAllFiltered() {
    setSelectedIds(itensFiltrados.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function openBulkDeleteModal() {
    if (selectedIds.length === 0) return;
    setBulkDeleteConfirmText("");
    setShowBulkDeleteModal(true);
  }

  function closeBulkDeleteModal() {
    setShowBulkDeleteModal(false);
    setBulkDeleteConfirmText("");
  }

  async function handleConfirmDeleteSelected() {
    if (selectedIds.length === 0) return;
    if (bulkDeleteConfirmText.trim().toUpperCase() !== "ELIMINAR") return;

    setLoading(true);
    setMessage(null);
    try {
      const result = await requestJson("/api/stock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      const count = Number(result?.count ?? selectedIds.length);
      if (viewItem && selectedIds.includes(viewItem.id)) {
        setViewItem(null);
      }
      closeBulkDeleteModal();
      setSelectedIds([]);
      await fetchItens();
      setMessage({ type: "success", text: `${count} artigo(s) desativado(s) (histórico preservado).` });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Não foi possível desativar os artigos selecionados." });
    } finally {
      setLoading(false);
    }
  }

  async function applyPhotoToItem(itemId: number, fotoDataUrl: string) {
    try {
      // Atualizar foto na base de dados via API
      await requestJson(`/api/stock/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ foto: fotoDataUrl }),
      });

      // Atualizar estado local
      setItens((prev) => prev.map((item) => (item.id === itemId ? { ...item, foto: fotoDataUrl } : item)));
      setFotosByItemId((prev) => ({ ...prev, [itemId]: fotoDataUrl }));
      setViewItem((prev) => (prev && prev.id === itemId ? { ...prev, foto: fotoDataUrl } : prev));
      setFichaDraft((prev) => (prev && prev.id === itemId ? { ...prev, foto: fotoDataUrl } : prev));
      setMessage({ type: "success", text: "Foto atualizada com sucesso." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Erro ao guardar foto." });
    }
  }

  async function removePhotoFromItem(itemId: number) {
    try {
      // Remover foto na base de dados via API
      await requestJson(`/api/stock/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ foto: null }),
      });

      // Atualizar estado local
      setItens((prev) => prev.map((item) => (item.id === itemId ? { ...item, foto: undefined } : item)));
      setFotosByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setViewItem((prev) => (prev && prev.id === itemId ? { ...prev, foto: undefined } : prev));
      setFichaDraft((prev) => (prev && prev.id === itemId ? { ...prev, foto: undefined } : prev));
      setMessage({ type: "success", text: "Foto removida com sucesso." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Erro ao remover foto." });
    }
  }

  function readImageFile(file: File, itemId: number) {
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Selecione um ficheiro de imagem válido." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setMessage({ type: "error", text: "Não foi possível carregar a imagem." });
        return;
      }
      applyPhotoToItem(itemId, result);
    };
    reader.onerror = () => setMessage({ type: "error", text: "Erro ao ler a imagem." });
    reader.readAsDataURL(file);
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const targetId = photoUploadTargetId ?? viewItem?.id;
    if (!targetId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    readImageFile(file, targetId);
    e.target.value = "";
    setPhotoUploadTargetId(null);
  }

  function openPhotoUploadForItem(itemId: number) {
    setPhotoUploadTargetId(itemId);
    photoInputRef.current?.click();
  }

  function openViewItem(item: ItemStock) {
    const foto = fotosByItemId[item.id] || item.foto;
    const next = { ...item, foto };
    setViewItem(next);
    setFichaDraft({ ...next });
    setIsFichaEditing(false);
    setFichaStep("resumo");
  }

  useEffect(() => {
    if (!Number.isFinite(queryItemId) || queryItemId <= 0) return;
    if (!itens.length) return;

    const target = itens.find((item) => item.id === queryItemId);
    if (!target) return;
    if (viewItem?.id === queryItemId) return;

    openViewItem(target);
  }, [queryItemId, itens, fotosByItemId, viewItem?.id]);

  function isColumnVisible(key: StockListColumnKey) {
    return Boolean(visibleStockColumns[key]);
  }

  function toggleStockColumn(key: StockListColumnKey) {
    setVisibleStockColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyEnabled = Object.values(next).some(Boolean);
      if (!anyEnabled) {
        return { ...next, [key]: true };
      }
      return next;
    });
  }

  function showAllStockColumns() {
    setVisibleStockColumns(buildDefaultStockListColumns());
  }

  function hideAllStockColumns() {
    const first = STOCK_LIST_COLUMNS[0]?.key;
    if (!first) return;
    const allHidden = STOCK_LIST_COLUMNS.reduce((acc, col) => {
      acc[col.key] = false;
      return acc;
    }, {} as Record<StockListColumnKey, boolean>);
    allHidden[first] = true;
    setVisibleStockColumns(allHidden);
  }

  async function exportStockExcel() {
    if (!itensFiltrados.length) return;
    try {
      const XLSX = await import("xlsx");
      const rows: Array<Record<string, string | number>> = [];
      const monthlyPlanText = (item: ItemStock): string => {
        const need = stockNeedsById[item.id];
        if (!need || !Array.isArray(need.mensal)) return "";
        return need.mensal
          .filter((m) => Number(m.quantidade || 0) > 0)
          .map((m) => `${m.month}: ${Number(m.quantidade || 0)}`)
          .join("; ");
      };
      for (const item of itensFiltrados) {
        const need = stockNeedsById[item.id];
        const row: Record<string, string | number> = {
          Nome: item.nome || item.descricao || "-",
        };
        for (const col of STOCK_LIST_COLUMNS) {
          if (col.key === "foto" || !isColumnVisible(col.key)) continue;
          switch (col.key) {
            case "nome":
              break;
            case "referencia":
              row[col.label] = item.referencia || "-";
              break;
            case "estado":
              row[col.label] = item.estadoArtigo || "ATIVO";
              break;
            case "referenciaSubstituta":
              row[col.label] = item.referenciaSubstituta || "-";
              break;
            case "codigoFabricante":
              row[col.label] = item.codigoFabricante || "-";
              break;
            case "quantidade":
              row[col.label] = Number(item.quantidade ?? 0);
              break;
            case "quantidadeMinima":
              row[col.label] = item.quantidadeMinima ?? "-";
              break;
            case "precoVenda":
              row[col.label] = Number(item.precoVenda ?? 0);
              break;
            case "marcaModelo":
              row[col.label] = [item.aplicavelMarcaJangada, item.aplicavelModeloJangada].filter(Boolean).join(" / ") || "-";
              break;
            case "categoria":
              row[col.label] = item.categoria || "DIVERSOS";
              break;
            case "prateleira":
              row[col.label] = resolveShelfCode(item.localizacao) || item.localizacao || "—";
              break;
            case "descricao":
              row[col.label] = item.descricao || "-";
              break;
            case "packs":
              row[col.label] = (item.tiposPackAssociados || []).join(", ") || "-";
              break;
            case "necessidade12m":
              row[col.label] = need?.necessidade12m ?? 0;
              break;
            case "saldoProjetado12m":
              row[col.label] = need?.saldoProjetado12m ?? item.quantidade;
              break;
            case "necessidadeMensal":
              row[col.label] = monthlyPlanText(item);
              break;
          }
        }
        rows.push(row);
      }
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");
      XLSX.writeFile(workbook, `stock_catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao exportar Excel");
    }
  }

  function handleFichaFieldChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type } = e.target;
    const checked = e.target.checked;
    setFichaDraft((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        [name]:
          type === "checkbox"
            ? checked
            : name === "precoCompra"
              ? (value === "" ? null : Number(value))
              : name === "quantidade" || name === "precoVenda" || name === "quantidadeMinima"
                ? (value === "" ? null : Number(value))
                : value,
      };

      if (name === "quantidade" && value === "") next.quantidade = 0;
      if (name === "precoVenda" && value === "") next.precoVenda = 0;
      if (name === "quantidadeMinima" && value === "") next.quantidadeMinima = null;

      if (isFichaEditing && viewItem?.id) {
        scheduleFichaAutoSave(viewItem.id, next);
      }

      return next;
    });
  }

  async function handleSaveFichaEdits() {
    if (!viewItem || !fichaDraft) return;
    const resolvedNome = String(fichaDraft.nome || fichaDraft.descricao || fichaDraft.referencia || "Sem nome").trim();
    if (!resolvedNome) return;

    setLoading(true);
    setMessage(null);
    try {
      const payload = { ...fichaDraft, nome: resolvedNome };
      const updated = await requestJson(`/api/stock/${viewItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const normalizedUpdated = updated as ItemStock;
      setViewItem((prev) => (prev ? { ...prev, ...normalizedUpdated, foto: prev.foto } : prev));
      setFichaDraft((prev) => (prev ? { ...prev, ...normalizedUpdated, foto: prev.foto } : prev));
      await fetchItens();
      setIsFichaEditing(false);
      setMessage({ type: "success", text: "Ficha atualizada com sucesso." });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Não foi possível atualizar a ficha." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const targetId = photoUploadTargetId ?? viewItem?.id;
    if (!targetId) return;

    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      const blob = imageItem.getAsFile();
      if (!blob) return;

      event.preventDefault();
      readImageFile(blob, targetId);
      setPhotoUploadTargetId(null);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [viewItem, photoUploadTargetId]);

  async function handleStockOperation(id: number, operacao: "entrada" | "saida", valor = 1) {
    setLoading(true);
    setMessage(null);
    try {
      await requestJson(`/api/stock/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operacao, valor }),
      });
      await fetchItens();
      setMessage({
        type: "success",
        text: operacao === "entrada" ? "Entrada de stock registada." : "Saída de stock registada.",
      });
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Não foi possível atualizar stock." });
    } finally {
      setLoading(false);
    }
  }

  async function handleReporAteMinimo(item: ItemStock) {
    const minimo = Number(item.quantidadeMinima ?? 0);
    const atual = Number(item.quantidade ?? 0);
    const falta = Math.max(0, minimo - atual);

    if (falta <= 0) {
      setMessage({ type: "success", text: "Este artigo já está no mínimo ou acima." });
      return;
    }

    await handleStockOperation(item.id, "entrada", falta);
  }

  async function openCreateItem() {
    const draft = loadNewItemDraft();
    setIsActionsPanelExpanded(true);
    setShowWizard(true);
    setForm(draft || INITIAL_STOCK_FORM);
    setFormStep("geral");
    setEditId(null);
    if (typeof window !== "undefined") {
      document.getElementById("stock-actions-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function splitApplicability(raw?: string): string[] {
    return String(raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function getRaftLinkScore(item: ItemStock): number {
    const marcas = splitApplicability(item.aplicavelMarcaJangada);
    const modelos = splitApplicability(item.aplicavelModeloJangada);
    const temMarca = marcas.length > 0;
    const temModelo = modelos.length > 0;
    const temPack = Array.isArray(item.tiposPackAssociados) && item.tiposPackAssociados.length > 0;
    const marcaTexto = String(item.aplicavelMarcaJangada || "").toLowerCase();
    const temCodigoFabricante = String(item.codigoFabricante || "").trim().length > 0;
    const isOceanSafetyComCodigo = marcaTexto.includes("ocean safety") && temCodigoFabricante;

    let score = 0;
    if (item.associavelJangada) score += 5;
    if (temMarca) score += 2;
    if (temModelo) score += 2;
    if (temPack) score += 1;
    if (isOceanSafetyComCodigo) score += 3;
    return score;
  }

  function getApplicableRaftModelBadge(item: ItemStock): string | null {
    const modelos = splitApplicability(item.aplicavelModeloJangada);
    if (modelos.length === 0) return null;
    if (modelos.length === 1) return `Modelo: ${modelos[0]}`;
    if (modelos.length === 2) return `Modelos: ${modelos.join(" / ")}`;
    return `Modelos: ${modelos.slice(0, 2).join(" / ")} +${modelos.length - 2}`;
  }

  function renderStockThumb(item: ItemStock) {
    const foto = fotosByItemId[item.id] || item.foto;
    if (foto) {
      return (
        <img
          src={foto}
          alt={`Foto de ${item.nome || item.descricao || "artigo"}`}
          className="h-10 w-10 rounded border border-gray-200 object-cover bg-white"
        />
      );
    }
    return (
      <div className="h-10 w-10 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
        Sem foto
      </div>
    );
  }

  function isStockBaixo(item: ItemStock): boolean {
    if (item.quantidadeMinima == null) return false;
    return item.quantidade <= item.quantidadeMinima;
  }

  function getValidadeDias(validade?: string): number | null {
    if (!validade) return null;
    try {
      const dataValidade = parseMonthYearToDate(validade);
      if (!dataValidade) return null;
      const hoje = new Date();
      const diff = dataValidade.getTime() - hoje.getTime();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  function isValidadeProxima(item: ItemStock, dias: number): boolean {
    const diasRestantes = getValidadeDias(item.validade);
    if (diasRestantes === null) return false;
    return diasRestantes <= dias && diasRestantes >= 0;
  }

  function isVencido(item: ItemStock): boolean {
    const diasRestantes = getValidadeDias(item.validade);
    if (diasRestantes === null) return false;
    return diasRestantes < 0;
  }

  function itemSupportsValidity(item: ItemStock): boolean {
    return stockItemSupportsValidity({
      nome: item.nome,
      descricao: item.descricao,
      categoria: item.categoria,
      codigoFabricante: item.codigoFabricante,
      referencia: item.referencia,
      observacoes: item.observacoes,
    });
  }

  function getItemCategoryLabel(item: ItemStock): string {
    // A categoria já vem normalizada do API, apenas usamos o valor diretamente
    return item.categoria || "DIVERSOS";
  }

  function getPrioritySectionKey(item: ItemStock): StockPriorityGroupKey {
    if (itemSupportsValidity(item)) return "validade";
    if (getRaftLinkScore(item) > 0) return "jangadas";
    return "restantes";
  }

  function isCriticalValidityCategory(category: string): boolean {
    const normalized = normalizeStockLabelText(category);
    if (!normalized) return false;
    return CRITICAL_VALIDITY_CATEGORY_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  function getValidityUrgencySummary(items: ItemStock[]) {
    return items.reduce(
      (acc, item) => {
        if (isVencido(item)) {
          acc.vencidos += 1;
        } else if (isValidadeProxima(item, 30)) {
          acc.ate30 += 1;
        } else if (isValidadeProxima(item, 90)) {
          acc.ate90 += 1;
        }
        return acc;
      },
      { vencidos: 0, ate30: 0, ate90: 0 }
    );
  }

  function getCategoryBadgeClasses(sectionKey: StockPriorityGroupKey, category: string): string {
    if (sectionKey === "validade" && isCriticalValidityCategory(category)) {
      return "bg-red-100 text-red-800 border border-red-200";
    }
    if (sectionKey === "jangadas") {
      return "bg-indigo-100 text-indigo-800 border border-indigo-200";
    }
    return "bg-slate-200 text-slate-700";
  }

  function getCategoryAccordionKey(sectionKey: StockPriorityGroupKey, category: string): string {
    return `${sectionKey}::${normalizeStockLabelText(category) || category}`;
  }

  function isCategoryExpanded(sectionKey: StockPriorityGroupKey, category: string): boolean {
    const key = getCategoryAccordionKey(sectionKey, category);
    return expandedStockCategories[key] ?? true;
  }

  function toggleCategoryExpanded(sectionKey: StockPriorityGroupKey, category: string) {
    const key = getCategoryAccordionKey(sectionKey, category);
    setExpandedStockCategories((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }

  function compareStockItems(a: ItemStock, b: ItemStock): number {
    const sectionOrder: Record<StockPriorityGroupKey, number> = {
      validade: 0,
      jangadas: 1,
      restantes: 2,
    };

    const sectionDiff =
      sectionOrder[getPrioritySectionKey(a)] - sectionOrder[getPrioritySectionKey(b)];
    if (sectionDiff !== 0) return sectionDiff;

    const categoryDiff = getItemCategoryLabel(a).localeCompare(getItemCategoryLabel(b), "pt", {
      sensitivity: "base",
    });
    if (categoryDiff !== 0) return categoryDiff;

    if (getPrioritySectionKey(a) === "validade") {
      const diasA = getValidadeDias(a.validade);
      const diasB = getValidadeDias(b.validade);
      if (diasA !== null && diasB !== null && diasA !== diasB) return diasA - diasB;
      if (diasA !== null && diasB === null) return -1;
      if (diasA === null && diasB !== null) return 1;
    }

    if (getPrioritySectionKey(a) === "jangadas") {
      const raftDiff = getRaftLinkScore(b) - getRaftLinkScore(a);
      if (raftDiff !== 0) return raftDiff;
    }

    const quantidadeMinimaA = Number(a.quantidadeMinima ?? 0);
    const quantidadeMinimaB = Number(b.quantidadeMinima ?? 0);
    const stockBaixoDiff = Number(isStockBaixo(b)) - Number(isStockBaixo(a));
    if (stockBaixoDiff !== 0) return stockBaixoDiff;
    if (quantidadeMinimaA !== quantidadeMinimaB) return quantidadeMinimaB - quantidadeMinimaA;

    return String(a.nome || a.descricao || "").localeCompare(String(b.nome || b.descricao || ""), "pt", {
      sensitivity: "base",
    });
  }

  const marcasDisponiveis = Array.from(
    new Set(itens.flatMap((item) => splitApplicability(item.aplicavelMarcaJangada)))
  ).sort((a, b) => a.localeCompare(b, "pt"));

  const modelosDisponiveis = Array.from(
    new Set(itens.flatMap((item) => splitApplicability(item.aplicavelModeloJangada)))
  ).sort((a, b) => a.localeCompare(b, "pt"));

  const categoriasDisponiveis = getStockCategoryOptions().map((option) => option.value);

  const itensFiltrados = itens
    .filter((item) => {
      const marcas = splitApplicability(item.aplicavelMarcaJangada);
      const modelos = splitApplicability(item.aplicavelModeloJangada);
      const categoria = item.categoria || "DIVERSOS";
      const textoBusca = filtroTexto.trim().toLowerCase();
      const campoNome = String(item.nome || "").toLowerCase();
      const campoDescricao = String(item.descricao || "").toLowerCase();
      const campoReferencia = String(item.referencia || "").toLowerCase();
      const campoCodigoFabricante = String(item.codigoFabricante || "").toLowerCase();
      const okCategoria = !filtroCategoria || categoria === filtroCategoria;
      const okMarca = !filtroMarca || marcas.some((marca) => marca.toLowerCase() === filtroMarca.toLowerCase());
      const okModelo = !filtroModelo || modelos.some((modelo) => modelo.toLowerCase() === filtroModelo.toLowerCase());
      const okPack = !filtroPack || (item.tiposPackAssociados && item.tiposPackAssociados.includes(filtroPack));
      const okTexto =
        !textoBusca ||
        campoNome.includes(textoBusca) ||
        campoDescricao.includes(textoBusca) ||
        campoReferencia.includes(textoBusca) ||
        campoCodigoFabricante.includes(textoBusca);
      const okStockBaixo = !filtroStockBaixo || isStockBaixo(item);
      const okSemPreco = !filtroSemPreco || (!item.precoVenda || Number(item.precoVenda) === 0);
      const okCampo = (() => {
        if (!filtroCampo || !textoBusca) return true;
        switch (filtroCampo) {
          case "nome":
            return campoNome.includes(textoBusca);
          case "descricao":
            return campoDescricao.includes(textoBusca);
          case "referencia":
            return campoReferencia.includes(textoBusca);
          case "codigoFabricante":
            return campoCodigoFabricante.includes(textoBusca);
          case "referenciaSubstituta":
            return String(item.referenciaSubstituta || "").toLowerCase().includes(textoBusca);
          case "estado":
            return String(item.estadoArtigo || "").toLowerCase().includes(textoBusca);
          case "categoria":
            return String(item.categoria || "").toLowerCase().includes(textoBusca);
          case "marcaModelo":
            return `${item.aplicavelMarcaJangada || ""} ${item.aplicavelModeloJangada || ""}`.toLowerCase().includes(textoBusca);
          case "prateleira":
            return `${resolveShelfCode(item.localizacao) || ""} ${item.localizacao || ""}`.toLowerCase().includes(textoBusca);
          default:
            return true;
        }
      })();
      const okValidade = 
        filtroValidade === "todos" ||
        (filtroValidade === "vencidos" && isVencido(item)) ||
        (filtroValidade === "30dias" && isValidadeProxima(item, 30)) ||
        (filtroValidade === "90dias" && isValidadeProxima(item, 90));
      const shelfCode = resolveShelfCode(item.localizacao);
      const okPrateleira =
        !filtroPrateleira ||
        (filtroPrateleira === "__NONE__" ? !shelfCode : shelfMatchesLocation(item.localizacao, filtroPrateleira));
      return okCategoria && okMarca && okModelo && okPack && okTexto && okCampo && okStockBaixo && okSemPreco && okValidade && okPrateleira;
    })
    .sort(compareStockItems);

  const shelfSummary = useMemo(() => buildShelfSummary(itens), [itens]);

  const stockPrioritySections: StockPrioritySection[] = ([
    {
      key: "validade",
      label: "Artigos com validade",
      description: "Itens com controlo de prazo, ordenados pelos que precisam de mais atenção primeiro.",
      items: [],
      categories: [],
    },
    {
      key: "jangadas",
      label: "Artigos mais usados nas jangadas",
      description: "Itens associáveis a jangadas, modelos, marcas ou packs de serviço.",
      items: [],
      categories: [],
    },
    {
      key: "restantes",
      label: "Outros artigos",
      description: "Material complementar e artigos sem ligação direta prioritária às jangadas.",
      items: [],
      categories: [],
    },
  ] satisfies StockPrioritySection[]).map((section): StockPrioritySection => {
    const items = itensFiltrados.filter((item) => getPrioritySectionKey(item) === section.key);
    const categories = Array.from(
      items.reduce((map, item) => {
        const category = getItemCategoryLabel(item);
        const current = map.get(category) || [];
        current.push(item);
        map.set(category, current);
        return map;
      }, new Map<string, ItemStock[]>())
    )
      .sort(([a], [b]) => a.localeCompare(b, "pt", { sensitivity: "base" }))
      .map(([category, sectionItems]) => ({
        category,
        items: sectionItems.sort(compareStockItems),
      }));

    return {
      ...section,
      items,
      categories,
    };
  }).filter((section) => section.items.length > 0);

  const allCategoryAccordionKeys = useMemo(
    () =>
      stockPrioritySections.flatMap((section) =>
        section.categories.map((categoryGroup) =>
          getCategoryAccordionKey(section.key, categoryGroup.category)
        )
      ),
    [stockPrioritySections]
  );

  function expandAllStockCategories() {
    setExpandedStockCategories((prev) => {
      const next = { ...prev };
      for (const key of allCategoryAccordionKeys) {
        next[key] = true;
      }
      return next;
    });
  }

  function collapseAllStockCategories() {
    setExpandedStockCategories((prev) => {
      const next = { ...prev };
      for (const key of allCategoryAccordionKeys) {
        next[key] = false;
      }
      return next;
    });
  }

  const stockNeedsById = stockNeeds.reduce<Record<number, StockNeedRow>>((acc, row) => {
    acc[row.stockId] = row;
    return acc;
  }, {});

  const monthlyArticlesByMonth = useMemo<Record<string, MonthlyArticleNeed[]>>(() => {
    const aggregateByMonth = new Map<string, Map<string, MonthlyArticleNeed>>();

    for (const row of stockNeeds) {
      const nome = String(row.nome || "").trim();
      if (!nome) continue;

      for (const monthly of row.mensal || []) {
        const month = String(monthly.month || "").trim();
        const quantidade = Number(monthly.quantidade || 0);
        if (!month || !Number.isFinite(quantidade) || quantidade <= 0) continue;

        const monthMap = aggregateByMonth.get(month) || new Map<string, MonthlyArticleNeed>();
        const key = `${nome.toLowerCase()}::${String(row.referencia || "").toLowerCase()}`;
        const existing = monthMap.get(key);

        if (existing) {
          existing.quantidade += quantidade;
        } else {
          monthMap.set(key, {
            nome,
            referencia: String(row.referencia || "").trim() || undefined,
            quantidade,
          });
        }

        aggregateByMonth.set(month, monthMap);
      }
    }

    const result: Record<string, MonthlyArticleNeed[]> = {};
    for (const [month, monthMap] of aggregateByMonth.entries()) {
      result[month] = Array.from(monthMap.values()).sort((a, b) => {
        if (a.quantidade !== b.quantidade) return b.quantidade - a.quantidade;
        return a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" });
      });
    }

    return result;
  }, [stockNeeds]);

  const selectedItems = itens.filter((item) => selectedIds.includes(item.id));
  const formSupportsValidity = stockItemSupportsValidity({
    nome: form.nome,
    descricao: form.descricao,
    categoria: form.categoria,
    codigoFabricante: form.codigoFabricante,
    referencia: form.referencia,
    observacoes: form.observacoes,
  });
  const fichaSupportsValidity = fichaDraft
    ? stockItemSupportsValidity({
        nome: fichaDraft.nome,
        descricao: fichaDraft.descricao,
        categoria: fichaDraft.categoria,
        codigoFabricante: fichaDraft.codigoFabricante,
        referencia: fichaDraft.referencia,
        observacoes: fichaDraft.observacoes,
      })
    : false;
  const viewItemSupportsValidity = viewItem
    ? stockItemSupportsValidity({
        nome: viewItem.nome,
        descricao: viewItem.descricao,
        categoria: viewItem.categoria,
        codigoFabricante: viewItem.codigoFabricante,
        referencia: viewItem.referencia,
        observacoes: viewItem.observacoes,
      })
    : false;

  const stockStats = useMemo(() => {
    const total = itens.length;
    const baixo = itens.filter((item) => isStockBaixo(item)).length;
    const vencidos = itens.filter((item) => isVencido(item)).length;
    const comValidade = itens.filter((item) => itemSupportsValidity(item)).length;
    return { total, baixo, vencidos, comValidade };
  }, [itens]);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  if (!isClientMounted) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 text-base text-gray-700">A carregar stock...</div>
      </div>
    );
  }

  if (!canViewStock) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm">
            <h1 className="text-xl font-semibold">Sem acesso ao stock</h1>
            <p className="mt-2 text-sm">Esta conta não tem permissões para consultar o módulo de stock.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="app-hero-panel flex flex-col gap-4 rounded-2xl p-6 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.2em] text-sky-100">Orey Técnica</p>
              <h1 className="mt-2 text-4xl font-bold">{canEditStock ? "Gestão de stock" : "Consulta de stock"}</h1>
              <p className="mt-2 max-w-4xl text-base text-sky-100">
                {canEditStock
                  ? "Catálogo operacional com prioridades por validade, artigos de jangadas e controlo rápido de necessidades, no mesmo padrão visual das restantes listas principais."
                  : "Consulta do catálogo de stock com filtros, prioridades e fichas dos artigos, em modo só de leitura."}
              </p>
              <div className="mt-4 inline-flex rounded-xl bg-white/10 p-1 ring-1 ring-white/20">
                <button
                  type="button"
                  onClick={() => setStockScope("all")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${stockScope === "all" ? "bg-white text-blue-700 shadow-sm" : "text-white hover:bg-white/10"}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setStockScope("jangadas-ocean")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${stockScope === "jangadas-ocean" ? "bg-white text-blue-700 shadow-sm" : "text-white hover:bg-white/10"}`}
                >
                  Só jangadas
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEditStock ? (
                <button
                  className="rounded-lg bg-white/15 px-4 py-2 text-base font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
                  onClick={() => {
                    if (isActionsPanelExpanded) {
                      setIsActionsPanelExpanded(false);
                      return;
                    }
                    openCreateItem();
                  }}
                >
                  {isActionsPanelExpanded ? "Recolher painel" : "+ Novo artigo"}
                </button>
              ) : null}
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700" onClick={() => { fetchItens(); fetchNeedsAnalysis(); }}>
                Atualizar lista
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                onClick={() => {
                  setWarehouseMapMode("view");
                  setIsWarehouseMapOpen(true);
                }}
              >
                🗂 20 Prateleiras
              </button>
              {canEditStock ? (
                <button
                  type="button"
                  disabled={organizingShelves}
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20 disabled:opacity-60"
                  onClick={async () => {
                    if (!window.confirm("Normalizar localizações para P01–P20 e atribuir prateleira aos artigos sem localização (por categoria)?")) return;
                    setOrganizingShelves(true);
                    try {
                      const res = await fetch("/api/stock/prateleiras", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ mode: "both", dryRun: false }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data?.error || "Falha ao organizar");
                      alert(`Organização concluída: ${data.changed || 0} artigo(s) atualizado(s).`);
                      fetchItens();
                    } catch (e: any) {
                      alert(e?.message || "Erro ao organizar prateleiras");
                    } finally {
                      setOrganizingShelves(false);
                    }
                  }}
                >
                  {organizingShelves ? "A organizar..." : "Organizar P01–P20"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total em vista", value: itensFiltrados.length },
              { label: "Artigos totais", value: stockStats.total },
              { label: "Stock baixo", value: stockStats.baixo },
              { label: "Com validade", value: stockStats.comValidade },
            ].map((item) => (
              <div key={item.label} className="app-hero-card rounded-xl p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-100">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="text-sm text-sky-100">
            Scope atual: <span className="font-semibold">{stockScope === "all" ? "Todos os artigos" : "Só jangadas"}</span>
          </div>
        </div>

        <div className="w-full">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Diretório</h2>
                <p className="text-base text-slate-600">Lista priorizada por validade, criticidade e aplicabilidade a jangadas.</p>
              </div>
              <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                {categoriasDisponiveis.length} categoria(s)
              </div>
            </div>
      {message && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {message.text}
        </div>
      )}
      {showWizard && canEditStock && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">{editId ? "Editar Item" : "Novo Item"}</h3>
            <div className="mb-4 flex gap-2">
              {([
                { key: "geral", label: "Geral" },
                { key: "comercial", label: "Comercial" },
                { key: "aplicabilidade", label: "Aplicabilidade" },
              ] as const).map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setFormStep(step.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${formStep === step.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}
                >
                  {step.label}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {formStep === "geral" && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">
                    Nome do artigo
                    <input
                      name="nome"
                      value={form.nome}
                      onChange={handleChange}
                      placeholder="Ex.: Cilindro CO₂ 2kg"
                      className="mt-1 border rounded px-2 py-1 w-full"
                    />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Quantidade atual
                      <input
                        name="quantidade"
                        type="number"
                        value={form.quantidade}
                        onChange={handleChange}
                        placeholder="0"
                        className="mt-1 border rounded px-2 py-1 w-full"
                        required
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Quantidade mínima
                      <input
                        name="quantidadeMinima"
                        type="number"
                        value={form.quantidadeMinima ?? ""}
                        onChange={handleChange}
                        placeholder="Opcional"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Referência
                      <input
                        name="referencia"
                        value={form.referencia || ""}
                        onChange={handleChange}
                        placeholder="Ex.: REF-123"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Estado do artigo
                      <select
                        name="estadoArtigo"
                        value={form.estadoArtigo || "ATIVO"}
                        onChange={(e) => handleChange(e as any)}
                        className="mt-1 border rounded px-2 py-1 w-full"
                      >
                        <option value="ATIVO">ATIVO</option>
                        <option value="DESCONTINUADO">DESCONTINUADO</option>
                        <option value="SUBSTITUIDO">SUBSTITUÍDO</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Referência substituta
                      <input
                        name="referenciaSubstituta"
                        value={form.referenciaSubstituta || ""}
                        onChange={handleChange}
                        placeholder="Ex.: NOVA-REF-456"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Categoria
                    <select
                      name="categoria"
                      value={form.categoria || ""}
                      onChange={(e) => handleChange(e as any)}
                      className="mt-1 border rounded px-2 py-1 w-full"
                    >
                      <option value="">Sem categoria</option>
                      {categoriasDisponiveis.map((categoria) => (
                        <option key={categoria} value={categoria}>{categoria}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-gray-700">
                    Descrição
                    <input
                      name="descricao"
                      value={form.descricao || ""}
                      onChange={handleChange}
                      placeholder="Descrição técnica do artigo"
                      className="mt-1 border rounded px-2 py-1 w-full"
                    />
                  </label>
                  <label className="block text-xs font-semibold mb-1 mt-2">Tipos de Pack Associados</label>
                  <select
                    multiple
                    className="border rounded px-2 py-1 w-full"
                    value={form.tiposPackAssociados || []}
                    onChange={e => {
                      const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
                      setForm(prev => {
                        const next = { ...prev, tiposPackAssociados: options };
                        if (editId) {
                          scheduleWizardAutoSave(editId, next);
                        } else {
                          saveNewItemDraft(next);
                        }
                        return next;
                      });
                    }}
                  >
                    <option value="R">R</option>
                    <option value="SIMPL. REDUZ.">SIMPL. REDUZ.</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
              )}

              {formStep === "comercial" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Preço de compra (€)
                      <input
                        name="precoCompra"
                        type="number"
                        step="0.01"
                        value={form.precoCompra ?? ""}
                        onChange={handleChange}
                        placeholder="Opcional"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Preço de venda (€)
                      <input
                        name="precoVenda"
                        type="number"
                        step="0.01"
                        value={form.precoVenda ?? 0}
                        onChange={handleChange}
                        placeholder="0.00"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-gray-700">
                    Código do fabricante
                    <input
                      name="codigoFabricante"
                      value={form.codigoFabricante || ""}
                      onChange={handleChange}
                      placeholder="Opcional"
                      className="mt-1 border rounded px-2 py-1 w-full"
                    />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Nº Inventário
                      <input
                        name="inventario"
                        value={form.inventario || ""}
                        onChange={handleChange}
                        placeholder="Opcional"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Lote
                      <input
                        name="lote"
                        value={form.lote || ""}
                        onChange={handleChange}
                        placeholder="Opcional"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Validade
                      <input
                        name="validade"
                        value={form.validade || ""}
                        onChange={handleChange}
                        placeholder={formSupportsValidity ? "MM/AAAA" : "Não aplicável a este artigo"}
                        className="mt-1 border rounded px-2 py-1 w-full disabled:bg-gray-100 disabled:text-gray-400"
                        disabled={!formSupportsValidity}
                      />
                    </label>
                    {!formSupportsValidity && (
                      <p className="text-[11px] text-amber-700 md:col-span-3">
                        A validade em stock fica reservada a artigos de prazo, como pirotecnia, água, rações, farmácia, comprimidos, luzes/baterias, tubos de alta pressão e válvulas OTS65.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {formStep === "aplicabilidade" && (
                <div className="space-y-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      name="associavelJangada"
                      type="checkbox"
                      checked={Boolean(form.associavelJangada)}
                      onChange={handleChange}
                    />
                    Associável a jangadas
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Marca(s) aplicável(is)
                      <input
                        name="aplicavelMarcaJangada"
                        value={form.aplicavelMarcaJangada || ""}
                        onChange={handleChange}
                        placeholder="Ex.: Zodiac, Plastimo"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Modelo(s) aplicável(is)
                      <input
                        name="aplicavelModeloJangada"
                        value={form.aplicavelModeloJangada || ""}
                        onChange={handleChange}
                        placeholder="Ex.: MK IV, Ocean Pro"
                        className="mt-1 border rounded px-2 py-1 w-full"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Pode escrever uma marca/modelo específico ou múltiplos valores separados por vírgula.
                  </p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={() => { setShowWizard(false); setEditId(null); setFormStep("geral"); }}>Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {viewItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-3xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="app-soft-blue-panel mb-4 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold">Ficha do artigo</p>
              <h3 className="text-xl font-bold text-gray-900">{viewItem.nome || viewItem.descricao || "Sem nome"}</h3>
              <p className="text-xs text-gray-600 mt-1 flex flex-wrap items-center gap-2">
                <span>Referência:</span>
                <span className="inline-flex rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  {viewItem.referencia || "-"}
                </span>
                <span>· Categoria: {viewItem.categoria || "-"}</span>
              </p>
            </div>
            <div className="mb-4">
              <div className="w-full h-44 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
                {viewItem.foto ? (
                  <img src={viewItem.foto} alt={`Foto de ${viewItem.nome}`} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-500 text-center px-3">
                    Sem foto. Faça upload ou use Ctrl+V para colar.
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {canEditStock ? (
                  <>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Upload de foto
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs"
                      onClick={() => removePhotoFromItem(viewItem.id)}
                    >
                      Remover foto
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="mb-4 flex gap-2">
              {([
                { key: "resumo", label: "Resumo" },
                { key: "comercial", label: "Comercial" },
                { key: "aplicabilidade", label: "Aplicabilidade" },
              ] as const).map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setFichaStep(step.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${fichaStep === step.key ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
                >
                  {step.label}
                </button>
              ))}
            </div>

            {fichaStep === "resumo" && (
              <div className="mb-4 text-sm bg-gray-50 rounded-lg border border-gray-200 p-4">
                {isFichaEditing && fichaDraft ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-gray-700">
                      Nome do artigo
                      <input name="nome" value={fichaDraft.nome || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="block text-xs font-semibold text-gray-700">
                        Referência
                        <input name="referencia" value={fichaDraft.referencia || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Estado do artigo
                        <select name="estadoArtigo" value={fichaDraft.estadoArtigo || "ATIVO"} onChange={handleFichaFieldChange as any} className="mt-1 border rounded px-2 py-1 w-full">
                          <option value="ATIVO">ATIVO</option>
                          <option value="DESCONTINUADO">DESCONTINUADO</option>
                          <option value="SUBSTITUIDO">SUBSTITUÍDO</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Quantidade atual
                        <input name="quantidade" type="number" value={fichaDraft.quantidade ?? 0} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Quantidade mínima
                        <input name="quantidadeMinima" type="number" value={fichaDraft.quantidadeMinima ?? ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                    </div>
                    <label className="block text-xs font-semibold text-gray-700">
                      Referência substituta
                      <input name="referenciaSubstituta" value={fichaDraft.referenciaSubstituta || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Categoria
                      <select name="categoria" value={fichaDraft.categoria || ""} onChange={handleFichaFieldChange as any} className="mt-1 border rounded px-2 py-1 w-full">
                        <option value="">Sem categoria</option>
                        {categoriasDisponiveis.map((categoria) => (
                          <option key={categoria} value={categoria}>{categoria}</option>
                        ))}
                      </select>
                      <div className="mt-2 text-xs">
                        {itemSupportsValidity(fichaDraft) ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">✓ Validade aplicável</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">✗ Sem validade</span>
                        )}
                      </div>
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Descrição
                      <input name="descricao" value={fichaDraft.descricao || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Prateleira (P01–P20)
                      <div className="mt-1 flex flex-wrap gap-2">
                        <select
                          name="localizacao"
                          value={resolveShelfCode(fichaDraft.localizacao) || ""}
                          onChange={(e) => {
                            const code = e.target.value;
                            setFichaDraft((prev: any) => prev ? { ...prev, localizacao: code || "" } : null);
                          }}
                          className="min-w-[12rem] flex-1 rounded border px-2 py-1"
                        >
                          <option value="">Sem prateleira</option>
                          {STOCK_SHELVES.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.code} · {s.zone}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setWarehouseMapMode("select");
                            setIsWarehouseMapOpen(true);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                          title="Escolher no mapa"
                        >
                          <MapPin size={14} />
                          Mapa
                        </button>
                      </div>
                      {fichaDraft.localizacao && !resolveShelfCode(fichaDraft.localizacao) && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Valor livre atual: {fichaDraft.localizacao} (normaliza com &quot;Organizar P01–P20&quot;)
                        </p>
                      )}
                    </label>
                    <label className="block text-xs font-semibold text-gray-700">
                      Observações
                      <input name="observacoes" value={fichaDraft.observacoes || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Nome</span><div className="text-sm text-gray-900 mt-1">{viewItem.nome || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Referência</span><div className="text-sm mt-1"><span className="inline-flex rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{viewItem.referencia || "-"}</span></div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Estado do artigo</span><div className="text-sm text-gray-900 mt-1">{viewItem.estadoArtigo || "ATIVO"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Referência substituta</span><div className="text-sm text-gray-900 mt-1">{viewItem.referenciaSubstituta || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Quantidade atual</span><div className="text-sm text-gray-900 mt-1">{viewItem.quantidade ?? 0}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Quantidade mínima</span><div className="text-sm mt-1"><span className={isStockBaixo(viewItem) ? "text-red-600 font-semibold" : "text-gray-900"}>{viewItem.quantidadeMinima ?? "-"}</span></div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Categoria</span><div className="text-sm text-gray-900 mt-1">{getItemCategoryLabel(viewItem)}</div><div className="mt-2 text-xs">{itemSupportsValidity(viewItem) ? <span className="inline-flex rounded-full bg-green-100 px-2 py-1 font-medium text-green-800">✓ Validade aplicável</span> : <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-700">✗ Sem validade</span>}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Descrição</span><div className="text-sm text-gray-900 mt-1">{viewItem.descricao || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <span className="font-semibold text-gray-600">Prateleira</span>
                      <div className="mt-1 text-sm text-gray-900">
                        {resolveShelfCode(viewItem.localizacao)
                          ? formatShelfLabel(viewItem.localizacao)
                          : viewItem.localizacao || "—"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Observações</span><div className="text-sm text-gray-900 mt-1">{viewItem.observacoes || "-"}</div></div>
                  </div>
                )}
              </div>
            )}

            {fichaStep === "comercial" && (
              <div className="mb-4 text-sm bg-gray-50 rounded-lg border border-gray-200 p-4">
                {isFichaEditing && fichaDraft ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="block text-xs font-semibold text-gray-700">
                        Preço de compra (€)
                        <input name="precoCompra" type="number" step="0.01" value={fichaDraft.precoCompra ?? ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Preço de venda (€)
                        <input name="precoVenda" type="number" step="0.01" value={fichaDraft.precoVenda ?? 0} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                    </div>
                    <label className="block text-xs font-semibold text-gray-700">
                      Código do fabricante
                      <input name="codigoFabricante" value={fichaDraft.codigoFabricante || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <label className="block text-xs font-semibold text-gray-700">
                        Nº Inventário
                        <input name="inventario" value={fichaDraft.inventario || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Lote
                        <input name="lote" value={fichaDraft.lote || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Validade
                        <input
                          name="validade"
                          value={fichaDraft.validade || ""}
                          onChange={handleFichaFieldChange}
                          className="mt-1 border rounded px-2 py-1 w-full disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder={fichaSupportsValidity ? "MM/AAAA" : "Não aplicável a este artigo"}
                          disabled={!fichaSupportsValidity}
                        />
                      </label>
                    </div>
                    {!fichaSupportsValidity && (
                      <p className="text-[11px] text-amber-700">
                        Este artigo não usa validade em stock. O sistema só mantém validade para artigos de prazo e substituição periódica.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Preço de compra</span><div className="text-sm text-gray-900 mt-1">{viewItem.precoCompra == null ? "-" : `${Number(viewItem.precoCompra).toFixed(2)} €`}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Preço de venda</span><div className="text-sm text-gray-900 mt-1">{Number(viewItem.precoVenda ?? 0).toFixed(2)} €</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Código do fabricante</span><div className="text-sm mt-1"><span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{viewItem.codigoFabricante || "-"}</span></div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Nº Inventário</span><div className="text-sm text-gray-900 mt-1">{viewItem.inventario || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Lote</span><div className="text-sm text-gray-900 mt-1">{viewItem.lote || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Validade</span><div className="text-sm text-gray-900 mt-1">{viewItemSupportsValidity ? (viewItem.validade || "-") : "Não aplicável"}</div></div>
                  </div>
                )}
              </div>
            )}

            {fichaStep === "aplicabilidade" && (
              <div className="mb-4 text-sm bg-gray-50 rounded-lg border border-gray-200 p-4">
                {isFichaEditing && fichaDraft ? (
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input name="associavelJangada" type="checkbox" checked={Boolean(fichaDraft.associavelJangada)} onChange={handleFichaFieldChange} />
                      Associável a jangadas
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="block text-xs font-semibold text-gray-700">
                        Marca(s) aplicável(is)
                        <input name="aplicavelMarcaJangada" value={fichaDraft.aplicavelMarcaJangada || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                      <label className="block text-xs font-semibold text-gray-700">
                        Modelo(s) aplicável(is)
                        <input name="aplicavelModeloJangada" value={fichaDraft.aplicavelModeloJangada || ""} onChange={handleFichaFieldChange} className="mt-1 border rounded px-2 py-1 w-full" />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Associável a jangadas</span><div className="text-sm text-gray-900 mt-1">{viewItem.associavelJangada ? "Sim" : "Não"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3"><span className="font-semibold text-gray-600">Marca(s) aplicável(is)</span><div className="text-sm text-gray-900 mt-1">{viewItem.aplicavelMarcaJangada || "-"}</div></div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3 md:col-span-2"><span className="font-semibold text-gray-600">Modelo(s) aplicável(is)</span><div className="text-sm text-gray-900 mt-1">{viewItem.aplicavelModeloJangada || "-"}</div></div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {canEditStock && isFichaEditing ? (
                <>
                  <button className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700" onClick={handleSaveFichaEdits}>Guardar alterações</button>
                  <button
                    className="px-4 py-2 bg-gray-300 rounded"
                    onClick={() => {
                      setIsFichaEditing(false);
                      setFichaDraft(viewItem ? { ...viewItem } : null);
                    }}
                  >
                    Cancelar edição
                  </button>
                </>
              ) : canEditStock ? (
                <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={() => setIsFichaEditing(true)}>
                  Editar todos os dados
                </button>
              ) : null}
              <button
                className="px-4 py-2 bg-gray-300 rounded"
                onClick={() => {
                  setViewItem(null);
                  setFichaDraft(null);
                  setIsFichaEditing(false);
                  setFichaStep("resumo");
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {showBulkDeleteModal && canEditStock && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-2xl border border-red-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-red-700 mb-2">Confirmar eliminação em lote</h3>
            <p className="text-sm text-gray-700 mb-3">
              Vai eliminar <b>{selectedItems.length}</b> artigo(s). Esta ação é irreversível.
            </p>

            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-60 overflow-y-auto">
              <ul className="space-y-1 text-xs text-gray-700">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      {item.nome || item.descricao || "Sem nome"}
                      {item.referencia ? ` · ${item.referencia}` : ""}
                    </span>
                    <span className="text-gray-500">ID {item.id}</span>
                  </li>
                ))}
              </ul>
            </div>

            <label className="block text-xs font-semibold text-gray-700 mb-4">
              Escreva <span className="text-red-700">ELIMINAR</span> para confirmar
              <input
                value={bulkDeleteConfirmText}
                onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                placeholder="ELIMINAR"
                className="mt-1 border rounded px-2 py-1 w-full"
              />
            </label>

            <div className="flex gap-2 justify-end">
              <button type="button" className="px-4 py-2 bg-gray-300 rounded" onClick={closeBulkDeleteModal}>
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                onClick={handleConfirmDeleteSelected}
                disabled={loading || bulkDeleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
              >
                Confirmar eliminação
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-bold mb-2">Itens de Stock</h2>
        {needsSummary && (
          <div className="mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs">
              <div className="text-blue-700 font-semibold">Artigos com validade ≤ 12 meses</div>
              <div className="text-xl font-bold text-blue-900">{needsSummary.artigosComValidadeAte12Meses}</div>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs">
              <div className="text-red-700 font-semibold">Artigos vencidos</div>
              <div className="text-xl font-bold text-red-900">{needsSummary.artigosVencidos}</div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs">
              <div className="text-amber-700 font-semibold">Quantidade total necessária (12m)</div>
              <div className="text-xl font-bold text-amber-900">{needsSummary.quantidadeTotalNecessaria12m}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs">
              <div className="text-emerald-700 font-semibold">Jangadas afetadas</div>
              <div className="text-xl font-bold text-emerald-900">{needsSummary.jangadasAfetadas}</div>
            </div>
          </div>
          {needsSummary.necessidadesMensaisTotais?.length > 0 && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-xs">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-semibold text-sky-800">
                <div className="flex items-center gap-2">
                  <span>Reposições mensais previstas</span>
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300 bg-white text-[11px] font-bold text-sky-700 cursor-help"
                  title="Inclui artigos com validade gerida e reposição prevista, como água, rações, pirotecnia, luzes, farmácia, comprimidos, válvulas OTS65 e tubos de alta pressão."
                  aria-label="Inclui artigos com validade gerida e reposição prevista, como água, rações, pirotecnia, luzes, farmácia, comprimidos, válvulas OTS65 e tubos de alta pressão."
                >
                  i
                </span>
                </div>
                <Link
                  href="/stock/reposicoes"
                  className="inline-flex items-center rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-100"
                >
                  Abrir controlo de reposições
                </Link>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {needsSummary.necessidadesMensaisTotais.map((item) => (
                  <Link
                    key={`summary-${item.month}`}
                    href={`/stock/reposicoes?month=${encodeURIComponent(item.month)}`}
                    className="rounded-md border border-sky-200 bg-white px-2 py-1"
                    title={
                      (monthlyArticlesByMonth[item.month] || []).length > 0
                        ? `${formatMonth(item.month)} · ${item.quantidade} unidade(s)\n` +
                          (monthlyArticlesByMonth[item.month] || [])
                            .map((article) => `${article.nome}${article.referencia ? ` (${article.referencia})` : ""}: ${article.quantidade}`)
                            .join("\n")
                        : `${formatMonth(item.month)} · ${item.quantidade} unidade(s)`
                    }
                  >
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-800">
                      <span>{formatMonth(item.month)}</span>
                      <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900">
                        {item.quantidade}
                      </span>
                    </div>
                    {(monthlyArticlesByMonth[item.month] || []).length > 0 && (
                      <div className="mt-1 max-w-[240px] truncate text-[10px] text-sky-700">
                        {(monthlyArticlesByMonth[item.month] || [])
                          .slice(0, 3)
                          .map((article) => `${article.nome} (${article.quantidade})`)
                          .join(", ")}
                        {(monthlyArticlesByMonth[item.month] || []).length > 3
                          ? ` +${(monthlyArticlesByMonth[item.month] || []).length - 3}`
                          : ""}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
        <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Prateleiras (20)</p>
              <p className="text-[11px] text-indigo-700/80">
                {shelfSummary.shelves.filter((s) => s.occupied).length}/20 ocupadas
                {shelfSummary.unassignedCount > 0 ? ` · ${shelfSummary.unassignedCount} sem prateleira` : ""}
                {filtroPrateleira ? ` · filtro: ${filtroPrateleira === "__NONE__" ? "sem prateleira" : filtroPrateleira}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltroPrateleira("")}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${!filtroPrateleira ? "bg-indigo-700 text-white" : "border border-indigo-200 bg-white text-indigo-800"}`}
            >
              Todas
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STOCK_SHELVES.map((shelf) => {
              const stats = shelfSummary.shelves.find((s) => s.code === shelf.code);
              const active = filtroPrateleira === shelf.code;
              return (
                <button
                  key={shelf.code}
                  type="button"
                  title={`${shelf.label} · ${shelf.zone}`}
                  onClick={() => setFiltroPrateleira(active ? "" : shelf.code)}
                  className={`inline-flex min-w-[3.25rem] flex-col items-center rounded-lg border px-1.5 py-1 text-[10px] font-bold transition ${
                    active
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : stats?.occupied
                        ? "border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-white"
                  }`}
                >
                  <span>{shelf.code}</span>
                  <span className="opacity-80">{stats?.itemCount || 0}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltroPrateleira(filtroPrateleira === "__NONE__" ? "" : "__NONE__")}
              className={`inline-flex min-w-[3.25rem] flex-col items-center rounded-lg border px-1.5 py-1 text-[10px] font-bold ${
                filtroPrateleira === "__NONE__"
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
              }`}
            >
              <span>N/A</span>
              <span>{shelfSummary.unassignedCount}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          {showFilters ? "▾" : "▸"} Filtros
          {(() => {
            const ativos = [filtroCategoria, filtroMarca, filtroModelo, filtroPack, filtroPrateleira, filtroStockBaixo ? "on" : "", filtroSemPreco ? "on" : "", filtroValidade !== "todos" ? filtroValidade : "", filtroCampo ? "on" : ""].filter(Boolean).length;
            return ativos > 0 ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{ativos}</span> : null;
          })()}
        </button>
        {showFilters && (<>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3">
          <label className="block text-[11px] font-semibold text-gray-700 md:col-span-2">
            <span className="flex items-center justify-between gap-2">
              Pesquisa
              {filtroCampo && (
                <button type="button" onClick={() => { setFiltroCampo(""); }} className="text-[10px] font-semibold text-blue-600 hover:underline">
                  Limpar campo
                </button>
              )}
            </span>
            <span className="mt-1 flex gap-2">
              <select
                value={filtroCampo}
                onChange={(e) => setFiltroCampo(e.target.value as "" | StockListColumnKey)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-xs w-40"
              >
                <option value="">Todos os campos</option>
                <option value="nome">Nome</option>
                <option value="referencia">Referência</option>
                <option value="referenciaSubstituta">Ref. substituta</option>
                <option value="codigoFabricante">Cód. fabricante</option>
                <option value="estado">Estado</option>
                <option value="categoria">Categoria</option>
                <option value="marcaModelo">Marca/Modelo</option>
                <option value="prateleira">Prateleira</option>
                <option value="descricao">Descrição</option>
              </select>
              <input
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder={filtroCampo ? "Filtrar apenas neste campo" : "Nome, descrição, referência ou cód. fabricante"}
                className="border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
              />
            </span>
          </label>

          <label className="block text-[11px] font-semibold text-gray-700">
            Categoria
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
            >
              <option value="">Todas as categorias</option>
              {categoriasDisponiveis.map((categoria) => (
                <option key={categoria} value={categoria}>{categoria}</option>
              ))}
            </select>
          </label>

          <label className="block text-[11px] font-semibold text-gray-700">
            Marca
            <select
              value={filtroMarca}
              onChange={(e) => setFiltroMarca(e.target.value)}
              className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
            >
              <option value="">Todas as marcas</option>
              {marcasDisponiveis.map((marca) => (
                <option key={marca} value={marca}>{marca}</option>
              ))}
            </select>
          </label>

          <label className="block text-[11px] font-semibold text-gray-700">
            Modelo
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
            >
              <option value="">Todos os modelos</option>
              {modelosDisponiveis.map((modelo) => (
                <option key={modelo} value={modelo}>{modelo}</option>
              ))}
            </select>
          </label>

          <label className="block text-[11px] font-semibold text-gray-700">
            Pack associado
            <select
              value={filtroPack}
              onChange={e => setFiltroPack(e.target.value)}
              className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
            >
              <option value="">Todos os packs</option>
              <option value="R">R</option>
              <option value="SIMPL. REDUZ.">SIMPL. REDUZ.</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <label className="block text-[11px] font-semibold text-gray-700">
            Estado de validade
            <select
              value={filtroValidade}
              onChange={e => setFiltroValidade(e.target.value as any)}
              className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-xs w-full"
            >
              <option value="todos">Todas as validades</option>
              <option value="vencidos">❌ Vencidos</option>
              <option value="30dias">⚠️ Vence em 30 dias</option>
              <option value="90dias">⚡ Vence em 90 dias</option>
            </select>
          </label>

          <label className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={filtroStockBaixo}
              onChange={(e) => setFiltroStockBaixo(e.target.checked)}
            />
            <span>🔻 Stock abaixo do mínimo</span>
          </label>

          <label className="flex items-center gap-2 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-xs cursor-pointer hover:bg-amber-100">
            <input
              type="checkbox"
              checked={filtroSemPreco}
              onChange={(e) => setFiltroSemPreco(e.target.checked)}
            />
            <span className="font-bold text-amber-900">⚠️ Sem preço definido</span>
          </label>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => {
                setFiltroTexto("");
                setFiltroCampo("");
                setFiltroCategoria("");
                setFiltroMarca("");
                setFiltroModelo("");
                setFiltroPack("");
                setFiltroStockBaixo(false);
                setFiltroSemPreco(false);
                setFiltroValidade("todos");
                setFiltroPrateleira("");
              }}
              className="border border-gray-300 bg-gray-100 rounded-lg px-3 py-2 text-xs font-medium w-full"
            >
Limpar todos os filtros
            </button>
          </div>
        </div>
        </>)}
        <div className="flex gap-2 mb-3">
          {([
            { key: "quadros", label: "Quadros" },
            { key: "lista", label: "Lista" },
            { key: "detalhes", label: "Detalhes" }
          ] as const).map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setViewMode(mode.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${viewMode === mode.key ? "bg-blue-700 text-white border-blue-700" : "bg-white text-gray-700 border-gray-300"}`}
            >
              {mode.label}
            </button>
          ))}
          <button
            type="button"
            onClick={expandAllStockCategories}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-700 border-gray-300"
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={collapseAllStockCategories}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-700 border-gray-300"
          >
            Recolher tudo
          </button>
        </div>
        {viewMode === "lista" && (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium"
                onClick={() => setShowColumnSelector((prev) => !prev)}
              >
                {showColumnSelector ? "Ocultar seletor de colunas" : "Mostrar seletor de colunas"}
              </button>
              {STOCK_LIST_COLUMNS.length - Object.values(visibleStockColumns).filter(Boolean).length > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                  {STOCK_LIST_COLUMNS.length - Object.values(visibleStockColumns).filter(Boolean).length} coluna(s) oculta(s)
                </span>
              )}
              <button
                type="button"
                className={`rounded border px-3 py-1.5 text-xs font-medium ${listDensity === "compact" ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-700"}`}
                onClick={() => setListDensity((prev) => (prev === "compact" ? "default" : "compact"))}
              >
                {listDensity === "compact" ? "Densidade: Compacta" : "Densidade: Normal"}
              </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void exportStockExcel()}
                  disabled={itensFiltrados.length === 0}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  title="Exportar as linhas atualmente visíveis para Excel (.xlsx)"
                >
                  ⬇ Exportar Excel
                </button>
                <button
                  type="button"
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                  onClick={showAllStockColumns}
                >
                  Mostrar todas
                </button>
                <button
                  type="button"
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                  onClick={hideAllStockColumns}
                >
                  Ocultar quase todas
                </button>
              </div>
            </div>
            {showColumnSelector && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {STOCK_LIST_COLUMNS.map((col) => (
                  <label key={col.key} className="inline-flex items-center gap-2 rounded border border-gray-200 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={isColumnVisible(col.key)}
                      onChange={() => toggleStockColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {canEditStock ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <span className="font-semibold text-gray-700">Selecionados: {selectedIds.length}</span>
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={itensFiltrados.length === 0}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-50"
            >
              Selecionar filtrados ({itensFiltrados.length})
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedIds.length === 0}
              className="rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-50"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={openBulkDeleteModal}
              disabled={selectedIds.length === 0 || loading}
              className="rounded bg-red-600 px-2 py-1 text-white disabled:opacity-50"
            >
              Eliminar em lote
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className="text-center py-4">Carregando...</div>
        ) : viewMode === "lista" ? (
          <div className="space-y-4">
            {stockPrioritySections.map((section) => (
              <div key={section.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="app-soft-blue-strip px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                      <h3 className="text-sm font-bold text-gray-900">{section.label}</h3>
                      <p className="text-xs text-gray-600">{section.description}</p>
                      {section.key === "validade" && (() => {
                        const summary = getValidityUrgencySummary(section.items);
                        return (
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            {summary.vencidos > 0 && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">❌ {summary.vencidos} vencido(s)</span>}
                            {summary.ate30 > 0 && <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">⚠️ {summary.ate30} até 30 dias</span>}
                            {summary.ate90 > 0 && <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">📅 {summary.ate90} até 90 dias</span>}
                          </div>
                        );
                      })()}
                    </div>
                    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                      {section.items.length} artigo(s)
                    {(() => {
                      const totalQtd = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0), 0);
                      const totalValor = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0) * Number(item2.precoVenda ?? 0), 0);
                      return (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{totalQtd} un.</span>
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(totalValor)}</span>
                        </div>
                      );
                    })()}
                    </span>
                  </div>
                </div>
                <div className="max-h-[75vh] overflow-auto">
                <table className={`min-w-full text-xs sm:text-sm ${listDensity === "compact" ? "[&_td]:!p-1 [&_th]:!p-1 [&_td]:!text-[11px] [&_td]:!leading-tight" : ""}`}>
                  <thead>
                    <tr className="bg-blue-100">
                      <th className="sticky top-0 z-30 bg-blue-100 left-0 w-10 border-r border-gray-200 p-2">
                        {canEditStock ? (
                          <input
                            type="checkbox"
                            checked={section.items.length > 0 && section.items.every((item) => selectedIds.includes(item.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds((prev) => Array.from(new Set([...prev, ...section.items.map((item) => item.id)])));
                              } else {
                                setSelectedIds((prev) => prev.filter((id) => !section.items.some((item) => item.id === id)));
                              }
                            }}
                            aria-label={`Selecionar artigos da secção ${section.label}`}
                          />
                        ) : null}
                      </th>
                      {isColumnVisible("foto") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Foto</th>}
                      {isColumnVisible("nome") && <th className="sticky top-0 z-30 bg-blue-100 left-10 border-r border-gray-200 p-2">Nome</th>}
                      {isColumnVisible("referencia") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Referência</th>}
                      {isColumnVisible("estado") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Estado</th>}
                      {isColumnVisible("referenciaSubstituta") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Ref. Substituta</th>}
                      {isColumnVisible("codigoFabricante") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Cód. Fabricante</th>}
                      {isColumnVisible("quantidade") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Quantidade</th>}
                      {isColumnVisible("quantidadeMinima") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Qtd. mínima</th>}
                      {isColumnVisible("precoVenda") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Preço de venda</th>}
                      {isColumnVisible("marcaModelo") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Marca/Modelo Jangada</th>}
                      {isColumnVisible("categoria") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Categoria</th>}
                      {isColumnVisible("prateleira") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Prateleira</th>}
                      {isColumnVisible("descricao") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Descrição</th>}
                      {isColumnVisible("packs") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Packs</th>}
                      {isColumnVisible("necessidade12m") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Necess. 12m</th>}
                      {isColumnVisible("saldoProjetado12m") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Saldo proj. 12m</th>}
                      {isColumnVisible("necessidadeMensal") && <th className="sticky top-0 z-20 bg-blue-100 p-2">Necessidade mensal</th>}
                      <th className="sticky top-0 z-30 bg-blue-100 right-0 border-l border-gray-200 p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.categories.map((categoryGroup) => (
                      <React.Fragment key={`${section.key}-${categoryGroup.category}`}>
                        <tr className="bg-slate-50">
                          <td
                            colSpan={Object.values(visibleStockColumns).filter(Boolean).length + 2}
                            className="border-t border-slate-200 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700"
                                  onClick={() => toggleCategoryExpanded(section.key, categoryGroup.category)}
                                >
                                  {isCategoryExpanded(section.key, categoryGroup.category) ? "▾" : "▸"}
                                </button>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getCategoryBadgeClasses(section.key, categoryGroup.category)}`}>
                                  {categoryGroup.category}
                                </span>
                                {section.key === "validade" && isCriticalValidityCategory(categoryGroup.category) && (
                                  <span className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                    Categoria crítica
                                  </span>
                                )}
                                <span className="text-[11px] text-gray-500">{categoryGroup.items.length} artigo(s)</span>
                                {section.key === "validade" && (() => {
                                  const summary = getValidityUrgencySummary(categoryGroup.items);
                                  return (
                                    <>
                                      {summary.vencidos > 0 && <span className="text-[11px] font-semibold text-red-700">{summary.vencidos} vencido(s)</span>}
                                      {summary.ate30 > 0 && <span className="text-[11px] font-semibold text-amber-700">{summary.ate30} até 30 dias</span>}
                                      {summary.ate90 > 0 && <span className="text-[11px] font-semibold text-blue-700">{summary.ate90} até 90 dias</span>}
                                    </>
                                  );
                                })()}
                              </div>
                              {canEditStock ? (
                                <button
                                  type="button"
                                  className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px]"
                                  onClick={() => {
                                    setSelectedIds((prev) => Array.from(new Set([...prev, ...categoryGroup.items.map((item) => item.id)])));
                                  }}
                                >
                                  Selecionar categoria
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isCategoryExpanded(section.key, categoryGroup.category) && categoryGroup.items.map(item => (
                <tr key={item.id} className={`border-t align-top ${(!item.precoVenda || Number(item.precoVenda) === 0) ? "bg-amber-50 hover:bg-amber-100" : "bg-white hover:bg-slate-50"}`}>
                  {(() => {
                    const need = stockNeedsById[item.id];
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <>
                  <td className="sticky left-0 z-10 w-10 border-r border-gray-200 bg-inherit p-2">
                    {canEditStock ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                        aria-label={`Selecionar artigo ${item.nome || item.descricao || item.referencia || item.id}`}
                      />
                    ) : null}
                  </td>
                  {isColumnVisible("foto") && <td className="p-2">
                    <div className="relative group">
                      {renderStockThumb(item)}
                    </div>
                  </td>}
                  {isColumnVisible("nome") && <td className="sticky left-10 z-10 border-r border-gray-200 bg-inherit p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{item.nome || item.descricao || "-"}</span>
                      {getApplicableRaftModelBadge(item) && (
                        <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {getApplicableRaftModelBadge(item)}
                        </span>
                      )}
                    </div>
                  </td>}
                  {isColumnVisible("referencia") && <td className="p-2">
                    <a
                      href={`/stock/${item.id}`}
                      className="inline-flex rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:underline"
                      title="Abrir ficha do produto"
                    >
                      {item.referencia || "-"}
                    </a>
                  </td>}
                  {isColumnVisible("estado") && <td className="p-2">{item.estadoArtigo || "ATIVO"}</td>}
                  {isColumnVisible("referenciaSubstituta") && <td className="p-2">{item.referenciaSubstituta || "-"}</td>}
                  {isColumnVisible("codigoFabricante") && <td className="p-2">
                    <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      {item.codigoFabricante || "-"}
                    </span>
                  </td>}
                  {isColumnVisible("quantidade") && <td className="p-2">
                    <div className="flex items-center gap-1">
                      <span className={isStockBaixo(item) ? "font-bold text-red-700" : ""}>{item.quantidade}</span>
                      {isStockBaixo(item) && (
                        <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-semibold" title={`Mínimo: ${item.quantidadeMinima}`}>
                          🔻 Baixo
                        </span>
                      )}
                      {isVencido(item) && (
                        <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          ❌ Vencido
                        </span>
                      )}
                      {!isVencido(item) && isValidadeProxima(item, 30) && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                          ⚠️ 30d
                        </span>
                      )}
                    </div>
                  </td>}
                  {isColumnVisible("quantidadeMinima") && <td className="p-2">{item.quantidadeMinima ?? "-"}</td>}
                  {isColumnVisible("precoVenda") && <td className="p-2">{Number(item.precoVenda ?? 0).toFixed(2)} €</td>}
                  {isColumnVisible("marcaModelo") && <td className="p-2">{item.aplicavelMarcaJangada || "-"} / {item.aplicavelModeloJangada || "-"}</td>}
                  {isColumnVisible("categoria") && <td className="p-2">{item.categoria}</td>}
                  {isColumnVisible("prateleira") && (
                    <td className="p-2">
                      {resolveShelfCode(item.localizacao) ? (
                        <button
                          type="button"
                          onClick={() => setFiltroPrateleira(resolveShelfCode(item.localizacao) || "")}
                          className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100"
                          title={item.localizacao || ""}
                        >
                          {resolveShelfCode(item.localizacao)}
                        </button>
                      ) : (
                        <span className="text-[11px] text-rose-600" title={item.localizacao || ""}>
                          {item.localizacao ? String(item.localizacao) : "—"}
                        </span>
                      )}
                    </td>
                  )}
                  {isColumnVisible("descricao") && <td className="p-2">
                    {item.descricao || "-"}
                  </td>}
                  {isColumnVisible("packs") && <td className="p-2">
                    {(item.tiposPackAssociados && item.tiposPackAssociados.length > 0)
                      ? item.tiposPackAssociados.join(", ")
                      : "-"}
                  </td>}
                  {isColumnVisible("necessidade12m") && <td className="p-2 font-semibold">{need?.necessidade12m ?? 0}</td>}
                  {isColumnVisible("saldoProjetado12m") && <td className={`p-2 font-semibold ${(need?.saldoProjetado12m ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {need?.saldoProjetado12m ?? item.quantidade}
                  </td>}
                  {isColumnVisible("necessidadeMensal") && <td className="p-2 text-[11px] leading-4 max-w-[320px]">
                    {renderMonthlyPlan(need?.mensal || [])}
                  </td>}
                  <td className="sticky right-0 z-10 flex gap-2 border-l border-gray-200 bg-inherit p-2">
                    {canEditStock ? (
                      <>
                        <button className="bg-green-600 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "entrada")}>+1</button>
                        <button className="bg-orange-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "saida")}>-1</button>
                        {isStockBaixo(item) && (
                          <button
                            className="bg-rose-600 px-2 py-1 rounded text-xs text-white"
                            onClick={() => handleReporAteMinimo(item)}
                            title="Repõe quantidade até ao mínimo definido"
                          >
                            Repôr mínimo
                          </button>
                        )}
                        <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white" onClick={() => openViewItem(item)}>Ver ficha</button>
                        <button className="bg-indigo-600 px-2 py-1 rounded text-xs text-white" onClick={() => void printLabels([item])}>Etiqueta</button>
                        <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                      </>
                    ) : (
                      <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white" onClick={() => openViewItem(item)}>Ver ficha</button>
                    )}
                  </td>
                      </>
                    );
                  })()}
                </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))}
            {itensFiltrados.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-500">
                <div className="flex flex-col items-center gap-3">
                  <span>Nenhum item de stock encontrado.</span>
                  {canEditStock ? (
                    <button type="button" onClick={openCreateItem} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                      + Adicionar item
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : viewMode === "quadros" ? (
          <div className="space-y-5">
            {stockPrioritySections.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{section.label}</h3>
                    <p className="text-xs text-gray-600">{section.description}</p>
                    {section.key === "validade" && (() => {
                      const summary = getValidityUrgencySummary(section.items);
                      return (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {summary.vencidos > 0 && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">❌ {summary.vencidos} vencido(s)</span>}
                          {summary.ate30 > 0 && <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">⚠️ {summary.ate30} até 30 dias</span>}
                          {summary.ate90 > 0 && <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">📅 {summary.ate90} até 90 dias</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                    {section.items.length} artigo(s)
                    {(() => {
                      const totalQtd = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0), 0);
                      const totalValor = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0) * Number(item2.precoVenda ?? 0), 0);
                      return (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{totalQtd} un.</span>
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(totalValor)}</span>
                        </div>
                      );
                    })()}
                  </span>
                </div>
                {section.categories.map((categoryGroup) => (
                  <div key={`${section.key}-${categoryGroup.category}`} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700"
                        onClick={() => toggleCategoryExpanded(section.key, categoryGroup.category)}
                      >
                        {isCategoryExpanded(section.key, categoryGroup.category) ? "▾" : "▸"}
                      </button>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getCategoryBadgeClasses(section.key, categoryGroup.category)}`}>
                        {categoryGroup.category}
                      </span>
                      {section.key === "validade" && isCriticalValidityCategory(categoryGroup.category) && (
                        <span className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          Categoria crítica
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500">{categoryGroup.items.length} artigo(s)</span>
                      {section.key === "validade" && (() => {
                        const summary = getValidityUrgencySummary(categoryGroup.items);
                        return (
                          <>
                            {summary.vencidos > 0 && <span className="text-[11px] font-semibold text-red-700">{summary.vencidos} vencido(s)</span>}
                            {summary.ate30 > 0 && <span className="text-[11px] font-semibold text-amber-700">{summary.ate30} até 30 dias</span>}
                            {summary.ate90 > 0 && <span className="text-[11px] font-semibold text-blue-700">{summary.ate90} até 90 dias</span>}
                          </>
                        );
                      })()}
                    </div>
                    {isCategoryExpanded(section.key, categoryGroup.category) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {categoryGroup.items.map((item) => (
                        <div
                          key={item.id}
                          className="border border-gray-200 rounded-lg bg-gray-50 p-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition"
                          role="button"
                          tabIndex={0}
                          onClick={() => openViewItem(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openViewItem(item);
                            }
                          }}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            {renderStockThumb(item)}
                            {canEditStock ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(item.id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleSelectItem(item.id)}
                                aria-label={`Selecionar artigo ${item.nome || item.descricao || item.referencia || item.id}`}
                              />
                            ) : null}
                          </div>
                          <h3 className="font-semibold text-gray-900">{item.nome || item.descricao || "-"}</h3>
                          {getApplicableRaftModelBadge(item) && (
                            <p className="mt-1 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                              {getApplicableRaftModelBadge(item)}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-1">
                            Quantidade: {item.quantidade}
                            {item.quantidadeMinima != null && (
                              <span className={isStockBaixo(item) ? "ml-1 font-semibold text-red-700" : "ml-1 text-gray-500"}>
                                (mín: {item.quantidadeMinima})
                              </span>
                            )}
                          </p>
                          {isStockBaixo(item) && (
                            <p className="text-[11px] font-semibold text-red-700">🔻 Abaixo do stock mínimo</p>
                          )}
                          <p className="text-xs text-gray-600">
                            Referência: <span className="font-medium text-indigo-700">{item.referencia || "-"}</span>
                          </p>
                          <p className="text-xs text-gray-600">Preço de venda: {Number(item.precoVenda ?? 0).toFixed(2)} €</p>
                          <p className="text-xs text-gray-600">Associável a jangada: {item.associavelJangada ? "Sim" : "Não"}</p>
                          <p className="text-xs text-gray-600">Marca/Modelo: {item.aplicavelMarcaJangada || "-"} / {item.aplicavelModeloJangada || "-"}</p>
                          <p className="text-xs text-gray-600">Categoria: {item.categoria || "-"}</p>
                          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white" onClick={() => openViewItem(item)}>Ver ficha</button>
                            {canEditStock ? (
                              <>
                                <button className="bg-green-600 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "entrada")}>+1</button>
                                <button className="bg-orange-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "saida")}>-1</button>
                                <button className="bg-indigo-600 px-2 py-1 rounded text-xs text-white" onClick={() => void printLabels([item])}>Etiqueta</button>
                                <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {itensFiltrados.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3 border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500 mb-3">Nenhum item de stock encontrado.</p>
                {canEditStock ? (
                  <button type="button" onClick={openCreateItem} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                    + Adicionar item
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {stockPrioritySections.map((section) => (
              <div key={section.key} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{section.label}</h3>
                    <p className="text-xs text-gray-600">{section.description}</p>
                    {section.key === "validade" && (() => {
                      const summary = getValidityUrgencySummary(section.items);
                      return (
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {summary.vencidos > 0 && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">❌ {summary.vencidos} vencido(s)</span>}
                          {summary.ate30 > 0 && <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">⚠️ {summary.ate30} até 30 dias</span>}
                          {summary.ate90 > 0 && <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">📅 {summary.ate90} até 90 dias</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                    {section.items.length} artigo(s)
                    {(() => {
                      const totalQtd = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0), 0);
                      const totalValor = section.items.reduce((acc2, item2) => acc2 + Number(item2.quantidade ?? 0) * Number(item2.precoVenda ?? 0), 0);
                      return (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{totalQtd} un.</span>
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(totalValor)}</span>
                        </div>
                      );
                    })()}
                  </span>
                </div>
                {section.categories.map((categoryGroup) => (
                  <div key={`${section.key}-${categoryGroup.category}`} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700"
                        onClick={() => toggleCategoryExpanded(section.key, categoryGroup.category)}
                      >
                        {isCategoryExpanded(section.key, categoryGroup.category) ? "▾" : "▸"}
                      </button>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getCategoryBadgeClasses(section.key, categoryGroup.category)}`}>
                        {categoryGroup.category}
                      </span>
                      {section.key === "validade" && isCriticalValidityCategory(categoryGroup.category) && (
                        <span className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          Categoria crítica
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500">{categoryGroup.items.length} artigo(s)</span>
                      {section.key === "validade" && (() => {
                        const summary = getValidityUrgencySummary(categoryGroup.items);
                        return (
                          <>
                            {summary.vencidos > 0 && <span className="text-[11px] font-semibold text-red-700">{summary.vencidos} vencido(s)</span>}
                            {summary.ate30 > 0 && <span className="text-[11px] font-semibold text-amber-700">{summary.ate30} até 30 dias</span>}
                            {summary.ate90 > 0 && <span className="text-[11px] font-semibold text-blue-700">{summary.ate90} até 90 dias</span>}
                          </>
                        );
                      })()}
                    </div>
                    {isCategoryExpanded(section.key, categoryGroup.category) && categoryGroup.items.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {renderStockThumb(item)}
                    <h3 className="font-semibold text-gray-900">{item.nome || item.descricao || "-"}</h3>
                    {getApplicableRaftModelBadge(item) && (
                      <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {getApplicableRaftModelBadge(item)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditStock ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        aria-label={`Selecionar artigo ${item.nome || item.descricao || item.referencia || item.id}`}
                      />
                    ) : null}
                    <button className="bg-blue-500 px-2 py-1 rounded text-xs text-white" onClick={() => openViewItem(item)}>Ver ficha</button>
                    {canEditStock ? (
                      <>
                        <button className="bg-green-600 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "entrada")}>+1</button>
                        <button className="bg-orange-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleStockOperation(item.id, "saida")}>-1</button>
                        <button className="bg-indigo-600 px-2 py-1 rounded text-xs text-white" onClick={() => void printLabels([item])}>Etiqueta</button>
                        <button className="bg-red-500 px-2 py-1 rounded text-xs text-white" onClick={() => handleDelete(item.id)}>Excluir</button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs">
                  <p>
                    <b>Quantidade:</b> {item.quantidade}
                    {item.quantidadeMinima != null && (
                      <span className={isStockBaixo(item) ? "ml-1 font-semibold text-red-700" : "ml-1 text-gray-500"}>
                        (mín: {item.quantidadeMinima})
                      </span>
                    )}
                  </p>
                  <p><b>Referência:</b> <span className="font-medium text-indigo-700">{item.referencia || "-"}</span></p>
                  <p><b>Preço de venda:</b> {Number(item.precoVenda ?? 0).toFixed(2)} €</p>
                  <p><b>Associável a jangada:</b> {item.associavelJangada ? "Sim" : "Não"}</p>
                  <p><b>Marca/Modelo:</b> {item.aplicavelMarcaJangada || "-"} / {item.aplicavelModeloJangada || "-"}</p>
                  <p><b>Categoria:</b> {item.categoria || "-"}</p>
                  <p><b>Descrição:</b> {item.descricao || "-"}</p>
                </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {itensFiltrados.length === 0 && (
              <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500 mb-3">Nenhum item de stock encontrado.</p>
                {canEditStock ? (
                  <button type="button" onClick={openCreateItem} className="bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                    + Adicionar item
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
      </section>
      </div>
      {/* Input global para upload de fotos */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
      <WarehouseMapDialog
        isOpen={isWarehouseMapOpen}
        onClose={() => setIsWarehouseMapOpen(false)}
        items={itens}
        mode={warehouseMapMode}
        selectedLocation={resolveShelfCode(fichaDraft?.localizacao) || fichaDraft?.localizacao || ""}
        onSelectLocation={(loc) => {
          if (warehouseMapMode === "select" && fichaDraft) {
            const code = resolveShelfCode(loc) || loc;
            setFichaDraft((prev: any) => (prev ? { ...prev, localizacao: code } : null));
          } else if (warehouseMapMode === "view") {
            setFiltroPrateleira(resolveShelfCode(loc) || "");
          }
        }}
      />
      {/* Enhanced Barcode Scanner - Add item to raft */}
      <button
        onClick={() => { setScanStep("item"); setShowScanner(true); setScannedItem(null); }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 flex items-center justify-center transition-all hover:scale-110"
        title="Scan para adicionar artigo à jangada"
      >
        <ScanLine size={22} />
      </button>

      {showScanner && scanStep === "item" && (
        <BarcodeScanner
          onScan={async (code) => {
            try {
              const res = await fetch(`/api/stock?q=${encodeURIComponent(code)}&limit=1`);
              const data = await res.json();
              const item = Array.isArray(data) ? data[0] : null;
              if (item) {
                setScannedItem(item);
                setScanStep("jangada");
              } else {
                const create = window.confirm(`Artigo "${code}" não encontrado. Criar novo?`);
                if (create) {
                  window.location.href = `/stock?newRef=${encodeURIComponent(code)}`;
                } else {
                  setShowScanner(false);
                  setScanStep(null);
                }
              }
            } catch { alert("Erro ao consultar stock."); setShowScanner(false); setScanStep(null); }
          }}
          onClose={() => { setShowScanner(false); setScanStep(null); setScannedItem(null); }}
        />
      )}

      {showScanner && scanStep === "jangada" && scannedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-2">Adicionar à Jangada</h3>
            <p className="text-sm text-slate-600 mb-4">
              Artigo: <strong>{scannedItem.descricao || scannedItem.referencia}</strong>
              <br />Stock atual: <strong>{scannedItem.quantidade}</strong>
            </p>
            <p className="text-xs text-slate-500 mb-4">Lê agora o código de barras da jangada (serial):</p>
            <BarcodeScanner
              onScan={async (serial) => {
                try {
                  const res = await fetch(`/api/jangadas/search?serial=${encodeURIComponent(serial)}`);
                  const jangada = await res.json();
                  if (!jangada || !jangada.id) {
                    const create = window.confirm(`Jangada com serial "${serial}" não encontrada.\nDeseja criar uma nova jangada com este serial?`);
                    if (create) {
                      window.open(`/jangadas/novo?serial=${encodeURIComponent(serial)}`, "_blank");
                    }
                    return;
                  }
                  const qty = parseInt(prompt("Quantidade a adicionar:", "1") || "1");
                  const validade = prompt("Validade (MM/AAAA) - deixar em branco se não aplicável:", "") || "";
                  await fetch(`/api/jangadas/${jangada.id}/artigos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: scannedItem.descricao || scannedItem.referencia,
                      quantidade: qty,
                      referencia: scannedItem.referencia,
                      validade,
                      codigoFabricante: scannedItem.codigoFabricante || "",
                      stockId: scannedItem.id,
                    }),
                  });
                  // Update stock validity to match
                  if (validade) {
                    await fetch(`/api/stock/${scannedItem.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ validade, quantidade: Math.max(0, scannedItem.quantidade - qty) }),
                    });
                  }
                  alert(`✅ ${qty}x ${scannedItem.referencia} adicionado à jangada ${jangada.serial || serial}!`);
                  const openJangada = window.confirm("Abrir ficha da jangada?");
                  if (openJangada) window.open(`/jangadas/${jangada.id}`, "_blank");
                  setShowScanner(false);
                  setScanStep(null);
                  setScannedItem(null);
                  window.location.reload();
                } catch { alert("Erro ao processar."); }
              }}
              onClose={() => { setShowScanner(false); setScanStep(null); setScannedItem(null); }}
            />
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

