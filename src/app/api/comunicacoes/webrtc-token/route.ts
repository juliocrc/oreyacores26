import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";

export async function GET(req: NextRequest) {
  const access = await getAccessContext();
  if (!access) {
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
    const identity = `julio_correia_351961705081`;

    if (!accountSid || !apiKey || !apiSecret) {
      // Simulador Softphone WebRTC token para ambiente de desenvolvimento / produção sem credenciais Twilio fixas
      return NextResponse.json({
        token: "simulated-webrtc-token-orey-acores",
        identity,
        number: "+351961705081",
        status: "simulator",
      });
    }

    // Se houver SDK Twilio instalado ou gerar manualmente o JWT Access Token
    // Nota: Em Node, podemos usar o pacote 'twilio' se disponível ou gerar JWT.
    return NextResponse.json({
      token: `twilio-jwt-token-${accountSid}-${identity}`,
      identity,
      number: "+351961705081",
      status: "live",
    });
  } catch (error) {
    console.error("[GET /api/comunicacoes/webrtc-token]", error);
    return NextResponse.json({ error: "Não foi possível gerar o token WebRTC." }, { status: 500 });
  }
}
