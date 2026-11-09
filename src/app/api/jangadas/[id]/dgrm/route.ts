import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const jangadaId = parseInt(idStr, 10);
    if (isNaN(jangadaId)) {
      return NextResponse.json({ error: "ID de jangada inválido." }, { status: 400 });
    }

    // Fetch liferaft with active articles and active certificate (if any)
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
      include: {
        artigos: {
          where: { inspecaoId: null },
        },
        serviceStation: true,
      },
    });

    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    // Fetch the linked ship (if any)
    const ship = jangada.shipId
      ? await prisma.navio.findUnique({ where: { id: jangada.shipId } })
      : null;

    // Fetch the latest inspection
    const latestInspection = await prisma.inspecao.findFirst({
      where: { jangadaId },
      orderBy: { dataInspecao: "desc" },
    });

    const dgrmPayload = {
      formatoVersao: "1.0",
      emitidoEm: new Date().toISOString(),
      estacaoServico: {
        codigo: jangada.serviceStation?.codigo || "AZORES-01",
        nome: jangada.serviceStation?.nome || "Orey Tecnica- Serviços Navais, Lda",
        territorio: jangada.serviceStation?.territorioTipo || "AZORES",
      },
      navio: {
        nome: ship?.nome || jangada.shipNameManual || "N/D",
        imo: ship?.imo || "N/D",
        matricula: ship?.matricula || "N/D",
        bandeira: ship?.bandeira || "PT",
        sinalChamada: ship?.callSignal || "N/D",
        armador: ship?.proprietario || "N/D",
      },
      equipamento: {
        tipo: "Jangada Salva-vidas",
        numeroSerie: jangada.serial,
        fabricante: jangada.brand,
        modelo: jangada.model,
        capacidadePessoas: jangada.capacity,
        tipoDisparo: jangada.launchType || "Graved-Drop",
        tipoPack: jangada.packType || "SOLAS A",
        dataFabrico: jangada.dataFabrico,
        numeroObra: jangada.numeroObra || "N/D",
      },
      inspecao: {
        numeroCertificado: jangada.ultimoCertificadoNumero || latestInspection?.certificadoNumero || "N/D",
        dataInspecao: jangada.dataInspecao || latestInspection?.dataInspecao || "N/D",
        dataProxInspecao: jangada.dataProxInspecao || latestInspection?.dataProxInspecao || "N/D",
        estadoGeral: latestInspection?.status || "Aprovado",
        tecnicoResponsavel: latestInspection?.status === "Concluída" ? "Técnico Certificado" : "N/D",
      },
      elementosSeguranca: {
        hru: {
          aplicavel: jangada.hruReferencia ? "Sim" : "Não",
          referencia: jangada.hruReferencia || "N/D",
          dataInstalacao: jangada.hruDataInstalacao || "N/D",
          validade: jangada.hruValidade || "N/D",
        },
        cilindro: {
          numeroSerie: jangada.cylinderSerial || "N/D",
          taraKg: jangada.cylinderTara ? parseFloat(jangada.cylinderTara) || 0 : 0,
          pesoBrutoKg: jangada.cylinderPesoBruto ? parseFloat(jangada.cylinderPesoBruto) || 0 : 0,
          cargaCo2Kg: jangada.cylinderCo2 ? parseFloat(jangada.cylinderCo2) || 0 : 0,
          cargaN2Kg: jangada.cylinderN2 ? parseFloat(jangada.cylinderN2) || 0 : 0,
          dataUltimoTeste: jangada.cylinderDataTeste || "N/D",
          dataProximoTeste: jangada.cylinderDataProxTeste || "N/D",
          sistemaDisparo: jangada.cylinderSistema || "Manual/Automático",
        },
        reflectorRadar: {
          presente: jangada.radarReflector ? "Sim" : "Não",
          validade: jangada.radarReflectorValidade || "N/D",
        },
      },
      testesRealizados: {
        testeWP: jangada.testeWP || "N/D",
        testeNAP: jangada.testeNAP || "N/D",
        testeFS: jangada.testeFS || "N/D",
        testeGI: jangada.testeGI || "N/D",
        testeDL: jangada.testeDL || "N/D",
      },
      artigosAtivos: jangada.artigos.map((art) => ({
        referencia: art.referencia || "N/D",
        descricao: art.name,
        quantidade: art.quantidade,
        validade: art.validade ? art.validade.toISOString().slice(0, 10) : "N/D",
      })),
    };

    const filename = `DGRM_${jangada.serial}_${jangada.ultimoCertificadoNumero || "DECL"}.json`.replace(/[^a-zA-Z0-9_.-]/g, "_");

    return new Response(JSON.stringify(dgrmPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting DGRM JSON:", error);
    return NextResponse.json({ error: "Erro ao gerar exportação DGRM." }, { status: 500 });
  }
}
