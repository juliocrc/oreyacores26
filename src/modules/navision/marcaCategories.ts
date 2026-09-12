import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

export type MarcaEquipamentoCategorias = {
  marca: string;
  pais?: string;
  jangada?: boolean;
  mes?: boolean;
  boias?: boolean;
  colete?: boolean;
  fatoImersao?: boolean;
  epirb?: boolean;
  rescueBoat?: boolean;
  turco?: boolean;
  redeResgate?: boolean;
  ffe?: boolean;
  baEebd?: boolean;
  jangadaAv?: boolean;
  coleteAv?: boolean;
};

let cachedCategories: Map<string, MarcaEquipamentoCategorias> | null = null;

function clean(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeKey(v: unknown): string {
  return clean(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function hasValue(v: unknown): boolean {
  const s = clean(v);
  return s !== '' && s !== '0' && s.toLowerCase() !== 'false';
}

export function loadMarcaCategories(): Map<string, MarcaEquipamentoCategorias> {
  if (cachedCategories) return cachedCategories;

  const map = new Map<string, MarcaEquipamentoCategorias>();
  const xlsPath = fs.existsSync('E:/Marcas de jangadas.xls')
    ? 'E:/Marcas de jangadas.xls'
    : path.join(process.cwd(), 'Marcas de jangadas.xls');
  if (!fs.existsSync(xlsPath)) return map;

  try {
    const workbook = XLSX.readFile(xlsPath, { raw: false });
    const sheet = workbook.Sheets['MArcas Navision'];
    if (!sheet) return map;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
    // Row 0 is header: Modelos | Jangada | MES | Boias/JB/DB | Colete | Fato Imersão | Epirb | Rescue Boat | Turco | Rede Resgate | FFE | BA-EEBD | Jangada Av | Colete Av
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const marca = clean(r[0]);
      if (!marca) continue;
      const pais = clean(r[1]) || undefined;

      const item: MarcaEquipamentoCategorias = {
        marca,
        pais,
        jangada: hasValue(r[3]),
        mes: hasValue(r[4]),
        boias: hasValue(r[5]),
        colete: hasValue(r[6]),
        fatoImersao: hasValue(r[7]),
        epirb: hasValue(r[8]),
        rescueBoat: hasValue(r[9]),
        turco: hasValue(r[10]),
        redeResgate: hasValue(r[11]),
        ffe: hasValue(r[12]),
        baEebd: hasValue(r[13]),
        jangadaAv: hasValue(r[14]),
        coleteAv: hasValue(r[15]),
      };

      map.set(normalizeKey(marca), item);
    }
  } catch (error) {
    console.error('Erro ao ler MArcas Navision:', error);
  }

  cachedCategories = map;
  return map;
}

export function getMarcaCategories(marca: string): MarcaEquipamentoCategorias | undefined {
  const map = loadMarcaCategories();
  return map.get(normalizeKey(marca));
}
