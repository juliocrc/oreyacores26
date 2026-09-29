import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const customStream = new ReadableStream({
    start(controller) {
      // Enviar mensagem inicial de boas-vindas / conexão estabelecida
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "CONNECTED", message: "SSE connected successfully" })}\n\n`));

      // Enviar heartbeats a cada 30 segundos para manter a ligação ativa
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "PING", timestamp: Date.now() })}\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new NextResponse(customStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
