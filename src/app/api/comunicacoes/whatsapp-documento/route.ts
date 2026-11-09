import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { isWhatsAppAllowed } from "@/lib/whatsapp-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeE164 } from "@/lib/textbee-sms";
import { isOpenwaConfigured, sendOpenwa } from "@/lib/openwa";
import { openwaBusinessHours } from "@/lib/business-hours";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_PDF = 3 * 1024 * 1024;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401, headers });
  if (!(await isWhatsAppAllowed())) return NextResponse.json({ error: "Sem permissão para enviar WhatsApp." }, { status: 403, headers });
  if (!isOpenwaConfigured() || !openwaBusinessHours().open) return NextResponse.json({ error: "WhatsApp indisponível ou fora do horário de envio." }, { status: 503, headers });
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data") || Number(req.headers.get("content-length")) > MAX_PDF + 65536) return NextResponse.json({ error: "Envie um PDF até 3 MB." }, { status: 413, headers });
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let form: FormData;
  try {
    if (!reader) throw new Error();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF + 65536) { await reader.cancel(); return NextResponse.json({ error: "PDF demasiado grande." }, { status: 413, headers }); }
      chunks.push(value);
    }
    form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData();
  } catch { return NextResponse.json({ error: "Formulário inválido." }, { status: 400, headers }); }
  finally { reader?.releaseLock(); }
  if ([...form.keys()].some(key => !["pdf", "destinatario", "confirmed"].includes(key)) || ["pdf", "destinatario", "confirmed"].some(key => form.getAll(key).length !== 1)) return NextResponse.json({ error: "Campos inválidos." }, { status: 400, headers });
  const raw = form.get("destinatario"), file = form.get("pdf");
  const phone = typeof raw === "string" ? normalizeE164(raw) : null;
  if (!phone || form.get("confirmed") !== "true" || !file || typeof file === "string" || file.size <= 0 || file.size > MAX_PDF || !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Confirme o destinatário e selecione um PDF até 3 MB." }, { status: 400, headers });
  const pdf = Buffer.from(await file.arrayBuffer());
  if (pdf.subarray(0, 5).toString() !== "%PDF-") return NextResponse.json({ error: "O ficheiro não é um PDF válido." }, { status: 400, headers });
  const limit = await checkRateLimit(`whatsapp-document:${access.userId}`, 3, 60000);
  if (!limit.allowed) return NextResponse.json({ error: "Envio indisponível ou limite atingido. Tente mais tarde." }, { status: limit.status === 503 ? 503 : 429, headers });
  const filename = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 115).replace(/\.pdf$/i, "") + ".pdf";
  let id: number | undefined;
  try {
    const row = await prisma.comunicacao.create({ data: { tipo: "WHATSAPP", canal: "openwa-document", assunto: "Documento PDF", destinatario: phone, mensagem: `Documento: ${filename}`, status: "pendente", enviadoPor: access.email || String(access.userId) }, select: { id: true } });
    id = row.id;
    const result = await sendOpenwa(phone, { pdf, filename }, id);
    if (result.uncertain) {
      await prisma.comunicacao.update({ where: { id }, data: { erro: "Envio sem confirmação. Verifique antes de repetir." } }).catch(() => {});
      return NextResponse.json({ error: "Envio sem confirmação. Não repita; verifique no WhatsApp e no fornecedor.", uncertain: true, id }, { status: 502, headers });
    }
    if (!result.ok) {
      await prisma.comunicacao.update({ where: { id }, data: { status: "falhou", erro: "Documento não aceite para envio." } }).catch(() => {});
      return NextResponse.json({ error: "Documento não aceite para envio.", status: "falhou", id }, { status: 502, headers });
    }
    let warning: string | undefined;
    try { await prisma.comunicacao.update({ where: { id }, data: { providerId: result.providerId, status: "pendente" } }); }
    catch { warning = "PDF aceite pelo fornecedor, mas o histórico não foi atualizado. Não repita; verifique o WhatsApp."; }
    return NextResponse.json({ ok: true, id, status: "pendente", ...(warning ? { warning } : {}) }, { headers });
  } catch {
    return NextResponse.json({ error: id ? "Não foi possível confirmar o envio. Não repita; verifique o histórico." : "Não foi possível preparar o envio.", uncertain: Boolean(id), id }, { status: 500, headers });
  }
}
