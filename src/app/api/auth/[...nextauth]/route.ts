import NextAuth from "next-auth/next";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

export async function GET(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}

export async function POST(req: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  const resolvedContext = { ...context, params: await context.params };
  return handler(req, resolvedContext);
}
