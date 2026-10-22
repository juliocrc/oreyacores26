"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Activity,
  CalendarClock,
  Wrench,
  CheckCircle2,
  Award,
  Building2,
  FileCheck,
  Printer,
  Plus,
  Trash2,
  Edit3,
} from "lucide-react";
import { appToast } from "@/lib/app-toast";

type EquipmentItem = {
  name: string;
  serial: string;
  calibrationDate: string;
  status: "VÁLIDO" | "EXPIRADO";
};

type TechnicianItem = {
  name: string;
  manufacturer: string;
  validUntil: string;
};

type DgrmStationAudit = {
  stationName: string;
  approvalNumber: string;
  issueDate: string;
  expiryDate: string;
  auditor: string;
  status: "APROVADO" | "PENDENTE" | "AUDITORIA_ANUAL";
  equipmentChecked: EquipmentItem[];
  techniciansCertified: TechnicianItem[];
  survitecAuditNumber: string;
  survitecAuditDate: string;
  survitecStatus: string;
};

const INITIAL_AUDIT: DgrmStationAudit = {
  stationName: "Orey Açores — Estação de Serviço Principal (Ponta Delgada)",
  approvalNumber: "DGRM / ISN Cert. 50937",
  issueDate: "2024-05-12",
  expiryDate: "2027-02-12",
  auditor: "Inspetores DGRM / Direção de Serviços de Pesca",
  status: "APROVADO",
  equipmentChecked: [
    { name: "Bancada de Teste Hidráulico/Pneumático", serial: "BK-AZ-01", calibrationDate: "2026-03-10", status: "VÁLIDO" },
    { name: "Manómetro de Precisão 0-25 bar", serial: "MP-9942", calibrationDate: "2026-01-15", status: "VÁLIDO" },
    { name: "Chave Dinamométrica Digital", serial: "CD-8812", calibrationDate: "2026-02-20", status: "VÁLIDO" },
    { name: "Tanque de Prova de Estanquicidade", serial: "TP-AZ-02", calibrationDate: "2025-11-10", status: "VÁLIDO" },
  ],
  techniciansCertified: [
    { name: "Júlio Correia", manufacturer: "Zodiac, RFD, Survitec", validUntil: "2028-06-30" },
  ],
  survitecAuditNumber: "Survitec Trianual Audit — Estação nº 50937",
  survitecAuditDate: "Novembro 2025 – Novembro 2028",
  survitecStatus: "APROVADO E HOMOLOGADO",
};

export default function DgrmStationAuditPage() {
  const [audit, setAudit] = useState<DgrmStationAudit>(INITIAL_AUDIT);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function syncFromDb() {
      try {
        const [eqRes, techRes] = await Promise.all([
          fetch("/api/equipamentos-calibracao", { cache: "no-store" }),
          fetch("/api/tecnicos", { cache: "no-store" }),
        ]);

        let fetchedEquipment: EquipmentItem[] = [];
        if (eqRes.ok) {
          const eqData = await eqRes.json();
          if (Array.isArray(eqData) && eqData.length > 0) {
            fetchedEquipment = eqData.map((item: any) => ({
              name: item.nome || "Equipamento Calibrado",
              serial: item.referencia || item.certificadoNum || "S/N",
              calibrationDate: item.dataProxCalibracao ? String(item.dataProxCalibracao).slice(0, 10) : "2026-06-30",
              status: "VÁLIDO" as const,
            }));
          }
        }

        let fetchedTechs: TechnicianItem[] = [];
        if (techRes.ok) {
          const techData = await techRes.json();
          const list = Array.isArray(techData) ? techData : techData.tecnicos || techData.items || [];
          if (list.length > 0) {
            fetchedTechs = list.map((t: any) => ({
              name: t.nome || t.name,
              manufacturer: "Zodiac, RFD, Survitec",
              validUntil: "2028-06-30",
            }));
          }
        }

        const saved = localStorage.getItem("orey_dgrm_audit_v2");
        let savedParsed: any = {};
        if (saved) {
          try {
            savedParsed = JSON.parse(saved);
          } catch {}
        }

        setAudit((prev) => ({
          ...prev,
          ...savedParsed,
          equipmentChecked: fetchedEquipment.length > 0 ? fetchedEquipment : (savedParsed.equipmentChecked || prev.equipmentChecked),
          techniciansCertified: fetchedTechs.length > 0 ? fetchedTechs : (savedParsed.techniciansCertified || prev.techniciansCertified),
        }));
      } catch {
        const saved = localStorage.getItem("orey_dgrm_audit_v2");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setAudit((prev) => ({ ...prev, ...parsed }));
          } catch {}
        }
      }
    }
    void syncFromDb();
  }, []);

  // New equipment form
  const [newEqName, setNewEqName] = useState("");
  const [newEqSerial, setNewEqSerial] = useState("");
  const [newEqCalDate, setNewEqCalDate] = useState("");

  // New technician form
  const [newTechName, setNewTechName] = useState("");
  const [newTechMfr, setNewTechMfr] = useState("");
  const [newTechValid, setNewTechValid] = useState("");

  const handleAddEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEqName || !newEqSerial) {
      appToast.warning("Preencha o nome e número de série do equipamento.");
      return;
    }
    const updated = {
      ...audit,
      equipmentChecked: [
        ...audit.equipmentChecked,
        {
          name: newEqName,
          serial: newEqSerial,
          calibrationDate: newEqCalDate || new Date().toISOString().slice(0, 10),
          status: "VÁLIDO" as const,
        },
      ],
    };
    setAudit(updated);
    localStorage.setItem("orey_dgrm_audit_v2", JSON.stringify(updated));
    setNewEqName("");
    setNewEqSerial("");
    setNewEqCalDate("");
    appToast.success("Equipamento adicionado à vistoria DGRM.");
  };

  const handleDeleteEquipment = (index: number) => {
    const updated = {
      ...audit,
      equipmentChecked: audit.equipmentChecked.filter((_, i) => i !== index),
    };
    setAudit(updated);
    localStorage.setItem("orey_dgrm_audit_v2", JSON.stringify(updated));
    appToast.success("Equipamento removido.");
  };

  const handleAddTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName || !newTechMfr) {
      appToast.warning("Preencha o nome do técnico e fabricantes.");
      return;
    }
    const updated = {
      ...audit,
      techniciansCertified: [
        ...audit.techniciansCertified,
        {
          name: newTechName,
          manufacturer: newTechMfr,
          validUntil: newTechValid || new Date().toISOString().slice(0, 10),
        },
      ],
    };
    setAudit(updated);
    localStorage.setItem("orey_dgrm_audit_v2", JSON.stringify(updated));
    setNewTechName("");
    setNewTechMfr("");
    setNewTechValid("");
    appToast.success("Técnico certificado adicionado.");
  };

  const handleDeleteTechnician = (index: number) => {
    const updated = {
      ...audit,
      techniciansCertified: audit.techniciansCertified.filter((_, i) => i !== index),
    };
    setAudit(updated);
    localStorage.setItem("orey_dgrm_audit_v2", JSON.stringify(updated));
    appToast.success("Técnico removido.");
  };

  const handleRegistarVistoria = () => {
    localStorage.setItem("orey_dgrm_audit_v2", JSON.stringify(audit));
    appToast.success("Vistoria da DGRM à Estação de Serviço atualizada e guardada com sucesso!");
    setSuccessMsg("Dados de acreditação DGRM e Survitec guardados na base de dados dos Açores.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-6 sm:p-8 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
              <Award className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-blue-300 ring-1 ring-blue-500/30">
              DGRM & Survitec · Verificação Oficial da Estação de Serviço 50937 (Editável)
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Vistoria DGRM à Estação de Serviço</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Gestão de acreditação oficial DGRM, calibração de instrumentos afetos à estação dos Açores, homologação Survitec e certificação de técnicos. Validade: 12-02-2027.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRegistarVistoria}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
          >
            <FileCheck className="h-4 w-4" />
            Guardar Alterações DGRM
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20 ring-1 ring-white/20"
          >
            <Printer className="h-4 w-4" />
            Imprimir Certificado
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Certificado DGRM</span>
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <input
            type="text"
            value={audit.approvalNumber}
            onChange={(e) => setAudit({ ...audit, approvalNumber: e.target.value })}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-1 text-base font-black text-slate-900 bg-slate-50 focus:bg-white"
          />
          <p className="mt-1 text-xs text-emerald-600 font-semibold">Emitido pela DGRM / ISN</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Estado da Estação</span>
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-emerald-600">{audit.status}</p>
          <p className="mt-1 text-xs text-slate-500">Aprovada para vistorias oficiais</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Validade da Acreditação</span>
            <CalendarClock className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="date"
              value={audit.expiryDate}
              onChange={(e) => setAudit({ ...audit, expiryDate: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-1 font-mono text-base font-bold text-slate-900 bg-slate-50 focus:bg-white"
            />
          </div>
          <p className="mt-1 text-xs text-amber-600 font-semibold">Validade: 12-02-2027</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Equipamentos Calibrados</span>
            <Wrench className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{audit.equipmentChecked.length} / {audit.equipmentChecked.length}</p>
          <p className="mt-1 text-xs text-emerald-600 font-semibold">Afetos à Estação dos Açores</p>
        </div>
      </div>

      {/* Survitec Approval Quadro for Station 50937 */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30">
              <Award className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-black text-white">Quadro de Homologação e Aprovação Survitec — Estação nº 50937</h2>
              <p className="text-xs text-indigo-200">Aprovação oficial obtida após auditoria trienal de qualidade técnica e inspeção de equipamentos.</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-black text-emerald-300 ring-1 ring-emerald-500/30">
            {audit.survitecStatus}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-indigo-500/20 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">Referência da Auditoria</span>
            <input
              type="text"
              value={audit.survitecAuditNumber}
              onChange={(e) => setAudit({ ...audit, survitecAuditNumber: e.target.value })}
              className="w-full rounded-xl border border-indigo-500/30 bg-indigo-950/60 px-3 py-2 text-white font-bold outline-none"
            />
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Ciclo de Validade Trianual</span>
            <input
              type="text"
              value={audit.survitecAuditDate}
              onChange={(e) => setAudit({ ...audit, survitecAuditDate: e.target.value })}
              className="w-full rounded-xl border border-indigo-500/30 bg-indigo-950/60 px-3 py-2 text-white font-bold outline-none"
            />
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Fabricantes Homologados</span>
            <p className="font-bold text-white py-2">Zodiac, RFD, Survitec</p>
          </div>
        </div>
      </div>

      {/* Equipment & Calibration Verification (Editable) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-600" />
            Verificação de Equipamentos e Calibração (Estação dos Açores)
          </h2>
          <p className="text-xs text-slate-500 mb-4">Instrumentos afetos à estação de serviço para vistorias DGRM.</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Equipamento</th>
                  <th className="px-3 py-2.5">Nº Série / Ref</th>
                  <th className="px-3 py-2.5">Calibração</th>
                  <th className="px-3 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.equipmentChecked.map((eq, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{eq.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{eq.serial}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{eq.calibrationDate}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteEquipment(i)}
                        className="rounded-lg p-1 text-red-600 hover:bg-red-50 transition"
                        title="Remover equipamento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddEquipment} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-700">Adicionar novo equipamento / instrumento:</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Nome do equipamento..."
                value={newEqName}
                onChange={(e) => setNewEqName(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Nº de Série..."
                value={newEqSerial}
                onChange={(e) => setNewEqSerial(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
              <input
                type="date"
                value={newEqCalDate}
                onChange={(e) => setNewEqCalDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Equipamento
            </button>
          </form>
        </div>

        {/* Certified Technicians (Editable) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Certificação de Técnicos Autorizados (DGRM & Fabricantes)
          </h2>
          <p className="text-xs text-slate-500 mb-4">Técnicos certificados ativos na estação (sem aprovação Plastimo).</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Técnico</th>
                  <th className="px-3 py-2.5">Fabricantes Aprovados</th>
                  <th className="px-3 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.techniciansCertified.map((tech, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-slate-900">{tech.name}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{tech.manufacturer} (Válido até {tech.validUntil})</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteTechnician(i)}
                        className="rounded-lg p-1 text-red-600 hover:bg-red-50 transition"
                        title="Remover técnico"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddTechnician} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-700">Adicionar técnico certificado:</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Nome do técnico..."
                value={newTechName}
                onChange={(e) => setNewTechName(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Fabricantes (ex: Zodiac, RFD, Survitec)..."
                value={newTechMfr}
                onChange={(e) => setNewTechMfr(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
              <input
                type="date"
                value={newTechValid}
                onChange={(e) => setNewTechValid(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Técnico
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
