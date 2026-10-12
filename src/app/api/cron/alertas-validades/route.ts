import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getLocalDateKey } from "@/lib/date-utils";
import { getSmsConfig } from "@/lib/sms-config";
import { notifyJangadaLembreteValidade, tryNotifySms } from "@/lib/notify-jangada-sms";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const enviar = searchParams.get("enviar") === "1";
    const secret = searchParams.get("secret") || "";

    const envSecret = process.env.CRON_SECRET?.trim();
    if (enviar && (!envSecret || secret !== envSecret)) {
      return NextResponse.json({ error: "Secret inválido." }, { status: 403 });
    }

    const config = await getSmsConfig();
    const diasAntecedencia = config.lembreteValidadeDias > 0 ? config.lembreteValidadeDias : 7;

    const today = new Date();
    const threshold = new Date();
    threshold.setDate(today.getDate() + diasAntecedencia);
    const todayStr = getLocalDateKey(today);
    const thresholdStr = getLocalDateKey(threshold);

    const jangadasExpirando = await prisma.jangada.findMany({
      where: {
        dataProxInspecao: {
          lte: thresholdStr,
          gte: todayStr,
        },
      },
      select: {
        id: true,
        serial: true,
        brand: true,
        model: true,
        owner: true,
        shipNameManual: true,
        dataProxInspecao: true,
      },
    });

    const alertasGerados = jangadasExpirando.map((j) => {
      const diasRestantes = Math.ceil((new Date(j.dataProxInspecao!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        jangadaId: j.id,
        serial: j.serial,
        armador: j.owner || "Armador",
        contacto: "Sem contacto na ficha",
        diasRestantes,
        mensagem: `Aviso Orey Açores: A sua jangada (S/N ${j.serial}) expira a inspeção em ${diasRestantes} dias (${new Date(j.dataProxInspecao!).toLocaleDateString("pt-PT")}). Agende a revisão connosco.`,
      };
    });

    const envios: Array<{ jangadaId: number; serial: string; sent: boolean; pending?: boolean; reason?: string }> = [];
    if (enviar) {
      if (config.enabled.lembrete_validade === false) {
        return NextResponse.json({ success: true, error: "Envio de lembretes desativado na configuração SMS." }, { status: 200 });
      }
      for (const j of jangadasExpirando) {
        const result = await tryNotifySms<{ sent: boolean; pending?: boolean; reason?: string }>(() =>
          notifyJangadaLembreteValidade(j.id, {
            dataProxInspecao: j.dataProxInspecao,
            useConfig: true,
            confirmada: false,
          }),
        );
        envios.push({
          jangadaId: j.id,
          serial: j.serial,
          sent: Boolean(result?.sent),
          pending: Boolean((result as { pending?: boolean })?.pending),
          reason: (result as { reason?: string })?.reason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      verificadoEm: new Date().toISOString(),
      antecedenciaDias: diasAntecedencia,
      totalAlertasPendentes: alertasGerados.length,
      totalEnviados: envios.filter((e) => e.sent).length,
      totalPendentesConfirmacao: envios.filter((e) => e.pending).length,
      envios: envios.length ? envios : undefined,
      alertas: alertasGerados,
    });
  } catch (error) {
    console.error("[GET /api/cron/alertas-validades]", error);
    return NextResponse.json({ error: "Erro ao executar verificação diária de validades." }, { status: 500 });
  }
}
