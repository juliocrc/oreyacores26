import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getLocalDateKey } from '@/lib/date-utils';
import type { InspectionData, GlobalStockItem } from '../types';
import { getWizardSteps, getStepIndexByKey } from '../steps';

export type { GlobalStockItem } from '../types';

type WizardState = {
  // Navigation
  currentStep: number;
  setStep: (step: number) => void;
  setStepByKey: (key: string) => void;
  currentStepKey: () => string | null;
  nextStep: () => void;
  prevStep: () => void;
  canProceed: () => boolean;
  validationErrors: string[];
  clearValidationErrors: () => void;
  
  // Data Payload
  jangadaId: number | null;
  shipId: number | null;
  inspecaoId: number | null;
  inspecoes: any[];
  setJangadaId: (id: number | null) => void;
  setShipId: (id: number | null) => void;
  setInspecaoId: (id: number | null) => void;
  
  inspectionData: InspectionData;
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
};

export const useJangadaWizardStore = create<WizardState>()(
  devtools(
    (set, get) => ({
      currentStep: 1,
      setStep: (step) => set({ currentStep: step, validationErrors: [] }),
      setStepByKey: (key) => {
        const steps = getWizardSteps(get().inspectionData);
        const idx = getStepIndexByKey(steps, key);
        if (idx > 0) set({ currentStep: idx, validationErrors: [] });
      },
      currentStepKey: () => {
        const state = get();
        const steps = getWizardSteps(state.inspectionData);
        return steps[state.currentStep - 1]?.key ?? null;
      },
      nextStep: () => {
        const state = get();
        if (state.canProceed()) {
          const steps = getWizardSteps(state.inspectionData);
          set({ currentStep: Math.min(state.currentStep + 1, steps.length), validationErrors: [] });
        }
      },
      prevStep: () => set((state) => {
        const steps = getWizardSteps(state.inspectionData);
        return { currentStep: Math.max(state.currentStep - 1, 1), validationErrors: [] };
      }),
      
      canProceed: () => {
        const state = get();
        const data = state.inspectionData;
        const steps = getWizardSteps(data);
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
          if (linhas.length > 0 && aprovacao?.status !== 'aprovado') {
            errors.push("O orçamento ainda não foi aprovado pelo cliente — envie via WhatsApp e registe a resposta.");
          }
        }

        set({ validationErrors: errors });
        return errors.length === 0;
      },
      
      validationErrors: [],
      clearValidationErrors: () => set({ validationErrors: [] }),
      
      jangadaId: null,
      shipId: null,
      inspecaoId: null,
      inspecoes: [],
      setJangadaId: (id) => set({ jangadaId: id }),
      setShipId: (id) => set({ shipId: id }),
      setInspecaoId: (id) => set({ inspecaoId: id }),
      
      inspectionData: {} as InspectionData,
      setInspectionData: (data) => set((state) => ({ 
        inspectionData: { ...state.inspectionData, ...data },
        isDirty: true,
      })),

      globalStock: [],
      setGlobalStock: (stock) => set({ globalStock: stock }),
      
      initializeWizard: (raftData, draftData) => {
        // Here we map backend Raft model fields into the inspectionData
        // We also map the draftData if an inspection is already in progress
        const initialData: any = {
          // Identificação
          brand: raftData?.brand || '',
          model: raftData?.model || '',
          serial: raftData?.serial || '',
          packType: raftData?.packType || '',
          capacity: raftData?.capacity || '',
          dataFabrico: raftData?.dataFabrico || '',
          dataInspecao: draftData?.dataInspecao || raftData?.dataInspecao || getLocalDateKey(),
          dataProxInspecao: draftData?.dataProxInspecao || raftData?.dataProxInspecao || '',
          shipName: draftData?.navioNome || raftData?.shipNameManual || raftData?.shipDetails?.nome || '',
          
          owner: raftData?.shipDetails?.proprietario || raftData?.ownerDisplay || raftData?.owner || '',
          shipFlag: raftData?.shipDetails?.bandeira || '',
          shipImo: raftData?.shipDetails?.imo || '',
          shipCallSign: raftData?.shipDetails?.callSignal || '',
          launchType: raftData?.launchType || '',
          fabricType: raftData?.fabricType || '',
          painterLength: raftData?.painterLength || '',
          maxStowageHeight: raftData?.maxStowageHeight || '',
          hruReference: raftData?.hruReferencia || '',
          hruExpiry: raftData?.hruValidade || '',
          radarReflector: raftData?.radarReflector || '',
          radarReflectorExpiry: raftData?.radarReflectorValidade || '',
          certificadoNumero: raftData?.ultimoCertificadoNumero || '',
          certificadoExternoNumero: raftData?.certificadoExternoNumero || '',
          certificadoExternoUrl: raftData?.certificadoExternoUrl || '',
          artigos: raftData?.artigos || [],
          shipDetails: raftData?.shipDetails || null,

          // Cilindro Base
          cylinder: {
            serial: raftData?.cylinderSerial || '',
            pesoBruto: raftData?.cylinderPesoBruto || '',
            tara: raftData?.cylinderTara || '',
            co2: raftData?.cylinderCo2 || '',
            n2: raftData?.cylinderN2 || '',
            dataTeste: raftData?.cylinderDataTeste || '',
            dataProxTeste: raftData?.cylinderDataProxTeste || '',
          },

          // Testes Base
          testes: {
            ...raftData,
            wpUnidadePressao: raftData?.testeWPUnidadePressao || 'hpa',
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
          
          // Pack Substituído
          packItems: draftData?.artigosSubstituidos?.reduce((acc: any, item: any) => {
            if (item.referencia && (item.motivo || "") !== "Fecho do Contentor") {
               acc[item.referencia] = item;
            }
            return acc;
          }, {}) || {},

          // Equipamento de fecho do contentor (cintas, autocolantes, HRU) restaurado do rascunho
          containerClosureItems: (draftData?.artigosSubstituidos || [])
            .filter((item: any) => (item.motivo || "") === "Fecho do Contentor")
            .map((item: any) => ({
              key: `closure-${item.referencia || item.descricao}`,
              kind: (item.kind || "autocolante") as "cinta" | "autocolante" | "hru",
              referencia: item.referencia || "",
              descricao: item.descricao || "Equipamento de fecho do contentor",
              quantidade: Number(item.quantidade) || 1,
              unitPrice: Number(item.precoUnitario || item.unitPrice) || 0,
              stockId: item.stockId ?? null,
              partNumber: item.codigoFabricante || undefined,
            })),

          // Orçamento (restaurado a partir do rascunho guardado)
          orcamento: draftData?.orcamento || undefined,
        };
        
        set({
          jangadaId: raftData?.id || null,
          shipId: draftData?.navioId || raftData?.shipId || null,
          inspecaoId: draftData?.id || null,
          inspecoes: raftData?.inspecoes || [],
          inspectionData: { ...initialData }
        });
      },
      
      isSaving: false,
      setIsSaving: (isSaving) => set({ isSaving }),
      
      lastSaved: null,
      setLastSaved: (date) => set({ lastSaved: date, isDirty: false }),
      isDirty: false,
      setIsDirty: (dirty) => set({ isDirty: dirty }),
    }),
    { name: 'JangadaWizardStore' }
  )
);
