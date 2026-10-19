import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import { buildCarimbadoCertificatePdf } from "@/lib/certificate-carimbado-pdf";
import { buildQuadroPDFArtifacts } from "@/lib/quadro-pdf-template";
import type { QuadroTemplateInput } from "@/lib/quadro-template";
import { sendEmail, type EmailAttachment } from "@/lib/email-sender";
import { sendWhatsAppApi, sendWhatsAppDocument } from "@/lib/whatsapp-provider";
import { buildWhatsAppUrl } from "@/lib/communications";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EnviarBody = {
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
  refId?: number;
  /** Id de um registo da fila "por enviar" que passa a "enviado"/"falhou". */
  pendingId?: number;
};

export async function POST(request: Request) {
  let comunicacaoId: number | null = null;
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as EnviarBody;

    const channel = body?.channel === "whatsapp" ? "whatsapp" : "email";
    const to = String(body?.to || "").trim();
    const phone = String(body?.phone || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();
    const includeCertificate = body?.includeCertificate !== false;
    const includeQuadro = body?.includeQuadro === true;

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
      let certName = certificatePdfFileName(body.certificate || {});
      let certPdf: Buffer | null = body.certificate ? buildCertificatePdfBuffer(body.certificate) : null;

      if (jangadaId) {
        const jangada = await prisma.jangada.findUnique({
          where: { id: jangadaId },
          include: { artigos: true, serviceStation: { select: { codigo: true, nome: true } } },
        });
        if (jangada) {
          const lastInspecao = await prisma.inspecao.findFirst({
            where: { jangadaId: jangada.id },
            orderBy: { dataInspecao: "desc" },
            include: { artigos: true },
          });
          const navio = jangada.shipId
            ? await prisma.navio.findUnique({
                where: { id: jangada.shipId },
                select: {
                  nome: true,
                  bandeira: true,
                  imo: true,
                  callSignal: true,
                  cliente: { select: { nome: true } },
                  serviceStation: { select: { codigo: true, nome: true } },
                },
              })
            : null;
          const station = jangada.serviceStation || navio?.serviceStation || null;
          const built = await buildCarimbadoCertificatePdf({
            jangada,
            lastInspecao,
            ship: navio,
            shipName: jangada.shipNameManual || navio?.nome || "",
            ownerName: navio?.cliente?.nome || jangada.owner || "",
            station,
          });
          certPdf = built.buffer;
          certName = built.fileName;
        }
      }

      if (certPdf) {
        attachments.push({ filename: certName, content: certPdf, contentType: "application/pdf" });
      }
    }

    if (includeQuadro && body.quadro) {
      const quadro = await buildQuadroPDFArtifacts(body.quadro);
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
        const caption = subject || "Certificado de Inspeção — Orey Açores";
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
        where: { id: pendingId, status: "por_enviar" },
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
    console.error("[POST /api/certificados/enviar]", error);
    return NextResponse.json(
      { error: "Erro ao enviar o certificado.", comunicacaoId },
      { status: 500 },
    );
  }
}
