"use client";
import { useEffect, useState } from "react";

export default function MarinhaSyncButton({ onSync }: { onSync: () => void | Promise<void> }) {
  const [canSync, setCanSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/navios/marinha?permissions=1", { signal: controller.signal })
      .then(async res => {
        const data = await res.json();
        if (res.ok) setCanSync(data.canSync === true);
        else setMessage(data.error || "Erro ao verificar importacao da Marinha.");
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("Erro ao verificar importacao da Marinha. Atualize a pagina para tentar novamente."); });
    return () => controller.abort();
  }, []);
  if (!canSync) return message ? <p role="status" className="max-w-sm text-xs text-white">Marinha: {message}</p> : null;
  return <div className="max-w-xl">
    <button type="button" disabled={busy} className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/25 disabled:opacity-50 sm:text-sm" onClick={async () => {
      if (!window.confirm("Importar todos os navios do catalogo da Marinha na estacao ativa? Os registos existentes serao preservados.")) return;
      setBusy(true);
      setMessage("");
      try {
        const res = await fetch("/api/navios/marinha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao importar catalogo.");
        setMessage(`${data.count} navios disponiveis na estacao ativa.${data.conflicts.length ? ` Conflitos: ${data.conflicts.join(" ")}` : ""}`);
        await onSync();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Erro ao importar catalogo."); }
      finally { setBusy(false); }
    }}>{busy ? "A importar Marinha..." : "Importar catalogo da Marinha"}</button>
    {message && <p role="status" className="mt-2 text-xs text-white">{message}</p>}
  </div>;
}
