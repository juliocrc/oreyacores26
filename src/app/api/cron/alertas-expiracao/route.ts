import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UrgencyLevel = "URGENTE" | "AVISO" | "LEMBRETE";

interface ExpiringItem {
  tipo: "jangada" | "colete" | "epirb";
  itemId: number;
  serial: string;
  descricao: string;
  dataExpiracao: string;
  diasRestantes: number;
  urgencia: UrgencyLevel;
  shipId: number | null;
  shipName: string;
  clienteId: number | null;
  clienteNome: string;
  clienteEmail: string;
  detalheExpiracao: string;
}

interface AlertSummary {
  clienteId: number;
  clienteNome: string;
  clienteEmail: string;
  itens: ExpiringItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Try dd/mm/yyyy or dd-mm-yyyy
  const ddMmYyyy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  // Try mm/yyyy
  const mmYyyy = raw.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if (mmYyyy) {
    const month = Number(mmYyyy[1]);
    const year = Number(mmYyyy[2]);
    if (month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, 1);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function getDaysRemaining(dateText: string | null | undefined): number | null {
  const d = parseDate(dateText);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function classifyUrgency(days: number): UrgencyLevel {
  if (days <= 15) return "URGENTE";
  if (days <= 30) return "AVISO";
  return "LEMBRETE";
}

function urgencyEmoji(level: UrgencyLevel): string {
  switch (level) {
    case "URGENTE":
      return "🔴";
    case "AVISO":
      return "🟡";
    case "LEMBRETE":
      return "🔵";
  }
}

// ---------------------------------------------------------------------------
// Ship/Client resolution cache
// ---------------------------------------------------------------------------

interface ShipClientInfo {
  shipName: string;
  clienteId: number | null;
  clienteNome: string;
  clienteEmail: string;
}

async function resolveShipClient(
  shipId: number | null,
  cache: Map<number, ShipClientInfo>
): Promise<ShipClientInfo> {
  const empty: ShipClientInfo = {
    shipName: "",
    clienteId: null,
    clienteNome: "",
    clienteEmail: "",
  };
  if (!shipId) return empty;
  if (cache.has(shipId)) return cache.get(shipId)!;

  const ship = await prisma.navio.findUnique({
    where: { id: shipId },
    select: {
      nome: true,
      clienteId: true,
      cliente: {
        select: {
          id: true,
          nome: true,
          email: true,
        },
      },
    },
  });

  if (!ship) {
    cache.set(shipId, empty);
    return empty;
  }

  const info: ShipClientInfo = {
    shipName: ship.nome,
    clienteId: ship.cliente?.id ?? null,
    clienteNome: ship.cliente?.nome ?? "",
    clienteEmail: ship.cliente?.email ?? "",
  };
  cache.set(shipId, info);
  return info;
}

// ---------------------------------------------------------------------------
// Email builder
// ---------------------------------------------------------------------------

function buildEmailHtml(alerts: AlertSummary): string {
  const rows = alerts.itens
    .map(
      (item) =>
        `<tr>
          <td style="padding:6px 10px;border:1px solid #ddd;">${urgencyEmoji(item.urgencia)} ${item.urgencia}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.tipo.toUpperCase()}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.descricao}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.shipName || "—"}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.detalheExpiracao}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;">${item.dataExpiracao}</td>
          <td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">${item.diasRestantes} dias</td>
        </tr>`
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;">
  <h2 style="color:#1a56db;">⚠️ Alerta de Expiração — Equipamentos de Segurança</h2>
  <p>Exmo(a) Sr(a). <strong>${alerts.clienteNome}</strong>,</p>
  <p>Informamos que os seguintes equipamentos associados às suas embarcações têm certificados/inspeções a expirar nos próximos 60 dias:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Urgência</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Tipo</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Equipamento</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Embarcação</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Detalhe</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Data Expiração</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Dias Restantes</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p>Por favor, contacte-nos para agendar as inspeções/renovações necessárias.</p>
  <p style="margin-top:24px;">Cumprimentos,<br/><strong>Orey Tecnica- Serviços Navais, Lda — Estação de Serviço</strong></p>
  <hr style="margin-top:32px;border:none;border-top:1px solid #ddd;"/>
  <p style="font-size:12px;color:#888;">Esta é uma mensagem automática gerada pelo sistema Gestor Naval. Não responda diretamente a este e-mail.</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // 1. Auth check
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Não autorizado. Header Authorization inválido." },
      { status: 401 }
    );
  }

  try {
    const now = new Date();
    const shipCache = new Map<number, ShipClientInfo>();

    // 2. Fetch all equipment
    const [jangadas, coletes, epirbs] = await Promise.all([
      prisma.jangada.findMany({
        where: { dataProxInspecao: { not: null } },
        select: {
          id: true,
          serial: true,
          brand: true,
          model: true,
          capacity: true,
          dataProxInspecao: true,
          shipId: true,
          shipNameManual: true,
        },
      }),
      prisma.colete.findMany({
        where: {
          estado: "Ativo",
          dataProxInspecao: { not: null },
        },
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          dataProxInspecao: true,
          shipId: true,
        },
      }),
      prisma.epirb.findMany({
        where: { estado: "Ativo" },
        select: {
          id: true,
          serial: true,
          marca: true,
          modelo: true,
          dataProxInspecao: true,
          dataValidadeBateria: true,
          shipId: true,
        },
      }),
    ]);

    // 3. Collect all expiring items (within 60 days)
    const expiringItems: ExpiringItem[] = [];

    // --- Jangadas ---
    for (const j of jangadas) {
      const days = getDaysRemaining(j.dataProxInspecao);
      if (days === null || days > 60) continue;
      const info = await resolveShipClient(j.shipId, shipCache);
      expiringItems.push({
        tipo: "jangada",
        itemId: j.id,
        serial: j.serial,
        descricao: `${j.brand || ""} ${j.model || ""} ${j.capacity}P (${j.serial})`.trim(),
        dataExpiracao: j.dataProxInspecao!,
        diasRestantes: days,
        urgencia: classifyUrgency(days),
        shipId: j.shipId,
        shipName: info.shipName || j.shipNameManual || "",
        clienteId: info.clienteId,
        clienteNome: info.clienteNome,
        clienteEmail: info.clienteEmail,
        detalheExpiracao: "Próxima inspeção",
      });
    }

    // --- Coletes ---
    for (const c of coletes) {
      const days = getDaysRemaining(c.dataProxInspecao);
      if (days === null || days > 60) continue;
      const info = await resolveShipClient(c.shipId, shipCache);
      expiringItems.push({
        tipo: "colete",
        itemId: c.id,
        serial: c.serial,
        descricao: `Colete ${[c.marca, c.modelo].filter(Boolean).join(" ")} (${c.serial})`,
        dataExpiracao: c.dataProxInspecao!,
        diasRestantes: days,
        urgencia: classifyUrgency(days),
        shipId: c.shipId ?? null,
        shipName: info.shipName,
        clienteId: info.clienteId,
        clienteNome: info.clienteNome,
        clienteEmail: info.clienteEmail,
        detalheExpiracao: "Próxima inspeção",
      });
    }

    // --- EPIRBs (inspection + battery) ---
    for (const e of epirbs) {
      const daysInsp = getDaysRemaining(e.dataProxInspecao);
      const daysBat = getDaysRemaining(e.dataValidadeBateria);

      const checks: { days: number; date: string; detalhe: string }[] = [];
      if (daysInsp !== null && daysInsp <= 60) {
        checks.push({ days: daysInsp, date: e.dataProxInspecao!, detalhe: "Inspeção a expirar" });
      }
      if (daysBat !== null && daysBat <= 60) {
        checks.push({ days: daysBat, date: e.dataValidadeBateria!, detalhe: "Bateria a expirar" });
      }

      if (checks.length === 0) continue;

      const info = await resolveShipClient(e.shipId, shipCache);

      for (const check of checks) {
        expiringItems.push({
          tipo: "epirb",
          itemId: e.id,
          serial: e.serial,
          descricao: `EPIRB ${[e.marca, e.modelo].filter(Boolean).join(" ")} (${e.serial})`,
          dataExpiracao: check.date,
          diasRestantes: check.days,
          urgencia: classifyUrgency(check.days),
          shipId: e.shipId ?? null,
          shipName: info.shipName,
          clienteId: info.clienteId,
          clienteNome: info.clienteNome,
          clienteEmail: info.clienteEmail,
          detalheExpiracao: check.detalhe,
        });
      }
    }

    // 4. Filter: only items with a known client + email
    const actionable = expiringItems.filter(
      (item) => item.clienteId !== null && item.clienteEmail
    );

    // 5. Check Auditoria: skip clients notified in the last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentLogs = await prisma.auditoria.findMany({
      where: {
        tabela: "Comunicacao",
        tipoOperacao: "AUTO_ALERT",
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        idRegisto: true,
      },
    });

    const recentlyNotifiedClientIds = new Set(recentLogs.map((l) => l.idRegisto));

    // 6. Group by client
    const grouped = new Map<number, AlertSummary>();
    for (const item of actionable) {
      if (recentlyNotifiedClientIds.has(item.clienteId!)) continue;

      if (!grouped.has(item.clienteId!)) {
        grouped.set(item.clienteId!, {
          clienteId: item.clienteId!,
          clienteNome: item.clienteNome,
          clienteEmail: item.clienteEmail,
          itens: [],
        });
      }
      grouped.get(item.clienteId!)!.itens.push(item);
    }

    // Sort items within each group by urgency
    for (const summary of grouped.values()) {
      summary.itens.sort((a, b) => a.diasRestantes - b.diasRestantes);
    }

    // 7. Send emails & log
    const hasSmtpConfig = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    let transporter: nodemailer.Transporter | null = null;
    if (hasSmtpConfig) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    const results: {
      clienteId: number;
      clienteNome: string;
      email: string;
      itensCount: number;
      urgentes: number;
      avisos: number;
      lembretes: number;
      emailSent: boolean;
      error?: string;
    }[] = [];

    // Also send a copy to admin emails
    const adminEmailString = process.env.AUTH_ADMIN_EMAILS || "";
    const adminEmails = adminEmailString
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    for (const [clienteId, summary] of grouped) {
      const urgentes = summary.itens.filter((i) => i.urgencia === "URGENTE").length;
      const avisos = summary.itens.filter((i) => i.urgencia === "AVISO").length;
      const lembretes = summary.itens.filter((i) => i.urgencia === "LEMBRETE").length;

      let emailSent = false;
      let errorMsg: string | undefined;

      if (transporter) {
        try {
          const recipients = [summary.clienteEmail, ...adminEmails]
            .filter(Boolean)
            .join(",");

          const subjectUrgency = urgentes > 0 ? "🔴 URGENTE" : avisos > 0 ? "🟡 AVISO" : "🔵 LEMBRETE";
          await transporter.sendMail({
            from:
              process.env.SMTP_FROM ||
              `"Orey Tecnica- Serviços Navais, Lda - Gestor Naval" <${process.env.SMTP_USER}>`,
            to: recipients,
            subject: `${subjectUrgency} — Certificados a expirar (${summary.itens.length} equipamento${summary.itens.length > 1 ? "s" : ""}) — ${summary.clienteNome}`,
            html: buildEmailHtml(summary),
          });
          emailSent = true;
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : "Erro ao enviar e-mail";
          console.error(`[CRON] Erro ao enviar e-mail para ${summary.clienteEmail}:`, err);
        }
      }

      // Log to Auditoria (even if email fails, for traceability)
      const descParts = summary.itens.map(
        (i) => `${i.urgencia}: ${i.descricao} (${i.detalheExpiracao} - ${i.diasRestantes} dias)`
      );
      await prisma.auditoria.create({
        data: {
          tabela: "Comunicacao",
          tipoOperacao: "AUTO_ALERT",
          idRegisto: clienteId,
          descricao: `Alerta automático de expiração enviado para ${summary.clienteNome} (${summary.clienteEmail}). ${summary.itens.length} equipamento(s): ${descParts.join("; ")}. E-mail: ${emailSent ? "Enviado" : "Falhou"}${errorMsg ? ` — ${errorMsg}` : ""}`,
          usuario: "sistema-cron",
        },
      });

      results.push({
        clienteId,
        clienteNome: summary.clienteNome,
        email: summary.clienteEmail,
        itensCount: summary.itens.length,
        urgentes,
        avisos,
        lembretes,
        emailSent,
        ...(errorMsg ? { error: errorMsg } : {}),
      });
    }

    // 8. Build response summary
    const totalExpiring = expiringItems.length;
    const totalActionable = actionable.length;
    const totalSkipped = actionable.filter((i) =>
      recentlyNotifiedClientIds.has(i.clienteId!)
    ).length;
    const totalEmailsSent = results.filter((r) => r.emailSent).length;
    const totalEmailsFailed = results.filter((r) => !r.emailSent).length;

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      smtpConfigured: hasSmtpConfig,
      summary: {
        totalExpiringItems: totalExpiring,
        totalWithClientEmail: totalActionable,
        totalSkippedRecentlyNotified: totalSkipped,
        clientesNotificados: results.length,
        emailsEnviados: totalEmailsSent,
        emailsFalhados: totalEmailsFailed,
      },
      byUrgency: {
        urgente: expiringItems.filter((i) => i.urgencia === "URGENTE").length,
        aviso: expiringItems.filter((i) => i.urgencia === "AVISO").length,
        lembrete: expiringItems.filter((i) => i.urgencia === "LEMBRETE").length,
      },
      byType: {
        jangadas: expiringItems.filter((i) => i.tipo === "jangada").length,
        coletes: expiringItems.filter((i) => i.tipo === "colete").length,
        epirbs: expiringItems.filter((i) => i.tipo === "epirb").length,
      },
      notifications: results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao processar alertas de expiração";
    console.error("[CRON] alertas-expiracao error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
