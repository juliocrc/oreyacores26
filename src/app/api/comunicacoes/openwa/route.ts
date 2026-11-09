import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { isWhatsAppAllowed } from "@/lib/whatsapp-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { openwaStatus } from "@/lib/openwa";

export const runtime = "nodejs";
export const maxDuration = 120;

async function authorize() {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  if (!(await isWhatsAppAllowed())) return NextResponse.json({ error: "Sem permissao para gerir WhatsApp." }, { status: 403 });
  const limit = await checkRateLimit(`openwa-lifecycle:${access.userId}`, 20, 60_000);
  if (limit.status === 503) return NextResponse.json({ error: "Servico temporariamente indisponivel." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Aguarde antes de consultar o WhatsApp." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) } });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json(await openwaStatus(false, req.signal), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  if (Number(req.headers.get("content-length")) > 1024) return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let body: any;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
        await reader.cancel().catch(() => {});
        return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
      }
      chunks.push(value);
    }
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return NextResponse.json({ error: "JSON invalido." }, { status: 400 }); }
  finally { reader?.releaseLock(); }
  if (!body || Object.keys(body).length !== 1 || !["connect", "refresh", "disconnect"].includes(body.action)) return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  if (body.action === "disconnect") return NextResponse.json({ error: "Desligar OpenWA nao suportado nesta integracao. Nenhuma acao executada.", code: "DISCONNECT_UNSUPPORTED" }, { status: 410 });
  const status = await openwaStatus(body.action === "connect", req.signal);
  return NextResponse.json(status, { status: !status.configured ? 503 : status.status === "unavailable" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}
