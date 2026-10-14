import fs from "node:fs";
import path from "node:path";

/**
 * Carimbo oficial OREY Açores (public/carimbooreyazores.jpg) como data URL.
 * Carregado apenas em runtime Node (server). Em contexto de browser devolve null.
 */
let cachedStamp: string | null | undefined;

export function getStampDataUrl(): string | null {
  if (cachedStamp !== undefined) return cachedStamp;
  cachedStamp = null;
  try {
    if (typeof window !== "undefined") return cachedStamp;
    const file = path.join(process.cwd(), "public", "carimbooreyazores.jpg");
    if (!fs.existsSync(file)) return cachedStamp;
    cachedStamp = `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    cachedStamp = null;
  }
  return cachedStamp;
}
