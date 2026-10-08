"use client";

import { useCallback, useEffect, useState } from "react";
import { appToast } from "@/lib/app-toast";
import type { CalibracaoFormState, CalibracaoRegisto } from "@/lib/calibracoes";

export function useCalibracoes(options: { seedCompressor?: boolean } = {}) {
  const { seedCompressor = false } = options;
  const [items, setItems] = useState<CalibracaoRegisto[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const url = seedCompressor
        ? "/api/equipamentos-calibracao?seedCompressor=true"
        : "/api/equipamentos-calibracao";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar os registos");
      setItems((await res.json()) as CalibracaoRegisto[]);
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar os registos");
    } finally {
      setLoading(false);
    }
  }, [seedCompressor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento inicial dos registos a partir da API.
    void fetchItems();
  }, [fetchItems]);

  const guardar = useCallback(
    async (form: CalibracaoFormState, editId: number | null) => {
      const url = editId ? `/api/equipamentos-calibracao/${editId}` : "/api/equipamentos-calibracao";
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Erro ao gravar");
      }

      appToast.success(editId ? "Registo atualizado" : "Registo criado com sucesso");
      await fetchItems();
    },
    [fetchItems],
  );

  const eliminar = useCallback(
    async (id: number) => {
      if (!confirm("Tem certeza que deseja eliminar este registo?")) return;
      try {
        const res = await fetch(`/api/equipamentos-calibracao/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Erro ao eliminar");
        appToast.success("Registo eliminado");
        await fetchItems();
      } catch (err: unknown) {
        appToast.error(err instanceof Error ? err.message : "Erro ao eliminar");
      }
    },
    [fetchItems],
  );

  return { items, loading, fetchItems, guardar, eliminar };
}
