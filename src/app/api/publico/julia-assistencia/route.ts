import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeE164 } from "@/lib/textbee-sms";
import { isPortalEquipmentDate } from "@/lib/portal-equipment-date";

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 4096) return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > 4096) return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const field = (key: string, max: number) => typeof body[key] === "string" && (body[key] as string).trim().length <= max ? (body[key] as string).trim() : "";
  const nome = field("nome", 120), telefone = field("telefone", 40), email = field("email", 254), navio = field("navio", 120), descricao = field("descricao", 1200);
  const ultimaInspecao = field("ultimaInspecao", 10), certificado = field("certificado", 100);
  const phone = telefone ? normalizeE164(telefone) : null;
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!nome || !descricao || body.confirmed !== true || (!phone && !validEmail) || (telefone && !phone) || (email && !validEmail)) {
    return NextResponse.json({ error: "Indique nome, descrição, um contacto válido e confirme o pedido." }, { status: 400 });
  }
  if ((body.ultimaInspecao && (!ultimaInspecao || !isPortalEquipmentDate(ultimaInspecao))) || (body.certificado && !certificado)) return NextResponse.json({ error: "Data de inspeção ou certificado inválido." }, { status: 400 });
  const global = await checkRateLimit("julia-lead:global", 100, 600_000);
  const limit = global.allowed ? await checkRateLimit(`julia-lead:${phone || email.toLowerCase()}`, 3, 600_000) : global;
  if (!limit.allowed) return NextResponse.json({ error: limit.status === 503 ? "Serviço temporariamente indisponível." : "Demasiados pedidos. Tente mais tarde." }, { status: limit.status === 503 ? 503 : 429 });
  try {
    const pedido = await prisma.pedidoAssistencia.create({ data: {
      nome, telefone: phone || null, email: email || null, navio: navio || null,
      descricao: [descricao, ultimaInspecao || certificado ? `Dados declarados pelo visitante, por verificar:${ultimaInspecao ? `\nÚltima inspeção: ${ultimaInspecao}` : ""}${certificado ? `\nÚltimo certificado: ${certificado}` : ""}` : ""].filter(Boolean).join("\n\n"), tipoAssistencia: "Contacto comercial / novo cliente", origem: "julia_publica", estado: "novo",
    }, select: { id: true } });
    return NextResponse.json({ success: true, id: pedido.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível registar o pedido. Tente novamente." }, { status: 500 });
  }
}
