import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import * as XLSX from 'xlsx';
import { requireAdminOrBypass } from '../_lib';

interface PrismaModelDelegate {
  findMany: () => Promise<Array<Record<string, unknown>>>
}

const prismaDelegates = prisma as unknown as Record<string, PrismaModelDelegate | undefined>;

export async function GET() {
  const auth = await requireAdminOrBypass();
  if (!auth.ok) return new Response('Não autorizado', { status: auth.status });

  try {
    const modelNames = Object.keys(prisma).filter(
      (key) => !key.startsWith('_') && !key.startsWith('$') && typeof prismaDelegates[key]?.findMany === 'function'
    );

    const wb = XLSX.utils.book_new();

    for (const model of modelNames) {
      const records = await prismaDelegates[model]!.findMany();

      // Clean up records: convert Dates or JSON objects to strings
      const cleanedRecords = records.map((record) => {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          if (value instanceof Date) {
            cleaned[key] = value.toISOString();
          } else if (typeof value === 'object' && value !== null) {
            cleaned[key] = JSON.stringify(value);
          } else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      });

      const ws = XLSX.utils.json_to_sheet(cleanedRecords);
      
      // Sheet names in Excel must be unique and <= 31 characters
      const sheetName = model.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_tabelas_${timestamp}.xlsx`;

    return new Response(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generating Excel backup:', error);
    return NextResponse.json({ error: (error as Error).message || 'Error generating Excel backup' }, { status: 5500 });
  }
}
