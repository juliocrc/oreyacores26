import NextAuth from "next-auth/next";
import { buildAuthOptions } from "@/auth";

function resolveProtocolHost(req: Request) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  return { host, protocol };
}

export async function GET(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const { host, protocol } = resolveProtocolHost(req);
  const isSecure = `${protocol}://${host}`.startsWith("https");
  const handler = NextAuth(buildAuthOptions(isSecure));
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}

export async function POST(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const { host, protocol } = resolveProtocolHost(req);
  const isSecure = `${protocol}://${host}`.startsWith("https");
  const handler = NextAuth(buildAuthOptions(isSecure));
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}
