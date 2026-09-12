interface ArtigoInspecao {
  id: number;
  name: string;
  quantidade: number;
  referencia: string | null;
  validade: string | null;
  codigoFabricante: string | null;
}

interface Inspecao {
  id: number;
  jangadaId?: number;
  certificadoNumero: string | null;
  dataInspecao: string;
  dataProxInspecao: string | null;
  status: string;
  responsavel?: string | null;
  numeroObra?: string | null;
  testeWP?: string | null;
  artigos?: ArtigoInspecao[];
  checklistSnapshot?: Record<string, { status?: string; notes?: string; fotos?: string[] }>;
}

interface InspecaoDetalhesDialogProps {
  inspecao: Inspecao;
  onClose: () => void;
}

export type { ArtigoInspecao, Inspecao, InspecaoDetalhesDialogProps };
