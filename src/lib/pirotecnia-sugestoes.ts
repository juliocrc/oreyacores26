import { normalizeNavioTipoCategoria } from "@/lib/navio-legal-types";

export type PirotecniaSugestao = { item: string; quantity: string };

export const PIROTECNIA_OPCOES = [
  "Facho de mão",
  "Foguete com paraquedas",
  "Sinal fumígeno flutuante",
  "Sinal fumígeno de mão",
  "Foguete luminoso simples",
  "Facho de mão (vermelho)",
  "Lançacabos (Line thrower)",
  "Sinal de homem ao mar / Man overboard (MOB)",
  "Kit de pirotecnia",
  "Caixa de pirotecnia",
  "Outro artigo pirotécnico",
] as const;

export function parseComprimentoNavio(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getPirotecniaSugestoes(
  tipoPesca?: string | null,
  tipoNavio?: string | null,
  comprimento?: unknown,
): PirotecniaSugestao[] {
  const categoria = normalizeNavioTipoCategoria(tipoPesca || "", null, tipoNavio || "");
  const len = parseComprimentoNavio(comprimento);

  const base: PirotecniaSugestao[] = [];

  if (len !== null && len >= 12) {
    base.push({ item: "Lançacabos (Line thrower)", quantity: "4" });
    base.push({ item: "Sinal de homem ao mar / Man overboard (MOB)", quantity: "2" });
  } else {
    base.push({ item: "Sinal de homem ao mar / Man overboard (MOB)", quantity: "1" });
  }

  if (categoria === "Pesca Costeira" && len !== null) {
    if (len <= 14) {
      return [
        ...base,
        { item: "Facho de mão", quantity: "3" },
        { item: "Foguete com paraquedas", quantity: "4" },
        { item: "Sinal fumígeno flutuante", quantity: "2" },
      ];
    }
    if (len <= 24) {
      return [
        ...base,
        { item: "Facho de mão", quantity: "6" },
        { item: "Foguete com paraquedas", quantity: "4" },
        { item: "Sinal fumígeno flutuante", quantity: "2" },
      ];
    }
    return [
      ...base,
      { item: "Facho de mão", quantity: "6" },
      { item: "Foguete com paraquedas", quantity: "12" },
      { item: "Sinal fumígeno flutuante", quantity: "4" },
    ];
  }

  if (categoria === "Pesca do Largo") {
    return [
      ...base,
      { item: "Facho de mão", quantity: "6" },
      { item: "Foguete com paraquedas", quantity: "12" },
      { item: "Sinal fumígeno flutuante", quantity: "4" },
    ];
  }

  return [
    ...base,
    { item: "Facho de mão", quantity: "3" },
    { item: "Foguete com paraquedas", quantity: "4" },
    { item: "Sinal fumígeno flutuante", quantity: "2" },
  ];
}

export type PirotecnicoBordo = { id?: string; item?: string; quantity?: string; validade?: string; notes?: string };

export function pirotecnicoStatus(validade?: string | null): { label: string; tone: "valid" | "expiring" | "expired" | "none" } {
  const raw = String(validade || "").trim();
  if (!raw) return { label: "Sem validade", tone: "none" };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { label: "Data inválida", tone: "none" };
  const days = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Expirado", tone: "expired" };
  if (days <= 180) return { label: `${days} dias`, tone: "expiring" };
  return { label: "Válido", tone: "valid" };
}
