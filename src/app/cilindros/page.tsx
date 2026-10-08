"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate, parseFlexibleDate } from "@/lib/date-utils";
import { formatValidityDisplay } from "@/lib/date-display";
import { normalizeText } from "@/lib/text-normalization";
import { normalizeCylinderSerialKey } from "@/lib/cilindros-page-helpers";
import { fmtPeso } from "@/lib/liferaft-diagram-helpers";
import type { CylinderStockItem, RaftCylinderInfo, NewCylinderDraft } from "@/types/cilindros-page";

export default function CilindrosPage() {
  const [items, setItems] = useState<CylinderStockItem[]>([]);
  const [rafts, setRafts] = useState<RaftCylinderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [filtroCarga, setFiltroCarga] = useState<"TODOS" | "CHEIO" | "VAZIO" | "PARCIAL">("TODOS");
  const [draft, setDraft] = useState<NewCylinderDraft>({
    jangadaId: "",
    stockItemId: "",
    cylinderSerial: "",
    cylinderSistema: "",
    cylinderCo2: "",
    cylinderN2: "",
    cylinderDataTeste: "",
    estadoCargaCilindro: "CHEIO",
    localizacao: "",
  });

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [stockRes, raftsRes] = await Promise.all([
        fetch("/api/stock?categoria=CILINDROS&includeInactive=true", { cache: "no-store" }),
        fetch("/api/jangadas", { cache: "no-store" }),
      ]);

      const stockData = await stockRes.json().catch(() => []);
      const raftData = await raftsRes.json().catch(() => []);

      if (!stockRes.ok) throw new Error(stockData?.error || "Falha ao carregar cilindros.");
      if (!raftsRes.ok) throw new Error(raftData?.error || "Falha ao carregar associação de jangadas.");

      const list = Array.isArray(stockData) ? (stockData as CylinderStockItem[]) : [];
      const raftsList = Array.isArray(raftData) ? (raftData as RaftCylinderInfo[]) : [];

      setItems(list);
      setRafts(raftsList);
    } catch (err) {
      setItems([]);
      setRafts([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar módulo de cilindros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadData();
    })();
  }, []);

  const rows = useMemo(() => {
    const normalizeKey = (value: unknown) => normalizeText(value).replace(/\s+/g, "");

    return rafts.map((raft) => {
      const serialToken = normalizeKey(raft.cylinderSerial);
      const stockMatch = serialToken
        ? items.find((item) => {
            const ref = normalizeKey(item.referencia);
            const fab = normalizeKey(item.codigoFabricante);
            const desc = normalizeText(item.descricao);
            return ref === serialToken || fab === serialToken || desc.includes(serialToken);
          })
        : undefined;

      return {
        ...raft,
        stockMatch,
        displayCylinderSerial: String(raft.cylinderSerial || "").trim() || "S/N",
      };
    });
  }, [rafts, items]);

  const proximosTestesHidraulicos = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return rows
      .map((row) => {
        const proxDate = parseFlexibleDate(row.cylinderDataProxTeste);
        if (!proxDate) return null;
        const diffMs = proxDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return {
          ...row,
          proxDate,
          diffDays,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => a.proxDate.getTime() - b.proxDate.getTime())
      .slice(0, 12);
  }, [rows]);

  const filtered = useMemo(() => {
    const term = normalizeText(search);
    return rows.filter((row) => {
      const haystack = normalizeText([
        row.serial,
        row.brand,
        row.model,
        row.displayCylinderSerial,
        row.cylinderSistema,
        row.cylinderCo2,
        row.cylinderN2,
        row.stockMatch?.referencia,
        row.stockMatch?.descricao,
        row.stockMatch?.codigoFabricante,
      ].join(" "));

      const carga = normalizeText(row.stockMatch?.estadoCargaCilindro);
      const okSearch = !term || haystack.includes(term);
      const okCarga =
        filtroCarga === "TODOS" ||
        (filtroCarga === "CHEIO" && carga.includes("cheio")) ||
        (filtroCarga === "VAZIO" && carga.includes("vazio")) ||
        (filtroCarga === "PARCIAL" && (carga.includes("parcial") || carga.includes("medio")));

      return okSearch && okCarga;
    });
  }, [rows, search, filtroCarga]);

  const totalQuantidade = useMemo(
    () => filtered.reduce((acc, row) => acc + Number(row.stockMatch?.quantidade || 0), 0),
    [filtered],
  );

  const totalCheios = useMemo(
    () => filtered.filter((row) => normalizeText(row.stockMatch?.estadoCargaCilindro).includes("cheio")).length,
    [filtered],
  );

  const cilindrosCheiosDisponiveis = useMemo(() => {
    const rowsByStockId = new Map<number, number>();
    for (const row of rows) {
      const stockId = row.stockMatch?.id;
      if (!stockId) continue;
      rowsByStockId.set(stockId, (rowsByStockId.get(stockId) || 0) + 1);
    }

    return items
      .filter((item) => normalizeText(item.estadoArtigo) !== "inativo")
      .filter((item) => normalizeText(item.estadoCargaCilindro).includes("cheio"))
      .filter((item) => Number(item.quantidade || 0) > 0)
      .map((item) => {
        const installedCount = rowsByStockId.get(item.id) || 0;
        return {
          ...item,
          installedCount,
          disponivel: Math.max(0, Number(item.quantidade || 0) - installedCount),
        };
      })
      .sort((a, b) => {
        const diff = b.disponivel - a.disponivel;
        if (diff !== 0) return diff;
        return String(a.referencia || "").localeCompare(String(b.referencia || ""), "pt-PT");
      });
  }, [items, rows]);

  const cilindrosVaziosOuParciaisDisponiveis = useMemo(() => {
    const rowsByStockId = new Map<number, number>();
    for (const row of rows) {
      const stockId = row.stockMatch?.id;
      if (!stockId) continue;
      rowsByStockId.set(stockId, (rowsByStockId.get(stockId) || 0) + 1);
    }

    return items
      .filter((item) => normalizeText(item.estadoArtigo) !== "inativo")
      .filter((item) => Number(item.quantidade || 0) > 0)
      .filter((item) => {
        const estado = normalizeText(item.estadoCargaCilindro);
        return estado.includes("vazio") || estado.includes("parcial") || estado.includes("medio");
      })
      .map((item) => {
        const installedCount = rowsByStockId.get(item.id) || 0;
        return {
          ...item,
          installedCount,
          disponivel: Math.max(0, Number(item.quantidade || 0) - installedCount),
        };
      })
      .sort((a, b) => {
        const diff = b.disponivel - a.disponivel;
        if (diff !== 0) return diff;
        return String(a.referencia || "").localeCompare(String(b.referencia || ""), "pt-PT");
      });
  }, [items, rows]);

  const cilindrosStockSelecionaveis = useMemo(
    () =>
      items
        .filter((item) => normalizeText(item.estadoArtigo) !== "inativo")
        .filter((item) => Number(item.quantidade || 0) > 0)
        .sort((a, b) => String(a.referencia || "").localeCompare(String(b.referencia || ""), "pt-PT")),
    [items],
  );

  const stockSerialKeys = useMemo(
    () =>
      new Set(
        items
          .flatMap((item) => [item.referencia, item.codigoFabricante])
          .map((value) => normalizeCylinderSerialKey(value))
          .filter(Boolean),
      ),
    [items],
  );

  const raftSerialKeysById = useMemo(() => {
    const map = new Map<number, string>();
    for (const raft of rafts) {
      const key = normalizeCylinderSerialKey(raft.cylinderSerial);
      if (!key) continue;
      map.set(raft.id, key);
    }
    return map;
  }, [rafts]);

  const handleCreateAndAssociate = async () => {
    const jangadaId = Number(draft.jangadaId);
    const hasJangadaSelecionada = Number.isFinite(jangadaId) && jangadaId > 0;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const selectedStockId = Number(draft.stockItemId);
      const selectedStockItem = Number.isFinite(selectedStockId)
        ? items.find((item) => item.id === selectedStockId)
        : undefined;
      const shouldCreateNewStock = !selectedStockItem;

      if (!hasJangadaSelecionada && !shouldCreateNewStock) {
        throw new Error("Selecionaste um cilindro existente; escolhe uma jangada para fazer a associação.");
      }

      const serialValue = String(
        draft.cylinderSerial || selectedStockItem?.referencia || selectedStockItem?.codigoFabricante || "",
      ).trim();
      const serialKey = normalizeCylinderSerialKey(serialValue);

      if (shouldCreateNewStock && serialKey && stockSerialKeys.has(serialKey)) {
        throw new Error("Já existe um cilindro no stock com esse número de série/referência.");
      }

      if (hasJangadaSelecionada && serialKey) {
        const duplicateRaft = rafts.find((raft) => raft.id !== jangadaId && raftSerialKeysById.get(raft.id) === serialKey);
        if (duplicateRaft) {
          throw new Error(
            `Esse cilindro já está associado a outra jangada (${duplicateRaft.brand || "—"} ${duplicateRaft.model || ""} · ${String(duplicateRaft.serial || "").trim() || "S/N"}).`,
          );
        }
      }

      if (shouldCreateNewStock) {
        const stockPayload = {
          referencia: serialValue || `S/N-${Date.now()}`,
          descricao: `Cilindro ${serialValue || "S/N"}`,
          categoria: "CILINDROS",
          estadoArtigo: "ATIVO",
          quantidade: 1,
          estadoCargaCilindro: draft.estadoCargaCilindro,
          localizacao: draft.localizacao || null,
        };

        const stockRes = await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stockPayload),
        });

        const stockBody = await stockRes.json().catch(() => ({}));
        if (!stockRes.ok) throw new Error(stockBody?.error || "Falha ao criar cilindro em stock.");
      }

      if (hasJangadaSelecionada) {
        const raftRes = await fetch(`/api/jangadas?id=${jangadaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capacity: Number(rafts.find((r) => r.id === jangadaId)?.capacity || 0),
            cylinderSerial: serialValue,
            cylinderSistema: draft.cylinderSistema || null,
            cylinderCo2: draft.cylinderCo2 || null,
            cylinderN2: draft.cylinderN2 || null,
            cylinderDataTeste: draft.cylinderDataTeste || null,
          }),
        });

        const raftBody = await raftRes.json().catch(() => ({}));
        if (!raftRes.ok) throw new Error(raftBody?.error || "Falha ao associar cilindro à jangada.");
      }

      setDraft({
        jangadaId: "",
        stockItemId: "",
        cylinderSerial: "",
        cylinderSistema: "",
        cylinderCo2: "",
        cylinderN2: "",
        cylinderDataTeste: "",
        estadoCargaCilindro: "CHEIO",
        localizacao: "",
      });
      if (shouldCreateNewStock && hasJangadaSelecionada) {
        setSuccess("Cilindro criado em stock e associado à jangada com sucesso.");
      } else if (shouldCreateNewStock && !hasJangadaSelecionada) {
        setSuccess("Cilindro criado em stock com sucesso (sem associação a jangada).");
      } else {
        setSuccess("Cilindro de stock associado à jangada com sucesso.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar/associar cilindro.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ds-page">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Módulo de Cilindros</h1>
          <p className="mt-2 text-sm text-slate-500">
            Lista completa de cilindros instalados por jangada (1 linha por jangada), com associação ao stock.
          </p>
        </div>
        <Link
          href="/stock?categoria=CILINDROS"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Abrir no Stock geral
        </Link>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Adicionar novo cilindro e associar à jangada</h2>
        <p className="mb-3 text-xs text-slate-500">
          Se não selecionar jangada, o cilindro fica disponível no stock: <b>CHEIO</b> entra na lista GI e <b>VAZIO/PARCIAL</b> entra na lista TH/carregamento.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Cilindro existente em stock (opcional)</span>
            <select
              value={draft.stockItemId}
              onChange={(event) => {
                const nextId = event.target.value;
                const selected = cilindrosStockSelecionaveis.find((item) => String(item.id) === nextId);
                setDraft((prev) => ({
                  ...prev,
                  stockItemId: nextId,
                  cylinderSerial: selected
                    ? String(selected.referencia || selected.codigoFabricante || prev.cylinderSerial || "")
                    : prev.cylinderSerial,
                  estadoCargaCilindro: selected
                    ? ((String(selected.estadoCargaCilindro || "").toUpperCase() as "CHEIO" | "VAZIO" | "PARCIAL") || prev.estadoCargaCilindro)
                    : prev.estadoCargaCilindro,
                  localizacao: selected ? String(selected.localizacao || prev.localizacao || "") : prev.localizacao,
                }));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Criar novo cilindro</option>
              {cilindrosStockSelecionaveis.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {(item.referencia || item.codigoFabricante || `ID ${item.id}`)} · {(item.descricao || "Sem descrição")} · Qtd {Number(item.quantidade || 0)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Jangada</span>
            <select
              value={draft.jangadaId}
              onChange={(event) => setDraft((prev) => ({ ...prev, jangadaId: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Sem associação (fica só em stock)</option>
              {rafts.map((raft) => (
                <option key={raft.id} value={String(raft.id)}>
                  {raft.brand || "—"} {raft.model || ""} · {String(raft.serial || "").trim() || "S/N"}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Nº série cilindro</span>
            <input
              value={draft.cylinderSerial}
              onChange={(event) => setDraft((prev) => ({ ...prev, cylinderSerial: event.target.value }))}
              placeholder="Ex.: 0871900"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Sistema</span>
            <input
              value={draft.cylinderSistema}
              onChange={(event) => setDraft((prev) => ({ ...prev, cylinderSistema: event.target.value }))}
              placeholder="Leafield / Thanner / ..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Estado carga</span>
            <select
              value={draft.estadoCargaCilindro}
              onChange={(event) => setDraft((prev) => ({ ...prev, estadoCargaCilindro: event.target.value as "CHEIO" | "VAZIO" | "PARCIAL" }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="CHEIO">Cheio</option>
              <option value="PARCIAL">Parcial</option>
              <option value="VAZIO">Vazio</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">CO2</span>
            <input
              value={draft.cylinderCo2}
              onChange={(event) => setDraft((prev) => ({ ...prev, cylinderCo2: event.target.value }))}
              placeholder="Ex.: 3.59"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">N2</span>
            <input
              value={draft.cylinderN2}
              onChange={(event) => setDraft((prev) => ({ ...prev, cylinderN2: event.target.value }))}
              placeholder="Ex.: 0.18"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Último teste hid.</span>
            <input
              type="date"
              value={draft.cylinderDataTeste}
              onChange={(event) => setDraft((prev) => ({ ...prev, cylinderDataTeste: event.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Localização stock</span>
            <input
              value={draft.localizacao}
              onChange={(event) => setDraft((prev) => ({ ...prev, localizacao: event.target.value }))}
              placeholder="Armazém / Prateleira"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => void handleCreateAndAssociate()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "A guardar..." : "Guardar cilindro (com ou sem associação)"}
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="mt-2 h-7 w-16 rounded bg-slate-200" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Registos</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{filtered.length}</p>
              <p className="mt-1 text-xs text-slate-500">Total jangadas: {rafts.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Quantidade total</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{totalQuantidade}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Cilindros &quot;Cheio&quot;</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{totalCheios}</p>
            </div>
          </>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-900">Próximos cilindros a fazer teste hidráulico</h2>
          <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs font-semibold text-amber-800">
            {proximosTestesHidraulicos.length} próximos registos
          </span>
        </div>

        {proximosTestesHidraulicos.length === 0 ? (
          <p className="text-sm text-amber-800">Sem datas de próximo teste hidráulico registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-xs">
              <thead>
                <tr className="text-amber-900">
                  <th className="px-2 py-1 text-left">Jangada</th>
                  <th className="px-2 py-1 text-left">Serial jangada</th>
                  <th className="px-2 py-1 text-left">Serial cilindro</th>
                  <th className="px-2 py-1 text-left">Sistema</th>
                  <th className="px-2 py-1 text-left">Próx. teste</th>
                  <th className="px-2 py-1 text-left">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {proximosTestesHidraulicos.map((row) => (
                  <tr key={`hydro-next-${row.id}`} className="border-t border-amber-100">
                    <td className="px-2 py-1 font-semibold">
                      <Link href={`/jangadas/${row.id}`} className="text-blue-700 hover:underline">
                        {row.brand || "—"} {row.model || ""}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{String(row.serial || "").trim() || "S/N"}</td>
                    <td className="px-2 py-1">{row.displayCylinderSerial}</td>
                    <td className="px-2 py-1">{row.cylinderSistema || "—"}</td>
                    <td className="px-2 py-1 font-semibold">{formatDate(row.cylinderDataProxTeste)}</td>
                    <td className={`px-2 py-1 font-semibold ${row.diffDays < 0 ? "text-red-700" : row.diffDays <= 30 ? "text-amber-700" : "text-emerald-700"}`}>
                      {row.diffDays < 0
                        ? `${(Math.abs(row.diffDays) / 365).toFixed(1)} anos em atraso`
                        : `${row.diffDays} dias`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-emerald-900">Cilindros cheios disponíveis para substituição (GI)</h2>
          <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {cilindrosCheiosDisponiveis.length} referências com stock cheio
          </span>
        </div>

        {cilindrosCheiosDisponiveis.length === 0 ? (
          <p className="text-sm text-emerald-800">Sem cilindros cheios disponíveis no stock.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-xs">
              <thead>
                <tr className="text-emerald-900">
                  <th className="px-2 py-1 text-left">Referência</th>
                  <th className="px-2 py-1 text-left">Descrição</th>
                  <th className="px-2 py-1 text-left">Qtd stock</th>
                  <th className="px-2 py-1 text-left">Instalados</th>
                  <th className="px-2 py-1 text-left">Disponível GI</th>
                </tr>
              </thead>
              <tbody>
                {cilindrosCheiosDisponiveis.map((item) => (
                  <tr key={`cheio-${item.id}`} className="border-t border-emerald-100">
                    <td className="px-2 py-1 font-semibold">{item.referencia || "—"}</td>
                    <td className="px-2 py-1">{item.descricao || "—"}</td>
                    <td className="px-2 py-1">{Number(item.quantidade || 0)}</td>
                    <td className="px-2 py-1">{item.installedCount}</td>
                    <td className="px-2 py-1 font-semibold text-emerald-700">{item.disponivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-amber-900">Cilindros vazios/parciais para teste hidráulico e carregamento</h2>
          <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs font-semibold text-amber-700">
            {cilindrosVaziosOuParciaisDisponiveis.length} referências vazias/parciais
          </span>
        </div>

        {cilindrosVaziosOuParciaisDisponiveis.length === 0 ? (
          <p className="text-sm text-amber-800">Sem cilindros vazios/parciais disponíveis no stock.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-xs">
              <thead>
                <tr className="text-amber-900">
                  <th className="px-2 py-1 text-left">Referência</th>
                  <th className="px-2 py-1 text-left">Descrição</th>
                  <th className="px-2 py-1 text-left">Estado carga</th>
                  <th className="px-2 py-1 text-left">Qtd stock</th>
                  <th className="px-2 py-1 text-left">Instalados</th>
                  <th className="px-2 py-1 text-left">Disponível TH</th>
                </tr>
              </thead>
              <tbody>
                {cilindrosVaziosOuParciaisDisponiveis.map((item) => (
                  <tr key={`vazio-th-${item.id}`} className="border-t border-amber-100">
                    <td className="px-2 py-1 font-semibold">{item.referencia || "—"}</td>
                    <td className="px-2 py-1">{item.descricao || "—"}</td>
                    <td className="px-2 py-1">{item.estadoCargaCilindro || "—"}</td>
                    <td className="px-2 py-1">{Number(item.quantidade || 0)}</td>
                    <td className="px-2 py-1">{item.installedCount}</td>
                    <td className="px-2 py-1 font-semibold text-amber-700">{item.disponivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <label className="md:col-span-3">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Pesquisar</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Referência, descrição, código fabricante, localização..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-slate-600">Estado de carga</span>
          <select
            value={filtroCarga}
            onChange={(event) => setFiltroCarga(event.target.value as "TODOS" | "CHEIO" | "VAZIO" | "PARCIAL")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="TODOS">Todos</option>
            <option value="CHEIO">Cheio</option>
            <option value="VAZIO">Vazio</option>
            <option value="PARCIAL">Parcial</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[980px] w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="px-3 py-2 text-left">Jangada</th>
              <th className="px-3 py-2 text-left">Serial jangada</th>
              <th className="px-3 py-2 text-left">Nº série cilindro</th>
              <th className="px-3 py-2 text-left">Sistema</th>
              <th className="px-3 py-2 text-left">CO2</th>
              <th className="px-3 py-2 text-left">N2</th>
              <th className="px-3 py-2 text-left">Últ. teste hid.</th>
              <th className="px-3 py-2 text-left">Próx. teste hid.</th>
              <th className="px-3 py-2 text-left">Ref. stock</th>
              <th className="px-3 py-2 text-left">Descrição stock</th>
              <th className="px-3 py-2 text-left">Qtd</th>
              <th className="px-3 py-2 text-left">Estado carga</th>
              <th className="px-3 py-2 text-left">Validade</th>
              <th className="px-3 py-2 text-left">Estado artigo</th>
              <th className="px-3 py-2 text-left">Localização</th>
              <th className="px-3 py-2 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={16} className="px-3 py-6 text-center text-slate-500">A carregar cilindros...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-3 py-6 text-center text-slate-500">Sem cilindros para apresentar.</td>
              </tr>
            ) : (
              filtered.map((row) => {
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <Link href={`/jangadas/${row.id}`} className="text-blue-700 hover:underline font-medium">
                        {(row.brand || "—")} {(row.model || "")}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{String(row.serial || "").trim() || "S/N"}</td>
                    <td className="px-3 py-2">{row.displayCylinderSerial}</td>
                    <td className="px-3 py-2">{row.cylinderSistema || "—"}</td>
                    <td className="px-3 py-2">{fmtPeso(row.cylinderCo2, " kg")}</td>
                    <td className="px-3 py-2">{fmtPeso(row.cylinderN2, " kg")}</td>
                    <td className="px-3 py-2">{formatValidityDisplay(row.cylinderDataTeste)}</td>
                    <td className="px-3 py-2">{formatValidityDisplay(row.cylinderDataProxTeste)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.stockMatch?.referencia || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{row.stockMatch?.descricao || "—"}</td>
                    <td className="px-3 py-2">{Number(row.stockMatch?.quantidade || 0)}</td>
                    <td className="px-3 py-2">{row.stockMatch?.estadoCargaCilindro || "—"}</td>
                    <td className="px-3 py-2">{row.stockMatch?.validade || "—"}</td>
                    <td className="px-3 py-2">{row.stockMatch?.estadoArtigo || "—"}</td>
                    <td className="px-3 py-2">{row.stockMatch?.localizacao || "—"}</td>
                    <td className="px-3 py-2">
                      {row.stockMatch ? (
                        <Link href={`/stock/${row.stockMatch.id}`} className="text-blue-700 hover:underline">
                          Ver artigo
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
