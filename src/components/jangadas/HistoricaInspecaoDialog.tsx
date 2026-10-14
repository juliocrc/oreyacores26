import React, { useState } from "react";
import { X, Plus, Trash2, FileText, Cylinder, Activity, ShieldCheck, RefreshCw } from "lucide-react";
import { appToast } from "@/lib/app-toast";

import type { HistoricaInspecaoDialogProps, ArticleInput } from "@/types/historica-inspecao-dialog";

export default function HistoricaInspecaoDialog({
  isOpen,
  onClose,
  jangadaId,
  onSuccess,
  isVistoriaAtual = false,
  currentRaftData = null,
}: HistoricaInspecaoDialogProps) {
  const [activeSubTab, setActiveSubTab] = useState<"geral" | "cilindro" | "testes" | "artigos">("geral");
  const [loading, setLoading] = useState(false);

  // Form states
  const [certificadoNumero, setCertificadoNumero] = useState("");
  const [certificateExists, setCertificateExists] = useState<{
    exists: boolean;
    inspection?: { id?: number; jangadaId?: number | null; jangadaSerial?: string | null } | null;
    raft?: { id?: number; serial?: string | null } | null;
  } | null>(null);
  const [certificateChecking, setCertificateChecking] = useState(false);
  const [dataInspecao, setDataInspecao] = useState("");
  const [dataProxInspecao, setDataProxInspecao] = useState("");
  const [responsavel, setResponsavel] = useState("");

  // Cylinder & HRU
  const [cylinderSerial, setCylinderSerial] = useState("");
  const [cylinderTara, setCylinderTara] = useState("");
  const [cylinderPesoBruto, setCylinderPesoBruto] = useState("");
  const [cylinderCo2, setCylinderCo2] = useState("");
  const [cylinderN2, setCylinderN2] = useState("");
  const [cylinderDataTeste, setCylinderDataTeste] = useState("");
  const [cylinderDataProxTeste, setCylinderDataProxTeste] = useState("");
  const [cylinderSistema, setCylinderSistema] = useState("Manual/Automático");

  const [hruReferencia, setHruReferencia] = useState("");
  const [hruDataInstalacao, setHruDataInstalacao] = useState("");
  const [hruValidade, setHruValidade] = useState("");

  // Tests
  const [testeWP, setTesteWP] = useState("Aprovado");
  const [testeNAP, setTesteNAP] = useState("Não Aplicável");
  const [testeFS, setTesteFS] = useState("Aprovado");
  const [testeGI, setTesteGI] = useState("Não Aplicável");
  const [testeDL, setTesteDL] = useState("Não Aplicável");

  // Pressures
  const [upperStart, setUpperStart] = useState("");
  const [upperEnd, setUpperEnd] = useState("");
  const [lowerStart, setLowerStart] = useState("");
  const [lowerEnd, setLowerEnd] = useState("");

  // Articles
  const [artigos, setArtigos] = useState<ArticleInput[]>([]);

  const [todayISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextYearISO] = useState(() => {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    return next.toISOString().slice(0, 10);
  });

  // Pré-preenchimento inteligente para vistorias atuais (adjusting state during render)
  if (isOpen) {
    if (isVistoriaAtual && currentRaftData) {
      const d = currentRaftData;
      if (cylinderSerial !== (d.cylinderSerial || "")) setCylinderSerial(d.cylinderSerial || "");
      if (cylinderTara !== String(d.cylinderTara || "")) setCylinderTara(String(d.cylinderTara || ""));
      if (cylinderPesoBruto !== String(d.cylinderPesoBruto || "")) setCylinderPesoBruto(String(d.cylinderPesoBruto || ""));
      if (cylinderCo2 !== String(d.cylinderCo2 || "")) setCylinderCo2(String(d.cylinderCo2 || ""));
      if (cylinderN2 !== String(d.cylinderN2 || "")) setCylinderN2(String(d.cylinderN2 || ""));
      if (cylinderDataTeste !== (d.cylinderDataTeste || "")) setCylinderDataTeste(d.cylinderDataTeste || "");
      if (cylinderDataProxTeste !== (d.cylinderDataProxTeste || "")) setCylinderDataProxTeste(d.cylinderDataProxTeste || "");
      if (cylinderSistema !== (d.cylinderSistema || "Manual/Automático")) setCylinderSistema(d.cylinderSistema || "Manual/Automático");

      if (hruReferencia !== (d.hruReferencia || "")) setHruReferencia(d.hruReferencia || "");
      if (hruDataInstalacao !== (d.hruDataInstalacao || "")) setHruDataInstalacao(d.hruDataInstalacao || "");
      if (hruValidade !== (d.hruValidade || "")) setHruValidade(d.hruValidade || "");

      if (testeWP !== (d.testeWP || "Aprovado")) setTesteWP(d.testeWP || "Aprovado");
      if (testeNAP !== (d.testeNAP || "Não Aplicável")) setTesteNAP(d.testeNAP || "Não Aplicável");
      if (testeFS !== (d.testeFS || "Aprovado")) setTesteFS(d.testeFS || "Aprovado");
      if (testeGI !== (d.testeGI || "Não Aplicável")) setTesteGI(d.testeGI || "Não Aplicável");
      if (testeDL !== (d.testeDL || "Não Aplicável")) setTesteDL(d.testeDL || "Não Aplicável");

      if (upperStart !== (d.testeWPCamaraSuperiorInicio || "")) setUpperStart(d.testeWPCamaraSuperiorInicio || "");
      if (upperEnd !== (d.testeWPCamaraSuperiorFim || "")) setUpperEnd(d.testeWPCamaraSuperiorFim || "");
      if (lowerStart !== (d.testeWPCamaraInferiorInicio || "")) setLowerStart(d.testeWPCamaraInferiorInicio || "");
      if (lowerEnd !== (d.testeWPCamaraInferiorFim || "")) setLowerEnd(d.testeWPCamaraInferiorFim || "");

      if (Array.isArray(d.artigos)) {
        const formattedArtigos = d.artigos.map((art: {
          name?: string | null;
          referencia?: string | null;
          quantidade?: number | null;
          validade?: string | null;
          categoria?: string | null;
        }) => ({
          name: art.name || "",
          referencia: art.referencia || "",
          quantidade: art.quantidade || 1,
          validade: art.validade ? String(art.validade).slice(0, 7) : "",
          categoria: art.categoria || "EMERGENCY",
        }));
        if (JSON.stringify(artigos) !== JSON.stringify(formattedArtigos)) setArtigos(formattedArtigos);
      } else if (artigos.length > 0) {
        setArtigos([]);
      }

      if (dataInspecao !== todayISO) setDataInspecao(todayISO);
      if (dataProxInspecao !== nextYearISO) setDataProxInspecao(nextYearISO);
      if (responsavel !== "Júlio Correia") setResponsavel("Júlio Correia");
    } else {
      if (certificadoNumero !== "") setCertificadoNumero("");
      if (dataInspecao !== "") setDataInspecao("");
      if (dataProxInspecao !== "") setDataProxInspecao("");
      if (responsavel !== "") setResponsavel("");
      if (cylinderSerial !== "") setCylinderSerial("");
      if (cylinderTara !== "") setCylinderTara("");
      if (cylinderPesoBruto !== "") setCylinderPesoBruto("");
      if (cylinderCo2 !== "") setCylinderCo2("");
      if (cylinderN2 !== "") setCylinderN2("");
      if (cylinderDataTeste !== "") setCylinderDataTeste("");
      if (cylinderDataProxTeste !== "") setCylinderDataProxTeste("");
      if (cylinderSistema !== "Manual/Automático") setCylinderSistema("Manual/Automático");
      if (hruReferencia !== "") setHruReferencia("");
      if (hruDataInstalacao !== "") setHruDataInstalacao("");
      if (hruValidade !== "") setHruValidade("");
      if (testeWP !== "Aprovado") setTesteWP("Aprovado");
      if (testeNAP !== "Não Aplicável") setTesteNAP("Não Aplicável");
      if (testeFS !== "Aprovado") setTesteFS("Aprovado");
      if (testeGI !== "Não Aplicável") setTesteGI("Não Aplicável");
      if (testeDL !== "Não Aplicável") setTesteDL("Não Aplicável");
      if (upperStart !== "") setUpperStart("");
      if (upperEnd !== "") setUpperEnd("");
      if (lowerStart !== "") setLowerStart("");
      if (lowerEnd !== "") setLowerEnd("");
      if (artigos.length > 0) setArtigos([]);
    }

    if (certificadoNumero.trim() === "") {
      if (certificateExists !== null) setCertificateExists(null);
      if (certificateChecking) setCertificateChecking(false);
    }
  }

  // Geração do próximo número de certificado (async)
  React.useEffect(() => {
    if (!isOpen || !isVistoriaAtual || !currentRaftData) return;
    const raftRef = currentRaftData as { id?: number; serial?: string } | null;
    const params = new URLSearchParams({
      nextCertificate: "1",
      referenceDate: new Date().toISOString().slice(0, 10),
    });
    if (raftRef?.id) params.set("raftId", String(raftRef.id));
    else if (raftRef?.serial) params.set("serial", String(raftRef.serial));
    fetch(`/api/inspecoes?${params.toString()}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.certificadoNumero) {
          setCertificadoNumero(resData.certificadoNumero);
        }
      })
      .catch(err => console.error("Error generating cert number:", err));
  }, [isOpen, isVistoriaAtual, currentRaftData]);

  // Verificação em tempo real de certificados já existentes
  React.useEffect(() => {
    if (!isOpen) return;
    const value = certificadoNumero.trim();
    if (!value) return;
    const timer = setTimeout(async () => {
      setCertificateChecking(true);
      try {
        const res = await fetch(`/api/inspecoes?checkCertificate=${encodeURIComponent(value)}`);
        const data = await res.json();
        setCertificateExists(data?.exists ? data : null);
      } catch {
        setCertificateExists(null);
      } finally {
        setCertificateChecking(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [certificadoNumero, isOpen]);

  if (!isOpen) return null;

  const handleAddArticleRow = () => {
    setArtigos([
      ...artigos,
      { name: "", referencia: "", quantidade: 1, validade: "", categoria: "EMERGENCY" },
    ]);
  };

  const handleRemoveArticleRow = (idx: number) => {
    setArtigos(artigos.filter((_, i) => i !== idx));
  };

  const handleArticleChange = (idx: number, field: keyof ArticleInput, val: ArticleInput[keyof ArticleInput]) => {
    const updated = [...artigos];
    updated[idx] = { ...updated[idx], [field]: val };
    setArtigos(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!certificadoNumero.trim()) {
      appToast.error("Introduza o número de certificado.");
      return;
    }
    if (certificateExists) {
      appToast.error(`O número de certificado ${certificadoNumero.trim()} já foi utilizado.`);
      return;
    }
    if (!dataInspecao) {
      appToast.error("Introduza a data da inspeção.");
      return;
    }

    setLoading(true);

    const payload = {
      jangadaId,
      certificadoNumero: certificadoNumero.trim(),
      dataInspecao,
      dataProxInspecao: dataProxInspecao || null,
      status: "Concluída",
      responsavel: responsavel || "sistema",
      hru: {
        referencia: hruReferencia || null,
        dataInstalacao: hruDataInstalacao || null,
        validade: hruValidade || null,
      },
      cylinder: {
        serial: cylinderSerial || null,
        tara: cylinderTara || null,
        pesoBruto: cylinderPesoBruto || null,
        co2: cylinderCo2 || null,
        n2: cylinderN2 || null,
        dataTeste: cylinderDataTeste || null,
        dataProxTeste: cylinderDataProxTeste || null,
        sistema: cylinderSistema || null,
      },
      testes: {
        testeWP,
        testeNAP,
        testeFS,
        testeGI,
        testeDL,
        testeWPCamaraSuperiorInicio: upperStart || null,
        testeWPCamaraSuperiorFim: upperEnd || null,
        testeWPCamaraInferiorInicio: lowerStart || null,
        testeWPCamaraInferiorFim: lowerEnd || null,
        testeWPTemperaturaInicial: currentRaftData?.testeWPTemperaturaInicial || null,
        testeWPTemperaturaFinal: currentRaftData?.testeWPTemperaturaFinal || null,
        testeWPPressaoAtmosfericaInicial: currentRaftData?.testeWPPressaoAtmosfericaInicial || null,
        testeWPPressaoAtmosfericaFinal: currentRaftData?.testeWPPressaoAtmosfericaFinal || null,
        testeWPHoraInicio: currentRaftData?.testeWPHoraInicio || null,
        testeWPHoraFim: currentRaftData?.testeWPHoraFim || null,
        testeWPUnidadePressao: "hpa",
      },
      artigos: artigos.filter(a => a.name.trim() !== ""),
    };

    try {
      const url = isVistoriaAtual ? "/api/inspecoes" : "/api/inspecoes/historico";
      const payloadBody = isVistoriaAtual
        ? {
            raftId: jangadaId,
            certificadoNumero: certificadoNumero.trim(),
            date: dataInspecao,
            dataProxInspecao: dataProxInspecao || null,
            status: "Concluída",
            responsavel: responsavel || "Júlio Correia",
            applyStockMovements: false,
            checklistSnapshot: {
              cylinderSerial: cylinderSerial || null,
              cylinderTara: cylinderTara || null,
              cylinderPesoBruto: cylinderPesoBruto || null,
              cylinderCo2: cylinderCo2 || null,
              cylinderN2: cylinderN2 || null,
              cylinderDataTeste: cylinderDataTeste || null,
              cylinderDataProxTeste: cylinderDataProxTeste || null,
              cylinderSistema: cylinderSistema || null,
              hruReferencia: hruReferencia || null,
              hruDataInstalacao: hruDataInstalacao || null,
              hruValidade: hruValidade || null,
              testeWP,
              testeNAP,
              testeFS,
              testeGI,
              testeDL,
              testeWPCamaraSuperiorInicio: upperStart || null,
              testeWPCamaraSuperiorFim: upperEnd || null,
              testeWPCamaraInferiorInicio: lowerStart || null,
              testeWPCamaraInferiorFim: lowerEnd || null,
              testeWPTemperaturaInicial: currentRaftData?.testeWPTemperaturaInicial || null,
              testeWPTemperaturaFinal: currentRaftData?.testeWPTemperaturaFinal || null,
              testeWPPressaoAtmosfericaInicial: currentRaftData?.testeWPPressaoAtmosfericaInicial || null,
              testeWPPressaoAtmosfericaFinal: currentRaftData?.testeWPPressaoAtmosfericaFinal || null,
              testeWPHoraInicio: currentRaftData?.testeWPHoraInicio || null,
              testeWPHoraFim: currentRaftData?.testeWPHoraFim || null,
              testeWPUnidadePressao: "hpa",
            }
          }
        : payload;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao gravar inspeção.");
      }

      appToast.success(isVistoriaAtual ? "Vistoria concluída e gravada com sucesso!" : "Inspeção histórica gravada com sucesso!");
      onSuccess();
      onClose();
    } catch (err) {
      appToast.error(err instanceof Error ? err.message : "Falha ao gravar inspeção.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              {isVistoriaAtual ? "📋 Registar / Concluir Vistoria Atual" : "📜 Registar Inspeção Histórica (Passada)"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isVistoriaAtual 
                ? "Grava a vistoria atual da jangada arquivando automaticamente o estado no histórico." 
                : "Introduza os dados e validades de uma vistoria anterior efetuada a esta jangada."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200/65 text-slate-400 hover:text-slate-700 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex border-b border-slate-150 bg-slate-50/50 px-4">
          {[
            { id: "geral" as const, label: "Dados Gerais", icon: FileText },
            { id: "cilindro" as const, label: "Cilindro & HRU", icon: Cylinder },
            { id: "testes" as const, label: "Testes Realizados", icon: Activity },
            { id: "artigos" as const, label: "Consumíveis / Artigos", icon: Plus },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-3 font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all ${
                  activeSubTab === tab.id
                    ? "border-indigo-600 text-indigo-600 -mb-px"
                    : "border-transparent text-slate-400 hover:text-slate-650"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {activeSubTab === "geral" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-150">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 mb-1">Nº Certificado *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: AZ-2022-105"
                  value={certificadoNumero}
                  onChange={(e) => setCertificadoNumero(e.target.value)}
                  className={`px-3 py-2 border rounded-xl outline-none focus:ring-2 text-sm font-semibold text-slate-700 ${
                    certificateExists
                      ? "border-red-400 bg-red-50 focus:ring-red-400"
                      : "border-slate-200 focus:ring-indigo-500"
                  }`}
                />
                {certificateExists && (
                  <p className="mt-1 text-xs font-semibold text-red-600 flex items-start gap-1">
                    <span>⚠</span>
                    <span>
                      Este número de certificado já foi utilizado
                      {certificateExists.inspection?.jangadaSerial
                        ? ` na jangada ${certificateExists.inspection.jangadaSerial}`
                        : certificateExists.raft?.serial
                          ? ` na jangada ${certificateExists.raft.serial}`
                          : ""}
                      . Verifique se não está a repetir uma inspeção.
                    </span>
                  </p>
                )}
                {certificateChecking && !certificateExists && (
                  <p className="mt-1 text-xs text-slate-400">A verificar número de certificado…</p>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 mb-1">Técnico Responsável</label>
                <input
                  type="text"
                  placeholder="Ex: Júlio Correia"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-700"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 mb-1">Data da Inspeção *</label>
                <input
                  type="date"
                  required
                  value={dataInspecao}
                  onChange={(e) => setDataInspecao(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-700"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 mb-1">Data Próxima Inspeção</label>
                <input
                  type="date"
                  value={dataProxInspecao}
                  onChange={(e) => setDataProxInspecao(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-700"
                />
              </div>
            </div>
          )}

          {activeSubTab === "cilindro" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b">Dados do Cilindro de Disparo</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Nº Série</label>
                  <input
                    type="text"
                    value={cylinderSerial}
                    onChange={(e) => setCylinderSerial(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Tara (Kg)</label>
                  <input
                    type="number" step="0.001"
                    placeholder="Ex: 12.500"
                    value={cylinderTara}
                    onChange={(e) => setCylinderTara(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Peso Bruto (Kg)</label>
                  <input
                    type="number" step="0.001"
                    placeholder="Ex: 17.200"
                    value={cylinderPesoBruto}
                    onChange={(e) => setCylinderPesoBruto(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Carga CO2 (Kg)</label>
                  <input
                    type="number" step="0.001"
                    placeholder="Ex: 4.500"
                    value={cylinderCo2}
                    onChange={(e) => setCylinderCo2(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Carga N2 (Kg)</label>
                  <input
                    type="number" step="0.001"
                    placeholder="Ex: 0.200"
                    value={cylinderN2}
                    onChange={(e) => setCylinderN2(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Sistema Disparo</label>
                  <input
                    type="text"
                    value={cylinderSistema}
                    onChange={(e) => setCylinderSistema(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Data Último Teste</label>
                  <input
                    type="date"
                    value={cylinderDataTeste}
                    onChange={(e) => setCylinderDataTeste(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Data Prox. Teste</label>
                  <input
                    type="date"
                    value={cylinderDataProxTeste}
                    onChange={(e) => setCylinderDataProxTeste(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
              </div>

              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b">Dados da HRU (Válvula Hidrostática)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Referência HRU</label>
                  <input
                    type="text"
                    placeholder="Ex: Hammar H20"
                    value={hruReferencia}
                    onChange={(e) => setHruReferencia(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Data Instalação</label>
                  <input
                    type="date"
                    value={hruDataInstalacao}
                    onChange={(e) => setHruDataInstalacao(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Validade HRU</label>
                  <input
                    type="date"
                    value={hruValidade}
                    onChange={(e) => setHruValidade(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "testes" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b">Testes Obrigatórios</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Teste Pressão (WP)</label>
                  <select
                    value={testeWP}
                    onChange={(e) => setTesteWP(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 bg-white"
                  >
                    <option value="Aprovado">Aprovado</option>
                    <option value="Reprovado">Reprovado</option>
                    <option value="Não Aplicável">Não Aplicável</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Teste Costuras (NAP)</label>
                  <select
                    value={testeNAP}
                    onChange={(e) => setTesteNAP(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 bg-white"
                  >
                    <option value="Aprovado">Aprovado</option>
                    <option value="Reprovado">Reprovado</option>
                    <option value="Não Aplicável">Não Aplicável</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Ensaio de Pavimento (FS)</label>
                  <select
                    value={testeFS}
                    onChange={(e) => setTesteFS(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 bg-white"
                  >
                    <option value="Aprovado">Aprovado</option>
                    <option value="Reprovado">Reprovado</option>
                    <option value="Não Aplicável">Não Aplicável</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Inspeção de Gás (GI)</label>
                  <select
                    value={testeGI}
                    onChange={(e) => setTesteGI(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 bg-white"
                  >
                    <option value="Aprovado">Aprovado</option>
                    <option value="Reprovado">Reprovado</option>
                    <option value="Não Aplicável">Não Aplicável</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Disparo Manual (DL)</label>
                  <select
                    value={testeDL}
                    onChange={(e) => setTesteDL(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 bg-white"
                  >
                    <option value="Aprovado">Aprovado</option>
                    <option value="Reprovado">Reprovado</option>
                    <option value="Não Aplicável">Não Aplicável</option>
                  </select>
                </div>
              </div>

              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest pb-1 border-b">Leituras de Pressão WP (Opcional)</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Câm. Superior Início</label>
                  <input
                    type="text"
                    placeholder="Ex: 120"
                    value={upperStart}
                    onChange={(e) => setUpperStart(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Câm. Superior Fim</label>
                  <input
                    type="text"
                    placeholder="Ex: 118"
                    value={upperEnd}
                    onChange={(e) => setUpperEnd(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Câm. Inferior Início</label>
                  <input
                    type="text"
                    placeholder="Ex: 120"
                    value={lowerStart}
                    onChange={(e) => setLowerStart(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 mb-1">Câm. Inferior Fim</label>
                  <input
                    type="text"
                    placeholder="Ex: 119"
                    value={lowerEnd}
                    onChange={(e) => setLowerEnd(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSubTab === "artigos" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Consumíveis Substituídos / Ativos</h4>
                <button
                  type="button"
                  onClick={handleAddArticleRow}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-250 transition-all shadow-sm"
                >
                  <Plus size={14} />
                  Adicionar Linha
                </button>
              </div>

              {artigos.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Nenhum artigo registado para este histórico. Clique em &quot;Adicionar Linha&quot; para introduzir consumíveis.
                </div>
              ) : (
                <div className="space-y-3">
                  {artigos.map((art, idx) => (
                    <div key={idx} className="flex flex-wrap md:flex-nowrap gap-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl items-center">
                      <div className="flex-1 min-w-[200px]">
                        <input
                          type="text"
                          placeholder="Nome do Artigo (Ex: Facho de Mão)"
                          value={art.name}
                          onChange={(e) => handleArticleChange(idx, "name", e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-28">
                        <input
                          type="text"
                          placeholder="Ref"
                          value={art.referencia}
                          onChange={(e) => handleArticleChange(idx, "referencia", e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-16">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qtd"
                          value={art.quantidade}
                          onChange={(e) => handleArticleChange(idx, "quantidade", parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-center font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-36">
                        <input
                          type="date"
                          value={art.validade}
                          onChange={(e) => handleArticleChange(idx, "validade", e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="w-32">
                        <select
                          value={art.categoria}
                          onChange={(e) => handleArticleChange(idx, "categoria", e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        >
                          <option value="EMERGENCY">Emergência</option>
                          <option value="EQUIPMENT">Equipamento</option>
                          <option value="RAFT">Jangada</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveArticleRow(idx)}
                        className="p-1.5 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer action */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-white sticky bottom-0 z-20">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold rounded-xl text-xs transition-all border border-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || certificateChecking || Boolean(certificateExists)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-150 transition-all flex items-center gap-1.5"
            >
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck size={16} />}
              {loading ? "A gravar..." : "Confirmar & Registar Vistoria"}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
