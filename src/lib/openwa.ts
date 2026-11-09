import { normalizeE164 } from "./textbee-sms";
import { openwaBusinessHours, OPENWA_HOURS } from "./business-hours";

export const OPENWA_UNCERTAIN = "O OpenWA pode ter aceite o envio. Nao repita nem envie texto alternativo; verifique o WhatsApp e o historico.";
export const OPENWA_CLOSED = `Envio WhatsApp encerrado. ${OPENWA_HOURS} Nao foi agendado qualquer envio.`;
export const isOpenwaSelected = () => process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === "openwa";

function config() {
  const key = process.env.OPENWA_API_KEY ?? "";
  const name = process.env.OPENWA_SESSION_NAME?.trim() || "orey-acores";
  const url = new URL(process.env.OPENWA_BASE_URL || "https://invalid.invalid");
  // Restrict the trusted deployment target, including redirects, rather than accepting arbitrary SSRF targets.
  if (url.protocol !== "https:" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.onrender\.com$/.test(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.port || !/^\/?$/.test(url.pathname) ||
      !key || key.length > 4096 || /[^\x21-\x7e]/.test(key) || !/^[a-zA-Z0-9_-]{1,100}$/.test(name)) {
    throw new Error("OpenWA nao configurado com um destino HTTPS Render seguro.");
  }
  return { base: url.origin, key, name };
}

export function isOpenwaConfigured() {
  try { config(); return isOpenwaSelected(); } catch { return false; }
}

const statuses = new Set(["created", "initializing", "qr_ready", "authenticating", "ready", "disconnected", "action_required", "failed"]);
type Session = { id: string; name: string; status: string };

async function request(path: string, method = "GET", body?: unknown, idempotencyKey?: string, timeoutMs = 15_000, signal?: AbortSignal) {
  const { base, key } = config();
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  combined.throwIfAborted();
  const response = await fetch(`${base}/api${path}`, {
    method, redirect: "error", cache: "no-store", signal: combined,
    headers: { "X-API-Key": key, ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error("OpenWA response too large"); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { throw new Error("Invalid OpenWA response"); }
  return { status: response.status, data };
}

function session(value: any): Session {
  if (!value || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value.id) ||
      value.name !== config().name || !statuses.has(value.status)) throw new Error("Invalid OpenWA session");
  return { id: value.id, name: value.name, status: value.status };
}

async function discover(timeoutMs = 15_000, signal?: AbortSignal): Promise<Session | null> {
  const result = await request(`/sessions?name=${encodeURIComponent(config().name)}`, "GET", undefined, undefined, timeoutMs, signal);
  if (result.status !== 200 || !Array.isArray(result.data)) throw new Error("OpenWA status unavailable");
  const matches = result.data.filter((s: any) => s?.name === config().name);
  if (matches.length > 1) throw new Error("Ambiguous OpenWA session");
  return matches.length ? session(matches[0]) : null;
}

export async function openwaStatus(connect = false, signal?: AbortSignal) {
  if (!isOpenwaConfigured()) return { configured: false, ready: false, status: "not_configured", ...openwaBusinessHours() };
  // One budget covers discovery, creation, start, status and QR, below the UI deadline.
  const budget = AbortSignal.timeout(100_000);
  const lifecycle = signal ? AbortSignal.any([signal, budget]) : budget;
  const statusRequest = (path: string, method = "GET", body?: unknown) => request(path, method, body, undefined, 15_000, lifecycle);
  try {
    let found = await discover(90_000, lifecycle);
    if (connect && !found) {
      const created = await statusRequest("/sessions", "POST", { name: config().name });
      if (created.status !== 201 && created.status !== 409) throw new Error("OpenWA create failed");
      found = await discover(15_000, lifecycle);
    }
    if (connect && found && ["created", "disconnected", "failed", "action_required"].includes(found.status)) {
      const started = await statusRequest(`/sessions/${encodeURIComponent(found.id)}/start`, "POST");
      if (started.status !== 200) throw new Error("OpenWA start failed");
    }
    if (found) {
      const current = await statusRequest(`/sessions/${encodeURIComponent(found.id)}`);
      if (current.status !== 200) throw new Error("OpenWA status failed");
      found = session(current.data);
    }
    let qrCode: string | undefined;
    if (found?.status === "qr_ready") {
      const qr = await statusRequest(`/sessions/${encodeURIComponent(found.id)}/qr`);
      if (qr.status !== 200 && qr.status !== 400) throw new Error("OpenWA QR failed");
      const value = qr.data?.qrCode;
      if (qr.status === 200 && typeof value === "string" && value.length <= 700_000 &&
          /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) &&
          Buffer.from(value.slice(22), "base64").subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) qrCode = value;
    }
    return { configured: true, ready: found?.status === "ready", status: found?.status ?? "absent", ...(qrCode ? { qrCode } : {}), ...openwaBusinessHours() };
  } catch {
    return { configured: true, ready: false, status: "unavailable", error: "Nao foi possivel consultar o OpenWA.", ...openwaBusinessHours() };
  }
}

export type OpenwaSendResult = { ok: boolean; providerId?: string; error?: string; uncertain?: boolean; closed?: boolean };

export async function sendOpenwa(phone: string, content: { text: string } | { audio: Buffer } | { pdf: Buffer; filename: string }, communicationId?: string | number): Promise<OpenwaSendResult> {
  if (!openwaBusinessHours().open) return { ok: false, closed: true, error: OPENWA_CLOSED };
  if (!isOpenwaConfigured()) return { ok: false, error: "OpenWA nao configurado." };
  // Every outbound attempt must first have a durable communication record.
  if (!communicationId || !/^\d+$/.test(String(communicationId))) return { ok: false, error: "OpenWA requer um registo de comunicacao persistente antes do envio." };
  const normalized = normalizeE164(phone);
  if (!normalized || !/^\+[1-9]\d{7,14}$/.test(normalized)) return { ok: false, error: "Telefone invalido." };
  if (("text" in content && (!content.text.trim() || content.text.length > 10_000)) ||
      ("audio" in content && (!content.audio.length || content.audio.length > 10 * 1024 * 1024)) ||
      ("pdf" in content && (!content.pdf.length || content.pdf.length > 3 * 1024 * 1024 || !content.pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || !/^[a-zA-Z0-9._ -]{1,120}\.pdf$/i.test(content.filename)))) return { ok: false, error: "Conteudo OpenWA invalido ou demasiado grande." };
  let found: Session | null;
  try { found = await discover(); } catch { return { ok: false, error: "Nao foi possivel consultar a sessao OpenWA." }; }
  if (found?.status !== "ready") return { ok: false, error: "A sessao OpenWA nao esta pronta. Ligue o WhatsApp na central." };
  if (!openwaBusinessHours().open) return { ok: false, closed: true, error: OPENWA_CLOSED };
  try {
    const kind = "audio" in content ? "audio" : "pdf" in content ? "document" : "text";
    const result = await request(`/sessions/${encodeURIComponent(found.id)}/messages/send-${kind}`, "POST", {
      chatId: `${normalized.slice(1)}@c.us`,
      ...("audio" in content ? { base64: content.audio.toString("base64"), mimetype: "audio/mpeg", ptt: false } : "pdf" in content ? { base64: content.pdf.toString("base64"), mimetype: "application/pdf", filename: content.filename } : { text: content.text, linkPreview: false }),
    }, `orey-communication-${communicationId}`);
    if (result.status === 201 && typeof result.data?.messageId === "string" && result.data.messageId.length > 0 && result.data.messageId.length <= 300 &&
        (typeof result.data.timestamp === "number" || typeof result.data.timestamp === "string")) return { ok: true, providerId: result.data.messageId };
    if (result.status >= 500 || result.status === 409 || result.status === 408 || result.status < 400) return { ok: false, uncertain: true, error: OPENWA_UNCERTAIN };
    return { ok: false, error: `OpenWA rejeitou o envio (HTTP ${result.status}).` };
  } catch { return { ok: false, uncertain: true, error: OPENWA_UNCERTAIN }; }
}
