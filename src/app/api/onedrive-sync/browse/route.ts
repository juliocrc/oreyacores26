import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { detectOneDriveBusinessRoots } from "@/lib/onedrive-sync";

export const runtime = "nodejs";

type DirectoryEntry = { name: string; path: string };

function listDirectories(target: string): DirectoryEntry[] {
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
}

function parentOf(target: string): string | null {
  const parent = path.dirname(target);
  return parent === target ? null : parent;
}

export async function GET(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
    if (!access.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const requested = (searchParams.get("path") || "").trim();
    const oneDriveRoots = detectOneDriveBusinessRoots();

    if (!requested) {
      const home = os.homedir();
      return NextResponse.json({
        path: home,
        parent: parentOf(home),
        directories: listDirectories(home),
        oneDriveRoots,
      });
    }

    const resolved = path.resolve(requested);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: `Caminho não encontrado: ${resolved}` }, { status: 404 });
    }
    if (!fs.statSync(resolved).isDirectory()) {
      return NextResponse.json({ error: `Não é uma pasta: ${resolved}` }, { status: 400 });
    }

    return NextResponse.json({
      path: resolved,
      parent: parentOf(resolved),
      directories: listDirectories(resolved),
      oneDriveRoots,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao listar pastas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
