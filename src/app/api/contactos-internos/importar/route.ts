import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logAuditoria } from "@/lib/auditoria";
import { resolveContactoStationCode } from "@/lib/contactos-internos-stations";

export const dynamic = 'force-dynamic';

type ContactoInternoCreateResult = { id: number };

type ContactoInternoTransactionalDelegate = {
  deleteMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<ContactoInternoCreateResult>;
};

type ImportRequestBody = {
  replaceExisting?: boolean;
  pdfPath?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { 
      CONTACTOS_INTERNOS_PDF_SOURCE, 
      DEFAULT_CONTACTOS_INTERNOS_PDF_PATH, 
      loadContactosInternosFromPdf,
    } = await import("@/lib/contactos-internos-import");
    
    type ImportedContactoInterno = {
      categoria: string;
      empresa: string | null;
      localizacao: string | null;
      nome: string;
      email: string | null;
      telemovel: string | null;
      telefoneFixo: string | null;
      extensaoNos: string | null;
      extensaoVodafone: string | null;
      observacoes: string | null;
      ativo: boolean;
      fonte: string;
    };
    const body = (await req.json().catch(() => ({}))) as ImportRequestBody;
    const replaceExisting = body?.replaceExisting !== false;
    const pdfPath = typeof body?.pdfPath === "string" && body.pdfPath.trim()
      ? body.pdfPath.trim()
      : DEFAULT_CONTACTOS_INTERNOS_PDF_PATH;

    const contactos = await loadContactosInternosFromPdf(pdfPath);
    if (!contactos.length) {
      return NextResponse.json(
        { error: "Não foi possível extrair contactos do PDF indicado." },
        { status: 400 }
      );
    }

    // Liga cada contacto à estação correta a partir da localização do PDF.
    const stationCodes = Array.from(
      new Set(
        contactos
          .map((contacto: ImportedContactoInterno) => resolveContactoStationCode(contacto.localizacao))
          .filter((code: string | null): code is string => Boolean(code))
      )
    );
    const stations = stationCodes.length
      ? await prisma.serviceStation.findMany({
          where: { codigo: { in: stationCodes } },
          select: { id: true, codigo: true },
        })
      : [];
    const stationIdByCode = new Map(stations.map((station) => [station.codigo, station.id]));

    const importedIds = await prisma.$transaction(async (tx) => {
      const contactoInternoModel = (tx as unknown as { contactoInterno: ContactoInternoTransactionalDelegate }).contactoInterno;

      if (replaceExisting) {
        await contactoInternoModel.deleteMany({ where: { fonte: CONTACTOS_INTERNOS_PDF_SOURCE } });
      }

      const created = await Promise.all(
        contactos.map((contacto: ImportedContactoInterno) => {
          const stationCode = resolveContactoStationCode(contacto.localizacao);
          const serviceStationId = stationCode ? stationIdByCode.get(stationCode) ?? null : null;
          return contactoInternoModel.create({
            data: { ...contacto, serviceStationId },
            select: { id: true },
          });
        })
      );

      return created.map((item: { id: number }) => item.id);
    });

    await Promise.all(
      importedIds.map((id: number) =>
        logAuditoria({
          tabela: "ContactoInterno",
          tipoOperacao: "CREATE",
          idRegisto: id,
          descricao: `Importação do PDF de contactos internos (${CONTACTOS_INTERNOS_PDF_SOURCE})`,
        })
      )
    );

    return NextResponse.json({
      success: true,
      imported: contactos.length,
      replaceExisting,
      pdfPath,
      source: CONTACTOS_INTERNOS_PDF_SOURCE,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao importar contactos internos a partir do PDF.";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
