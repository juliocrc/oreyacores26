import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { readdir as readdirAsync, stat as statAsync, readFile } from "fs/promises";
import path from "path";
import prisma from "@/lib/prisma";

const CERTIFICADOS_BASE = path.join(process.cwd(), "public", "certificados-organizados");
const NAVIOS_BASE = path.join(process.cwd(), "public", "navios", "NAVIOS");

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function getFileTypeFromName(name: string): "certificado" | "quadro" | "externo" | "outro" {
  const lower = name.toLowerCase();
  if (lower.startsWith("cert_") || lower.startsWith("certificado_") || lower.includes("certificado")) return "certificado";
  if (lower.startsWith("quadro_") || lower.includes("quadro")) return "quadro";
  if (lower.startsWith("ext_") || lower.startsWith("externo_") || lower.includes("externo")) return "externo";
  if (lower.endsWith(".pdf") || lower.endsWith(".xlsx")) return "outro";
  return "outro";
}

function extractSerialFromName(name: string): string | null {
  // Tenta padrões: _12345_ , _12345., -12345-, etc.
  const patterns = [
    /[_-](\d{4,})[_.-]/,  // _12345_ ou _12345.
    /[_-](\d{4,})$/,       // _12345 no fim
    /^(\d{4,})[_-]/,       // 12345_ no início
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractDateFromName(name: string): string | null {
  // Padrões: 20260115, 2026-01-15, 2026_01_15, 15012026
  const patterns = [
    /(\d{4})(\d{2})(\d{2})/,           // 20260115
    /(\d{4})[-_](\d{2})[-_](\d{2})/,  // 2026-01-15 ou 2026_01_15
    /(\d{2})(\d{2})(\d{4})/,           // 15012026
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) {
      if (p === patterns[0]) return `${m[1]}-${m[2]}-${m[3]}`;
      if (p === patterns[1]) return `${m[1]}-${m[2]}-${m[3]}`;
      if (p === patterns[2]) return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  return null;
}

async function readIndexJson(dir: string): Promise<any[]> {
  const indexPath = path.join(dir, "index.json");
  if (!existsSync(indexPath)) return [];
  try {
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function scanCertificadosDir(year: number): Promise<any[]> {
  const yearDir = path.join(CERTIFICADOS_BASE, `CERTIFICADOS AÇORES ${year}`);
  if (!existsSync(yearDir)) return [];
  
  const index = await readIndexJson(yearDir);
  if (index.length > 0) return index.map(f => ({ ...f, year, folderType: "certificados" }));
  
  // Fallback: scan direto
  const files = await readdirAsync(yearDir);
  return files
    .filter(f => f.toLowerCase().endsWith(".xlsx") || f.toLowerCase().endsWith(".pdf"))
    .map(async f => {
      const filePath = path.join(yearDir, f);
      const stats = await statAsync(filePath);
      return {
        name: f,
        type: getFileTypeFromName(f),
        serial: extractSerialFromName(f),
        date: extractDateFromName(f),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        year,
        folderType: "certificados",
        path: path.relative(process.cwd(), filePath),
      };
    });
}

async function scanNavioDir(shipName: string): Promise<any[]> {
  const sanitized = sanitizeFolderName(shipName);
  const navioDir = path.join(NAVIOS_BASE, sanitized);
  if (!existsSync(navioDir)) return [];
  
  const index = await readIndexJson(navioDir);
  if (index.length > 0) return index.map(f => ({ ...f, shipName, folderType: "navio" }));
  
  // Fallback: scan direto
  const files = await readdirAsync(navioDir);
  return files
    .filter(f => f.toLowerCase().endsWith(".xlsx") || f.toLowerCase().endsWith(".pdf"))
    .map(async f => {
      const filePath = path.join(navioDir, f);
      const stats = await statAsync(filePath);
      return {
        name: f,
        type: getFileTypeFromName(f),
        serial: extractSerialFromName(f),
        date: extractDateFromName(f),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        shipName,
        folderType: "navio",
        path: path.relative(process.cwd(), filePath),
      };
    });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year") ? Number(searchParams.get("year")) : null;
    const shipName = searchParams.get("shipName") || null;
    const serial = searchParams.get("serial") || null;
    const type = searchParams.get("type") || null; // certificado|quadro|externo
    const startDate = searchParams.get("startDate") || null;
    const endDate = searchParams.get("endDate") || null;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 500;
    const offset = searchParams.get("offset") ? Number(searchParams.get("offset")) : 0;

    let allFiles: any[] = [];

    if (shipName) {
      // Buscar apenas no navio específico
      allFiles = await scanNavioDir(shipName);
    } else if (year) {
      // Buscar apenas no ano específico
      allFiles = await scanCertificadosDir(year);
    } else {
      // Buscar em todos os anos (certificados) + todos os navios
      const anosDir = existsSync(CERTIFICADOS_BASE) ? await readdirAsync(CERTIFICADOS_BASE) : [];
      for (const d of anosDir) {
        const m = d.match(/CERTIFICADOS AÇORES (\d{4})/);
        if (m) allFiles.push(...await scanCertificadosDir(Number(m[1])));
      }
      const naviosDir = existsSync(NAVIOS_BASE) ? await readdirAsync(NAVIOS_BASE) : [];
      for (const n of naviosDir) {
        allFiles.push(...await scanNavioDir(n));
      }
    }

    // Filtros
    if (serial) {
      allFiles = allFiles.filter(f => f.serial === serial || f.name.includes(serial));
    }
    if (type) {
      allFiles = allFiles.filter(f => f.type === type);
    }
    if (startDate) {
      allFiles = allFiles.filter(f => f.date && f.date >= startDate);
    }
    if (endDate) {
      allFiles = allFiles.filter(f => f.date && f.date <= endDate);
    }

    // Ordenar por data desc (mais recente primeiro)
    allFiles.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.modified || "").localeCompare(a.modified || ""));

    // Paginação
    const total = allFiles.length;
    const paginated = allFiles.slice(offset, offset + limit);

    // Enriquecer com dados da BD (jangada, navio) se serial
    const serials = [...new Set(paginated.map(f => f.serial).filter(Boolean))];
    let jangadaMap: Record<string, any> = {};
    if (serials.length > 0) {
      const jangadas = await prisma.jangada.findMany({
        where: { serial: { in: serials as string[] } },
        select: { serial: true, brand: true, model: true, capacity: true, shipId: true, shipNameManual: true },
      });
      jangadaMap = Object.fromEntries(jangadas.map(j => [j.serial, j]));
    }

    const enriched = paginated.map(f => ({
      ...f,
      url: `/${f.path.replace(/\\/g, "/")}`,
      jangada: f.serial ? jangadaMap[f.serial] || null : null,
    }));

    return NextResponse.json({
      files: enriched,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      filters: { year, shipName, serial, type, startDate, endDate },
    });
  } catch (error) {
    console.error("Erro na busca de certificados organizados:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}