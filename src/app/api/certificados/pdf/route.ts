import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { buildCertificatePdfBuffer, certificatePdfFileName } from "@/lib/certificate-pdf";
import type { InspectionCertificateInput } from "@/lib/inspection-certificate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as InspectionCertificateInput | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dados do certificado inválidos." }, { status: 400 });
    }

    const buffer = buildCertificatePdfBuffer(body);
    const fileName = certificatePdfFileName(body);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[POST /api/certificados/pdf]", error);
    return NextResponse.json({ error: "Não foi possível gerar o certificado em PDF." }, { status: 500 });
  }
}
