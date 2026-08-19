import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isStaticOrInternal(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/public") || /\.[a-zA-Z0-9]+$/.test(pathname);
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/auth") || isStaticOrInternal(pathname)) {
    return NextResponse.next();
  }

  // TODO: reativar auth quando login funcionar no Render
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js).*)"],
};
