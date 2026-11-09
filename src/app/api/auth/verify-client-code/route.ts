import { NextResponse } from "next/server";

// Authentication and cookies must be handled by Auth.js, including its CSRF flow.
export async function POST() {
  return NextResponse.json(
    { error: "Utilize o inicio de sessao do portal.", signIn: "/area-cliente/login" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
