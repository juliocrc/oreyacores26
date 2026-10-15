// Mapeia a localização dos contactos internos (como vem no PDF) para o código
// da ServiceStation correspondente. Mantém-se num módulo leve (sem dependências)
// para poder ser testado e reutilizado sem carregar o parser do PDF.
//
// A chave é normalizada (minúsculas, espaços/tabs colapsados). Localizações sem
// estação associada (ex.: "Outros contactos úteis") devolvem null.
export const CONTACTO_LOCALIZACAO_STATION_CODE: Record<string, string> = {
  "es açores": "ACORES",
  "es alcantarilha": "ALCATARILHA",
  "es aveleda": "AVELEDA",
  "es vialonga": "LISBOA",
  "vialonga/lisboa": "LISBOA",
  vialonga: "LISBOA",
  lisboa: "LISBOA",
  setúbal: "SETUBAL",
};

function normalizeLocationKey(value: string) {
  return value.replace(/[\t\n\r]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function resolveContactoStationCode(localizacao: string | null | undefined): string | null {
  if (!localizacao) return null;
  return CONTACTO_LOCALIZACAO_STATION_CODE[normalizeLocationKey(localizacao)] ?? null;
}
