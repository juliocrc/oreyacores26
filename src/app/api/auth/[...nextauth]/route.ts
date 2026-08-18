import NextAuth from "next-auth/next";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

export async function GET(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  process.env.NEXTAUTH_URL = `${protocol}://${host}`;
  process.env.AUTH_URL = `${protocol}://${host}`;
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}

export async function POST(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  process.env.NEXTAUTH_URL = `${protocol}://${host}`;
  process.env.AUTH_URL = `${protocol}://${host}`;
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}