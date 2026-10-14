import fs from "node:fs";
import path from "node:path";

/**
 * Carimbo oficial aplicado na área de assinatura do certificado, como data URL.
 *
 * Resolução por estação de serviço: procura primeiro
 * `public/carimbos/<CODIGO_ESTACAO>.(jpg|jpeg|png|webp)` e, se não existir,
 * recorre ao carimbo OREY Açores por omissão (`public/carimbooreyazores.jpg`).
 *
 * Carregado apenas em runtime Node (server). Em contexto de browser devolve null.
 */
const cache = new Map<string, string | null>();

function normalizeToken(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readAsDataUrl(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    return null;
  }
}

export function getStampDataUrl(stationCode?: string | null): string | null {
  if (typeof window !== "undefined") return null;

  const token = normalizeToken(stationCode);
  const cacheKey = token || "__default__";
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  let result: string | null = null;
  if (token) {
    const stationDir = path.join(process.cwd(), "public", "carimbos");
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const data = readAsDataUrl(path.join(stationDir, `${token}.${ext}`));
      if (data) {
        result = data;
        break;
      }
    }
  }

  if (!result) {
    result = readAsDataUrl(path.join(process.cwd(), "public", "carimbooreyazores.jpg"));
  }

  cache.set(cacheKey, result);
  return result;
}
