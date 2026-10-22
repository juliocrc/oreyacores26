import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ParsedSparesRow {
  partDescription: string;
  product: string;
  additionalNotes: string;
  minReq: number;
  stationStock: number;
  toBeOrdered: number;
  navision: string;
  descNavi: string;
  applicableModels?: string;
}

interface ParsedDSBRow {
  partNumber: string;
  product: string;
  raftType: string;
  raftType2: string;
  ytd: number;
  value: number;
  minReq: number;
  stationStock: number;
  orderValue: number;
  toBeOrdered: number;
  additionalComments: string;
  navision: string;
  descricao: string;
  applicableModels?: string;
}

async function parseRFDFile(buffer: Buffer): Promise<ParsedSparesRow[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Sheet1"];
  if (!sheet) throw new Error("Sheet1 not found in RFD file");

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as (string | number)[][];
  
  // Find header row (Row 6 in 0-indexed)
  const headerRowIndex = 6;
  const header = (data[headerRowIndex] as (string | number)[]).map(String);
  
  const columnMap = {
    partDescription: header.indexOf("Part Description"),
    product: header.indexOf("Product "),
    additionalNotes: header.indexOf("Addtional Notes"),
    minReq: header.indexOf("Min req"),
    stationStock: header.indexOf("Station stock"),
    toBeOrdered: header.indexOf("To Be Ordered"),
    navision: header.indexOf("NAVISION"),
    descNavi: header.indexOf("desc navi"),
  };

  const rows: ParsedSparesRow[] = [];
  
  for (let i = 7; i < data.length; i++) {
    const row = data[i] as (string | number)[];
    if (!row || row.length === 0) continue;
    
    const partDescription = String(row[columnMap.partDescription] || "").trim();
    if (!partDescription) continue;
    
    const product = String(row[columnMap.product] || "").trim();
    const additionalNotes = String(row[columnMap.additionalNotes] || "").trim();
    const minReq = parseFloat(String(row[columnMap.minReq] || "0")) || 0;
    const stationStock = parseFloat(String(row[columnMap.stationStock] || "0")) || 0;
    const toBeOrdered = parseFloat(String(row[columnMap.toBeOrdered] || "0")) || 0;
    const navision = String(row[columnMap.navision] || "").trim();
    const descNavi = String(row[columnMap.descNavi] || "").trim();
    
    rows.push({
      partDescription,
      product,
      additionalNotes,
      minReq,
      stationStock,
      toBeOrdered,
      navision,
      descNavi,
    });
  }
  
  return rows;
}

async function parseDSBFile(buffer: Buffer): Promise<ParsedDSBRow[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Sheet1"];
  if (!sheet) throw new Error("Sheet1 not found in DSB file");

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as (string | number)[][];
  
  // Find header row (Row 8 in 0-indexed)
  const headerRowIndex = 8;
  const header = (data[headerRowIndex] as (string | number)[]).map(String);
  
  const columnMap = {
    partNumber: header.indexOf("Part Number"),
    product: header.indexOf("Product"),
    raftType: header.indexOf("Raft Type"),
    raftType2: header.indexOf("Raft type"),
    ytd: header.indexOf("Y.T.D."),
    value: header.indexOf("Value"),
    minReq: header.indexOf("Min req"),
    stationStock: header.indexOf("Station Stock"),
    orderValue: header.indexOf("Order value"),
    toBeOrdered: header.indexOf("To be ordered"),
    additionalComments: header.indexOf("Additional Comments"),
    navision: header.indexOf("navision"),
    descricao: header.indexOf("descrição"),
    applicableModels: Math.max(
      header.indexOf("LR97"),
      header.indexOf("LR05/07 6-12p"),
      header.indexOf("LR05/07 16-25p"),
      header.indexOf("LR86/97/07"),
      header.indexOf("LR86/97"),
      header.indexOf("LR05"),
    ),
  };

  const rows: ParsedDSBRow[] = [];
  
  for (let i = 15; i < data.length; i++) {
    const row = data[i] as (string | number)[];
    if (!row || row.length === 0) continue;
    
    const partNumber = String(row[columnMap.partNumber] || "").trim();
    if (!partNumber || partNumber === "0") continue;
    
    const product = String(row[columnMap.product] || "").trim();
    if (!product) continue;
    
    const raftType = String(row[columnMap.raftType] || "").trim();
    const raftType2 = String(row[columnMap.raftType2] || "").trim();
    const ytd = parseFloat(String(row[columnMap.ytd] || "0")) || 0;
    const value = parseFloat(String(row[columnMap.value] || "0")) || 0;
    const minReq = parseFloat(String(row[columnMap.minReq] || "0")) || 0;
    const stationStock = parseFloat(String(row[columnMap.stationStock] || "0")) || 0;
    const orderValue = parseFloat(String(row[columnMap.orderValue] || "0")) || 0;
    const toBeOrdered = parseFloat(String(row[columnMap.toBeOrdered] || "0")) || 0;
    const additionalComments = String(row[columnMap.additionalComments] || "").trim();
    const navision = String(row[columnMap.navision] || "").trim();
    const descricao = String(row[columnMap.descricao] || "").trim();
    
    // Build applicable models from the model columns
    const modelColumns = [
      header[columnMap.applicableModels] || "",
      header[columnMap.applicableModels + 1] || "",
      header[columnMap.applicableModels + 2] || "",
    ];
    const applicableModels = modelColumns
      .filter(h => h && h.trim())
      .join(", ");
    
    rows.push({
      partNumber,
      product,
      raftType,
      raftType2,
      ytd,
      value,
      minReq,
      stationStock,
      orderValue,
      toBeOrdered,
      additionalComments,
      navision,
      descricao,
      applicableModels,
    });
  }
  
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    const fileType = formData.get("fileType") as string; // "RFD" or "DSB"

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum ficheiro enviado" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      return NextResponse.json({ error: "Apenas ficheiros Excel (.xlsx, .xls) são suportados" }, { status: 400 });
    }

    if (!fileType || !["RFD", "DSB"].includes(fileType)) {
      return NextResponse.json({ error: "Tipo de ficheiro inválido. Use 'RFD' ou 'DSB'." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    if (fileType === "RFD") {
      const rows = await parseRFDFile(buffer);
      for (const row of rows) {
        try {
          const data = {
            name: row.partDescription,
            descricao: row.descNavi || row.additionalNotes,
            referencia: row.navision,
            codigoFabricante: row.navision, // Using NAVISION as manufacturer code
            modelosAplicaveis: row.product, // Product as applicable model
            stock: row.stationStock,
            minStock: row.minReq,
            unit: "un",
          };

          if (data.referencia) {
            const existing = await prisma.artigo.findFirst({ where: { referencia: data.referencia } });
            if (existing) {
              await prisma.artigo.update({ where: { id: existing.id }, data });
              updated++;
            } else {
              await prisma.artigo.create({ data });
              created++;
            }
          } else {
            const existingByName = await prisma.artigo.findFirst({ where: { name: data.name } });
            if (existingByName) {
              await prisma.artigo.update({ where: { id: existingByName.id }, data });
              updated++;
            } else {
              await prisma.artigo.create({ data });
              created++;
            }
          }
        } catch (e) {
          errors.push(`Erro ao processar "${row.partDescription}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } else if (fileType === "DSB") {
      const rows = await parseDSBFile(buffer);
      for (const row of rows) {
        try {
          const data = {
            name: row.product,
            descricao: row.descricao || row.additionalComments,
            referencia: row.navision,
            codigoFabricante: row.navision,
            modelosAplicaveis: row.applicableModels || row.raftType || row.raftType2,
            stock: row.stationStock,
            minStock: row.minReq,
            unit: "un",
          };

          if (data.referencia) {
            const existing = await prisma.artigo.findFirst({ where: { referencia: data.referencia } });
            if (existing) {
              await prisma.artigo.update({ where: { id: existing.id }, data });
              updated++;
            } else {
              await prisma.artigo.create({ data });
              created++;
            }
          } else {
            const existingByName = await prisma.artigo.findFirst({ where: { name: data.name } });
            if (existingByName) {
              await prisma.artigo.update({ where: { id: existingByName.id }, data });
              updated++;
            } else {
              await prisma.artigo.create({ data });
              created++;
            }
          }
        } catch (e) {
          errors.push(`Erro ao processar "${row.product}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: created + updated + errors.length,
    });
  } catch (error) {
    console.error("[POST /api/stock/importar]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao importar stock" },
      { status: 500 }
    );
  }
}