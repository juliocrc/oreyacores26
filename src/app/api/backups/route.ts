import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const backupParentDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupParentDir)) {
    return NextResponse.json([]);
  }

  try {
    const files = fs.readdirSync(backupParentDir);
    const backups = files
      .map((name) => {
        const fullPath = path.join(backupParentDir, name);
        const stat = fs.statSync(fullPath);
        
        // Support both old format (backup_XXX dirs) and new format (.db files)
        if (stat.isDirectory() && name.startsWith('backup_')) {
          const tableFiles = fs.readdirSync(fullPath).filter((f) => f.endsWith('.json'));
          let totalSize = 0;
          tableFiles.forEach((file) => {
            totalSize += fs.statSync(path.join(fullPath, file)).size;
          });
          return {
            name,
            createdAt: stat.mtime.toISOString(),
            size: totalSize,
            tablesCount: tableFiles.length,
          };
        }
        
        // Support .db files directly in backups folder
        if (!stat.isDirectory() && name.endsWith('.db')) {
          return {
            name: name.replace('.db', ''),
            createdAt: stat.mtime.toISOString(),
            size: stat.size,
            tablesCount: 1,
          };
        }
        
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime());

    return NextResponse.json(backups);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    console.log('[API Backups] Triggering backup script...');
    await execAsync('node scripts/db_backup.js');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API Backups] Failed to run backup:', err);
    return NextResponse.json({ error: (err as Error).message || 'Erro ao executar backup' }, { status: 500 });
  }
}
