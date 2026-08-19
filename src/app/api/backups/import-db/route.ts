import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Ficheiro não enviado.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate it's a SQLite database (header: "SQLite format 3\0")
    const header = buffer.slice(0, 16).toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      return NextResponse.json({ error: 'Ficheiro inválido. Envie uma base de dados SQLite (.db).' }, { status: 400 });
    }

    const dbPath = path.join(process.cwd(), 'prisma', 'local.db');

    // Create backup of current database before replacing
    if (fs.existsSync(dbPath)) {
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fs.copyFileSync(dbPath, path.join(backupDir, `pre_import_backup_${timestamp}.db`));
    }

    // Replace the database
    fs.writeFileSync(dbPath, buffer);

    return NextResponse.json({
      success: true,
      message: 'Base de dados importada com sucesso. Recomenda-se reiniciar o servidor.',
      size: buffer.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Erro ao importar base de dados.' }, { status: 500 });
  }
}