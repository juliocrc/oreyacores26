import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseClientRegistration } from "@/lib/client-registration";
import { normalizeE164 } from "@/lib/textbee-sms";
import { POST as requestCode } from "../client-code/route";

export async function POST(req: NextRequest) {
  try {
    const registration = parseClientRegistration(await req.json().catch(() => null));
    if (!registration) return NextResponse.json({ error: "Indique nome, NIF e pelo menos um contacto valido (email ou telemovel)." }, { status: 400 });
    const global = await checkRateLimit("client-registration:global", 100, 600_000);
    const limit = global.allowed ? await checkRateLimit(`client-registration:${registration.nif}`, 3, 600_000) : global;
    if (!limit.allowed) return NextResponse.json({ error: limit.status === 503 ? "Servico temporariamente indisponivel." : "Demasiados pedidos. Tente mais tarde." }, { status: limit.status === 503 ? 503 : 429 });
    const cliente = await prisma.cliente.findUnique({ where: { nif: registration.nif },
      select: { id: true, nome: true, email: true, telefone: true, telmovel: true, serviceStationId: true } });
    const emailMatches = Boolean(cliente?.email && cliente.email.trim().toLowerCase() === registration.email);
    const phone = registration.phone ? normalizeE164(registration.phone) : null;
    const phoneMatches = Boolean(phone && cliente && [cliente.telmovel, cliente.telefone].some(value => value && normalizeE164(value) === phone));
    const updateAfterLogin = Boolean(cliente && !cliente.email?.trim() && phoneMatches && registration.email);
    const needsReview = !cliente || (!emailMatches && !phoneMatches) ||
      registration.nome !== cliente.nome || (!emailMatches && !updateAfterLogin);
    if (needsReview || updateAfterLogin) {
      await prisma.pedidoAssistencia.create({ data: {
        nome: registration.nome, email: registration.email, telefone: registration.phone,
        serviceStationId: cliente?.serviceStationId ?? null,
        origem: "portal_acesso", estado: "novo", tipoAssistencia: "Registo / atualizacao de dados do cliente",
        descricao: `Pedido de registo ou atualizacao do portal. Dados declarados, ainda nao autenticados.\nNome: ${registration.nome}\nNIF: ${registration.nif}\nEmail proposto: ${registration.email || "Nao tem email"}\nTelemovel proposto: ${registration.phone || "Nao indicado"}\n${cliente ? `Validar na ficha /clientes/${cliente.id}.` : "Validar o registo antes de criar uma ficha."}\nNenhum contacto existente foi substituido.`,
        metadados: JSON.stringify({ clienteId: cliente?.id ?? null, dadosPropostos: registration, estadoRegisto: "aguarda_validacao" }),
      } });
    }
    if (!cliente || (!emailMatches && !phoneMatches)) return NextResponse.json({
      success: false, registrationPending: true, assistanceRequested: true,
      message: "Dados recebidos em Pedidos de Assistencia. A equipa vai validar o registo ou a atualizacao dos contactos antes de permitir o acesso.",
    }, { status: 202 });
    // A public NIF match is not identity proof: issue only to an existing contact.
    const response = await requestCode(new NextRequest(new URL("/api/auth/client-code", req.url), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(emailMatches ? { email: cliente.email } : { phone }), nif: registration.nif }),
    }));
    const result = await response.json();
    return NextResponse.json({ ...result, verifyWithNif: true, updateAfterLogin,
      ...(needsReview || updateAfterLogin ? { assistanceRequested: true } : {}) }, { status: response.status });
  } catch {
    console.error("[client-registration] Nao foi possivel registar o pedido.");
    return NextResponse.json({ error: "Nao foi possivel processar o pedido de registo." }, { status: 500 });
  }
}
