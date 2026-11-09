import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePortalClienteId, InspectionDocumentError } from '@/lib/saved-inspection-documents';
import { invoiceDisplay, invoiceMetadata, type OfficialPdfMetadata } from '@/lib/invoice-official';
import { OfficialInvoiceError, readOfficialPdf } from '@/lib/invoice-official-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const clienteId = await requirePortalClienteId();
    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json({ error: 'ID invalido.' }, { status: 400, headers });
    }
    const invoice = await prisma.fatura.findFirst({ where: { id: Number(id), clienteId } });
    if (!invoice || !invoiceDisplay(invoice).numeroFaturaOficial || !invoiceDisplay(invoice).pdfOficial) {
      return NextResponse.json({ error: 'PDF oficial nao encontrado.' }, { status: 404, headers });
    }
    const pdf = invoiceMetadata(invoice.metadados).pdfOficial as OfficialPdfMetadata;
    const bytes = await readOfficialPdf(invoice.id, pdf);
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"` } });
  } catch (error) {
    if (error instanceof InspectionDocumentError || error instanceof OfficialInvoiceError) {
      return NextResponse.json({ error: error.status >= 500 ? 'PDF oficial temporariamente indisponivel. Contacte a oficina.' : error.message }, { status: error.status, headers });
    }
    console.error('[portal/faturas/oficial]', error);
    return NextResponse.json({ error: 'Nao foi possivel descarregar o PDF oficial.' }, { status: 500, headers });
  }
}
