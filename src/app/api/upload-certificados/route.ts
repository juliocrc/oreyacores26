import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { writeFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { del, list, put } from "@vercel/blob";
import { saveExternalCertificadoToNavioFolder } from "@/lib/certificados-organizados";

const UPLOAD_DIR = join(process.cwd(), "public", "certificados-externos");
const BLOB_PREFIX = "certificados-externos";

function storageEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function requiresBlobStorage() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function missingBlobConfigResponse() {
  return NextResponse.json(
    {
      error: "Storage externo não configurado. Define BLOB_READ_WRITE_TOKEN para gerir certificados em produção.",
    },
    { status: 503 }
  );
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"|?*]/g, "_").replace(/\.\./g, "_");
}

function blobPath(filename?: string) {
  return filename ? `${BLOB_PREFIX}/${filename}` : `${BLOB_PREFIX}/`;
}

// Garante que a pasta existe
async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function GET() {
  try {
    if (!storageEnabled() && requiresBlobStorage()) {
      return missingBlobConfigResponse();
    }

    if (storageEnabled()) {
      const result = await list({ prefix: blobPath() });
      const pdfBlobs = (result.blobs || []).filter((blob) => blob.pathname.toLowerCase().endsWith(".pdf"));

      const files = await Promise.all(
        pdfBlobs.map(async (blob) => {
          const name = blob.pathname.split("/").pop() || blob.pathname;
          const certificado = await prisma.certificadoExtraido.findUnique({
            where: { fileName: name },
            include: {
              jangada: {
                select: {
                  id: true,
                  serial: true,
                  brand: true,
                  model: true,
                },
              },
            },
          });

          return {
            name,
            url: blob.url,
            size: blob.size,
            updatedAt: blob.uploadedAt.toISOString(),
            jangada: certificado?.jangada || null,
            shipName: certificado?.shipName || null,
          };
        })
      );

      return NextResponse.json({ files });
    }

    await ensureUploadDir();
    
    const fileNames = await readdir(UPLOAD_DIR);
    const pdfFiles = fileNames.filter(name => name.toLowerCase().endsWith('.pdf'));
    
    const files = await Promise.all(
      pdfFiles.map(async (name) => {
        const filePath = join(UPLOAD_DIR, name);
        const stats = await stat(filePath);
        
        // Busca no banco de dados se existe registro deste certificado
        const certificado = await prisma.certificadoExtraido.findUnique({
          where: { fileName: name },
          include: {
            jangada: {
              select: {
                id: true,
                serial: true,
                brand: true,
                model: true,
              },
            },
          },
        });
        
        return {
          name,
          url: `/certificados-externos/${name}`,
          size: stats.size,
          updatedAt: stats.mtime.toISOString(),
          jangada: certificado?.jangada || null,
          shipName: certificado?.shipName || null,
        };
      })
    );
    
    return NextResponse.json({ files });
  } catch (error) {
    console.error("Erro ao listar certificados:", error);
    return NextResponse.json({ files: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!storageEnabled() && requiresBlobStorage()) {
      return missingBlobConfigResponse();
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const payload = await req.json().catch(() => null) as {
        action?: string;
        fileNames?: string[];
        jangadaId?: string | null;
      } | null;

      if (payload?.action === "registerUploadedFiles") {
        const fileNames = (payload.fileNames || [])
          .map((name) => sanitizeFilename(String(name || "")).trim())
          .filter((name) => Boolean(name) && name.toLowerCase().endsWith(".pdf"));

        if (!fileNames.length) {
          return NextResponse.json({ error: "Nenhum ficheiro válido para registar." }, { status: 400 });
        }

        let raftSerial: string | null = null;
        if (payload.jangadaId && payload.jangadaId !== "") {
          const jangada = await prisma.jangada.findUnique({
            where: { id: Number(payload.jangadaId) },
            select: { serial: true },
          });
          raftSerial = jangada?.serial || null;
        }

        for (const name of fileNames) {
          await prisma.certificadoExtraido.upsert({
            where: { fileName: name },
            create: {
              fileName: name,
              raftSerial,
              hasQuadro: false,
              validitiesCount: 0,
            },
            update: {
              raftSerial,
              updatedAt: new Date(),
            },
          });
        }

        return GET();
      }
    }

    if (!storageEnabled()) {
      await ensureUploadDir();
    }
    
    const formData = await req.formData();
    const files = formData.getAll("file") as File[];
    const jangadaId = formData.get("jangadaId") as string | null;
    const certificadoExternoNumero = formData.get("certificadoExternoNumero") as string | null;
    const shipId = formData.get("shipId") as string | null;
    const shipName = formData.get("shipName") as string | null;
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Nenhum ficheiro enviado." }, { status: 400 });
    }
    
    // Busca o serial da jangada se foi fornecido ID
    let raftSerial: string | null = null;
    if (jangadaId && jangadaId !== "") {
      const jangada = await prisma.jangada.findUnique({
        where: { id: Number(jangadaId) },
        select: { serial: true },
      });
      raftSerial = jangada?.serial || null;
    }
    
    // Processa cada arquivo
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        continue; // Ignora arquivos que não são PDF
      }

      const safeName = sanitizeFilename(file.name);

      if (storageEnabled()) {
        await put(blobPath(safeName), file, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/pdf",
        });
      } else {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const filePath = join(UPLOAD_DIR, safeName);
        await writeFile(filePath, buffer);
        
        // Guardar também na pasta organizada do navio (NAVIOS/{navio}/) com nomenclatura padrão
        if (shipName || shipId) {
          let resolvedShipName = shipName;
          if (!resolvedShipName && shipId && shipId !== "") {
            const navio = await prisma.navio.findUnique({
              where: { id: Number(shipId) },
              select: { nome: true },
            });
            resolvedShipName = navio?.nome || null;
          }
          
          if (resolvedShipName) {
            await saveExternalCertificadoToNavioFolder(resolvedShipName, safeName, buffer, {
              serial: raftSerial || undefined,
              date: new Date(), // data de upload
            });
          }
        }
      }
      
      // Cria ou atualiza registro no banco de dados
      await prisma.certificadoExtraido.upsert({
        where: { fileName: safeName },
        create: {
          fileName: safeName,
          raftSerial,
          hasQuadro: false,
          validitiesCount: 0,
        },
        update: {
          raftSerial,
          updatedAt: new Date(),
        },
      });

      // REGISTO AUTOMÁTICO NA JANGADA: se temos jangadaId e número de certificado externo,
      // atualiza os campos certificadoExternoUrl e certificadoExternoNumero na jangada
      if (jangadaId && jangadaId !== "" && certificadoExternoNumero && certificadoExternoNumero.trim()) {
        const fileUrl = storageEnabled() 
          ? `https://${process.env.BLOB_PUBLIC_URL || "blob.vercel-storage.com"}/${blobPath(safeName)}`
          : `/certificados-externos/${encodeURIComponent(safeName)}`;
        
        await prisma.jangada.update({
          where: { id: Number(jangadaId) },
          data: {
            certificadoExternoNumero: certificadoExternoNumero.trim(),
            certificadoExternoUrl: fileUrl,
          },
        });
      }
    }
    
    // Retorna lista atualizada
    return GET();
  } catch (error) {
    console.error("Erro ao fazer upload:", error);
    return NextResponse.json({ error: "Erro ao enviar ficheiro." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!storageEnabled() && requiresBlobStorage()) {
      return missingBlobConfigResponse();
    }

    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    
    if (!name) {
      return NextResponse.json({ error: "Nome do ficheiro não fornecido." }, { status: 400 });
    }
    
    if (storageEnabled()) {
      const targetPath = blobPath(name);
      const result = await list({ prefix: targetPath });
      const exact = (result.blobs || []).find((blob) => blob.pathname === targetPath);
      if (exact?.url) {
        await del(exact.url);
      }
    } else {
      const filePath = join(UPLOAD_DIR, name);
      await unlink(filePath);
    }
    
    // Remove do banco de dados
    await prisma.certificadoExtraido.deleteMany({
      where: { fileName: name },
    });
    
    // Retorna lista atualizada
    return GET();
  } catch (error) {
    console.error("Erro ao remover ficheiro:", error);
    return NextResponse.json({ error: "Erro ao remover ficheiro." }, { status: 500 });
  }
}
