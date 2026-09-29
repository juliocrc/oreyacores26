/**
 * Utilitário de Extração de Dados de Placas de Identificação de Jangadas (OCR Parsing)
 */

export interface ExtractedRaftData {
  serial?: string;
  brand?: string;
  model?: string;
  capacity?: number;
  dataFabrico?: string;
  rawText?: string;
}

const KNOWN_BRANDS = ["ZODIAC", "SEASAVA", "VIKING", "SURvitec", "SEAGO", "PLASTIMO", "AVON", "RFD", "DSB"];

export function extractRaftDataFromOCR(rawText: string): ExtractedRaftData {
  if (!rawText) return {};

  const result: ExtractedRaftData = { rawText };
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  // 1. Detetar marca conhecida
  for (const line of lines) {
    const upper = line.toUpperCase();
    const found = KNOWN_BRANDS.find((b) => upper.includes(b));
    if (found) {
      result.brand = found;
      break;
    }
  }

  // 2. Extrair capacidade (ex: "PERSONS: 6", "6 PERSONS", "CAPACITY 12")
  const capRegex = /(?:persons?|cap(?:acity)?|pax)[\s:]*([0-9]{1,2})/i;
  for (const line of lines) {
    const match = line.match(capRegex);
    if (match && match[1]) {
      const val = parseInt(match[1], 10);
      if (val > 0 && val <= 150) {
        result.capacity = val;
        break;
      }
    }
  }

  // 3. Extrair data de fabrico (ex: "05/2021", "2021-05", "MFG: 2021")
  const dateRegex = /(?:mfg|fabrico|date)[\s:]*([0-9]{2}[\/\-][0-9]{4}|[0-9]{4}[\/\-][0-9]{2})/i;
  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match && match[1]) {
      result.dataFabrico = match[1].replace("/", "-");
      break;
    }
  }

  // 4. Extrair número de série (ex: "S/N: 12345", "SERIAL: ABC-123")
  const serialRegex = /(?:s\/n|serial|no|nr)[\s:]*([A-Za-z0-9\-\/]{4,25})/i;
  for (const line of lines) {
    const match = line.match(serialRegex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length >= 4 && !candidate.toLowerCase().includes("persons")) {
        result.serial = candidate;
        break;
      }
    }
  }

  return result;
}
