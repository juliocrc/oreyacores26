// Converte YYYY-MM-DD para dd/mm/aaaa.
// Valores so com mes (YYYY-MM) caem para MM/AAAA, para nunca devolver
// um AAAA-MM cru ao utilizador.
export function toDisplayDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) return `${monthOnly[2]}/${monthOnly[1]}`;
  return value;
}

// Converte dd/mm/aaaa para YYYY-MM-DD
export function toStorageDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  // se ja estiver em YYYY-MM-DD retorna como esta
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value;
}

// Converte YYYY-MM-DD para MM/AAAA (validade)
export function toDisplayValidade(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}/${match[1]}`;
  // se ja estiver em MM/AAAA retorna como esta
  if (/^\d{2}\/\d{4}/.test(value)) return value;
  return value;
}

// Ultimo dia real de um mes, com calendario correcto (meses de 30/31 dias
// e Fevereiro em anos bissextos).
function endOfMonthISO(year: number, month: number): string {
  if (month < 1 || month > 12) return "";
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

// Converte uma validade so com mes (MM/AAAA ou YYYY-MM) para YYYY-MM-DD
// no ULTIMO dia do mes.
//
// Uma validade mensal significa "valido ate ao fim do mes": gravar o dia 01
// faria o artigo parecer expirado ate 30 dias antes do prazo real. Guardar o
// ultimo dia mantem todas as comparacoes de vencimento correctas sem ter de
// alterar cada consumidor, e continua a ser uma data de calendario valida
// (2024-02 -> 2024-02-29 em ano bissexto).
export function toStorageValidade(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();

  const mmAAAA = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmAAAA) return endOfMonthISO(Number(mmAAAA[2]), Number(mmAAAA[1]));

  const aaaaMM = raw.match(/^(\d{4})-(\d{2})$/);
  if (aaaaMM) return endOfMonthISO(Number(aaaaMM[1]), Number(aaaaMM[2]));

  // Data com dia explicito: preserva-se tal e qual.
  const completa = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (completa) return completa[0];

  return raw;
}

// Normaliza input para a forma canonica de armazenamento.
// Aceita dd/mm/aaaa, MM/AAAA, YYYY-MM-DD e YYYY-MM, e valida a data
// (rejeita 31/02/2024 e meses fora de 1-12).
// Devolve '' quando o valor nao e uma data valida, para que texto
// invalido nunca chegue a base de dados.
export function normalizeDateInput(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) {
    const day = Number(ddmm[1]);
    const month = Number(ddmm[2]);
    const year = Number(ddmm[3]);
    const probe = new Date(year, month - 1, day);
    const valida =
      month >= 1 && month <= 12 && day >= 1 &&
      probe.getFullYear() === year &&
      probe.getMonth() === month - 1 &&
      probe.getDate() === day;
    if (!valida) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const mmAAAA = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmAAAA) {
    const month = Number(mmAAAA[1]);
    if (month < 1 || month > 12) return "";
    return `${mmAAAA[2]}-${String(month).padStart(2, "0")}`;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const day = Number(ymd[3]);
    const month = Number(ymd[2]);
    const year = Number(ymd[1]);
    const probe = new Date(year, month - 1, day);
    const valida =
      month >= 1 && month <= 12 && day >= 1 &&
      probe.getFullYear() === year &&
      probe.getMonth() === month - 1 &&
      probe.getDate() === day;
    return valida ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : "";
  }

  const ym = raw.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const month = Number(ym[2]);
    return month >= 1 && month <= 12 ? `${ym[1]}-${ym[2]}` : "";
  }

  return "";
}
