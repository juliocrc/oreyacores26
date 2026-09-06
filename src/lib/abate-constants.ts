/**
 * Constantes da "Ficha de Abate de Jangadas Salva-Vidas" (IM.049/00).
 * Os códigos 1-12 são os tipos de barco; os códigos 13-27 são os motivos de abate.
 */

export type AbateTipoBarco = { codigo: number; label: string };
export type AbateMotivo = { codigo: number; label: string };

export const ABATE_TIPOS_BARCO: AbateTipoBarco[] = [
  { codigo: 1, label: "Barco de Passageiros (> 4 metros)" },
  { codigo: 2, label: "Barco de Passageiros (< 4 metros)" },
  { codigo: 3, label: "Navio de Cruzeiro de Passageiros (Oceano/Internacional)" },
  { codigo: 4, label: "Barco de Passageiros de alta velocidade" },
  { codigo: 5, label: "Cargueiro de Grande Capacidade" },
  { codigo: 6, label: "Cargueiro de Média Capacidade" },
  { codigo: 7, label: "Petroleiro" },
  { codigo: 8, label: "Navio Auxiliar" },
  { codigo: 9, label: "Barco de Pesca" },
  { codigo: 10, label: "Barco de Recreio / Yacht" },
  { codigo: 11, label: "Jangada de Treino a bordo (indicar o tipo de barco)" },
  { codigo: 12, label: "Jangada de Treino mantida e inspeccionada em terra" },
];

export const ABATE_MOTIVOS: AbateMotivo[] = [
  { codigo: 13, label: "Oxidação do Cobre - se reparação não for economicamente vantajosa" },
  { codigo: 14, label: "Fugas de Ar - se reparação não for economicamente vantajosa" },
  { codigo: 15, label: "Desgaste" },
  { codigo: 16, label: "Abate depois de acidente do barco" },
  { codigo: 17, label: "Abate a pedido do cliente (descrever motivo no campo 28)" },
  { codigo: 18, label: "Estragos feitos durante demonstração" },
  { codigo: 19, label: "Estragos feitos por calor forte (ex: incêndio a bordo)" },
  { codigo: 20, label: "Vandalismo" },
  { codigo: 21, label: "Estragos feitos por água (dentro do saco ou contentor)" },
  { codigo: 22, label: "Estragos feitos por bolor" },
  { codigo: 23, label: "Teste NAP negativo" },
  { codigo: 24, label: "Teste FS negativo" },
  { codigo: 25, label: "Abertura das costuras, coladas ou cosidas" },
  { codigo: 26, label: "Outras causas (descrever motivo no campo 28)" },
  { codigo: 27, label: "A jangada não estava devidamente acondicionada quando recebida na ES" },
];

export function getAbateTipoBarcoLabel(tipoBarco?: string | null): string {
  if (!tipoBarco) return "";
  const byLabel = ABATE_TIPOS_BARCO.find((t) => t.label === tipoBarco);
  if (byLabel) return byLabel.label;
  const byCodigo = ABATE_TIPOS_BARCO.find((t) => String(t.codigo) === String(tipoBarco).trim());
  return byCodigo ? byCodigo.label : String(tipoBarco).trim();
}

export function getAbateMotivoLabel(motivo?: string | null): string {
  if (!motivo) return "";
  const numeric = Number(String(motivo).trim());
  const found = ABATE_MOTIVOS.find((m) => m.codigo === numeric);
  if (found) return found.label;
  return String(motivo).trim();
}