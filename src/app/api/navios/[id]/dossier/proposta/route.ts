import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

function getEstimatedPrice(tipo: string, capacityOrSize: string | number): number | string {
  const cleanTipo = String(tipo).trim().toLowerCase();
  if (cleanTipo.includes("jangada")) {
    const cap = parseInt(String(capacityOrSize)) || 6;
    if (cap <= 4) return 150.00;
    if (cap <= 6) return 180.00;
    if (cap <= 8) return 225.00;
    if (cap <= 10) return 260.00;
    if (cap <= 12) return 310.00;
    return 390.00;
  }
  if (cleanTipo.includes("colete")) {
    return 35.00;
  }
  if (cleanTipo.includes("epirb") || cleanTipo.includes("radiobaliza")) {
    return 85.00;
  }
  return "A ORÇAR";
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!id) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const navioDb = await prisma.navio.findUnique({
      where: { id },
      include: {
        cliente: true
      }
    });

    if (!navioDb) return NextResponse.json({ error: "Navio não encontrado" }, { status: 404 });

    const jangadas = await prisma.jangada.findMany({ where: { shipId: id } });
    const coletes = await prisma.colete.findMany({ where: { shipId: id } });
    const epirbs = await prisma.epirb.findMany({ where: { shipId: id } });

    const navio = {
      ...navioDb,
      jangadas,
      coletes,
      epirbs
    };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Proposta de Manutenção");

    // Configuração de colunas
    worksheet.columns = [
      { header: "Tipo Equipamento", key: "tipo", width: 22 },
      { header: "Número Série", key: "serial", width: 18 },
      { header: "Marca / Modelo", key: "modelo", width: 25 },
      { header: "Capacidade / Tam", key: "capacidade", width: 18 },
      { header: "Próxima Inspeção", key: "validade", width: 18 },
      { header: "Estado", key: "estado", width: 18 },
      { header: "Ação Recomendada", key: "acao", width: 28 },
      { header: "Preço Unitário (EUR)", key: "preco", width: 20 },
    ];

    // Estilo do cabeçalho principal
    worksheet.mergeCells("A1:H1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "OREY TECNICA- SERVIÇOS NAVAIS, LDA - PROPOSTA COMERCIAL DE MANUTENÇÃO";
    titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E3A8A" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 40;

    // Info do Navio e Cliente
    worksheet.mergeCells("A3:D3");
    worksheet.getCell("A3").value = `Navio: ${navio.nome} (${navio.matricula || "-"})`;
    worksheet.getCell("A3").font = { name: "Arial", size: 11, bold: true };

    worksheet.mergeCells("E3:H3");
    worksheet.getCell("E3").value = `Cliente: ${navio.cliente?.nome || "Particular"}`;
    worksheet.getCell("E3").font = { name: "Arial", size: 11, bold: true };

    worksheet.mergeCells("A4:H4");
    worksheet.getCell("A4").value = `Data de Emissão: ${new Date().toLocaleDateString("pt-PT")}`;
    worksheet.getCell("A4").font = { name: "Arial", size: 10, italic: true };

    // Linha de Cabeçalho da Tabela (Fica na linha 6)
    const headerRow = worksheet.getRow(6);
    headerRow.values = [
      "Tipo Equipamento",
      "Número Série",
      "Marca / Modelo",
      "Capacidade / Tam",
      "Próxima Inspeção",
      "Estado",
      "Ação Recomendada",
      "Preço Unitário (EUR)"
    ];
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "334155" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });

    type ProposalItem = {
      tipo: string;
      serial: string;
      modelo: string;
      capacidade: string;
      validade: string;
      estado: string;
      acao: string;
    };
    const items: ProposalItem[] = [];

    // Agregar equipamentos
    navio.jangadas.forEach((j) => {
      const isExpired = j.dataProxInspecao ? new Date(j.dataProxInspecao).getTime() < Date.now() : false;
      const isDueSoon = j.dataProxInspecao ? (new Date(j.dataProxInspecao).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000 : false;
      
      items.push({
        tipo: "Jangada Salva-vidas",
        serial: j.serial,
        modelo: `${j.brand || ""} ${j.model || ""}`,
        capacidade: j.capacity ? `${j.capacity}P` : "-",
        validade: j.dataProxInspecao ? new Date(j.dataProxInspecao).toLocaleDateString("pt-PT") : "-",
        estado: isExpired ? "Expirado" : isDueSoon ? "A expirar (30d)" : "Ok",
        acao: isExpired || isDueSoon ? "Inspeção anual obrigatória" : "Manter em serviço",
      });
    });

    navio.coletes.forEach((c) => {
      const isExpired = c.dataProxInspecao ? new Date(c.dataProxInspecao).getTime() < Date.now() : false;
      const isDueSoon = c.dataProxInspecao ? (new Date(c.dataProxInspecao).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000 : false;

      items.push({
        tipo: "Colete Salva-vidas",
        serial: c.serial,
        modelo: `${c.marca || ""} ${c.modelo || ""}`,
        capacidade: c.tamanho || "-",
        validade: c.dataProxInspecao ? new Date(c.dataProxInspecao).toLocaleDateString("pt-PT") : "-",
        estado: isExpired ? "Expirado" : isDueSoon ? "A expirar (30d)" : "Ok",
        acao: isExpired || isDueSoon ? "Inspeção de colete" : "Manter em serviço",
      });
    });

    navio.epirbs.forEach((e) => {
      const isExpired = e.dataProxInspecao ? new Date(e.dataProxInspecao).getTime() < Date.now() : false;
      const isDueSoon = e.dataProxInspecao ? (new Date(e.dataProxInspecao).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000 : false;

      items.push({
        tipo: "Radiobaliza EPIRB",
        serial: e.serial,
        modelo: `${e.marca || ""} ${e.modelo || ""}`,
        capacidade: e.tipo || "-",
        validade: e.dataProxInspecao ? new Date(e.dataProxInspecao).toLocaleDateString("pt-PT") : "-",
        estado: isExpired ? "Expirado" : isDueSoon ? "A expirar (30d)" : "Ok",
        acao: isExpired || isDueSoon ? "Inspeção e teste de bateria" : "Manter em serviço",
      });
    });

    // Escrever dados na tabela
    let rowIdx = 7;
    items.forEach((item) => {
      const row = worksheet.getRow(rowIdx);
      const estPrice = getEstimatedPrice(item.tipo, item.capacidade);
      row.values = [
        item.tipo,
        item.serial,
        item.modelo,
        item.capacidade,
        item.validade,
        item.estado,
        item.acao,
        estPrice
      ];
      row.height = 20;

      // Formatar a célula de Preço se for numérica
      const priceCell = row.getCell(8);
      if (typeof estPrice === "number") {
        priceCell.numFmt = '"€"#,##0.00';
        priceCell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        priceCell.alignment = { horizontal: "left", vertical: "middle" };
      }

      // Colorir a célula de Estado consoante a gravidade
      const statusCell = row.getCell(6);
      if (item.estado === "Expirado") {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEE2E2" } }; // Light red
        statusCell.font = { color: { argb: "B91C1C" }, bold: true };
      } else if (item.estado.startsWith("A expirar")) {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF3C7" } }; // Light yellow
        statusCell.font = { color: { argb: "D97706" }, bold: true };
      } else {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D1FAE5" } }; // Light green
        statusCell.font = { color: { argb: "047857" } };
      }

      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "E2E8F0" } },
          bottom: { style: "thin", color: { argb: "E2E8F0" } },
          left: { style: "thin", color: { argb: "E2E8F0" } },
          right: { style: "thin", color: { argb: "E2E8F0" } },
        };
      });

      rowIdx++;
    });

    // Rodapé de Termos
    rowIdx += 2;
    worksheet.mergeCells(`A${rowIdx}:H${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = "Termos e Condições Gerais:";
    worksheet.getCell(`A${rowIdx}`).font = { name: "Arial", size: 10, bold: true };
    
    rowIdx++;
    worksheet.mergeCells(`A${rowIdx}:H${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = "1. Os valores unitários acima descritos estão sujeitos a confirmação física dos equipamentos em oficina.";
    worksheet.getCell(`A${rowIdx}`).font = { name: "Arial", size: 9, color: { argb: "475569" } };

    rowIdx++;
    worksheet.mergeCells(`A${rowIdx}:H${rowIdx}`);
    worksheet.getCell(`A${rowIdx}`).value = "2. Prazo de validade desta proposta: 30 dias a contar da data de emissão.";
    worksheet.getCell(`A${rowIdx}`).font = { name: "Arial", size: 9, color: { argb: "475569" } };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Proposta Comercial - Navio ${navio.nome}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar proposta comercial:", error);
    return NextResponse.json(
      { error: "Não foi possível gerar a proposta comercial." },
      { status: 500 }
    );
  }
}
