export type FileInfo = {
  name: string;
  relativePath?: string;
  size: number;
  modified: string;
};

export type FolderType = 'manuais' | 'documentacao' | 'legislacao' | 'boletins';

export type FolderData = {
  files: FileInfo[];
  loading: boolean;
};

export type ManualCategory = {
  equipamento: "Jangadas" | "Coletes" | "Outros";
  marca: string;
  modelo: string;
};

export type JangadaBrandCount = {
  marca: string;
  total: number;
};

export type JangadaBrandModelCount = {
  marca: string;
  modelo: string;
  total: number;
};

export type TechnicalItem = {
  name: string;
  category?: string;
  quantity?: string;
  reference?: string;
  notes?: string;
  optional?: boolean;
};

export const FIXED_BRAND_ORDER = ["RFD", "DSB", "EUROVINIL", "SURVITEC", "ZODIAC", "SEA-SAFE", "LALIZAS", "VIKING", "PLASTIMO", "ARIMAR", "SEAGO", "OCEAN SAFETY", "DUARRY"];
export const MANUAIS_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const EXTERNAL_ONLY_FOLDERS: FolderType[] = ['manuais', 'boletins'];
export const INTERNAL_MANAGED_FOLDERS: Exclude<FolderType, 'manuais' | 'boletins'>[] = ['documentacao', 'legislacao'];
