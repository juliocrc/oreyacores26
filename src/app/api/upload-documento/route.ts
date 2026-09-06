import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import prisma from '@/lib/prisma';
import { isAllowedFolder, listFiles, saveFile } from '@/lib/documentos-storage';
import { saveExternalCertificadoToNavioFolder } from '@/lib/certificados-organizados';

type FolderType = 'documentacao' | 'legislacao' | 'ordens-servico' | 'certificados';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function sanitizeFilename(filename: string): string {
  // Remove caracteres perigosos mas mantém acentos
  return filename.replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '_');
}

function isAllowedExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png'];
  return allowed.includes(ext);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = formData.get('folder') as FolderType | null;
    const shipId = formData.get('shipId') as string | null;
    const shipName = formData.get('shipName') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum ficheiro fornecido' },
        { status: 400 }
      );
    }

    if (!folder) {
      return NextResponse.json(
        { error: 'Pasta obrigatória' },
        { status: 400 }
      );
    }

    const folderOk = isAllowedFolder(folder) || folder.startsWith('ordens-servico/') || folder.startsWith('certificados/');
    if (!folderOk) {
      return NextResponse.json(
        { error: 'Pasta inválida. Use: documentacao, legislacao, ordens-servico/{id} ou certificados/{id}' },
        { status: 400 }
      );
    }

    // Validar tamanho (documentação/legislação: 500 MB)
    const maxSize = DEFAULT_MAX_UPLOAD_BYTES;
    const maxSizeMb = (maxSize / 1024 / 1024).toFixed(0);
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Ficheiro muito grande. Máximo: ${maxSizeMb} MB. Tamanho: ${(file.size / 1024 / 1024).toFixed(2)} MB` },
        { status: 400 }
      );
    }

    // Validar extensão
    if (!isAllowedExtension(file.name)) {
      return NextResponse.json(
        { error: 'Tipo de ficheiro não permitido. Use: PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    let savedName: string;
    const buffer = Buffer.from(bytes);
    
    // Se for certificado externo, guardar também na pasta organizada do navio
    const isExternalCert = String(folder) === 'certificados/externos';
    
    if (isAllowedFolder(folder)) {
      savedName = await saveFile(folder, sanitizeFilename(file.name), bytes, file.type);
    } else {
      const dir = path.join(UPLOADS_DIR, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      savedName = sanitizeFilename(file.name);
      const counter = 1;
      let finalName = savedName;
      while (fs.existsSync(path.join(dir, finalName))) {
        const ext = path.extname(savedName);
        const base = path.basename(savedName, ext);
        finalName = `${base}_${counter}${ext}`;
      }
      fs.writeFileSync(path.join(dir, finalName), buffer);
      savedName = finalName;
    }

    // Se for certificado externo e tivermos shipName/shipId, guardar na pasta do navio
    if (isExternalCert && buffer) {
      let resolvedShipName = shipName;
      let resolvedDate = new Date();

      if (!resolvedShipName && shipId && shipId !== "") {
        const navio = await prisma.navio.findUnique({
          where: { id: Number(shipId) },
          select: { nome: true },
        });
        resolvedShipName = navio?.nome || null;
      }

      if (resolvedShipName) {
        await saveExternalCertificadoToNavioFolder(resolvedShipName, savedName, buffer, {
          date: resolvedDate,
        });
      }
    }

    return NextResponse.json({
      success: true,
      filename: savedName,
      originalName: file.name,
      size: file.size,
      folder,
      message: 'Ficheiro carregado com sucesso',
    });
  } catch (error: unknown) {
    console.error('Erro no upload:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao carregar ficheiro', details },
      { status: 500 }
    );
  }
}

// Listar ficheiros de uma pasta
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder') as FolderType | null;

    if (!isAllowedFolder(folder)) {
      return NextResponse.json(
        { error: 'Pasta inválida' },
        { status: 400 }
      );
    }

    const files = await listFiles(folder);
    return NextResponse.json({ files });
  } catch (error: unknown) {
    console.error('Erro ao listar ficheiros:', error);
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao listar ficheiros', details },
      { status: 500 }
    );
  }
}
