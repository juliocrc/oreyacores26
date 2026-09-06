"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { toLocalISO } from '@/lib/date-utils';

interface Tecnico {
  id: number;
  nome: string;
}

interface RaftInfo {
  id?: number;
  serial?: string;
  brand?: string;
  model?: string;
  shipNameManual?: string;
  owner?: string;
  responsavel?: string;
}

interface ReceiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  jangada: RaftInfo;
}

export default function ReceiveDialog({
  isOpen,
  onClose,
  onDone,
  jangada,
}: ReceiveDialogProps) {
  const [date, setDate] = useState("");
  const [tecnico, setTecnico] = useState(jangada.responsavel || "");
  const [note, setNote] = useState("");
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTecnicos = useCallback(async () => {
    try {
      const res = await fetch("/api/tecnicos?includeInactive=false");
      if (res.ok) {
        const raw = await res.json();
        const list: Tecnico[] = [];
        if (Array.isArray(raw.stations)) {
          raw.stations.forEach((station: { tecnicos?: Tecnico[] }) => {
            if (Array.isArray(station.tecnicos)) {
              station.tecnicos.forEach((tech: Tecnico) => list.push(tech));
            }
          });
        }
        if (Array.isArray(raw.unassigned)) {
          (raw.unassigned as Tecnico[]).forEach((tech: Tecnico) => list.push(tech));
        }
        const unique: Tecnico[] = [];
        const seen = new Set<string>();
        list.forEach(item => {
          if (item && item.nome && !seen.has(item.nome)) {
            seen.add(item.nome);
            unique.push(item);
          }
        });
        setTecnicos(unique);
      }
    } catch (err) {
      console.error("Error loading technicians:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      setDate(toLocalISO(today));
      setTecnico(jangada.responsavel || "");
      setNote("");
      setError("");
      setSuccess("");
      void loadTecnicos();
    }
  }, [isOpen, jangada.responsavel, loadTecnicos]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Por favor, introduza uma data e hora válidas.");
      }

      const queueBody = {
        raftId: jangada.id,
        workflowStatus: "entrada_estacao",
        status: "aguardar",
        tecnico: tecnico || undefined,
        observacao: note || undefined,
        arrivalDate: parsedDate.toISOString().slice(0, 10),
        arrivedViaForwarder: false,
        expectedDeliveryDate: date
      };

      const queueRes = await fetch("/api/service-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queueBody)
      });

      if (!queueRes.ok) {
        const errorJson = await queueRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Erro ao marcar a jangada como recebida na estação.");
      }

      setSuccess("Jangada recebida na estação de serviço com sucesso!");
      setTimeout(() => {
        onDone();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao receber a jangada.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col text-left">
        <div className="flex justify-between items-center border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">Recebida na Estação</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full w-8 h-8 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
              {success}
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs text-slate-600">
            <p><b>Jangada:</b> {jangada.brand} {jangada.model} ({jangada.serial})</p>
            <p><b>Navio:</b> {jangada.shipNameManual || jangada.owner || "Sem navio"}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Data / Hora de Entrada</label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Técnico Responsável</label>
            <select
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Escolher técnico...</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.nome}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notas / Observações</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Estado da jangada à chegada, instruções adicionais..."
              rows={3}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "A registar..." : "Registar Receção"}
          </button>
        </div>
      </div>
    </div>
  );
}
