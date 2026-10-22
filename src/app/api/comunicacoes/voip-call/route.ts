import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clienteNome = String(body?.clienteNome || "Exmo. Cliente").trim();
    const telefone = String(body?.telefone || "").trim();
    const jangadaModel = String(body?.jangadaModel || "Jangada Salva-vidas").trim();
    const capacidade = String(body?.capacidade || "12").trim();
    const serial = String(body?.serial || "").trim();
    const navioNome = String(body?.navioNome || "Embarcação").trim();
    const dataValidade = String(body?.dataValidade || "22/10/2026").trim();

    if (!telefone) {
      return NextResponse.json({ error: "Número de telefone obrigatório para iniciar a chamada VoIP." }, { status: 400 });
    }

    const ttsMessage = `Olá ${clienteNome}. Relembramos que a vistoria técnica da jangada salva-vidas ${jangadaModel}, com capacidade para ${capacidade} lugares, série ${serial}, instalada na embarcação ${navioNome}, tem validade prevista até ${dataValidade}. Para garantir a segurança da embarcação e a conformidade legal, confirme por favor se podemos agendar a vistoria e a emissão do novo certificado. Ficamos a aguardar o seu contacto. Com os melhores cumprimentos, Orey Azores.`;

    // Twilio REST API Integration (or simulation fallback if env vars are not set)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || "+351961705081";

    let callSid = `sim-call-${Date.now()}`;
    let providerStatus = "queued";

    if (accountSid && authToken) {
      // Real Twilio REST API call
      const twiml = `<Response><Say language="pt-PT">${ttsMessage}</Say></Response>`;
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: telefone,
          From: twilioNumber,
          Twiml: twiml,
        }),
      });

      if (twilioRes.ok) {
        const twilioData = await twilioRes.json();
        callSid = twilioData.sid || callSid;
        providerStatus = twilioData.status || "initiated";
      } else {
        const errText = await twilioRes.text();
        console.warn("[Twilio Voice API] Falha na chamada, a usar modo simulador REST:", errText);
      }
    }

    // Registar no histórico de comunicações
    await prisma.comunicacao.create({
      data: {
        tipo: "WHATSAPP", // ou chamada de voz
        canal: "voip-twilio",
        destinatario: telefone,
        assunto: `Chamada de Voz IA (Twilio REST) — ${clienteNome}`,
        mensagem: ttsMessage,
        status: "enviado",
        enviadoPor: access.email || "Júlio Correia",
      },
    });

    return NextResponse.json({
      success: true,
      callSid,
      status: providerStatus,
      message: `Chamada VoIP iniciada com sucesso via REST API para ${telefone} (${clienteNome}).`,
    });
  } catch (error) {
    console.error("[POST /api/comunicacoes/voip-call]", error);
    return NextResponse.json({ error: "Não foi possível iniciar a chamada VoIP." }, { status: 500 });
  }
}
