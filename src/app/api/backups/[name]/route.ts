import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAdminOrBypass } from '@/app/api/backups/_lib';

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) return NextResponse.json({ error: 'Não autorizado' }, { status: auth.status });

  const resolvedParams = await context.params;
  const { name } = resolvedParams;
  const backupDir = path.join(process.cwd(), 'backups', name);
  
  if (!fs.existsSync(backupDir) || !name.startsWith('backup_')) {
    return NextResponse.json({ error: 'Backup não encontrado' }, { status: 404 });
  }

  try {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'));
    const combinedData: Record<string, unknown> = {};

    files.forEach((file) => {
      const tableName = file.replace('.json', '');
      const content = fs.readFileSync(path.join(backupDir, file), 'utf-8');
      try {
        combinedData[tableName] = JSON.parse(content);
      } catch {
        combinedData[tableName] = [];
      }
    });

    const responsePayload = {
      backupName: name,
      exportedAt: fs.statSync(backupDir).mtime.toISOString(),
      tables: combinedData,
    };

    return new Response(JSON.stringify(responsePayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${name}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) return NextResponse.json({ error: 'Não autorizado' }, { status: auth.status });

  const resolvedParams = await context.params;
  const { name } = resolvedParams;
  const backupDir = path.join(process.cwd(), 'backups', name);

  if (!fs.existsSync(backupDir) || !name.startsWith('backup_')) {
    return NextResponse.json({ error: 'Backup não encontrado' }, { status: 404 });
  }

  try {
    fs.rmSync(backupDir, { recursive: true, force: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
