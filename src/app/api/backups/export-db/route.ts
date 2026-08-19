import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const dbPath = path.join(process.cwd(), 'prisma', 'local.db');
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: 'Base de dados não encontrada' }, { status: 404 });
  }

  try {
    const dbBuffer = fs.readFileSync(dbPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return new Response(dbBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="gestornaval_${timestamp}.db"`,
        'Content-Length': dbBuffer.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}