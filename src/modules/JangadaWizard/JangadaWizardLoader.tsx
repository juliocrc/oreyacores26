"use client";
import React, { useEffect, useState } from 'react';
import { useJangadaWizardStore } from './store/useJangadaWizardStore';
import { Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { getSavedStepKey } from './steps';
import { classifyLocalDraft, draftTime } from './localDraftStatus';

export default function JangadaWizardLoader({ 
  jangadaId, 
  children,
  inspectionToOpen,
  onOpenSavedInspection,
}: { 
  jangadaId: number;
  children: React.ReactNode;
  inspectionToOpen?: any;
  onOpenSavedInspection?: (inspection: any) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [draftToRestore, setDraftToRestore] = useState<any>(null);
  const [serverData, setServerData] = useState<{ raftData: any; latestInsp: any; draftData: any } | null>(null);
  const [draftStatus, setDraftStatus] = useState<'redundant' | 'pending' | 'unknown'>('unknown');
  const { initializeWizard, setStep, setStepByKey, setInspectionData, setGlobalStock } = useJangadaWizardStore();

  function restoreStep(draft: any) {
    const state = useJangadaWizardStore.getState();
    setStepByKey(getSavedStepKey(state.inspectionData, draft || {}, state.hideOrcamento));
  }

  async function loadStock() {
    try {
      const res = await fetch("/api/stock?includeFoto=true");
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
        quantidadeReservada: Number(s.quantidadeReservada ?? 0),
        foto: s.foto || null,
        localizacao: s.localizacao || null,
        codigoBarras: s.codigoBarras || null,
        codigoFabricante: s.codigoFabricante || null,
        stationId: s.serviceStationId ?? s.stationId ?? null,
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

    const params = new URLSearchParams({
      nextCertificate: "1",
      referenceDate: new Date().toISOString().slice(0, 10),
    });
    if (raftData?.id) params.set("raftId", String(raftData.id));
    else if (raftData?.serial) params.set("serial", String(raftData.serial));
    const res = await fetch(`/api/inspecoes?${params.toString()}`);
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
        if (!inspRes.ok) throw new Error('Não foi possível confirmar as inspeções guardadas');
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
            setDraftStatus(classifyLocalDraft(draft, inspList));
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
            setInspectionData(draft.inspectionData);
            useJangadaWizardStore.setState({ jangadaId, inspecaoId: draft.inspecaoId || null, editVersions: draft.editVersions || { expectedUpdatedAt: null, expectedRaftUpdatedAt: null } });
            restoreStep(draft);
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
      useJangadaWizardStore.setState({ inspecaoId: draftToRestore.inspecaoId || null, editVersions: draftToRestore.editVersions || { expectedUpdatedAt: null, expectedRaftUpdatedAt: null } });
      restoreStep(draftToRestore);
      setDraftToRestore(null);
      setLoading(false);
      void loadStock();
    }
  };

  const handleDiscard = () => {
    if (serverData) {
      if (!window.confirm(draftStatus === 'redundant' ? 'Eliminar esta cópia local já guardada? A inspeção registada não será alterada.' : 'Não foi possível comprovar que este rascunho está guardado. Eliminar pode perder alterações locais. Deseja continuar?')) return;
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
              {draftStatus === 'redundant' ? 'Esta cópia local corresponde à versão concluída guardada no servidor.' : draftStatus === 'pending' ? 'Este rascunho pode conter alterações ainda não guardadas no servidor.' : 'Não foi possível confirmar se este rascunho contém alterações não guardadas. Preserve-o até verificar.'}
              {' '}Inspeção registada: {serverData?.latestInsp ? `${serverData.latestInsp.status || 'estado desconhecido'} · ${draftTime(serverData.latestInsp.updatedAt || serverData.latestInsp.dataInspecao)}` : 'não confirmada'}.
            </p>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              <p className="font-bold">Comparação dos campos identificáveis</p>
              <p>Inspeção associada: local {draftToRestore.inspecaoId || 'não indicada'} · servidor {serverData?.latestInsp?.id || 'não confirmada'}</p>
              <p>Data: local {String(draftToRestore.inspectionData?.dataInspecao || 'não indicada').slice(0, 10)} · servidor {String(serverData?.latestInsp?.dataInspecao || 'não confirmada').slice(0, 10)}</p>
              <p>Certificado: local {draftToRestore.inspectionData?.certificadoNumero || 'não indicado'} · servidor {serverData?.latestInsp?.certificadoNumero || 'não confirmado'}</p>
              <p>Esta comparação não mostra todos os campos. Se existirem dúvidas, preserve ou exporte o rascunho antes de o eliminar.</p>
              <button type="button" className="underline font-bold" onClick={() => { const blob = new Blob([JSON.stringify(draftToRestore, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `rascunho-jangada-${jangadaId}.json`; link.click(); URL.revokeObjectURL(url); }}>Exportar cópia local</button>
            </div>
            
            <div className="flex gap-3 justify-end pt-2">
              {onOpenSavedInspection && serverData?.latestInsp && ['concluída', 'concluida', 'condenada'].includes(String(serverData.latestInsp.status || '').trim().toLowerCase()) && (
                <button type="button" onClick={() => { setDraftToRestore(null); setLoading(true); onOpenSavedInspection(serverData.latestInsp); }} className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-semibold text-sm">
                  Ver vistoria registada (preservar rascunho)
                </button>
              )}
              <button
                type="button"
                onClick={handleDiscard}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                Eliminar cópia local
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
