import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

export type XlsRaftModelSpec = {
  marca: string;
  modelo: string;
  fabricante?: string;
  pais?: string;
  certificacoes: string[];
  tipos: string[];
  capacidades: number[];
  pack?: string;
  formato?: string;
  dimensoesJangada?: { comp?: string; largura?: string; altura?: string };
  dimensoesContentor?: { comp?: string; largura?: string; altura?: string };
  peso?: string;
};

let cachedSpecs: Map<string, XlsRaftModelSpec> | null = null;

function clean(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeKey(v: unknown): string {
  return clean(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function loadXlsRaftCatalog(): Map<string, XlsRaftModelSpec> {
  if (cachedSpecs) return cachedSpecs;

  const specsMap = new Map<string, XlsRaftModelSpec>();
  const xlsPath = fs.existsSync('E:/Marcas de jangadas.xls')
    ? 'E:/Marcas de jangadas.xls'
    : path.join(process.cwd(), 'Marcas de jangadas.xls');
  if (!fs.existsSync(xlsPath)) return specsMap;

  try {
    const workbook = XLSX.readFile(xlsPath, { raw: false });
    const sheet = workbook.Sheets['Sheet3'] || workbook.Sheets['Sheet1'];
    if (!sheet) return specsMap;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
    if (rows.length < 3) return specsMap;

    // Row 1 contains subheader labels
    const subheaders = (rows[1] || []).map((c) => clean(c));
    // Find where sizes start (column with header '4')
    const sizeStartIndex = subheaders.findIndex((h) => h === '4');

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] || [];
      const marca = clean(r[0]);
      const modelo = clean(r[2]);
      if (!marca || !modelo) continue;

      const fabricante = clean(r[3]);
      const pais = clean(r[1]);

      // Certifications columns (indices 5 to 20 approx)
      const certLabels = ['Solas', 'HSC', 'ISO9650-1', 'ISO9650-2', 'MCA UK', 'USCG'];
      const certificacoes: string[] = [];
      for (let cIdx = 5; cIdx <= 10; cIdx++) {
        if (clean(r[cIdx]) !== '') {
          certificacoes.push(subheaders[cIdx] || `Cert_${cIdx}`);
        }
      }

      // Tipo columns (indices 11 to 20)
      const tipos: string[] = [];
      for (let tIdx = 11; tIdx <= 20; tIdx++) {
        if (clean(r[tIdx]) !== '') {
          tipos.push(subheaders[tIdx] || `Tipo_${tIdx}`);
        }
      }

      // Extra columns for Sheet3 (indices 21 to 30)
      const pack = clean(r[21]) || undefined;
      const formato = clean(r[23]) || undefined;
      const compJangada = clean(r[24]) || undefined;
      const larguraJangada = clean(r[25]) || undefined;
      const alturaJangada = clean(r[26]) || undefined;
      const compContentor = clean(r[27]) || undefined;
      const larguraContentor = clean(r[28]) || undefined;
      const alturaContentor = clean(r[29]) || undefined;
      const peso = clean(r[30]) || undefined;

      // Capacities from sizeStartIndex onwards
      const capacidades: number[] = [];
      if (sizeStartIndex > 0) {
        for (let sIdx = sizeStartIndex; sIdx < r.length; sIdx++) {
          const val = clean(r[sIdx]);
          if (val !== '') {
            const capNum = parseInt(subheaders[sIdx], 10);
            if (!isNaN(capNum)) {
              capacidades.push(capNum);
            }
          }
        }
      }

      const key = `${normalizeKey(marca)}::${normalizeKey(modelo)}`;
      specsMap.set(key, {
        marca,
        modelo,
        fabricante: fabricante || marca,
        pais,
        certificacoes,
        tipos,
        capacidades,
        pack,
        formato,
        dimensoesJangada: { comp: compJangada, largura: larguraJangada, altura: alturaJangada },
        dimensoesContentor: { comp: compContentor, largura: larguraContentor, altura: alturaContentor },
        peso,
      });
    }
  } catch (error) {
    console.error('Erro ao ler catalogo Excel de jangadas:', error);
  }

  cachedSpecs = specsMap;
  return specsMap;
}

export function getXlsRaftSpec(marca: string, modelo: string): XlsRaftModelSpec | undefined {
  const map = loadXlsRaftCatalog();
  const key = `${normalizeKey(marca)}::${normalizeKey(modelo)}`;
  return map.get(key);
}
