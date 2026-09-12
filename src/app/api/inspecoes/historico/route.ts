import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeArtigoValidade } from "@/lib/date-utils";
import { Prisma } from "@prisma/client";
import { writeInspectionSnapshot } from "@/lib/inspection-snapshots";

async function findCertificateConflict(certificate: string, excludeInspectionId?: number | null) {
  const excludeCondition = excludeInspectionId && Number.isFinite(excludeInspectionId)
    ? Prisma.sql`AND id != ${excludeInspectionId}`
    : Prisma.empty;

  const inspectionMatch = await prisma.$queryRaw<Array<{ id: number; jangadaId: number | null; jangadaSerial: string | null }>>`
    SELECT id, "jangadaId", "jangadaSerial" FROM "Inspecao"
    WHERE LOWER("certificadoNumero") = LOWER(${certificate})
    ${excludeCondition}
    LIMIT 1`;

  if (inspectionMatch[0]) {
    return { type: "inspection", match: inspectionMatch[0] };
  }

  const raftMatch = await prisma.$queryRaw<Array<{ id: number; serial: string | null }>>`
    SELECT id, serial FROM "Jangada"
    WHERE LOWER("ultimoCertificadoNumero") = LOWER(${certificate})
    LIMIT 1`;

  if (raftMatch[0]) {
    return { type: "raft", match: raftMatch[0] };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const {
      jangadaId,
      certificadoNumero,
      dataInspecao,
      dataProxInspecao,
      status,
      hru,
      cylinder,
      testes,
      artigos,
    } = payload;

    if (!jangadaId || !certificadoNumero || !dataInspecao) {
      return NextResponse.json(
        { error: "ID da jangada, número de certificado e data de inspeção são obrigatórios." },
        { status: 400 }
      );
    }

    const cleanCertNo = String(certificadoNumero).trim().toUpperCase();

    // Check if certificate already exists in inspections or raft records
    const conflict = await findCertificateConflict(cleanCertNo);
    if (conflict) {
      const message = conflict.type === "inspection"
        ? `Já existe uma inspeção registada com o certificado ${cleanCertNo}.`
        : `O número de certificado ${cleanCertNo} já está associado a uma jangada.`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Fetch the liferaft details to build a complete snapshot
    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
    });

    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    // Begin database transaction to save historical inspection and articles
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Inspecao record
      const inspecao = await tx.inspecao.create({
        data: {
          certificadoNumero: cleanCertNo,
          navioNome: jangada.shipNameManual || "Sem Navio",
          navioId: jangada.shipId,
          jangadaId: jangada.id,
          jangadaSerial: jangada.serial,
          dataInspecao: String(dataInspecao),
          dataProxInspecao: dataProxInspecao ? String(dataProxInspecao) : null,
          status: status || "Concluída",
          sourceFile: "checklist_quadro_historico_manual",
          
          numeroObra: payload.numeroObra || jangada.numeroObra || null,
          testeWP: testes?.testeWP || null,
          testeNAP: testes?.testeNAP || null,
          testeFS: testes?.testeFS || null,
          testeGI: testes?.testeGI || null,
          testeDL: testes?.testeDL || null,
          testeWPUnidadePressao: testes?.testeWPUnidadePressao || "hpa",
          testeWPInstrumento: testes?.testeWPInstrumento || null,
          testeWPHoraInicio: testes?.testeWPHoraInicio || null,
          testeWPHoraFim: testes?.testeWPHoraFim || null,
          testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || null,
          testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || null,
          testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || null,
          testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || null,
          testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || null,
          testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || null,
          testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || null,
          testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || null,
          testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || null,
          testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || null,
          oficinaTemperatura: testes?.oficinaTemperatura || null,
          oficinaHumidade: testes?.oficinaHumidade || null,
        },
      });

      // 2. Create the associated ArtigoJangada records for this historical inspection
      const createdArtigos = [];
      if (Array.isArray(artigos)) {
        for (const art of artigos) {
          if (!art.name) continue;
          const created = await tx.artigoJangada.create({
            data: {
              jangadaId: jangada.id,
              inspecaoId: inspecao.id,
              name: String(art.name),
              referencia: art.referencia ? String(art.referencia) : null,
              quantidade: parseInt(art.quantidade, 10) || 1,
              validade: normalizeArtigoValidade(art.validade),
            },
          });
          createdArtigos.push(created);
        }
      }

      // 3. Se esta inspeção for a mais recente ou se for igual/mais recente que a data atual da jangada, atualizamos a jangada com os dados da inspeção!
      const mustUpdateRaft = !jangada.dataInspecao || new Date(dataInspecao) >= new Date(jangada.dataInspecao);
      if (mustUpdateRaft) {
        await tx.jangada.update({
          where: { id: jangada.id },
          data: {
            ultimoCertificadoNumero: cleanCertNo,
            dataInspecao: String(dataInspecao),
            dataProxInspecao: dataProxInspecao ? String(dataProxInspecao) : null,
            numeroObra: payload.numeroObra || jangada.numeroObra || null,
            
            // Dados do Cilindro
            cylinderSerial: cylinder?.serial || jangada.cylinderSerial || null,
            cylinderTara: cylinder?.tara || jangada.cylinderTara || null,
            cylinderPesoBruto: cylinder?.pesoBruto || jangada.cylinderPesoBruto || null,
            cylinderCo2: cylinder?.co2 || jangada.cylinderCo2 || null,
            cylinderN2: cylinder?.n2 || jangada.cylinderN2 || null,
            cylinderDataTeste: cylinder?.dataTeste || jangada.cylinderDataTeste || null,
            cylinderDataProxTeste: cylinder?.dataProxTeste || jangada.cylinderDataProxTeste || null,
            cylinderSistema: cylinder?.sistema || jangada.cylinderSistema || null,
            
            // Dados do HRU
            hruReferencia: hru?.referencia || jangada.hruReferencia || null,
            hruDataInstalacao: hru?.dataInstalacao || jangada.hruDataInstalacao || null,
            hruValidade: hru?.validade || jangada.hruValidade || null,
            
            // Dados de testes WP
            testeWP: testes?.testeWP || jangada.testeWP || null,
            testeNAP: testes?.testeNAP || jangada.testeNAP || null,
            testeFS: testes?.testeFS || jangada.testeFS || null,
            testeGI: testes?.testeGI || jangada.testeGI || null,
            testeDL: testes?.testeDL || jangada.testeDL || null,
            testeWPUnidadePressao: testes?.testeWPUnidadePressao || jangada.testeWPUnidadePressao || "hpa",
            testeWPInstrumento: testes?.testeWPInstrumento || jangada.testeWPInstrumento || null,
            testeWPHoraInicio: testes?.testeWPHoraInicio || jangada.testeWPHoraInicio || null,
            testeWPHoraFim: testes?.testeWPHoraFim || jangada.testeWPHoraFim || null,
            testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || jangada.testeWPTemperaturaInicial || null,
            testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || jangada.testeWPTemperaturaFinal || null,
            testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || jangada.testeWPPressaoAtmosfericaInicial || null,
            testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || jangada.testeWPPressaoAtmosfericaFinal || null,
            testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || jangada.testeWPCamaraSuperiorInicio || null,
            testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || jangada.testeWPCamaraSuperiorFim || null,
            testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || jangada.testeWPCamaraSuperiorQueda || null,
            testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || jangada.testeWPCamaraInferiorInicio || null,
            testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || jangada.testeWPCamaraInferiorFim || null,
            testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || jangada.testeWPCamaraInferiorQueda || null,
            oficinaTemperatura: testes?.oficinaTemperatura || jangada.oficinaTemperatura || null,
            oficinaHumidade: testes?.oficinaHumidade || jangada.oficinaHumidade || null,
          }
        });
      }

      return { inspecao, createdArtigos };
    });

    // 3. Build a complete snapshot representing the state of the liferaft at the time of this historical inspection
    const snapshotData = {
      ...jangada,
      ultimoCertificadoNumero: cleanCertNo,
      dataInspecao,
      dataProxInspecao,
      
      // Override cylinder values for this historical inspection
      cylinderSerial: cylinder?.serial || jangada.cylinderSerial,
      cylinderTara: cylinder?.tara || jangada.cylinderTara,
      cylinderPesoBruto: cylinder?.pesoBruto || jangada.cylinderPesoBruto,
      cylinderCo2: cylinder?.co2 || jangada.cylinderCo2,
      cylinderN2: cylinder?.n2 || jangada.cylinderN2,
      cylinderDataTeste: cylinder?.dataTeste || jangada.cylinderDataTeste,
      cylinderDataProxTeste: cylinder?.dataProxTeste || jangada.cylinderDataProxTeste,
      cylinderSistema: cylinder?.sistema || jangada.cylinderSistema,

      // Override HRU values
      hruReferencia: hru?.referencia || jangada.hruReferencia,
      hruDataInstalacao: hru?.dataInstalacao || jangada.hruDataInstalacao,
      hruValidade: hru?.validade || jangada.hruValidade,

      // Override test values
      testeWP: testes?.testeWP || jangada.testeWP || "N/D",
      testeNAP: testes?.testeNAP || jangada.testeNAP || "N/D",
      testeFS: testes?.testeFS || jangada.testeFS || "N/D",
      testeGI: testes?.testeGI || jangada.testeGI || "N/D",
      testeDL: testes?.testeDL || jangada.testeDL || "N/D",

      testeTemperaturaCamaraSuperior: testes?.testeTemperaturaCamaraSuperior || "",
      testeTemperaturaCamaraInferior: testes?.testeTemperaturaCamaraInferior || "",
      testePressaoCamaraSuperior: testes?.testePressaoCamaraSuperior || "",
      testePressaoCamaraInferior: testes?.testePressaoCamaraInferior || "",
      testeWPUnidadePressao: testes?.testeWPUnidadePressao || "hpa",
      testeWPInstrumento: testes?.testeWPInstrumento || "",
      testeWPHoraInicio: testes?.testeWPHoraInicio || "",
      testeWPHoraFim: testes?.testeWPHoraFim || "",
      testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || "",
      testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || "",
      testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || "",
      testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || "",
      testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || "",
      testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || "",
      testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || "",
      testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || "",
      testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || "",
      testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || "",

      oficinaTemperatura: testes?.oficinaTemperatura || "",
      oficinaHumidade: testes?.oficinaHumidade || "",

      // Add the active articles during this inspection
      artigos: result.createdArtigos,
    };

    // Save the snapshot file so the historical view renders perfectly
    await writeInspectionSnapshot(cleanCertNo, snapshotData);

    return NextResponse.json({
      success: true,
      inspecaoId: result.inspecao.id,
      certificadoNumero: cleanCertNo,
    });
  } catch (error) {
    console.error("Error creating historical inspection:", error);
    return NextResponse.json(
      { error: "Erro interno ao registar inspeção histórica." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json();
    const {
      inspecaoId,
      jangadaId,
      certificadoNumero,
      dataInspecao,
      dataProxInspecao,
      status,
      responsavel,
      hru,
      cylinder,
      testes,
      artigos,
    } = payload;

    if (!inspecaoId || !jangadaId || !certificadoNumero || !dataInspecao) {
      return NextResponse.json(
        { error: "ID da inspeção, ID da jangada, número de certificado e data de inspeção são obrigatórios." },
        { status: 400 }
      );
    }

    const cleanCertNo = String(certificadoNumero).trim().toUpperCase();

    // Check if certificate already exists in inspections or raft records (excluding current inspection)
    const conflict = await findCertificateConflict(cleanCertNo, Number(inspecaoId));
    if (conflict) {
      const message = conflict.type === "inspection"
        ? `Já existe outra inspeção registada com o certificado ${cleanCertNo}.`
        : `O número de certificado ${cleanCertNo} já está associado a uma jangada.`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // Fetch original inspection to compare
    const originalInspecao = await prisma.inspecao.findUnique({
      where: { id: Number(inspecaoId) },
    });

    if (!originalInspecao) {
      return NextResponse.json({ error: "Inspeção não encontrada." }, { status: 404 });
    }

    const jangada = await prisma.jangada.findUnique({
      where: { id: jangadaId },
    });

    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete existing associated articles for this inspection
      await tx.artigoJangada.deleteMany({
        where: { inspecaoId: Number(inspecaoId) },
      });

      // 2. Update Inspecao record
      const txInspecao = tx.inspecao as unknown as {
        update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<{ id: number }>;
      };
      const inspecao = await txInspecao.update({
        where: { id: Number(inspecaoId) },
        data: {
          certificadoNumero: cleanCertNo,
          dataInspecao: String(dataInspecao),
          dataProxInspecao: dataProxInspecao ? String(dataProxInspecao) : null,
          status: status || "Concluída",
          responsavel: responsavel || "Júlio Correia",
          
          numeroObra: payload.numeroObra || null,
          testeWP: testes?.testeWP || null,
          testeNAP: testes?.testeNAP || null,
          testeFS: testes?.testeFS || null,
          testeGI: testes?.testeGI || null,
          testeDL: testes?.testeDL || null,
          testeWPUnidadePressao: testes?.testeWPUnidadePressao || "hpa",
          testeWPInstrumento: testes?.testeWPInstrumento || null,
          testeWPHoraInicio: testes?.testeWPHoraInicio || null,
          testeWPHoraFim: testes?.testeWPHoraFim || null,
          testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || null,
          testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || null,
          testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || null,
          testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || null,
          testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || null,
          testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || null,
          testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || null,
          testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || null,
          testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || null,
          testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || null,
          oficinaTemperatura: testes?.oficinaTemperatura || null,
          oficinaHumidade: testes?.oficinaHumidade || null,
        },
      });

      // 3. Create the updated associated ArtigoJangada records
      const createdArtigos = [];
      if (Array.isArray(artigos)) {
        for (const art of artigos) {
          if (!art.name) continue;
          const created = await tx.artigoJangada.create({
            data: {
              jangadaId: jangada.id,
              inspecaoId: inspecao.id,
              name: String(art.name),
              referencia: art.referencia ? String(art.referencia) : null,
              quantidade: parseInt(art.quantidade, 10) || 1,
              validade: normalizeArtigoValidade(art.validade),
            },
          });
          createdArtigos.push(created);
        }
      }

      // 4. Update the main Jangada record if this was the last inspection
      const mustUpdateRaft = jangada.ultimoCertificadoNumero === originalInspecao.certificadoNumero || !jangada.dataInspecao || new Date(dataInspecao) >= new Date(jangada.dataInspecao);
      if (mustUpdateRaft) {
        await tx.jangada.update({
          where: { id: jangada.id },
          data: {
            ultimoCertificadoNumero: cleanCertNo,
            dataInspecao: String(dataInspecao),
            dataProxInspecao: dataProxInspecao ? String(dataProxInspecao) : null,
            numeroObra: payload.numeroObra || null,
            
            // Dados do Cilindro
            cylinderSerial: cylinder?.serial || null,
            cylinderTara: cylinder?.tara || null,
            cylinderPesoBruto: cylinder?.pesoBruto || null,
            cylinderCo2: cylinder?.co2 || null,
            cylinderN2: cylinder?.n2 || null,
            cylinderDataTeste: cylinder?.dataTeste || null,
            cylinderDataProxTeste: cylinder?.dataProxTeste || null,
            cylinderSistema: cylinder?.sistema || null,
            
            // Dados do HRU
            hruReferencia: hru?.referencia || null,
            hruDataInstalacao: hru?.dataInstalacao || null,
            hruValidade: hru?.validade || null,
            
            // Dados de testes WP
            testeWP: testes?.testeWP || null,
            testeNAP: testes?.testeNAP || null,
            testeFS: testes?.testeFS || null,
            testeGI: testes?.testeGI || null,
            testeDL: testes?.testeDL || null,
            testeWPUnidadePressao: testes?.testeWPUnidadePressao || "hpa",
            testeWPInstrumento: testes?.testeWPInstrumento || null,
            testeWPHoraInicio: testes?.testeWPHoraInicio || null,
            testeWPHoraFim: testes?.testeWPHoraFim || null,
            testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || null,
            testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || null,
            testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || null,
            testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || null,
            testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || null,
            testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || null,
            testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || null,
            testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || null,
            testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || null,
            testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || null,
            oficinaTemperatura: testes?.oficinaTemperatura || null,
            oficinaHumidade: testes?.oficinaHumidade || null,
          }
        });
      }

      return { inspecao, createdArtigos };
    });

    // 5. Re-write the snapshot file
    const snapshotData = {
      ...jangada,
      ultimoCertificadoNumero: cleanCertNo,
      dataInspecao,
      dataProxInspecao,
      numeroObra: payload.numeroObra || null,
      
      cylinderSerial: cylinder?.serial || null,
      cylinderTara: cylinder?.tara || null,
      cylinderPesoBruto: cylinder?.pesoBruto || null,
      cylinderCo2: cylinder?.co2 || null,
      cylinderN2: cylinder?.n2 || null,
      cylinderDataTeste: cylinder?.dataTeste || null,
      cylinderDataProxTeste: cylinder?.dataProxTeste || null,
      cylinderSistema: cylinder?.sistema || null,

      hruReferencia: hru?.referencia || null,
      hruDataInstalacao: hru?.dataInstalacao || null,
      hruValidade: hru?.validade || null,

      testeWP: testes?.testeWP || "N/D",
      testeNAP: testes?.testeNAP || "N/D",
      testeFS: testes?.testeFS || "N/D",
      testeGI: testes?.testeGI || "N/D",
      testeDL: testes?.testeDL || "N/D",

      testeWPUnidadePressao: testes?.testeWPUnidadePressao || "hpa",
      testeWPInstrumento: testes?.testeWPInstrumento || "",
      testeWPHoraInicio: testes?.testeWPHoraInicio || "",
      testeWPHoraFim: testes?.testeWPHoraFim || "",
      testeWPTemperaturaInicial: testes?.testeWPTemperaturaInicial || "",
      testeWPTemperaturaFinal: testes?.testeWPTemperaturaFinal || "",
      testeWPPressaoAtmosfericaInicial: testes?.testeWPPressaoAtmosfericaInicial || "",
      testeWPPressaoAtmosfericaFinal: testes?.testeWPPressaoAtmosfericaFinal || "",
      testeWPCamaraSuperiorInicio: testes?.testeWPCamaraSuperiorInicio || "",
      testeWPCamaraSuperiorFim: testes?.testeWPCamaraSuperiorFim || "",
      testeWPCamaraSuperiorQueda: testes?.testeWPCamaraSuperiorQueda || "",
      testeWPCamaraInferiorInicio: testes?.testeWPCamaraInferiorInicio || "",
      testeWPCamaraInferiorFim: testes?.testeWPCamaraInferiorFim || "",
      testeWPCamaraInferiorQueda: testes?.testeWPCamaraInferiorQueda || "",

      oficinaTemperatura: testes?.oficinaTemperatura || "",
      oficinaHumidade: testes?.oficinaHumidade || "",

      artigos: result.createdArtigos,
    };

    await writeInspectionSnapshot(cleanCertNo, snapshotData);

    return NextResponse.json({
      success: true,
      inspecaoId: result.inspecao.id,
      certificadoNumero: cleanCertNo,
    });
  } catch (error) {
    console.error("Error updating historical inspection:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar inspeção histórica." },
      { status: 500 }
    );
  }
}
