"use client";
import React, { useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

export default function JangadaWizardLoader({ 
  jangadaId, 
  children,
  inspectionToOpen 
}: { 
  jangadaId: number;
  children: React.ReactNode;
  inspectionToOpen?: any;
}) {
  const [loading, setLoading] = useState(true);
  const [draftToRestore, setDraftToRestore] = useState<any>(null);
  const [serverData, setServerData] = useState<{ raftData: any; latestInsp: any; draftData: any } | null>(null);
  const { initializeWizard, setStep, setStepByKey, setInspectionData, setGlobalStock } = useJangadaWizardStore();

  function restoreStep(draft: any) {
    if (draft && draft.currentStepKey) {
      setStepByKey(draft.currentStepKey);
    } else {
      setStep(draft?.currentStep || 1);
    }
  }

  async function loadStock() {
    try {
      const res = await fetch("/api/stock");
      if (!res.ok) return;
      const d = await res.json();
      const items = Array.isArray(d)
        ? d
        : Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d?.data)
            ? d.data
            : Array.isArray(d?.stock)
              ? d.stock
              : [];
      const normalized = items.map((s: any) => ({
        id: s.id,
        referencia: s.referencia || s.ref || "",
        descricao: s.descricao || s.nome || "",
        quantidade: Number(s.quantidade ?? s.qty ?? 0),
        categoria: s.categoria || null,
        validade: s.validade || null,
        lote: s.lote || null,
        precoVenda: Number(s.precoVenda ?? s.preco ?? 0) || null,
      }));
      setGlobalStock(normalized);
      setInspectionData({ globalStock: normalized });
    } catch {
      // Stock is optional; wizard must not block if it fails.
    }
  }

  async function autoGenerateNumbers(raftData: any, draftData: any) {
  try {
    // Numa nova vistoria (sem rascunho de inspeção em curso) geramos certificado e obra.
    // Num rascunho em curso mantemos os números já atribuídos à inspeção.
    const isDraft = Boolean(draftData?.id);
    if (isDraft) return;

    const res = await fetch(`/api/inspecoes?nextCertificate=1&referenceDate=${new Date().toISOString().slice(0, 10)}`);
    if (!res.ok) return;
    const data = await res.json();
    const updates: Record<string, unknown> = {};

    if (data?.certificadoNumero) {
      const newCert = String(data.certificadoNumero || "").trim();
      const lastCert = String(raftData?.ultimoCertificadoNumero || "").trim();
      // Nunca reutilizar o último certificado da jangada numa nova vistoria
      if (newCert && newCert !== lastCert) {
        updates.certificadoNumero = newCert;
      }
    }
    if (data?.numeroObra) {
      updates.numeroObra = String(data.numeroObra);
    }
    if (Object.keys(updates).length > 0) {
      setInspectionData(updates);
    }
  } catch (error) {
    console.error("Erro ao gerar números automáticos:", error);
  }
}

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch Raft Data
        const raftRes = await fetch(`/api/jangadas/${jangadaId}`);
        if (!raftRes.ok) throw new Error('Failed to fetch Raft');
        const raftData = await raftRes.json();

        // Fetch Inspection Draft
        const inspRes = await fetch(`/api/inspecoes?jangadaId=${jangadaId}`);
        const inspList = await inspRes.json();
        const latestInsp = Array.isArray(inspList) && inspList.length > 0 ? inspList[0] : null;

        // Permite abrir o wizard a partir de um ?inspecaoId= na URL (ex.: botão "Vistoria Registada")
        const urlInspectionId = typeof window !== 'undefined'
          ? (() => {
              const raw = new URLSearchParams(window.location.search).get('inspecaoId');
              const parsed = raw ? parseInt(raw, 10) : NaN;
              return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
            })()
          : null;

        // 1) Inspeção específica (prop) — ex.: botão "Vistoria Registada" / última vistoria
        const explicitInspection = inspectionToOpen?.id ? inspectionToOpen : null;
        // 2) Inspeção específica por ?inspecaoId= na URL
        const queryInspection = urlInspectionId
          ? (Array.isArray(inspList) ? inspList.find((i: any) => Number(i?.id) === urlInspectionId) : null) || null
          : null;

        // 3) Rascunho em curso (Draft). Uma inspeção concluída/condenada
        //    significa que esta é uma NOVA vistoria → criamos uma nova inspeção (draftData null).
        const draftData =
          explicitInspection || queryInspection ||
          (latestInsp && String(latestInsp.status || "").trim().toLowerCase() === 'draft' ? latestInsp : null);

        setServerData({ raftData, latestInsp, draftData });

        // Check if there is a local draft (matches useAutoSave key pattern)
        // (ignorado quando abrimos uma inspeção específica — consulta/edição de vistoria registada)
        const localDraftRaw = !explicitInspection && !queryInspection
          ? localStorage.getItem(`jangada-wizard-draft-${jangadaId}`)
          : null;
        if (localDraftRaw) {
          const draft = JSON.parse(localDraftRaw);
          // Only offer restoration if draft has actual data and is valid
          if (draft && draft.inspectionData && Object.keys(draft.inspectionData).length > 0) {
            setDraftToRestore(draft);
            return; // Wait for user decision
          }
        }

        // Initialize Store from Server
        initializeWizard(raftData, draftData);
        // Quando abrimos uma inspeção específica (consulta/edição) mantemos os números já atribuídos
        if (!explicitInspection && !queryInspection) {
          autoGenerateNumbers(raftData, draftData);
        }
        setLoading(false);
        void loadStock();
      } catch (error) {
        console.error("Error loading Wizard data:", error);
        
        // Offline Fallback: Try loading from local draft if server is unreachable
        const localDraftRaw = localStorage.getItem(`jangada-wizard-draft-${jangadaId}`);
        if (localDraftRaw) {
          const draft = JSON.parse(localDraftRaw);
          if (draft && draft.inspectionData) {
            console.log("Offline mode: Restoring from local draft...");
            // Initialize with draft data
            initializeWizard(draft.inspectionData, null);
            restoreStep(draft);
            setInspectionData(draft.inspectionData);
            setLoading(false);
            return;
          }
        }
        
        alert("Não foi possível carregar os dados da jangada e não existem rascunhos locais gravados offline.");
      }
    }

    loadData();
  }, [jangadaId, initializeWizard, inspectionToOpen]);

  const handleRestore = () => {
    if (serverData && draftToRestore) {
      // Initialize with base config, then override with draft
      initializeWizard(serverData.raftData, serverData.draftData);
      setInspectionData(draftToRestore.inspectionData);
      restoreStep(draftToRestore);
      setDraftToRestore(null);
      setLoading(false);
      void loadStock();
    }
  };

  const handleDiscard = () => {
    if (serverData) {
      localStorage.removeItem(`jangada-wizard-draft-${jangadaId}`);
      initializeWizard(serverData.raftData, serverData.draftData);
      autoGenerateNumbers(serverData.raftData, serverData.draftData);
      setDraftToRestore(null);
      setLoading(false);
      void loadStock();
    }
  };

  if (loading) {
    if (draftToRestore) {
      return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Rascunho Local Detetado</h3>
                <p className="text-xs text-slate-500">Última gravação: {draftToRestore.savedAt ? new Date(draftToRestore.savedAt).toLocaleString('pt-PT') : 'Desconhecida'}</p>
              </div>
            </div>
            
            <p className="text-sm text-slate-600 leading-relaxed">
              Foi encontrado um progresso de inspeção gravado localmente neste dispositivo para esta jangada. Deseja recuperar este rascunho ou recomeçar com os dados do servidor?
            </p>
            
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={handleDiscard}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                Descartar
              </button>
              <button
                type="button"
                onClick={handleRestore}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Recuperar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
        <p className="text-slate-600 font-medium">A carregar dados da Jangada...</p>
      </div>
    );
  }

  return <>{children}</>;
}
