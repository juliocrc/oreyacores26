import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import { buildQuadroPDFArtifacts } from "@/lib/quadro-pdf-template";
import type { QuadroTemplateInput } from "@/lib/quadro-template";
import { getEmailSenderAccounts, isEmailConfigured, sendEmail, type EmailAttachment } from "@/lib/email-sender";
import { sendWhatsAppApi, sendWhatsAppDocument } from "@/lib/whatsapp-provider";
import { buildWhatsAppUrl } from "@/lib/communications";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";
import { isOpenwaSelected } from "@/lib/openwa";
import { canUseEmailSenderProfiles } from "@/lib/email-sender-access";
import { InspectionDocumentError, resolveSavedInspectionDocument, buildSavedInspectionPayload } from "@/lib/saved-inspection-documents";
import { isSosDocumentRaft, SOS_DOCUMENT_NOTICE } from '@/lib/raft-document-rules';

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EnviarBody = {
  senderAccount?: "julio" | "tecnica";
  channel?: "email" | "whatsapp";
  to?: string;
  phone?: string;
  subject?: string;
  message?: string;
  certificate?: InspectionCertificateInput;
  quadro?: QuadroTemplateInput;
  includeCertificate?: boolean;
  includeQuadro?: boolean;
  clienteId?: number;
  jangadaId?: number;
  inspecaoId?: number;
  refId?: number;
  /** Id de um registo da fila "por enviar" que passa a "enviado"/"falhou". */
  pendingId?: number;
};

export async function GET() {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  return NextResponse.json({ emailConfigured: isEmailConfigured(), emailAccounts: canUseEmailSenderProfiles(access.email) ? getEmailSenderAccounts().map(({ id, email, label, configured }) => ({ id, email, label, configured })) : [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let comunicacaoId: number | null = null;
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as EnviarBody;
    const senderAccount = body?.senderAccount;
    if (senderAccount !== undefined && !canUseEmailSenderProfiles(access.email)) {
      return NextResponse.json({ error: "Sem permissao para usar contas de envio." }, { status: 403 });
    }
    if (senderAccount !== undefined && senderAccount !== "julio" && senderAccount !== "tecnica") {
      return NextResponse.json({ error: "Conta de envio invalida." }, { status: 400 });
    }

    const channel = body?.channel === "whatsapp" ? "whatsapp" : "email";
    if (channel === "whatsapp" && isOpenwaSelected()) {
      return NextResponse.json({ error: "Envio de documentos OpenWA indisponivel. Nenhum documento ou texto alternativo foi enviado.", code: "OPENWA_DOCUMENT_UNSUPPORTED" }, { status: 501 });
    }
    const to = String(body?.to || "").trim();
    const phone = String(body?.phone || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const includeCertificate = body?.includeCertificate !== false;
    const includeQuadro = body?.includeQuadro === true;
    if (includeCertificate && body?.inspecaoId == null) {
      throw new InspectionDocumentError('Guarde a inspeção antes de emitir ou enviar o certificado.', 400);
    }

    if (!message) {
      return NextResponse.json({ error: "A mensagem não pode estar vazia." }, { status: 400 });
    }
    if (channel === "email" && !EMAIL_RE.test(to)) {
      return NextResponse.json({ error: "Indique um email de destino válido." }, { status: 400 });
    }
    if (channel === "email" && !subject) {
      return NextResponse.json({ error: "O assunto não pode estar vazio." }, { status: 400 });
    }
    if (channel === "whatsapp" && !phone) {
      return NextResponse.json({ error: "Indique um número de telemóvel válido." }, { status: 400 });
    }
    if (!includeCertificate && !includeQuadro) {
      return NextResponse.json({ error: "Selecione pelo menos um documento para enviar." }, { status: 400 });
    }
    if (channel === "email" && !isEmailConfigured(senderAccount)) {
      return NextResponse.json({ error: "Conta de email nao configurada. Contacte a administracao.", code: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
    }
    const savedSource = body.inspecaoId != null ? await resolveSavedInspectionDocument(body) : null;
    if (includeQuadro) {
      const raft = savedSource?.jangada ?? (body.jangadaId ? await prisma.jangada.findUnique({ where: { id: body.jangadaId } }) : null);
      if ((raft && isSosDocumentRaft(raft)) || isSosDocumentRaft(body.certificate || {}) || isSosDocumentRaft(body.quadro || {})) {
        throw new InspectionDocumentError(SOS_DOCUMENT_NOTICE, 400);
      }
    }
    const quadroInput = includeQuadro && savedSource ? buildSavedInspectionPayload(savedSource).quadro : body.quadro;
    if (includeQuadro && !quadroInput) {
      return NextResponse.json({ error: "Quadro indisponivel. Nenhum documento foi enviado." }, { status: 400 });
    }
    if (includeCertificate && !savedSource && !body.certificate && !body.jangadaId) {
      return NextResponse.json({ error: "Certificado indisponivel. Nenhum documento foi enviado." }, { status: 400 });
    }

    const operador = await prisma.user.findUnique({
      where: { id: access.userId },
      select: { name: true, email: true },
    });
    const enviadoPor = operador?.name || operador?.email || String(access.userId);

    const jangadaId = Number.isFinite(body?.jangadaId) ? Number(body.jangadaId) : null;
    const clienteId = Number.isFinite(body?.clienteId) ? Number(body.clienteId) : null;
    const refId = Number.isFinite(body?.refId) ? Number(body.refId) : null;

    // ---------------------------------------------------------------------
    // Geração dos anexos
    // ---------------------------------------------------------------------
    const attachments: EmailAttachment[] = [];

    if (includeCertificate) {
      if (!savedSource) throw new InspectionDocumentError('Guarde a inspeção antes de emitir ou enviar o certificado.', 400);
      const built = await buildCarimbadoCertificatePdf(savedSource);
      attachments.push({ filename: built.fileName, content: built.buffer, contentType: "application/pdf" });
    }

    if (includeQuadro && quadroInput) {
      const quadro = await buildQuadroPDFArtifacts(quadroInput);
      attachments.push({
        filename: quadro.fileName,
        content: quadro.buffer,
        contentType: "application/pdf",
      });
    }

    if (attachments.length === 0) {
      return NextResponse.json(
        { error: "Não foi possível gerar nenhum dos documentos pedidos." },
        { status: 400 },
      );
    }

    // ---------------------------------------------------------------------
    // Envio
    // ---------------------------------------------------------------------
    let ok = false;
    let erro: string | undefined;
    let whatsappUrl: string | undefined;
    let canal = channel === "email" ? "email" : "whatsapp-api";
    let status = "enviado";

    if (channel === "email") {
      const result = await sendEmail({
        to,
        subject,
        text: message,
        attachments,
        ...(senderAccount !== undefined ? { senderAccount } : {}),
      });
      ok = result.ok;
      erro = result.error;
      if (!ok) status = "falhou";
    } else {
      const destinatario = phone;
      const textRes = await sendWhatsAppApi(destinatario, message);
      whatsappUrl = textRes.link;
      if (!textRes.ok) {
        ok = false;
        erro = textRes.erro;
        status = "falhou";
        canal = "wa.me";
      } else if (!textRes.enviadoDeFacto) {
        ok = true;
        status = "pendente";
        canal = "wa.me";
        erro = "WhatsApp sem API configurada — abra o link para enviar manualmente.";
      } else {
        ok = true;
        canal = "whatsapp-api";
        const caption = subject || "Certificado de Inspeção — Orey Tecnica- Serviços Navais, Lda";
        for (const att of attachments) {
          const docRes = await sendWhatsAppDocument(destinatario, {
            filename: att.filename,
            content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
            caption,
          });
          if (!docRes.ok && docRes.naoConfigurado) {
            status = "pendente";
            canal = "wa.me";
            erro = docRes.erro;
            whatsappUrl = docRes.link || buildWhatsAppUrl(destinatario, message);
            break;
          }
          if (!docRes.ok) {
            status = "parcial";
            erro = docRes.erro;
          }
        }
      }
    }

    const comunicacaoData = {
      tipo: channel === "email" ? "EMAIL" : "WHATSAPP",
      canal,
      destinatario: channel === "email" ? to : phone,
      assunto: channel === "email" ? subject : subject || null,
      mensagem: message,
      status,
      erro: erro || null,
      refTipo: "Jangada",
      refId,
      clienteId,
      jangadaId,
      enviadoPor,
    };

    const pendingId = Number.isFinite(body?.pendingId) ? Number(body.pendingId) : null;
    if (pendingId) {
      const updated = await prisma.comunicacao.updateMany({
        where: { id: pendingId, jangadaId, status: "por_enviar" },
        data: { ...comunicacaoData, enviadoEm: new Date() },
      });
      if (updated.count > 0) comunicacaoId = pendingId;
    }

    if (!comunicacaoId) {
      const comunicacao = await prisma.comunicacao.create({
        data: comunicacaoData,
        select: { id: true },
      });
      comunicacaoId = comunicacao.id;
    }

    if (!ok) {
      return NextResponse.json(
        { error: erro || "Não foi possível enviar a mensagem.", comunicacaoId, whatsappUrl },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      comunicacaoId,
      status,
      canal,
      whatsappUrl,
      files: attachments.map((a) => a.filename),
    });
  } catch (error) {
    if (error instanceof InspectionDocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST /api/certificados/enviar]", error);
    return NextResponse.json(
      { error: "Erro ao enviar o certificado.", comunicacaoId },
      { status: 500 },
    );
  }
}
