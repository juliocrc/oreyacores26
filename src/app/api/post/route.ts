import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const where: Prisma.PostWhereInput = {};
  const title = searchParams.get("title"); if (title) where.title = { contains: title };
  if (searchParams.get("published")) where.published = searchParams.get("published") === "true";
  if (searchParams.get("authorId")) where.authorId = Number(searchParams.get("authorId"));

  const posts = await prisma.post.findMany({
    where,
    include: { author: true }
  });
  return NextResponse.json(posts);
}
