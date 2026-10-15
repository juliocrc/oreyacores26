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

    // Por política, este cron NÃO envia SMS/WhatsApp automaticamente.
    // Quando solicitado (enviar=1&secret=...), apenas PREPARA rascunhos para o
    // operador enviar manualmente a partir da caixa de comunicações.
    const preparacoes: Array<{ jangadaId: number; serial: string; preparado: boolean; reason?: string }> = [];
    if (enviar) {
      if (config.enabled.lembrete_validade === false) {
        return NextResponse.json({ success: true, error: "Preparação de lembretes desativada na configuração SMS." }, { status: 200 });
      }
      const hojeInicio = new Date();
      hojeInicio.setHours(0, 0, 0, 0);
      for (const j of jangadasExpirando) {
        const jaPreparado = await prisma.comunicacao.findFirst({
          where: {
            jangadaId: j.id,
            canal: "auto-preparado",
            status: "rascunho",
            createdAt: { gte: hojeInicio },
          },
          select: { id: true },
        });
        if (jaPreparado) {
          preparacoes.push({ jangadaId: j.id, serial: j.serial, preparado: false, reason: "Já preparado hoje." });
          continue;
        }
        const result = await tryNotifySms<{ sent: boolean; staged?: boolean; reason?: string }>(() =>
          notifyJangadaLembreteValidade(j.id, {
            dataProxInspecao: j.dataProxInspecao,
            useConfig: false,
            enviarAhora: false,
          }),
        );
        preparacoes.push({
          jangadaId: j.id,
          serial: j.serial,
          preparado: Boolean((result as { staged?: boolean })?.staged),
          reason: (result as { reason?: string })?.reason,
        });
      }
    }

    return NextResponse.json({
      success: true,
      verificadoEm: new Date().toISOString(),
      antecedenciaDias: diasAntecedencia,
      totalAlertasPendentes: alertasGerados.length,
      totalPreparados: preparacoes.filter((e) => e.preparado).length,
      preparacoes: preparacoes.length ? preparacoes : undefined,
      alertas: alertasGerados,
    });
  } catch (error) {
    console.error("[GET /api/cron/alertas-validades]", error);
    return NextResponse.json({ error: "Erro ao executar verificação diária de validades." }, { status: 500 });
  }
}
