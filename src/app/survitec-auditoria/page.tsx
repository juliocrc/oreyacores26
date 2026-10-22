"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Shield, AlertCircle, CheckCircle, Eye, Download, Upload, Award, Calendar, Building2, Printer, Plus, Trash2, Edit3 } from "lucide-react";
import { appToast } from "@/lib/app-toast";

type SurvitecAuditInfo = {
  stationName: string;
  stationCode: string;
  lastAuditDate: string;
  expiryDate: string;
  auditor: string;
  status: "VÁLIDO" | "PENDENTE" | "EXPIRADO";
  brandsRepresented: string[];
  findings: Array<{
    id: string;
    category: string;
    requirement: string;
    finding: string;
    severity: "critical" | "major" | "minor" | "observation";
    status: "open" | "in-progress" | "closed";
    reference: string;
  }>;
};

const SURVITEC_AUDIT_DATA: SurvitecAuditInfo = {
  stationName: "Orey Açores — Estação de Serviço Principal",
  stationCode: "AZO-SURV-01",
  lastAuditDate: "2025-11-15",
  expiryDate: "2028-11-15",
  auditor: "Survitec Group Global Quality & Technical Audit Team",
  status: "VÁLIDO",
  brandsRepresented: ["Zodiac", "RFD", "DSB", "Toyo", "SurvitecZodiac", "Beaufort"],
  findings: [
    {
      id: "SURV-2025-01",
      category: "Calibração de Manómetros",
      requirement: "Survitec Station Quality Manual - Sec. 4.2",
      finding: "Todos os manómetros de teste de pressão verificados e com certificados válidos na bancada de ensaio.",
      severity: "observation",
      status: "closed",
      reference: "Relatório de Auditoria Trianual Nov 2025",
    },
    {
      id: "SURV-2025-02",
      category: "Formação de Técnicos",
      requirement: "Survitec Technical Bulletin TB-2025-09",
      finding: "Certificados de reciclagem bienal dos técnicos Júlio Correia atualizados.",
      severity: "minor",
      status: "closed",
      reference: "Relatório de Auditoria Trianual Nov 2025",
    },
    {
      id: "SURV-2025-03",
      category: "Armazenamento de Peças de Origem",
      requirement: "Survitec Spare Parts Control Policy",
      finding: "Stock de cilindros, ogivas e kits de disparo de origem devidamente catalogados no sistema.",
      severity: "minor",
      status: "closed",
      reference: "Relatório de Auditoria Trianual Nov 2025",
    },
  ],
};

export default function SurvitecAuditoriaPage() {
  const [audit, setAudit] = useState<SurvitecAuditInfo>(SURVITEC_AUDIT_DATA);
  const [newBrand, setNewBrand] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orey_survitec_audit_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        setAudit((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("orey_survitec_audit_v1", JSON.stringify(audit));
    appToast.success("Auditoria Survitec atualizada e guardada com sucesso!");
  };

  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrand.trim()) return;
    if (audit.brandsRepresented.includes(newBrand.trim())) {
      appToast.warning("Essa marca já está registada.");
      return;
    }
    const updated = {
      ...audit,
      brandsRepresented: [...audit.brandsRepresented, newBrand.trim()],
    };
    setAudit(updated);
    localStorage.setItem("orey_survitec_audit_v1", JSON.stringify(updated));
    setNewBrand("");
    appToast.success("Marca Survitec adicionada.");
  };

  const handleRemoveBrand = (brandToRemove: string) => {
    const updated = {
      ...audit,
      brandsRepresented: audit.brandsRepresented.filter((b) => b !== brandToRemove),
    };
    setAudit(updated);
    localStorage.setItem("orey_survitec_audit_v1", JSON.stringify(updated));
    appToast.success("Marca removida.");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30">
              <Award className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-indigo-300 ring-1 ring-indigo-500/30">
              Survitec Group · Auditoria Trianual Oficial (Editável)
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Auditoria Trianual Survitec</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Certificação e garantia de representação oficial das marcas Survitec. Permite editar dados da estação, datas de validade e marcas homologadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500"
          >
            <CheckCircle className="h-4 w-4" />
            Guardar Alterações Survitec
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:bg-white/20 ring-1 ring-white/20"
          >
            <Printer className="h-4 w-4" />
            Imprimir Relatório
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Estado da Estação</span>
            <Shield className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-emerald-600">{audit.status}</p>
          <p className="mt-1 text-xs text-slate-500">Representação Survitec Ativa</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Última Auditoria</span>
            <Calendar className="h-5 w-5 text-indigo-600" />
          </div>
          <input
            type="date"
            value={audit.lastAuditDate}
            onChange={(e) => setAudit({ ...audit, lastAuditDate: e.target.value })}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-1 font-mono text-base font-bold text-slate-900 bg-slate-50 focus:bg-white"
          />
          <p className="mt-1 text-xs text-slate-500">Inspeção presencial Survitec</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Validade da Certificação</span>
            <Award className="h-5 w-5 text-amber-600" />
          </div>
          <input
            type="date"
            value={audit.expiryDate}
            onChange={(e) => setAudit({ ...audit, expiryDate: e.target.value })}
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-1 font-mono text-base font-bold text-slate-900 bg-slate-50 focus:bg-white"
          />
          <p className="mt-1 text-xs text-emerald-600 font-semibold">Ciclo trienal ativo</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Marcas Representadas</span>
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{audit.brandsRepresented.length}</p>
          <p className="mt-1 text-xs text-slate-500">Homologadas pelo grupo</p>
        </div>
      </div>

      {/* Brands & Findings */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
            <Award className="h-5 w-5 text-indigo-600" />
            Marcas Survitec Homologadas para Representação
          </h2>
          <p className="text-xs text-slate-500 mb-4">Gerencie as marcas certificadas para a estação dos Açores.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {audit.brandsRepresented.map((brand) => (
              <span key={brand} className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-sm font-black text-indigo-900">
                {brand}
                <button
                  type="button"
                  onClick={() => handleRemoveBrand(brand)}
                  className="text-indigo-400 hover:text-red-600 transition"
                  title="Remover marca"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>

          <form onSubmit={handleAddBrand} className="flex gap-2">
            <input
              type="text"
              placeholder="Adicionar nova marca (ex: Avon, RFD)..."
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Registo de Auditorias Trianuais
          </h2>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="rounded-xl bg-slate-50 p-3 flex justify-between items-center border border-slate-100">
              <div>
                <p className="font-bold">Auditoria Trianual Atual ({audit.lastAuditDate} – {audit.expiryDate})</p>
                <p className="text-slate-500">Auditor: {audit.auditor}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">{audit.status}</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 flex justify-between items-center border border-slate-100">
              <div>
                <p className="font-bold">Auditoria Trianual 2022 – 2025</p>
                <p className="text-slate-500">Auditor: Survitec Technical Audit</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">Concluído</span>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 flex justify-between items-center border border-slate-100">
              <div>
                <p className="font-bold">Auditoria Fev 2017 (RFD & DSB Spares)</p>
                <p className="text-slate-500">Auditor: Survitec Group</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">Concluído</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
