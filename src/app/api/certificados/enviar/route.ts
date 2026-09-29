import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import { sendEmail } from "@/lib/email-sender";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let comunicacaoId: number | null = null;
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      subject?: string;
      message?: string;
      certificate?: InspectionCertificateInput;
      clienteId?: number;
      jangadaId?: number;
      refId?: number;
    };

    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const certificate = body?.certificate;

    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "Indique um email de destino válido." }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "O assunto não pode estar vazio." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "A mensagem não pode estar vazia." }, { status: 400 });
    }
    if (!certificate || typeof certificate !== "object") {
      return NextResponse.json({ error: "Dados do certificado inválidos." }, { status: 400 });
    }

    const operador = await prisma.user.findUnique({
      where: { id: access.userId },
      select: { name: true, email: true },
    });
    const enviadoPor = operador?.name || operador?.email || String(access.userId);

    const fileName = certificatePdfFileName(certificate);
    const pdf = buildCertificatePdfBuffer(certificate);

    const result = await sendEmail({
      to,
      subject,
      text: message,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });

    const comunicacao = await prisma.comunicacao.create({
      data: {
        tipo: "EMAIL",
        canal: "email",
        destinatario: to,
        assunto: subject,
        mensagem: message,
        status: result.ok ? "enviado" : "falhou",
        erro: result.ok ? null : result.error || "Erro ao enviar email.",
        refTipo: "Jangada",
        refId: Number.isFinite(body?.refId) ? Number(body.refId) : null,
        clienteId: Number.isFinite(body?.clienteId) ? Number(body.clienteId) : null,
        jangadaId: Number.isFinite(body?.jangadaId) ? Number(body.jangadaId) : null,
        enviadoPor,
      },
      select: { id: true },
    });
    comunicacaoId = comunicacao.id;

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Não foi possível enviar o email.", comunicacaoId },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, comunicacaoId, fileName });
  } catch (error) {
    console.error("[POST /api/certificados/enviar]", error);
    return NextResponse.json(
      { error: "Erro ao enviar o certificado por email.", comunicacaoId },
      { status: 500 },
    );
  }
}
