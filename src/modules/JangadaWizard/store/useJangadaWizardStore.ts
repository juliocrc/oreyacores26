import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getLocalDateKey } from '@/lib/date-utils';
import type { InspectionData, GlobalStockItem } from '../types';
import { getWizardSteps, getStepIndexByKey } from '../steps';
import { resolveArticleNextInspection } from '../articleExpiry';
import { serverFingerprints, serverChanges, type ServerBaseline, type ServerSection } from '../serverPersistence';

export type { GlobalStockItem } from '../types';

function currentWizardSteps(state: WizardState) {
  return getWizardSteps(state.inspectionData, { hideOrcamento: state.hideOrcamento });
}

// Linhas de orçamento guardadas na inspeção usam o formato do servidor
// (`precoUnitario`, por vezes sem `id`). Ao restaurar para o wizard, é preciso
// converter para o formato do store (`unitPrice`) e garantir um `id` único em
// cada linha — sem id, editar o preço de uma linha alterava todas as outras.
function normalizeOrcamentoLinhas(linhas: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(linhas)) return [];

  const seen = new Set<string>();
  return linhas.map((raw, index) => {
    const linha = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const referencia = String(linha.referencia ?? "");

    let id = String(linha.id ?? "").trim();
    if (!id) id = `linha-${referencia || "artigo"}-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);

    const quantidade = Number(linha.quantidade ?? 0) || 0;
    const unitPrice = Number(linha.unitPrice ?? linha.precoUnitario ?? 0) || 0;

    return {
      ...linha,
      id,
      referencia,
      descricao: String(linha.descricao ?? ""),
      quantidade,
      unitPrice,
      total: Math.round(quantidade * unitPrice * 100) / 100,
      source: linha.source ?? "manual",
    };
  });
}

type WizardState = {
  editVersions: { expectedUpdatedAt?: string | null; expectedRaftUpdatedAt?: string | null };
  // Navigation
  currentStep: number;
  setStep: (step: number) => void;
  setStepByKey: (key: string) => void;
  currentStepKey: () => string | null;
  nextStep: (force?: boolean) => boolean;
  prevStep: () => void;
  canProceed: () => boolean;
  validationErrors: string[];
  clearValidationErrors: () => void;
  hideOrcamento: boolean;
  setHideOrcamento: (value: boolean) => void;
  
  // Data Payload
  jangadaId: number | null;
  shipId: number | null;
  inspecaoId: number | null;
  inspecoes: any[];
  setJangadaId: (id: number | null) => void;
  setShipId: (id: number | null) => void;
  setInspecaoId: (id: number | null) => void;
  setInspecoes: (list: any[]) => void;
  
  inspectionData: InspectionData;
  automaticNextInspection: boolean;
  setInspectionData: (data: Partial<InspectionData>) => void;
  
  // Global Stock
  globalStock: GlobalStockItem[];
  setGlobalStock: (stock: GlobalStockItem[]) => void;
  
  // Initialize from Backend
  initializeWizard: (raftData: any, draftData?: any) => void;
  
  // Saving Status
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  
  // Auto-save
  lastSaved: Date | null;
  setLastSaved: (date: Date) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  serverBaseline: ServerBaseline;
  pendingServerChanges: Record<ServerSection, boolean>;
  hasServerChanges: boolean;
  markServerPersisted: (data: InspectionData, context: { jangadaId: number; inspecaoId: number; sections?: ServerSection[] }) => void;
};

export const useJangadaWizardStore = create<WizardState>()(
  devtools(
    (set, get) => ({
      editVersions: {},
      currentStep: 1,
      setStep: (step) => set({ currentStep: Math.max(1, Math.min(step, currentWizardSteps(get()).length)), validationErrors: [] }),
      setStepByKey: (key) => {
        const steps = currentWizardSteps(get());
        const idx = getStepIndexByKey(steps, key) ||
          (key === 'boletins' ? getStepIndexByKey(steps, 'checklist') :
            key === 'reparacoes' ? getStepIndexByKey(steps, 'contentor') || getStepIndexByKey(steps, 'resumo') : 0);
        if (idx > 0) set({ currentStep: idx, validationErrors: [] });
      },
      currentStepKey: () => {
        const state = get();
        const steps = currentWizardSteps(state);
        return steps[state.currentStep - 1]?.key ?? null;
      },
      nextStep: (force?: boolean): boolean => {
        const state = get();
        if (force || state.canProceed()) {
          const steps = currentWizardSteps(state);
          set({ currentStep: Math.min(state.currentStep + 1, steps.length), validationErrors: [] });
          return true;
        }
        return false;
      },
      prevStep: () => set((state) => {
        const steps = currentWizardSteps(state);
        return { currentStep: Math.max(state.currentStep - 1, 1), validationErrors: [] };
      }),
      
      canProceed: () => {
        const state = get();
        const data = state.inspectionData;
        const steps = currentWizardSteps(state);
        const stepKey = steps[state.currentStep - 1]?.key ?? '';
        const errors: string[] = [];

        if (stepKey === 'dados') {
          if (!data.serial?.trim()) errors.push("Série é obrigatória");
          if (!data.brand?.trim()) errors.push("Marca é obrigatória");
          if (!data.model?.trim()) errors.push("Modelo é obrigatório");
          if (!data.packType?.trim()) errors.push("Tipo de pack é obrigatório");
          if (!data.capacity) errors.push("Capacidade é obrigatória");
        }

        if (stepKey === 'testes') {
          if (data.testes?.testeWP === 'PASSOU') {
            if (!data.testes?.wpCamaraSupInicio) errors.push("Pressão Câmara Superior (Início) é obrigatória para teste WP");
            if (!data.testes?.wpCamaraSupFim) errors.push("Pressão Câmara Superior (Fim) é obrigatória para teste WP");
          }
        }

        if (stepKey === 'reparacoes') {
          const repairs = (data.reparacoes || []).filter((r: any) => r.tipo || r.descricao);
          if (repairs.length === 0) errors.push("Indique as reparações/colagens a realizar");
        }

        if (stepKey === 'orcamento') {
          const linhas = data.orcamento?.linhas || [];
          const aprovacao = data.orcamento?.aprovacaoWhatsApp;
          const submetido = aprovacao?.status === 'enviado' || aprovacao?.status === 'aprovado';
          if (linhas.length > 0 && aprovacao?.status === 'rejeitado') {
            errors.push("O orçamento foi rejeitado no módulo de Orçamentos — ajuste as linhas e reenvie para análise.");
          } else if (linhas.length > 0 && !submetido) {
            errors.push("Submeta o orçamento para análise (botão «Submeter para análise»). A aprovação e a fatura fazem-se no módulo de Orçamentos.");
          }
        }

        set({ validationErrors: errors });
        return errors.length === 0;
      },
      
      validationErrors: [],
      clearValidationErrors: () => set({ validationErrors: [] }),
      hideOrcamento: false,
      setHideOrcamento: (value) => set((state) => {
        const key = currentWizardSteps(state)[state.currentStep - 1]?.key || 'dados';
        const steps = getWizardSteps(state.inspectionData, { hideOrcamento: value });
        return { hideOrcamento: value, currentStep: getStepIndexByKey(steps, key) || 1 };
      }),
      
      jangadaId: null,
      shipId: null,
      inspecaoId: null,
      inspecoes: [],
      setJangadaId: (id) => set({ jangadaId: id }),
      setShipId: (id) => set({ shipId: id }),
      setInspecaoId: (id) => set({ inspecaoId: id }),
      setInspecoes: (list) => set({ inspecoes: list }),
      
      inspectionData: {} as InspectionData,
      automaticNextInspection: true,
      setInspectionData: (data) => set((state) => {
        const nextInspectionData = { ...state.inspectionData, ...data };
        if (data.dataProxInspecao === undefined && state.automaticNextInspection) {
          nextInspectionData.dataProxInspecao = resolveArticleNextInspection({ ...nextInspectionData, dataProxInspecao: '' });
        }
        const justActivatedAbate = !state.inspectionData.abate?.ativo && nextInspectionData.abate?.ativo;
        const oldSteps = currentWizardSteps(state);
        const newSteps = getWizardSteps(nextInspectionData, { hideOrcamento: state.hideOrcamento });
        const oldKey = oldSteps[state.currentStep - 1]?.key || 'dados';
        let nextStep = getStepIndexByKey(newSteps, oldKey);
        if (!nextStep) {
          // If a conditional step disappears, continue at the next surviving key.
          const following = oldSteps.slice(state.currentStep).find(s => getStepIndexByKey(newSteps, s.key));
          nextStep = following ? getStepIndexByKey(newSteps, following.key) : 1;
        }
        if (justActivatedAbate) {
          const newSteps = getWizardSteps(nextInspectionData, { hideOrcamento: state.hideOrcamento });
          const resumoIdx = newSteps.findIndex(s => s.key === 'resumo');
          if (resumoIdx !== -1) {
            nextStep = resumoIdx + 1;
          }
        }
        const pendingServerChanges = serverChanges(nextInspectionData, state.serverBaseline);
        return {
          inspectionData: nextInspectionData,
          pendingServerChanges,
          hasServerChanges: Object.values(pendingServerChanges).some(Boolean),
          automaticNextInspection: data.dataProxInspecao === undefined && state.automaticNextInspection,
          currentStep: nextStep,
          isDirty: true,
        };

      }),

      globalStock: [],
      setGlobalStock: (stock) => set({ globalStock: stock }),
      
      initializeWizard: (raftData, draftData) => {
        set({ editVersions: { expectedUpdatedAt: draftData?.id ? draftData.updatedAt ?? null : undefined, expectedRaftUpdatedAt: raftData?.updatedAt ?? null } });
        // Here we map backend Raft model fields into the inspectionData
        // We also map the draftData if an inspection is already in progress
        const initialData: any = {
          // Identificação
          brand: raftData?.brand || '',
          model: raftData?.model || '',
          serial: raftData?.serial || '',
          packType: raftData?.packType || '',
          capacity: raftData?.capacity || '',
           dataFabrico: raftData?.dataFabrico || draftData?.dataFabrico || '',
           dataInspecao: draftData?.dataInspecao || getLocalDateKey(),
           dataProxInspecao: resolveArticleNextInspection({
             brand: raftData?.brand, model: raftData?.model, shipDetails: raftData?.shipDetails,
             dataInspecao: draftData?.dataInspecao || getLocalDateKey(),
             dataProxInspecao: draftData?.dataProxInspecao,
           }),
          dataUltimoGi: (draftData?.checklistSnapshot as { _dataUltimoGi?: string } | null)?._dataUltimoGi || '',
          shipName: draftData?.navioNome || raftData?.shipNameManual || raftData?.shipDetails?.nome || '',
          
          owner: raftData?.shipDetails?.proprietario || raftData?.ownerDisplay || raftData?.owner || '',
          shipFlag: raftData?.shipDetails?.bandeira || '',
          shipImo: raftData?.shipDetails?.imo || '',
          shipCallSign: raftData?.shipDetails?.callSignal || '',
          launchType: raftData?.launchType || '',
          fabricType: raftData?.fabricType || '',
          painterLength: raftData?.painterLength || '',
          maxStowageHeight: raftData?.maxStowageHeight || '',
hruReference: draftData?.hruReference || raftData?.hruReferencia || '',
            hruSerial: draftData?.hruSerial || raftData?.hruSerial || '',
            hruStockId: draftData?.hruStockId || raftData?.hruStockId || null,
            hruExpiry: draftData?.hruExpiry || raftData?.hruValidade || '',
            hruDataInstalacao: draftData?.hruDataInstalacao || raftData?.hruDataInstalacao || '',
          hruTipo: raftData?.hruTipo || '',
          hruAplicavel: draftData?.hruAplicavel || raftData?.hruAplicavel || 'NAO',
          luzesInstaladas: draftData?.luzesInstaladas || 'SIM',
          bateriaInstalada: draftData?.bateriaInstalada || 'SIM',
          radarReflector: raftData?.radarReflector || '',
          radarReflectorExpiry: raftData?.radarReflectorValidade || '',
          certificadoNumero: draftData?.certificadoNumero || '',
          numeroObra: draftData?.numeroObra || '',
          responsavel: draftData?.responsavel || '',
          signatureBase64: draftData?.signatureBase64 || '',
          clienteAssinaturaBase64: draftData?.clienteAssinaturaBase64 || '',
          clienteNomeAssinatura: draftData?.clienteNomeAssinatura || '',
          certificadoExternoNumero: raftData?.certificadoExternoNumero || '',
          certificadoExternoUrl: raftData?.certificadoExternoUrl || '',
          artigos: raftData?.artigos || [],
          shipDetails: raftData?.shipDetails || null,

          // Cilindro Base
          cylinderCabecaDisparoRef: raftData?.cylinderCabecaDisparoRef || '',
          cylinderCabecaDisparoDescricao: raftData?.cylinderCabecaDisparoDescricao || '',
          cylinder: {
            sistema: raftData?.cylinderSistema || '',
            serial: raftData?.cylinderSerial || '',
            pesoBruto: raftData?.cylinderPesoBruto || '',
            tara: raftData?.cylinderTara || '',
            co2: raftData?.cylinderCo2 || '',
            n2: raftData?.cylinderN2 || '',
            dataTeste: raftData?.cylinderDataTeste || '',
            dataProxTeste: raftData?.cylinderDataProxTeste || '',
          },
          cylinders: (() => {
            const rawJson = (raftData as any)?.cylindersJson;
            if (typeof rawJson === "string" && rawJson.trim()) {
              try {
                const parsed = JSON.parse(rawJson);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
              } catch { /* ignora JSON inválido */ }
            }
            if (Array.isArray((raftData as any)?.cylinders) && (raftData as any).cylinders.length > 0) return (raftData as any).cylinders;
            if (raftData?.cylinderData && Array.isArray(raftData.cylinderData) && raftData.cylinderData.length > 0) return raftData.cylinderData;
            return raftData?.cylinder && (raftData.cylinder as any).serial ? [raftData.cylinder] : [];
          })(),
          testeCamaras: (() => {
            const rawJson = (raftData as any)?.testeCamarasJson;
            if (typeof rawJson === "string" && rawJson.trim()) {
              try { return JSON.parse(rawJson); } catch { /* ignora JSON inválido */ }
            }
            return (raftData as any)?.testeCamaras || undefined;
          })(),

          // Testes Base
          testes: {
            ...raftData,
            wpUnidadePressao: draftData?.testeWPUnidadePressao || raftData?.testeWPUnidadePressao || 'hpa',
            wpManometroId: raftData?.testeWPManometroId || '',
            wpBarometroId: raftData?.testeWPBarometroId || '',
            wpHoraInicio: raftData?.testeWPHoraInicio || '',
            wpHoraFim: raftData?.testeWPHoraFim || '',
            wpTempInicio: raftData?.testeWPTemperaturaInicial || '',
            wpTempFim: raftData?.testeWPTemperaturaFinal || '',
            wpPressaoAtmInicio: raftData?.testeWPPressaoAtmosfericaInicial || '',
            wpPressaoAtmFim: raftData?.testeWPPressaoAtmosfericaFinal || '',
            wpCamaraSupInicio: raftData?.testeWPCamaraSuperiorInicio || '',
            wpCamaraSupFim: raftData?.testeWPCamaraSuperiorFim || '',
            wpCamaraInfInicio: raftData?.testeWPCamaraInferiorInicio || '',
            wpCamaraInfFim: raftData?.testeWPCamaraInferiorFim || '',
            // NAP parameters
            napUnidadePressao: raftData?.testeNAPUnidadePressao || 'hpa',
            napManometroId: raftData?.testeNAPManometroId || '',
            napHoraInicio: raftData?.testeNAPHoraInicio || '',
            napHoraFim: raftData?.testeNAPHoraFim || '',
            napTempInicio: raftData?.testeNAPTemperaturaInicial || '',
            napTempFim: raftData?.testeNAPTemperaturaFinal || '',
            napPressaoAtmInicio: raftData?.testeNAPPressaoAtmosfericaInicial || '',
            napPressaoAtmFim: raftData?.testeNAPPressaoAtmosfericaFinal || '',
            napCamaraSupInicio: raftData?.testeNAPCamaraSuperiorInicio || '',
            napCamaraSupFim: raftData?.testeNAPCamaraSuperiorFim || '',
            napCamaraInfInicio: raftData?.testeNAPCamaraInferiorInicio || '',
            napCamaraInfFim: raftData?.testeNAPCamaraInferiorFim || '',
          },
          
          // Checklist
          checklist: draftData?.checklistSnapshot || {},
          
          // Pack Substituído — quando se abre a última vistoria registada (consulta/edição)
          // usamos apenas os artigos com validade que estão atualmente na jangada
          // (raftData.artigos), preenchidos pelo Step4. Os artigosSubstituidos da inspeção
          // antiga só restauram o pack num rascunho em curso (Draft).
          packItems: (String(draftData?.status || "").trim().toLowerCase() === 'draft')
            ? draftData?.artigosSubstituidos?.reduce((acc: any, item: any) => {
                if (item.referencia && (item.motivo || "") !== "Fecho do Contentor") {
                   acc[item.referencia] = item;
                }
                return acc;
              }, {}) || {}
            : draftData?.artigosSubstituidos?.reduce((acc: any, item: any) => {
                if (item.referencia && (item.motivo || "") !== "Fecho do Contentor") {
                  const match = (raftData?.artigos || []).find((a: any) =>
                    String(a.referencia || "").trim().toLowerCase() === String(item.referencia || "").trim().toLowerCase()
                  );
                  const matchValidade = match?.validade ? String(match.validade) : String(item.validade || "");
                  // Numa inspeção antiga registada, só contam como substituídos os artigos
                  // que estavam efetivamente preenchidos na base de dados antiga (com validade).
                  // Os restantes consideram-se verificados (presentes na ficha da jangada).
                  const preenchido = Number(item.quantidade) > 0 && Boolean(matchValidade);
                  acc[item.referencia] = {
                    ...item,
                    quantidade: preenchido ? Number(item.quantidade) : 0,
                    quantidadeVerificada: match ? Number(match.quantidade) || 0 : 0,
                    validade: matchValidade,
                    validadeOriginal: matchValidade,
                  };
                }
                return acc;
              }, {}) || {},

          // Equipamento de fecho do contentor (cintas, autocolantes, HRU) restaurado do rascunho
          containerClosureItems: (draftData?.artigosSubstituidos || [])
            .filter((item: any) => (item.motivo || "") === "Fecho do Contentor")
            .map((item: any, idx: number) => ({
              key: `closure-${item.referencia || item.descricao}-${idx}`,
              kind: (item.kind || "autocolante") as "cinta" | "autocolante" | "hru",
              referencia: item.referencia || "",
              descricao: item.descricao || "Equipamento de fecho do contentor",
              quantidade: Number(item.quantidade) || 1,
              unitPrice: Number(item.precoUnitario || item.unitPrice) || 0,
              stockId: item.stockId ?? null,
              partNumber: item.codigoFabricante || undefined,
            })),

          // Orçamento (restaurado a partir do rascunho guardado)
          orcamento: draftData?.orcamento
            ? {
                ...draftData.orcamento,
                linhas: normalizeOrcamentoLinhas(draftData.orcamento.linhas),
              }
            : undefined,

          // Boletins de serviço aplicáveis (marca/modelo) e estado de aplicação
          applicableServiceBulletins: raftData?.applicableServiceBulletins,
          serviceBulletinsApplied: raftData?.serviceBulletinsApplied || {},
          reparacoes: draftData?.reparacoes ?? raftData?.reparacoes,
          repairRequested: draftData?.repairRequested ?? raftData?.repairRequested,

          // Abate da jangada (ficha IM.049/00)
          abate: raftData?.abate || { ativo: false, tipoBarco: "", motivo: "", detalhes: "" },
        };
        
        const inspectionData = { ...initialData, ...(draftData?.checklistSnapshot?._articleExpiry || {}) };
        const serverBaseline: ServerBaseline = serverFingerprints(inspectionData);
        if (!draftData?.id) serverBaseline.data = null;
        const pendingServerChanges = serverChanges(inspectionData, serverBaseline);
        set({
          currentStep: 1,
          validationErrors: [],
          jangadaId: raftData?.id || null,
          shipId: draftData?.navioId || raftData?.shipId || null,
          inspecaoId: draftData?.id || null,
          inspecoes: raftData?.inspecoes || [],
          automaticNextInspection: !draftData?.dataProxInspecao,
          inspectionData,
          serverBaseline,
          pendingServerChanges,
          hasServerChanges: Object.values(pendingServerChanges).some(Boolean),
          isDirty: false,
          lastSaved: null,
          isSaving: false,
        });
      },
      
      isSaving: false,
      setIsSaving: (isSaving) => set({ isSaving }),
      
      lastSaved: null,
      setLastSaved: (date) => set({ lastSaved: date, isDirty: false }),
      isDirty: false,
      setIsDirty: (dirty) => set({ isDirty: dirty }),
      serverBaseline: { data: null, review: null, signatures: null },
      pendingServerChanges: { data: false, review: false, signatures: false },
      hasServerChanges: false,
      markServerPersisted: (data, context) => set(state => {
        if (state.jangadaId !== context.jangadaId || state.inspecaoId !== context.inspecaoId) return {};
        const saved = serverFingerprints(data);
        const serverBaseline = { ...state.serverBaseline };
        for (const key of context.sections || ['data', 'review', 'signatures'] as ServerSection[]) serverBaseline[key] = saved[key];
        const pendingServerChanges = serverChanges(state.inspectionData, serverBaseline);
        const hasServerChanges = Object.values(pendingServerChanges).some(Boolean);
        return { serverBaseline, pendingServerChanges, hasServerChanges, isDirty: state.isDirty && hasServerChanges };
      }),
    }),
    { name: 'JangadaWizardStore' }
  )
);
