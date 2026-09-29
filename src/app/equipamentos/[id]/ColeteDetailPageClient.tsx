"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ColeteWizardLoader from '@/modules/ColeteWizard/ColeteWizardLoader';
import { ColetorPremiumDossier } from '@/components/coletes/ColetorPremiumDossier';
import LifejacketDiagram from '@/components/coletes/LifejacketDiagram';
import { AlertCircle, Loader2, Save, X, Activity, Package, Edit, Printer, TriangleAlert, History, RotateCcw } from 'lucide-react';
import { MECANISMO_OPTIONS, type MecanismoOption } from "@/types/ficha-verificacao-multipla";
import { formatValidityDisplay } from "@/lib/date-display";
import { resolveTechnicalCatalog, buildMechanismRecommendations, orderMechanismOptions } from "@/lib/ficha-verificacao-multipla-helpers";

export default function ColeteDetailPageClient({ coleteId }: { coleteId: number | string }) {
  const [isInspecting, setIsInspecting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [isEditingComponents, setIsEditingComponents] = useState(false);
  const [savingComponents, setSavingComponents] = useState(false);
  const [searchCilindro, setSearchCilindro] = useState('');
  const [searchPastilha, setSearchPastilha] = useState('');
  const [searchLuz, setSearchLuz] = useState('');
  const [searchApito, setSearchApito] = useState('');
  const [searchMecanismo, setSearchMecanismo] = useState('');

  // Componente change history (persisted in database)
  const [componentHistory, setComponentHistory] = useState<any[]>([]);

  useEffect(() => {
    if (data?.id) {
      fetch(`/api/coletes/${data.id}/component-history`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(({ history }) => setComponentHistory(history || []))
        .catch(() => setComponentHistory([]));
    }
  }, [data?.id]);

  const addToComponentHistory = useCallback(async (changes: Record<string, any>) => {
    if (!data?.id) return;
    try {
      await fetch(`/api/coletes/${data.id}/component-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      // Refresh history
      const res = await fetch(`/api/coletes/${data.id}/component-history`);
      if (res.ok) {
        const { history } = await res.json();
        setComponentHistory(history || []);
      }
    } catch (e) {
      console.warn("Failed to save component history:", e);
    }
  }, [data?.id]);
  const [componentForm, setComponentForm] = useState<any>({
    cilindroRef: '', cilindroLote: '', cilindroStockId: '',
    pastilhaRef: '', pastilhaLote: '', pastilhaValidade: '', pastilhaStockId: '',
    temLuz: true,
    luzRef: '', luzLote: '', luzValidade: '', luzStockId: '',
    apitoRef: '', apitoLote: '', apitoStockId: '',
    mecanismoInflacao: ''
  });

  useEffect(() => {
    if (data) {
      setComponentForm({
        cilindroRef: data.cilindroRef || '',
        cilindroLote: data.cilindroLote || '',
        pastilhaRef: data.pastilhaRef || '',
        pastilhaLote: data.pastilhaLote || '',
        pastilhaValidade: data.pastilhaValidade || '',
        temLuz: data.temLuz === false ? false : true,
        luzRef: data.luzRef || '',
        luzLote: data.luzLote || '',
        luzValidade: data.luzValidade || '',
        apitoRef: data.apitoRef || '', apitoLote: data.apitoLote || '',
        cilindroStockId: '', pastilhaStockId: '', luzStockId: '', apitoStockId: '',
        mecanismoInflacao: data.mecanismoInflacao || ''
      });
      setHasUnsavedChanges(false);
    }
  }, [data]);

  const handleSaveComponents = async () => {
    try {
      setSavingComponents(true);
      
      // Compute what changed
      const changes: Record<string, { from: any; to: any }> = {};
      const fieldsToTrack = [
        'cilindroRef', 'cilindroLote', 'pastilhaRef', 'pastilhaLote', 'pastilhaValidade',
        'temLuz', 'luzRef', 'luzLote', 'luzValidade', 'apitoRef', 'apitoLote',
        'mecanismoInflacao', 'mecanismoValidade'
      ];
      fieldsToTrack.forEach(f => {
        if (componentForm[f] !== data?.[f]) {
          changes[f] = { from: data?.[f] || '—', to: componentForm[f] || '—' };
        }
      });
      
      const res = await fetch(`/api/coletes/${coleteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(componentForm)
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Erro ao salvar componentes (${res.status}): ${errBody}`);
      }
      
      if (Object.keys(changes).length > 0) {
        addToComponentHistory(changes);
      }
      
      setData((prev: any) => ({
        ...prev,
        ...componentForm
      }));
      setIsEditingComponents(false);
      setHasUnsavedChanges(false);
      initialFormSyncDone.current = false;
      setTimeout(() => { initialFormSyncDone.current = true; }, 0);
      alert('Componentes atualizados com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar');
    } finally {
      setSavingComponents(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('startInspection') === '1') {
        setIsInspecting(true);
      }
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // Only fetch if it's a valid ID
        if (typeof coleteId === 'number' || !isNaN(Number(coleteId))) {
          const res = await fetch(`/api/coletes/${coleteId}?includeStock=true`);
          if (!res.ok) throw new Error('Not found');
          const json = await res.json();
          setData(json);
        } else {
          // It's a demo id like example-lalizas
          setData({ id: coleteId, marca: 'Lalizas', modelo: 'Sigma', serial: 'DEMO-123' });
        }
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    if (!isInspecting) {
      fetchData();
    }
  }, [coleteId, isInspecting]);

  const [movimentos, setMovimentos] = useState<any[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const initialFormSyncDone = useRef(false);
  useEffect(() => {
    if (initialFormSyncDone.current && isEditingComponents) {
      setHasUnsavedChanges(true);
    }
    initialFormSyncDone.current = true;
  }, [componentForm]);

  useEffect(() => {
    if (data?.serial) {
      fetch(`/api/equipamento/movimentos?serial=${data.serial}`)
        .then(res => res.json())
        .then(json => setMovimentos(json))
        .catch(err => console.error(err));
    }
  }, [data?.serial]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditingComponents && hasUnsavedChanges) handleSaveComponents();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditingComponents, hasUnsavedChanges, componentForm]);

  const validityTone = (valStr: string | null) => {
    if (!valStr) return null;
    const match = valStr.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      const m2 = valStr.match(/(\d{2})\/(\d{4})/);
      if (!m2) return null;
      const year = parseInt(m2[2]), month = parseInt(m2[1]) - 1;
      const d = new Date(year, month, 1).getTime() + 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
      if (days < 0) return { label: 'Expirado', cls: 'bg-red-100 text-red-700 border-red-200' };
      if (days <= 90) return { label: 'A expirar', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
      return { label: 'OK', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    }
    const year = parseInt(match[1]), month = parseInt(match[2]) - 1;
    const d = new Date(year, month, 1).getTime() + 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Expirado', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (days <= 90) return { label: 'A expirar', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'OK', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  const printFicha = () => {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const pastilha = MECANISMO_OPTIONS.find(o => o.value === data.mecanismoInflacao)?.temPastilha ?? true;
    win.document.write(`
      <html><head><title>Ficha Técnica ${data.serial}</title>
      <style>
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 18px; border-bottom: 2px solid #000; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 700; }
        .ok { color: #059669; } .warn { color: #d97706; } .exp { color: #dc2626; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>FICHA TÉCNICA DE COLETE SALVA-VIDAS</h1>
      <table><tr><th>Navio</th><td>${data.navio?.nome || '—'}</td><th>Matrícula</th><td>${data.navio?.matricula || '—'}</td></tr>
      <tr><th>Marca / Modelo</th><td>${data.marca || '—'} / ${data.modelo || '—'}</td><th>Nº Série</th><td>${data.serial || '—'}</td></tr>
      <tr><th>Próx. Inspeção</th><td>${data.dataProxInspecao ? new Date(data.dataProxInspecao).toLocaleDateString('pt-PT') : '—'}</td><th>Mecanismo</th><td>${data.mecanismoInflacao ? (MECANISMO_OPTIONS.find(o => o.value === data.mecanismoInflacao)?.label || data.mecanismoInflacao) : '—'}</td></tr></table>
      <table><tr><th>Componente</th><th>Referência</th><th>Lote</th><th>Validade</th></tr>
      <tr><td>Cilindro CO₂</td><td>${data.cilindroRef || '—'}</td><td>${data.cilindroLote || '—'}</td><td>—</td></tr>
      ${pastilha ? `<tr><td>Pastilha de Sal</td><td>${data.pastilhaRef || '—'}</td><td>${data.pastilhaLote || '—'}</td><td>${data.pastilhaValidade ? formatValidityDisplay(data.pastilhaValidade) : '—'}</td></tr>` : ''}
      ${data.temLuz !== false ? `<tr><td>Luz Emergência</td><td>${data.luzRef || '—'}</td><td>${data.luzLote || '—'}</td><td>${data.luzValidade ? formatValidityDisplay(data.luzValidade) : '—'}</td></tr>` : ''}
      <tr><td>Apito</td><td>${data.apitoRef || '—'}</td><td>${data.apitoLote || '—'}</td><td>—</td></tr></table>
      <p style="font-size:10px;color:#999;margin-top:20px">Gerado em ${new Date().toLocaleString('pt-PT')}</p>
       ${['<scr', 'ipt>window.print();window.close();</scr', 'ipt>'].join('')}
      </body></html>
    `);
    win.document.close();
  };

  const brandCatalog = data ? resolveTechnicalCatalog(data.marca, data.modelo) : null;
  const recommendedMechanisms = buildMechanismRecommendations(brandCatalog?.brandCatalog ?? null);
  const orderedMechanismOptions = orderMechanismOptions(recommendedMechanisms);

  const selectedMecanismo = MECANISMO_OPTIONS.find(o => o.value === componentForm.mecanismoInflacao);
  const showPastilha = selectedMecanismo?.temPastilha ?? false;
  const showMecanismoValidade = selectedMecanismo?.temValidadePropria ?? false;

  if (isInspecting) {
    return <ColeteWizardLoader coleteId={typeof coleteId === 'number' ? coleteId : (isNaN(Number(coleteId)) ? 0 : Number(coleteId))} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={24} />
        <span className="text-slate-500 font-medium">A carregar ficha de colete...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-red-200 text-red-600 max-w-lg mx-auto mt-12 shadow-sm">
        <AlertCircle className="mx-auto mb-4" size={48} />
        <h2 className="text-xl font-bold">Colete Não Encontrado</h2>
        <p className="mt-2 text-sm text-slate-500">O identificador solicitado é inválido ou não existe.</p>
      </div>
    );
  }

  // Calculate health score and basic props for the premium dossier
  let score = 100;
  let overdue = 0;
  let dueSoon = 0;
  
  if (data.dataProxInspecao) {
    const prox = new Date(data.dataProxInspecao).getTime();
    const now = Date.now();
    const daysLeft = Math.ceil((prox - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) { overdue = 1; score -= 40; }
    else if (daysLeft < 30) { dueSoon = 1; score -= 15; }
  } else {
    score -= 20; // No inspection date
  }

  const tone = score >= 80 ? { ring: 'ring-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', label: 'Excelente' }
             : score >= 60 ? { ring: 'ring-amber-500', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', label: 'Atenção' }
             : { ring: 'ring-rose-500', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800', label: 'Crítico' };



  const printLabel = () => {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Etiqueta ${data.serial}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 20px; display: flex; justify-content: center; align-items: center; height: 90vh; }
            .label { border: 2px solid #0f172a; padding: 20px; border-radius: 12px; display: inline-block; background: #fff; width: 220px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .title { font-size: 14px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.1em; margin-bottom: 12px; }
            .serial { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 12px; font-family: monospace; }
            .model { font-size: 12px; color: #475569; margin-top: 4px; font-weight: 500; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="label">
            <div class="title">OREY AZORES</div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.href)}" width="150" height="150" />
            <div class="serial">${data.serial}</div>
            <div class="model">${data.marca || ''} ${data.modelo || ''}</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  };
  const formatStockValidade = (valStr: string | null) => {
    if (!valStr) return '';
    const match = valStr.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      return `${match[2]}/${match[1]}`;
    }
    return valStr;
  };

  const coleteStock = data?.globalStock || [];
  const cilindrosStock = coleteStock.filter((s: any) => s.categoria === 'CILINDROS');
  const pastilhasStock = coleteStock.filter((s: any) => s.categoria === 'PASTILHAS');
  const luzesStock = coleteStock.filter((s: any) => s.categoria === 'LUZES');
  const apitosStock = coleteStock.filter((s: any) => (s.categoria || '').toUpperCase() === 'APITOS' || s.descricao.toLowerCase().includes('apito') || s.descricao.toLowerCase().includes('whistle'));
  const mecanismosStock = coleteStock.filter((s: any) => {
    const cat = (s.categoria || '').toLowerCase();
    const desc = s.descricao.toLowerCase();
    const ref = (s.referencia || '').toLowerCase();
    return cat.includes('mecan') || cat.includes('insufl') || cat.includes('disparo') || cat.includes('cabeca') || desc.includes('mecanismo') || desc.includes('insufla') || desc.includes('disparo') || ref.includes('hammar') || ref.includes('hr-') || ref.includes('lz-') || ref.includes('uml-');
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out space-y-6">
      <ColetorPremiumDossier
        dossierCounts={{ overdue, dueSoon }}
        dossierSummaryCards={[
          { label: 'Navio', value: data.navio?.nome || '—', hint: data.navio?.matricula || '', tone: 'sky' },
          { label: 'Marca / Modelo', value: `${data.marca || '—'} / ${data.modelo || '—'}`, hint: data.tamanho || '', tone: 'indigo' },
          { label: 'Nº Série', value: data.serial || '—', hint: '', tone: 'emerald' },
        ]}
        coleteHealthTone={tone}
        coleteHealthScore={score}
        coleteHealthStrokeOffset={314 - (314 * score) / 100}
        coleteHealthBreakdown={[
          { label: 'Validade Geral', value: score, hint: 'Baseado na data de inspeção', kind: score > 80 ? 'coverage' : 'critical' }
        ]}
        coleteSpotlightCards={[
          { title: 'Próxima Inspeção', value: data.dataProxInspecao ? new Date(data.dataProxInspecao).toLocaleDateString('pt-PT') : '—', description: 'Data limite para próxima revisão', kind: overdue > 0 ? 'critical' : dueSoon > 0 ? 'attention' : 'coverage' }
        ]}
        coleteCategoryScores={[
          { label: 'Estado Técnico', score: data.dataProxInspecao ? score : 50, detail: overdue > 0 ? 'Inspeção em atraso!' : 'Inspeção em dia' },
          { label: 'Documentação', score: data.certificado ? 100 : 0, detail: data.certificado ? 'Certificado emitido e válido' : 'Sem certificado ativo' },
          { label: 'Componentes', score: (data.cilindroRef && data.pastilhaRef) ? 100 : (data.cilindroRef || data.pastilhaRef) ? 50 : 0, detail: (data.cilindroRef && data.pastilhaRef) ? 'Consumíveis montados' : 'Consumíveis em falta' }
        ]}
        coleteNextFocusActions={[
          ...(overdue > 0 ? [{
            title: 'Inspeção em atraso',
            detail: 'Realize a inspeção técnica do colete para validar os componentes e o seu funcionamento.',
            cta: 'Iniciar Inspeção',
            onClick: () => setIsInspecting(true)
          }] : []),
          ...(!data.cilindroRef || !data.pastilhaRef ? [{
            title: 'Componentes em falta',
            detail: 'Existem componentes obrigatórios não registados neste colete.',
            cta: 'Editar Componentes',
            onClick: () => setIsEditingComponents(true)
          }] : [])
        ]}
        dossierQuickActions={[
          { key: 'inspect', label: 'Iniciar Inspeção', onClick: () => setIsInspecting(true), className: 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent shadow-sm' },
          { key: 'back', label: 'Voltar à Lista', onClick: () => window.location.href = '/equipamentos', className: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50' }
        ]}
        dossierTimeline={data.dossier?.timeline?.map((item: any) => {
          let kind: "inspecao" | "certificado" | "evidencia" | "operacao" | "dados" = "operacao";
          if (item.kind === "inspection" || item.kind === "verificacao") kind = "inspecao";
          else if (item.kind === "certificate") kind = "certificado";
          else if (item.kind === "evidence") kind = "evidencia";
          else if (item.kind === "record") kind = "dados";
          return {
            id: item.id,
            title: item.title,
            date: item.date,
            detail: item.description,
            kind,
            href: item.href,
            badge: item.status,
          };
        }) || []}
        certificateDocuments={data.certificado ? [{
          id: data.certificado.id,
          certificadoNumero: data.certificado.numeroCertificado,
          dataInspecao: data.certificado.dataCertificado,
          dataProxInspecao: data.certificado.dataValidade,
          sourceYear: new Date(data.certificado.dataCertificado).getFullYear(),
        }] : []}
        evidenceDocuments={data.dossier?.documents
          ?.filter((doc: any) => doc.source === "Evidências operacionais do colete")
          ?.map((doc: any) => ({
            name: doc.reference,
            originalName: doc.title,
            url: doc.href,
            uploadedAt: doc.issueDate,
          })) || []}
        dossierDeadlines={data.dossier?.deadlines?.map((deadline: any) => ({
          key: deadline.id,
          label: deadline.title,
          displayValue: deadline.date ? new Date(deadline.date).toLocaleDateString('pt-PT') : '—',
          description: `${deadline.entityLabel} · ${deadline.source}`,
          days: deadline.daysRemaining,
        })) || []}
        phase3Recommendations={[]}
        inspectionCycleLabel="Anual"
        formatDatePt={(v) => v ? new Date(v).toLocaleDateString('pt-PT') : '—'}
        formatFileSize={(bytes) => {
          if (!bytes) return '';
          const kb = bytes / 1024;
          return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
        }}
        getDeadlineTone={(days) => {
          if (days === null) return { badge: 'Sem limite', className: 'border-slate-200 bg-slate-50 text-slate-700' };
          if (days < 0) return { badge: 'Expirado', className: 'border-rose-200 bg-rose-50 text-rose-700' };
          if (days === 0) return { badge: 'Vence Hoje', className: 'border-rose-200 bg-rose-50 text-rose-700 animate-pulse' };
          if (days <= 30) return { badge: 'A expirar', className: 'border-amber-200 bg-amber-50 text-amber-700' };
          if (days <= 90) return { badge: 'Planear', className: 'border-blue-200 bg-blue-50 text-blue-700' };
          return { badge: 'OK', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
        }}
        scrollToDossierBlock={() => {}}
        onOpenEvidencias={() => {}}
        onOpenHistorico={() => {}}
      />

      <LifejacketDiagram colete={data} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* QR Code Panel */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center text-center justify-between min-h-[250px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Etiqueta QR Code</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">Cole este QR Code no equipamento físico para auditorias rápidas no cais.</p>
          </div>
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`} 
            alt="QR Code" 
            className="w-32 h-32 border p-2 bg-white rounded-xl"
          />
          <button 
            onClick={printLabel} 
            className="mt-4 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors w-full"
          >
            Imprimir Etiqueta
          </button>
        </div>

        {/* Movement History Panel */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm md:col-span-2 flex flex-col justify-between min-h-[250px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base mb-3">Histórico de Rastreabilidade</h3>
            <div className="overflow-y-auto max-h-[160px] border border-slate-100 rounded-xl">
              {movimentos.length > 0 ? (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                      <th className="p-3">Data</th>
                      <th className="p-3">Origem</th>
                      <th className="p-3">Destino</th>
                      <th className="p-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movimentos.map((mov) => (
                      <tr key={mov.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-500">{new Date(mov.data).toLocaleString('pt-PT')}</td>
                        <td className="p-3 font-medium text-slate-700">{mov.origemShipNome || 'Sem Navio'}</td>
                        <td className="p-3 font-medium text-slate-700">{mov.destinoShipNome || 'Sem Navio'}</td>
                        <td className="p-3 text-slate-500">{mov.motivo || 'Alteração'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-400 italic text-center py-10 text-xs">Ainda sem histórico de transferências.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Componentes Atuais do Colete */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="text-indigo-600" size={18} /> Componentes e Consumíveis Instalados
            </h3>
            <p className="text-xs text-slate-500 mt-1">Referências, lotes e validades dos componentes montados neste colete.</p>
          </div>
          <div className="flex items-center gap-2">
            {isEditingComponents ? (
              <>
                {hasUnsavedChanges && <span className="text-[10px] text-amber-600 font-medium animate-pulse">⚠️ Alterações não guardadas</span>}
                <button
                  onClick={handleSaveComponents}
                  disabled={savingComponents}
                  title={`Guardar componentes (Ctrl+S)${hasUnsavedChanges ? '' : ' — Sem alterações'}`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition disabled:opacity-50 ${hasUnsavedChanges ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400'}`}
                >
                  <Save size={12} /> {savingComponents ? 'A guardar...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setIsEditingComponents(false)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
                >
                  <X size={12} /> Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditingComponents(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition"
              >
                <Edit size={12} /> Editar Componentes
              </button>
            )}
            <button
              onClick={printFicha}
              title="Exportar ficha técnica para PDF (impressão)"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition"
            >
              <Printer size={12} /> PDF
            </button>
          </div>
        </div>

          {isEditingComponents ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Configuração de Componentes</h4>
                <p className="text-xs text-slate-500">Indique quais os componentes instalados neste colete.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">Colete tem luz de emergência?</label>
                <select
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={componentForm.temLuz === false ? 'nao' : 'sim'}
                  onChange={(e) => setComponentForm((prev: any) => ({ ...prev, temLuz: e.target.value === 'sim' }))}
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Edit Cilindro */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-sky-100 pb-2">
                <span className="text-lg">💨</span>
                <span className="text-xs font-bold uppercase tracking-wider text-sky-800">Cilindro CO₂</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Artigo Stock</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Pesquisar artigo..."
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] bg-slate-50"
                        value={searchCilindro}
                        onChange={(e) => setSearchCilindro(e.target.value)}
                      />
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        value={componentForm.cilindroStockId || ''}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const found = cilindrosStock.find((s: any) => s.id === id);
                          setComponentForm((prev: any) => ({
                            ...prev,
                            cilindroStockId: id || '',
                            cilindroRef: found?.referencia || '',
                            cilindroLote: found?.lote || '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {cilindrosStock.filter((s: any) => !searchCilindro || (s.descricao || '').toLowerCase().includes(searchCilindro.toLowerCase()) || (s.referencia || '').toLowerCase().includes(searchCilindro.toLowerCase())).map((s: any) => {
                          const isZero = (s.quantidade ?? 0) === 0;
                          return (
                            <option key={s.id} value={s.id} title={`${s.descricao || 'Sem descrição'} — ${isZero ? 'SEM STOCK' : `Stock: ${s.quantidade}`}`}>
                              {s.descricao || 'Sem descrição'} {s.referencia ? `(${s.referencia})` : ''} — Stock: {s.quantidade ?? 0}{isZero ? ' ⚠️' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {(() => {
                      const selId = Number(componentForm.cilindroStockId);
                      const selItem = selId ? cilindrosStock.find((s: any) => s.id === selId) : null;
                      return (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {selItem?.foto ? (
                            <img src={selItem.foto} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                          ) : null}
                          {selItem && (selItem.quantidade ?? 0) === 0 && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded whitespace-nowrap">Sem Stock</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Lote</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    value={componentForm.cilindroLote}
                    onChange={(e) => setComponentForm((prev: any) => ({ ...prev, cilindroLote: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Edit Pastilha */}
            {showPastilha && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-amber-100 pb-2">
                <span className="text-lg">💊</span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Pastilha de Sal</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Artigo Stock</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Pesquisar artigo..."
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] bg-slate-50"
                        value={searchPastilha}
                        onChange={(e) => setSearchPastilha(e.target.value)}
                      />
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        value={componentForm.pastilhaStockId || ''}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const found = pastilhasStock.find((s: any) => s.id === id);
                          setComponentForm((prev: any) => ({
                            ...prev,
                            pastilhaStockId: id || '',
                            pastilhaRef: found?.referencia || '',
                            pastilhaLote: found?.lote || '',
                            pastilhaValidade: found?.validade ? formatStockValidade(found.validade) : '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {pastilhasStock.filter((s: any) => !searchPastilha || (s.descricao || '').toLowerCase().includes(searchPastilha.toLowerCase()) || (s.referencia || '').toLowerCase().includes(searchPastilha.toLowerCase())).map((s: any) => {
                          const isZero = (s.quantidade ?? 0) === 0;
                          return (
                            <option key={s.id} value={s.id} title={`${s.descricao || 'Sem descrição'} — ${isZero ? 'SEM STOCK' : `Stock: ${s.quantidade}`}`}>
                              {s.descricao || 'Sem descrição'} {s.referencia ? `(${s.referencia})` : ''} — Stock: {s.quantidade ?? 0}{isZero ? ' ⚠️' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {(() => {
                      const selId = Number(componentForm.pastilhaStockId);
                      const selItem = selId ? pastilhasStock.find((s: any) => s.id === selId) : null;
                      return (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {selItem?.foto ? (
                            <img src={selItem.foto} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                          ) : null}
                          {selItem && (selItem.quantidade ?? 0) === 0 && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded whitespace-nowrap">Sem Stock</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Lote</label>
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      value={componentForm.pastilhaLote}
                      onChange={(e) => setComponentForm((prev: any) => ({ ...prev, pastilhaLote: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Validade</label>
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      placeholder="EX: MM/AAAA"
                      value={componentForm.pastilhaValidade}
                      onChange={(e) => setComponentForm((prev: any) => ({ ...prev, pastilhaValidade: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Edit Luz */}
            {componentForm.temLuz !== false && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-emerald-100 pb-2">
                <span className="text-lg">💡</span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Luz de Emergência</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Artigo Stock</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Pesquisar artigo..."
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] bg-slate-50"
                        value={searchLuz}
                        onChange={(e) => setSearchLuz(e.target.value)}
                      />
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        value={componentForm.luzStockId || ''}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const found = luzesStock.find((s: any) => s.id === id);
                          setComponentForm((prev: any) => ({
                            ...prev,
                            luzStockId: id || '',
                            luzRef: found?.referencia || '',
                            luzLote: found?.lote || '',
                            luzValidade: found?.validade ? formatStockValidade(found.validade) : '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {luzesStock.filter((s: any) => !searchLuz || (s.descricao || '').toLowerCase().includes(searchLuz.toLowerCase()) || (s.referencia || '').toLowerCase().includes(searchLuz.toLowerCase())).map((s: any) => {
                          const isZero = (s.quantidade ?? 0) === 0;
                          return (
                            <option key={s.id} value={s.id} title={`${s.descricao || 'Sem descrição'} — ${isZero ? 'SEM STOCK' : `Stock: ${s.quantidade}`}`}>
                              {s.descricao || 'Sem descrição'} {s.referencia ? `(${s.referencia})` : ''} — Stock: {s.quantidade ?? 0}{isZero ? ' ⚠️' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {(() => {
                      const selId = Number(componentForm.luzStockId);
                      const selItem = selId ? luzesStock.find((s: any) => s.id === selId) : null;
                      return (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {selItem?.foto ? (
                            <img src={selItem.foto} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                          ) : null}
                          {selItem && (selItem.quantidade ?? 0) === 0 && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded whitespace-nowrap">Sem Stock</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Lote</label>
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      value={componentForm.luzLote}
                      onChange={(e) => setComponentForm((prev: any) => ({ ...prev, luzLote: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Validade</label>
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      placeholder="EX: MM/AAAA"
                      value={componentForm.luzValidade}
                      onChange={(e) => setComponentForm((prev: any) => ({ ...prev, luzValidade: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Edit Apito */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-violet-100 pb-2">
                <span className="text-lg">📯</span>
                <span className="text-xs font-bold uppercase tracking-wider text-violet-800">Apito</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Artigo Stock</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Pesquisar artigo..."
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] bg-slate-50"
                        value={searchApito}
                        onChange={(e) => setSearchApito(e.target.value)}
                      />
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        value={componentForm.apitoStockId || ''}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const found = apitosStock.find((s: any) => s.id === id);
                          setComponentForm((prev: any) => ({
                            ...prev,
                            apitoStockId: id || '',
                            apitoRef: found?.referencia || '',
                            apitoLote: found?.lote || '',
                          }));
                        }}
                      >
                        <option value="">—</option>
                        {apitosStock.filter((s: any) => !searchApito || (s.descricao || '').toLowerCase().includes(searchApito.toLowerCase()) || (s.referencia || '').toLowerCase().includes(searchApito.toLowerCase())).map((s: any) => {
                          const isZero = (s.quantidade ?? 0) === 0;
                          return (
                            <option key={s.id} value={s.id} title={`${s.descricao || 'Sem descrição'} — ${isZero ? 'SEM STOCK' : `Stock: ${s.quantidade}`}`}>
                              {s.descricao || 'Sem descrição'} {s.referencia ? `(${s.referencia})` : ''} — Stock: {s.quantidade ?? 0}{isZero ? ' ⚠️' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {(() => {
                      const selId = Number(componentForm.apitoStockId);
                      const selItem = selId ? apitosStock.find((s: any) => s.id === selId) : null;
                      return (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {selItem?.foto ? (
                            <img src={selItem.foto} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                          ) : null}
                          {selItem && (selItem.quantidade ?? 0) === 0 && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded whitespace-nowrap">Sem Stock</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Lote</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    value={componentForm.apitoLote}
                    onChange={(e) => setComponentForm((prev: any) => ({ ...prev, apitoLote: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Edit Mecanismo Insuflação */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b border-orange-100 pb-2">
                <span className="text-lg">⚙️</span>
                <span className="text-xs font-bold uppercase tracking-wider text-orange-800">Mecanismo Insuflação</span>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</label>
                  <select
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    value={componentForm.mecanismoInflacao}
                    onChange={(e) => setComponentForm((prev: any) => ({ ...prev, mecanismoInflacao: e.target.value }))}
                  >
                    <option value="">-- Selecionar --</option>
                    {orderedMechanismOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} title={`${opt.label}${opt.temPastilha ? ' — Usa pastilha de sal' : opt.temValidadePropria ? ' — Validade própria' : ' — Sem pastilha'}`}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {showMecanismoValidade && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Validade do Mecanismo</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    placeholder="EX: MM/AAAA"
                    value={componentForm.mecanismoValidade || ''}
                    onChange={(e) => setComponentForm((prev: any) => ({ ...prev, mecanismoValidade: e.target.value }))}
                  />
                </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Artigo Stock</label>
                  {mecanismosStock.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        placeholder="Pesquisar artigo..."
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] bg-slate-50"
                        value={searchMecanismo}
                        onChange={(e) => setSearchMecanismo(e.target.value)}
                      />
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                        value={componentForm.mecanismoStockId || ''}
                        onChange={(e) => setComponentForm((prev: any) => ({ ...prev, mecanismoStockId: Number(e.target.value) || '' }))}
                      >
                        <option value="">—</option>
                        {mecanismosStock.filter((s: any) => !searchMecanismo || (s.descricao || '').toLowerCase().includes(searchMecanismo.toLowerCase()) || (s.referencia || '').toLowerCase().includes(searchMecanismo.toLowerCase())).map((s: any) => {
                          const isZero = (s.quantidade ?? 0) === 0;
                          return (
                            <option key={s.id} value={s.id} title={`${s.descricao || 'Sem descrição'} — ${isZero ? 'SEM STOCK' : `Stock: ${s.quantidade}`}`}>
                              {s.descricao || 'Sem descrição'} {s.referencia ? `(${s.referencia})` : ''} — Stock: {s.quantidade ?? 0}{isZero ? ' ⚠️' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {(() => {
                      const selId = Number(componentForm.mecanismoStockId);
                      const selItem = selId ? mecanismosStock.find((s: any) => s.id === selId) : null;
                      return (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          {selItem?.foto ? (
                            <img src={selItem.foto} alt="" className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                          ) : null}
                          {selItem && (selItem.quantidade ?? 0) === 0 && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded whitespace-nowrap">Sem Stock</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  ) : (
                  <div className="text-xs text-slate-400 italic px-2.5 py-1.5 border border-dashed border-slate-200 rounded-lg">
                    Nenhum artigo de stock disponível para mecanismo de insuflação
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* View Cilindro */}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 transition hover:shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-200 text-sky-700 text-sm font-bold">💨</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">Cilindro CO₂</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Referência</span>
                  <span className="font-semibold text-slate-800">{data.cilindroRef || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Lote</span>
                  <span className="font-medium text-slate-700">{data.cilindroLote || '—'}</span>
                </div>
              </div>
            </div>

            {/* View Pastilha */}
            {(MECANISMO_OPTIONS.find(o => o.value === data.mecanismoInflacao)?.temPastilha ?? true) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-200 text-amber-700 text-sm font-bold">💊</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Pastilha de Sal</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Referência</span>
                  <span className="font-semibold text-slate-800">{data.pastilhaRef || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Lote</span>
                  <span className="font-medium text-slate-700">{data.pastilhaLote || '—'}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-500">Validade</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1.5">{data.pastilhaValidade || '—'}{(() => { const t = validityTone(data.pastilhaValidade); return t ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${t.cls}`}>{t.label}</span> : null; })()}</span>
                </div>
              </div>
            </div>
            )}

            {/* View Luz */}
            {data.temLuz !== false && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 text-sm font-bold">💡</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Luz de Emergência</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Referência</span>
                  <span className="font-semibold text-slate-800">{data.luzRef || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Lote</span>
                  <span className="font-medium text-slate-700">{data.luzLote || '—'}</span>
                </div>
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-500">Validade</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1.5">{data.luzValidade || '—'}{(() => { const t = validityTone(data.luzValidade); return t ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${t.cls}`}>{t.label}</span> : null; })()}</span>
                </div>
              </div>
            </div>
            )}

            {/* View Apito */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 transition hover:shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-violet-200 text-violet-700 text-sm font-bold">📯</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Apito</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Referência</span>
                  <span className="font-semibold text-slate-800">{data.apitoRef || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Lote</span>
                  <span className="font-medium text-slate-700">{data.apitoLote || '—'}</span>
                </div>
              </div>
            </div>

            {/* View Mecanismo Insuflação */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 transition hover:shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-200 text-orange-700 text-sm font-bold">⚙️</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-orange-700">Mecanismo Insuflação</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Tipo</span>
                  <span className="font-semibold text-slate-800">{data.mecanismoInflacao ? MECANISMO_OPTIONS.find((o) => o.value === data.mecanismoInflacao)?.label || data.mecanismoInflacao : '—'}</span>
                </div>
                {MECANISMO_OPTIONS.find(o => o.value === data.mecanismoInflacao)?.temValidadePropria && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-500">Validade</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1.5">{data.mecanismoValidade || '—'}{(() => { const t = validityTone(data.mecanismoValidade); return t ? <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${t.cls}`}>{t.label}</span> : null; })()}</span>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de Artigos Substituídos */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
          <span>📦</span> Histórico de Artigos e Consumíveis Substituídos
        </h3>
        <div className="overflow-y-auto max-h-[250px] border border-slate-100 rounded-xl">
          {data.inspecoes?.flatMap((insp: any) => 
            insp.artigos?.map((art: any) => ({
              ...art,
              dataInspecao: insp.dataInspecao,
              certificadoNumero: insp.certificadoNumero
            }))
          )?.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="p-3 w-10">Foto</th>
                  <th className="p-3">Data Inspeção</th>
                  <th className="p-3">Certificado</th>
                  <th className="p-3">Artigo/Descrição</th>
                  <th className="p-3">Referência</th>
                  <th className="p-3">Lote</th>
                  <th className="p-3">Validade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.inspecoes.flatMap((insp: any) => 
                  insp.artigos?.map((art: any, idx: number) => (
                    <tr key={`${insp.id}-${idx}`} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        {art.stock?.foto ? (
                          <img src={art.stock.foto} alt={art.name || ''} className="h-10 w-10 rounded border border-slate-200 object-cover bg-white" />
                        ) : (
                          <div className="h-10 w-10 rounded border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">{insp.dataInspecao ? new Date(insp.dataInspecao).toLocaleDateString('pt-PT') : '—'}</td>
                      <td className="p-3 font-semibold text-indigo-600">{insp.certificadoNumero || '—'}</td>
                      <td className="p-3 font-medium text-slate-800">{art.name || art.descricao || '—'}</td>
                      <td className="p-3 text-slate-600">{art.referencia || '—'}</td>
                      <td className="p-3 text-slate-500">{art.lote || '—'}</td>
                      <td className="p-3 text-slate-500">{art.validade ? new Date(art.validade).toLocaleDateString('pt-PT') : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 italic text-center py-10 text-xs">Ainda sem histórico de substituição de artigos.</p>
          )}
        </div>
      </div>

      {/* Histórico de Alterações de Componentes (local) */}
      {componentHistory.length > 0 && (
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mt-4">
        <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">
          <span>📝</span> Histórico de Alterações de Componentes
        </h3>
        <div className="overflow-y-auto max-h-[200px] border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                <th className="p-3">Data/Hora</th>
                <th className="p-3">Campo Alterado</th>
                <th className="p-3">De</th>
                <th className="p-3">Para</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {componentHistory.flatMap((entry: any) => 
                Object.entries(entry.changes).map(([field, change], idx: number) => {
                  const ch = change as { from?: string; to?: string };
                  return (
                  <tr key={`${entry.id}-${idx}`} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString('pt-PT')}</td>
                    <td className="p-3 font-medium text-slate-800">{field.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</td>
                    <td className="p-3 text-slate-500">{ch.from}</td>
                    <td className="p-3 font-medium text-emerald-700">{ch.to}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
