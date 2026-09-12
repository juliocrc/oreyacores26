import { NextResponse } from 'next/server';
import { getAccessContext } from '@/lib/access-control';

// API: /api/export/excel — descontinuado (script original removido).
// A funcionalidade de exportação de stock/XLSX está em /api/backups/export-excel.
export async function GET() {
  const access = await getAccessContext();
  if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  if (!access.isAdmin) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  return NextResponse.json(
    { error: "Endpoint descontinuado. Utilize /api/backups/export-excel para exportar dados." },
    { status: 410 }
  );
}
