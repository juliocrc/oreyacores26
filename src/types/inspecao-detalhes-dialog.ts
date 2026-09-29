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
  navioNome?: string | null;
  testeWP?: string | null;
  testeNAP?: string | null;
  testeFS?: string | null;
  testeGI?: string | null;
  testeDL?: string | null;
  testeWPUnidadePressao?: string | null;
  testeWPHoraInicio?: string | null;
  testeWPHoraFim?: string | null;
  testeWPTemperaturaInicial?: string | null;
  testeWPTemperaturaFinal?: string | null;
  testeWPPressaoAtmosfericaInicial?: string | null;
  testeWPPressaoAtmosfericaFinal?: string | null;
  testeWPCamaraSuperiorInicio?: string | null;
  testeWPCamaraSuperiorFim?: string | null;
  testeWPCamaraInferiorInicio?: string | null;
  testeWPCamaraInferiorFim?: string | null;
  artigos?: ArtigoInspecao[];
  checklistSnapshot?: Record<string, { status?: string; notes?: string; fotos?: string[] }>;
}

interface InspecaoDetalhesDialogProps {
  inspecao: Inspecao;
  onClose: () => void;
}

export type { ArtigoInspecao, Inspecao, InspecaoDetalhesDialogProps };
