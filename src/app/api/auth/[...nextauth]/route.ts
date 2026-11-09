import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

export async function POST(request: NextRequest) {
  const response = await handlers.POST(request);
  // Auth.js serializes CredentialsSignin into a redirect (or a JSON redirect URL).
  const location = response.headers.get("location") || (await response.clone().json().catch(() => null))?.url;
  if (typeof location === "string") {
    const code = new URL(location, request.url).searchParams.get("code");
    if (code === "rate_limit_unavailable" || code === "rate_limit_exceeded") {
      return Response.json({ url: location, error: code === "rate_limit_unavailable" ? "Servico temporariamente indisponivel." : "Demasiadas tentativas. Tente novamente mais tarde." }, {
        status: code === "rate_limit_unavailable" ? 503 : 429,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  return response;
}
