import { NextResponse } from 'next/server';

// API: /api/export/pdf — descontinuado (script original removido).
export async function GET() {
  return NextResponse.json(
    { error: "Endpoint descontinuado. Utilize /api/backups/export-excel para exportar dados." },
    { status: 410 }
  );
}
