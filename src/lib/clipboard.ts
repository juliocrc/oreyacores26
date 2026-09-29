/**
 * Copiar texto para a área de transferência sem partir a aplicação.
 *
 * O `navigator.clipboard.writeText` lança `NotAllowedError` sempre que o
 * documento não está com foco. Sem `.catch()`, essa rejeição fica sem
 * tratamento e o Next devolve-a como "Recoverable Error", apesar de a
 * operação ser perfeitamente irrelevante para o trabalho em curso.
 *
 * Para além disso, nem todos os browsers expõem a Clipboard API (ou só a
 * expõem em contextos seguros), por isso mantemos a reserva com
 * `document.execCommand`, hoje em dia em desuso mas ainda funcional.
 */

export type CopyResult = { ok: true } | { ok: false; reason: "unsupported" | "denied" | "empty" };

export async function copyTextToClipboard(value: string): Promise<CopyResult> {
  const text = String(value ?? "");
  if (!text) return { ok: false, reason: "empty" };

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // Documento sem foco, permissão negada, ou contexto não seguro.
      // Tentamos a reserva antes de desistir.
      return legacyCopy(text) ? { ok: true } : { ok: false, reason: "denied" };
    }
  }

  return legacyCopy(text) ? { ok: true } : { ok: false, reason: "unsupported" };
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
