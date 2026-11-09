import { create } from "zustand";
import { defaultChecklist, type ChecklistResult } from "@/lib/fatos-imersao-checklist";

export type GlobalStockItem = {
  id: number;
  referencia: string;
  descricao: string;
  quantidade: number;
  categoria: string | null;
  validade: string | null;
  lote: string | null;
};

export type FatoComponent = {
  id: string;
  name: string;
  reference: string;
  stockId: number | null;
  validade: string;
  lote: string;
  substituido?: boolean;
};

type InspectionData = {
  brand: string;
  model: string;
  designNo: string;
  serial: string;
  shipName: string;
  shipId: number | null;
  tamanho: string;
  material: string;
  dataFabrico: string;
  dataInspecao: string;
  dataProxInspecao: string;
  usoRegular: boolean;
  intervaloServicoMeses: number | null;
  inspectorNome: string;
  manualReferencia: string;
  manualRevisao: string;
  equipamentoEnsaio: string;
  reparacoes: string;
  checklist: Record<string, ChecklistResult | string>;
  componentes: FatoComponent[];
  leakMetodo: string;
  leakPressaoInicial: string;
  leakPressaoFinal: string;
  leakDeltaP: string;
  leakUnidade: string;
  leakDuracaoMin: string;
  leakResultado: string;
  leakReTest: string;
  zonasFuga: string[];
  codigoBER: string;
  motivoBER: string;
  observacoes: string;
};

type State = {
  fatoId: number | null;
  isDirty: boolean;
  globalStock: GlobalStockItem[];
  inspectionData: InspectionData;
  setFatoId: (id: number | null) => void;
  setGlobalStock: (stock: GlobalStockItem[]) => void;
  setInspectionData: (data: Partial<InspectionData>) => void;
  setChecklistItem: (key: string, value: string) => void;
  toggleZonaFuga: (key: string) => void;
  setIsDirty: (v: boolean) => void;
  reset: () => void;
};

const initialData = (): InspectionData => ({
  brand: "",
  model: "",
  designNo: "",
  serial: "",
  shipName: "",
  shipId: null,
  tamanho: "",
  material: "",
  dataFabrico: "",
  dataInspecao: new Date().toISOString().slice(0, 10),
  dataProxInspecao: "",
  usoRegular: false,
  intervaloServicoMeses: null,
  inspectorNome: "",
  manualReferencia: "",
  manualRevisao: "",
  equipamentoEnsaio: "",
  reparacoes: "",
  checklist: defaultChecklist(),
  componentes: [
    { id: "light", name: "Luz de emergência", reference: "", stockId: null, validade: "", lote: "", substituido: false },
    { id: "whistle", name: "Apito", reference: "", stockId: null, validade: "", lote: "", substituido: false },
    { id: "buddy", name: "Buddy line", reference: "", stockId: null, validade: "", lote: "", substituido: false },
    { id: "gloves", name: "Luvas", reference: "", stockId: null, validade: "", lote: "", substituido: false },
    { id: "tape", name: "Fita retro-refletora", reference: "", stockId: null, validade: "", lote: "", substituido: false },
    { id: "beeswax", name: "Beeswax / grease zip", reference: "", stockId: null, validade: "", lote: "", substituido: false },
  ],
  leakMetodo: "",
  leakPressaoInicial: "",
  leakPressaoFinal: "",
  leakDeltaP: "",
  leakUnidade: "kPa",
  leakDuracaoMin: "",
  leakResultado: "",
  leakReTest: "N/A",
  zonasFuga: [],
  codigoBER: "",
  motivoBER: "",
  observacoes: "",
});

export const useFatoImersaoWizardStore = create<State>((set) => ({
  fatoId: null,
  isDirty: false,
  globalStock: [],
  inspectionData: initialData(),

  setFatoId: (id) => set({ fatoId: id }),
  setGlobalStock: (stock) => set({ globalStock: stock }),
  setInspectionData: (data) =>
    set((s) => ({
      inspectionData: { ...s.inspectionData, ...data },
      isDirty: true,
    })),
  setChecklistItem: (key, value) =>
    set((s) => ({
      inspectionData: {
        ...s.inspectionData,
        checklist: { ...s.inspectionData.checklist, [key]: value },
      },
      isDirty: true,
    })),
  toggleZonaFuga: (key) =>
    set((s) => {
      const setZ = new Set(s.inspectionData.zonasFuga);
      if (setZ.has(key)) setZ.delete(key);
      else setZ.add(key);
      return {
        inspectionData: { ...s.inspectionData, zonasFuga: Array.from(setZ) },
        isDirty: true,
      };
    }),
  setIsDirty: (v) => set({ isDirty: v }),
  reset: () =>
    set({
      fatoId: null,
      isDirty: false,
      globalStock: [],
      inspectionData: initialData(),
    }),
}));
