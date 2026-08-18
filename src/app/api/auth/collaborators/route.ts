import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {

    const users = await prisma.user.findMany({
      where: {
        NOT: {
          role: "CLIENTE"
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
      orderBy: {
        name: "asc"
      }
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Erro ao obter colaboradores:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
