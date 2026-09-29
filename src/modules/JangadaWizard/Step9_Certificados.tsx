"use client";
import React, { useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { CheckCircle, Download, FileText, Loader2, ArrowRight, ExternalLink, Upload, ShieldCheck, Ban, UserCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { appToast } from '@/lib/app-toast';
import { saveShipDocument, saveCertificateDocument, yearFromDate, toastSavedPathIfPresent } from '@/lib/ship-downloads';
import { buildCertificatePayload as buildSharedCertificatePayload } from './buildCertificatePayload';
import { buildAbateReportDoc, abateReportFilename } from '@/lib/abate-report-pdf';
import { getAbateMotivoLabel } from '@/lib/abate-constants';

const HarbourOne_URL = "https://survitec2.my.site.com/HarbourOne/login?ec=302&startURL=%2FHarbourOne%2F";

export default function Step9_Certificados() {
  const router = useRouter();
  const { data: session } = useSession();
  const { inspectionData, setInspectionData, jangadaId, shipId, inspecaoId } = useJangadaWizardStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [extSaving, setExtSaving] = useState(false);

  const hasExternalCert = Boolean(
    (inspectionData.certificadoExternoNumero || '').trim() || (inspectionData.certificadoExternoUrl || '').trim()
  );

  const revisao = inspectionData.orcamento?.certificadoRevisao || { status: 'pendente' as const };
  const revisaoAprovada = revisao.status === 'aprovado';
  const tecnicoCampo = inspectionData.responsavel || '';
  const revisor = session?.user?.name || '';
  const isAdmin = session?.user?.role === 'ADMIN';

  const aprovarRevisao = () => {
    const orc = inspectionData.orcamento || {
      linhas: [],
      valorMaoObra: 0,
      valorDesconto: 0,
      isIsentoIva: false,
    };
    setInspectionData({
      ...inspectionData,
      orcamento: {
        ...orc,
        certificadoRevisao: {
          status: 'aprovado',
          revistoPorNome: revisor,
          revistoPorId: session?.user?.id,
          revistoEm: new Date().toISOString(),
        },
      },
    });
    appToast.success("Certificado revisto e aprovado como 2º par de olhos.");
  };

  const limparRevisao = () => {
    const orc = inspectionData.orcamento || {
      linhas: [],
      valorMaoObra: 0,
      valorDesconto: 0,
      isIsentoIva: false,
    };
    setInspectionData({
      ...inspectionData,
      orcamento: { ...orc, certificadoRevisao: { status: 'pendente' as const } },
    });
  };

  const openHarbourOne = () => {
    window.open(HarbourOne_URL, "_blank", "noopener,noreferrer");
  };

  const handleExternalFile = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      appToast.error("O certificado externo deve ser um ficheiro PDF.");
      return;
    }
    try {
      setExtSaving(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "certificados/externos");
      // Enviar shipId e shipName para guardar na pasta organizada do navio (NAVIOS/{navio}/)
      if (inspectionData.shipId) fd.append("shipId", String(inspectionData.shipId));
      if (inspectionData.shipName) fd.append("shipName", inspectionData.shipName);
      const res = await fetch("/api/upload-documento", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no upload do certificado");
      const filename = json.filename || json.originalName;
      if (!filename) throw new Error("Não foi possível obter o nome do ficheiro.");
      const url = `/uploads/certificados/externos/${encodeURIComponent(filename)}`;
      setInspectionData({ ...inspectionData, certificadoExternoUrl: url });
      appToast.success("PDF do certificado externo carregado com sucesso!");
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao carregar o PDF");
    } finally {
      setExtSaving(false);
    }
  };

  const handleSaveExternalCert = async () => {
    if (!jangadaId) {
      appToast.error("Jangada não associada. Não é possível guardar o certificado externo.");
      return;
    }
    try {
      setExtSaving(true);
      const res = await fetch(`/api/jangadas/${jangadaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificadoExternoNumero: (inspectionData.certificadoExternoNumero || "").trim(),
          certificadoExternoUrl: (inspectionData.certificadoExternoUrl || "").trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || "Erro ao guardar certificado externo");
      appToast.success("Certificado externo guardado com sucesso!");
    } catch (err: unknown) {
      appToast.error(err instanceof Error ? err.message : "Erro ao guardar certificado externo");
    } finally {
      setExtSaving(false);
    }
  };

  const clearExternalCert = () => {
    setInspectionData({
      ...inspectionData,
      certificadoExternoNumero: "",
      certificadoExternoUrl: "",
    });
  };

  const buildCertificatePayload = () => buildSharedCertificatePayload(inspectionData, jangadaId, inspecaoId);

  const handleGenerate = async (type: 'orey-html' | 'orey-xlsx' | 'survitec' | 'quadro-xlsx') => {
    if (!revisaoAprovada) {
      appToast.error("Aprove primeiro o certificado como 2º par de olhos antes de emitir.");
      return;
    }
    setLoading(type);
    setPreviewHtml(null);
    try {
      const payload = buildCertificatePayload();
      let url = '';
      
      if (type === 'orey-html') url = '/api/certificados/orey?format=html';
      if (type === 'orey-xlsx') url = '/api/certificados/orey?format=xlsx';
      if (type === 'survitec') url = '/api/certificados/survitec-moderno';
      if (type === 'quadro-xlsx') url = '/api/exportar-raft';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Falha ao gerar certificado');

      if (type === 'orey-xlsx' || type === 'quadro-xlsx') {
        // Guarda o ficheiro nas pastas organizadas (quadro → public/navios/{navio}/,
        // certificado → public/certificados-organizados/certificados açores 2026 versao1/)
        // em vez de descarregar.
        if (toastSavedPathIfPresent(response, type === 'orey-xlsx' ? 'Certificado' : 'Quadro')) return;

        const blob = await response.blob();

        let fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1];
        if (!fileName) {
          // Rede de segurança: o nome correcto vem sempre do servidor
          // (buildQuadroFileName / certificado). Aqui só se algo falhar.
          const certNumber = inspectionData.certificadoNumero?.trim() || `AZ${String(new Date().getFullYear()).slice(2)}-000`;
          const ship = String(payload.shipName || inspectionData.shipName || 'NAVIO').toUpperCase();
          fileName = type === 'quadro-xlsx'
            ? `${inspectionData.serial || 'jangada'}_${new Date().getFullYear()}.xlsx`
            : `${certNumber} (${ship}).xlsx`;
        }

        if (type === 'quadro-xlsx') {
          await saveShipDocument({
            shipName: payload.shipName || inspectionData.shipName || inspectionData.shipNameManual,
            category: 'Quadros',
            filename: fileName,
            blob,
          });
        } else {
          await saveCertificateDocument({
            year: yearFromDate(payload.inspectionDate),
            filename: fileName,
            blob,
          });
        }
      } else {
        const data = await response.json();
        setPreviewHtml(data.html);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao gerar certificado. Verifique a consola.');
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadPreview = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Certificado_${inspectionData.serial}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const handleAbateReport = () => {
    const abate = inspectionData.abate || { ativo: false };
    if (!abate.ativo) {
      appToast.error("A jangada não está assinalada para abate (passo 2 — Checklist).");
      return;
    }
    try {
      const doc = buildAbateReportDoc({
        brand: inspectionData.brand || '',
        model: inspectionData.model || '',
        serial: inspectionData.serial || '',
        capacity: inspectionData.capacity ?? '',
        dataFabrico: inspectionData.dataFabrico || '',
        dataInspecao: inspectionData.dataInspecao || new Date().toISOString().slice(0, 10),
        shipName: inspectionData.shipName || inspectionData.shipNameManual || '',
        owner: inspectionData.owner || '',
        shipFlag: inspectionData.shipFlag || '',
        shipImo: inspectionData.shipImo || '',
        shipCallSign: inspectionData.shipCallSign || '',
        tipoBarco: abate.tipoBarco || '',
        motivo: abate.motivo || '',
        detalhes: abate.detalhes || '',
        responsavel: inspectionData.responsavel || '',
        signatureBase64: inspectionData.signatureBase64 || '',
      });
      doc.save(abateReportFilename({
        serial: inspectionData.serial || '',
      }));
      appToast.success("Ficha de Abate (PDF) gerada com sucesso!");
    } catch (err) {
      console.error(err);
      appToast.error("Erro ao gerar a Ficha de Abate.");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-4 py-8">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-emerald-50">
          <CheckCircle size={40} className="animate-bounce" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Inspeção Submetida!</h2>
        <p className="text-slate-500 max-w-md mx-auto text-lg">
          A jangada <span className="font-bold text-slate-700">{inspectionData.serial}</span> foi atualizada e os consumos de stock aplicados com sucesso.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <FileText className="text-indigo-500" />
          Emissão de Certificados
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => handleGenerate('orey-xlsx')}
            disabled={loading !== null || !revisaoAprovada}
            title={revisaoAprovada ? "" : "É necessária a aprovação como 2º par de olhos"}
            className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all font-bold disabled:cursor-not-allowed ${
              revisaoAprovada
                ? "border-emerald-100 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-200 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            {loading === 'orey-xlsx' ? <Loader2 className="animate-spin" size={32} /> : <Download size={32} />}
            <span>Exportar Excel</span>
            <span className="text-xs font-medium opacity-70">Certificado .xlsx</span>
          </button>

          <button 
            onClick={() => handleGenerate('quadro-xlsx')}
            disabled={loading !== null || !revisaoAprovada}
            title={revisaoAprovada ? "" : "É necessária a aprovação como 2º par de olhos"}
            className={`flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all font-bold disabled:cursor-not-allowed ${
              revisaoAprovada
                ? "border-blue-100 bg-blue-50 hover:bg-blue-100 hover:border-blue-200 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            {loading === 'quadro-xlsx' ? <Loader2 className="animate-spin" size={32} /> : <FileText size={32} />}
            <span>Quadro Inspeção</span>
            <span className="text-xs font-medium opacity-70">Tabela de Dados</span>
          </button>
        </div>
      </div>

      {/* Revisão final (2º par de olhos) */}
      <div className={`bg-white border rounded-3xl p-8 shadow-sm ${revisaoAprovada ? 'border-emerald-300' : 'border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserCheck className={revisaoAprovada ? 'text-emerald-600' : 'text-slate-400'} />
            Revisão final — 2º par de olhos
          </h3>
          {revisaoAprovada ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
              <CheckCircle size={14} />
              Aprovado por {revisao.revistoPorNome || '—'}
              {revisao.revistoEm ? ` · ${new Date(revisao.revistoEm).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date(revisao.revistoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              Pendente de revisão
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Antes de emitir o certificado, um administrador deve rever o registo como 2º par de olhos, de
          preferência diferente do técnico de campo
          {tecnicoCampo ? <span className="font-bold text-slate-700"> ({tecnicoCampo})</span> : null}
          . A aprovação está disponível apenas para administradores.
        </p>

        {revisaoAprovada ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-emerald-700">{revisao.revistoPorNome}</span>
            {isAdmin && (
              <button
                onClick={limparRevisao}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Repor para pendente
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <button
                onClick={aprovarRevisao}
                disabled={!revisor}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
              >
                <UserCheck size={16} />
                Aprovar certificado ({revisor || 'sessão indisponível'})
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
                <ShieldCheck size={16} />
                Aprovação disponível apenas para administradores.
              </span>
            )}
            {isAdmin && revisor && tecnicoCampo && revisor.trim().toLowerCase() === tecnicoCampo.trim().toLowerCase() && (
              <span className="text-[11px] font-semibold text-amber-600">
                Estás a rever o teu próprio registo — idealmente outro técnico faz esta revisão.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Ficha de Abate */}
      <div className={`bg-white border rounded-3xl p-8 shadow-sm ${Boolean(inspectionData.abate?.ativo) ? 'border-red-300' : 'border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Ban className={Boolean(inspectionData.abate?.ativo) ? 'text-red-500' : 'text-slate-400'} />
            Ficha de Abate de Jangadas Salva-Vidas
          </h3>
        </div>

        {Boolean(inspectionData.abate?.ativo) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800">
              <p className="font-bold mb-1.5">Jangada assinalada para abate</p>
              <p><span className="font-semibold">Motivo:</span> {getAbateMotivoLabel(inspectionData.abate?.motivo) || '—'}</p>
              <p className="mt-1"><span className="font-semibold">Tipo de Barco:</span> {inspectionData.abate?.tipoBarco || '—'}</p>
            </div>
            <div className="flex flex-col justify-center items-start gap-2">
              <button
                onClick={handleAbateReport}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-md transition-all"
              >
                <Download size={20} />
                Gerar Ficha de Abate (PDF)
              </button>
              <p className="text-xs text-slate-500">
                Template IM.049/00 — campos do cabeçalho, tipo de barco, motivo (13–27) e campo 28.
              </p>
            </div>
          </div>
        ) : (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-slate-100 text-slate-400 font-bold cursor-not-allowed"
          >
            <Ban size={20} />
            Sem abate assinalado — ative no passo 2 (Checklist)
          </button>
        )}
      </div>

      {/* Certificado Externo (HarbourOne) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-amber-500" />
            Certificado Externo
          </h3>
          <button
            onClick={openHarbourOne}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-md transition-all"
          >
            <ExternalLink size={16} />
            Abrir HarbourOne
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          Quando o certificado é feito no HarbourOne (fabricante), preencha abaixo o número do certificado e
          carregue o PDF. Se for indicado um certificado externo, o número interno no formato{" "}
          <span className="font-mono font-bold text-slate-700">AZ26-XXX</span> fica sem efeito.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nº do Certificado Externo</label>
            <input
              type="text"
              className="w-full border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors"
              placeholder="Ex: HB-2026-123"
              value={inspectionData.certificadoExternoNumero || ''}
              onChange={(e) => setInspectionData({ ...inspectionData, certificadoExternoNumero: e.target.value })}
            />
            {hasExternalCert && (
              <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                <ShieldCheck size={12} />
                Certificado externo indicado — o número AZ26-XXX é ignorado nesta inspeção.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Documento PDF do Certificado</label>
            {inspectionData.certificadoExternoUrl ? (
              <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <a
                  href={inspectionData.certificadoExternoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1.5 truncate"
                >
                  <FileText size={14} className="shrink-0" />
                  <span className="truncate">Ver Certificado PDF Carregado</span>
                </a>
                <button
                  type="button"
                  onClick={clearExternalCert}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold ml-2 shrink-0"
                >
                  Remover
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl cursor-pointer bg-slate-50 hover:bg-amber-50/30 transition-all text-xs font-bold text-slate-600">
                {extSaving ? <Loader2 className="animate-spin text-amber-600" size={16} /> : <Upload size={16} className="text-amber-600" />}
                <span>{extSaving ? "A carregar..." : "Carregar Ficheiro PDF"}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={extSaving}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleExternalFile(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSaveExternalCert}
            disabled={extSaving || !hasExternalCert}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md transition"
          >
            {extSaving ? "A Guardar..." : "Guardar Certificado Externo"}
          </button>
        </div>
      </div>

      {previewHtml && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl animate-in slide-in-from-bottom-8">
          <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              Visualização Prévia do Certificado
            </h3>
            <button 
              onClick={handleDownloadPreview}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-bold text-sm flex items-center gap-2 transition-colors"
            >
              <Download size={16} />
              Transferir HTML
            </button>
          </div>
          <div className="p-0 bg-slate-100 relative h-[800px] overflow-auto">
            <iframe 
              srcDoc={previewHtml} 
              className="w-full h-full bg-white scale-95 origin-top mt-4 rounded-xl shadow-sm border border-slate-200"
            />
          </div>
        </div>
      )}

      <div className="flex justify-center pt-8">
        <button 
          onClick={() => router.push('/jangadas')}
          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-3 transition-transform hover:scale-105"
        >
          Voltar para a Lista de Jangadas
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
