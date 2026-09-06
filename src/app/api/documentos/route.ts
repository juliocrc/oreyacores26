import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/auth';
import fs from 'fs';
import path from 'path';

const BASE_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folder = searchParams.get('folder');
  if (!folder) return NextResponse.json({ error: 'Parâmetro folder obrigatório' }, { status: 400 });

  const dir = path.join(BASE_DIR, folder);
  if (!fs.existsSync(dir)) return NextResponse.json([]);

  try {
    const files = fs.readdirSync(dir).map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        url: `/uploads/${folder}/${name}`,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
      };
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    return NextResponse.json(files);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folder = searchParams.get('folder');
  const file = searchParams.get('file');
  if (!folder || !file) return NextResponse.json({ error: 'Parâmetros obrigatórios: folder, file' }, { status: 400 });

  const filePath = path.join(BASE_DIR, folder, path.basename(file));
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Ficheiro não encontrado' }, { status: 404 });

  try {
    fs.unlinkSync(filePath);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
