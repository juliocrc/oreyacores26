import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth";

export async function GET(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const nextauthUrl = process.env.NEXTAUTH_URL;
  const authUrl = process.env.AUTH_URL;

  const isSecureEnv = !!(nextauthUrl ?? authUrl ?? "").startsWith("https");
  const isSecureHeader = proto === "https";

  const token1 = await getToken({ req, secret: secret || "" });
  const token2 = await getToken({ req, secret: secret || "", secureCookie: true, cookieName: "__Secure-next-auth.session-token" });
  const token3 = await getToken({ req, secret: secret || "", secureCookie: false, cookieName: "next-auth.session-token" });

  const cookieHeader = req.headers.get("cookie") || "";
  const hasSecureCookie = cookieHeader.includes("__Secure-next-auth.session-token");
  const hasInsecureCookie = cookieHeader.includes("next-auth.session-token=") && !hasSecureCookie;

  return NextResponse.json({
    proto,
    host,
    nextauthUrl,
    authUrl,
    authSecretSet: !!process.env.AUTH_SECRET,
    nextauthSecretSet: !!process.env.NEXTAUTH_SECRET,
    isSecureEnv,
    isSecureHeader,
    tokenAutoDetect: token1 ? { sub: token1.sub, role: token1.role } : null,
    tokenSecure: token2 ? { sub: token2.sub, role: token2.role } : null,
    tokenInsecure: token3 ? { sub: token3.sub, role: token3.role } : null,
    hasSecureCookie,
    hasInsecureCookie,
    cookieHeaderLength: cookieHeader.length,
  });
}
