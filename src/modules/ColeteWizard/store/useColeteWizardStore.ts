import { create } from 'zustand';

export type GlobalStockItem = {
  id: number;
  referencia: string;
  descricao: string;
  quantidade: number;
  categoria: string | null;
  validade: string | null;
  lote: string | null;
};

type ColeteWizardState = {
  coleteId: number | null;
  inspectionId: number | null;
  verificacaoId: number | null;
  shipId: number | null;
  globalStock: GlobalStockItem[];
  verificacoes: any[];
  isDirty: boolean;
  
  inspectionData: {
    // Info
    brand: string;
    model: string;
    serial: string;
    shipName: string;
    shipId: number | null;
    dataInspecao: string;
    dataProxInspecao: string;
    dataFabrico?: string; // Add optional dataFabrico
    marca?: string; // Added marca
    modelo?: string; // Added modelo
    tamanho?: string; // Added tamanho
    inspectorNome?: string; // Added inspectorNome
    checklist?: Record<string, string>; // Added checklist
    observacoesInspecao?: string; // Added observacoesInspecao
    
    // Checklist visual
    tecidoExterior: string;
    colagens: string;
    fitasReflectoras: string;
    sistemaInflacao: string;
    mecanismoInflacao: string;
    camaras: string;
    garrafaCO2: string;
    tuboInflador: string;
    zataosVelcro: string;

    // Configuração de componentes
    temLuz: boolean;

    // Componentes substituídos (ligação ao stock)
    componentes: {
      id: string; // Ex: 'cylinder', 'light', 'whistle', 'cartridge'
      name: string;
      reference: string;
      stockId: number | null;
      validade: string;
      lote: string;
      substituido?: boolean;
    }[];

    // Testes
    testePressao: string;
    testeInsuflacao: string;
    testeVazamento: string;
    
    observacoes: string;
  };

  setColeteId: (id: number | null) => void;
  setInspectionId: (id: number | null) => void;
  setGlobalStock: (stock: GlobalStockItem[]) => void;
  setVerificacoes: (verificacoes: any[]) => void;
  setInspectionData: (data: Partial<ColeteWizardState['inspectionData']>) => void;
  setIsDirty: (dirty: boolean) => void;
  reset: () => void;
};

const initialInspectionData = {
  brand: '',
  model: '',
  serial: '',
  shipName: '',
  shipId: null,
  dataInspecao: new Date().toISOString().slice(0, 10),
  dataProxInspecao: '',
  
  tecidoExterior: 'OK',
  colagens: 'OK',
  fitasReflectoras: 'OK',
  sistemaInflacao: 'OK',
  mecanismoInflacao: 'OK',
  camaras: 'OK',
  garrafaCO2: 'OK',
  tuboInflador: 'OK',
  zataosVelcro: 'OK',

  temLuz: false,

  componentes: [
    { id: 'cylinder', name: 'Cilindro CO2', reference: '', stockId: null, validade: '', lote: '', substituido: false },
    { id: 'cartridge', name: 'Pastilha de Sal (Bobbin)', reference: '', stockId: null, validade: '', lote: '', substituido: false },
    { id: 'light', name: 'Luz de Emergência', reference: '', stockId: null, validade: '', lote: '', substituido: false },
    { id: 'whistle', name: 'Apito', reference: '', stockId: null, validade: '', lote: '', substituido: false }
  ],

  testePressao: '',
  testeInsuflacao: '',
  testeVazamento: '',
  
  observacoes: '',
};

export const useColeteWizardStore = create<ColeteWizardState>((set) => ({
  coleteId: null,
  inspectionId: null,
  verificacaoId: null,
  shipId: null,
  globalStock: [],
  verificacoes: [],
  isDirty: false,
  inspectionData: { ...initialInspectionData },

  setColeteId: (id) => set({ coleteId: id }),
  setInspectionId: (id) => set({ inspectionId: id, verificacaoId: id }),
  setGlobalStock: (stock) => set({ globalStock: stock }),
  setVerificacoes: (vers) => set({ verificacoes: vers }),
  
  setInspectionData: (data) => set((state) => {
    const extra: any = {};
    if (data.shipId !== undefined) {
      extra.shipId = data.shipId;
    }
    return {
      inspectionData: { ...state.inspectionData, ...data },
      isDirty: true,
      ...extra
    };
  }),

  setIsDirty: (dirty) => set({ isDirty: dirty }),

  reset: () => set({ 
    coleteId: null, 
    inspectionId: null, 
    verificacaoId: null,
    shipId: null,
    globalStock: [],
    verificacoes: [],
    isDirty: false,
    inspectionData: { ...initialInspectionData } 
  }),
}));
