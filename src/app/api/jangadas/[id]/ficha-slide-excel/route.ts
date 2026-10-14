import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { getAccessContext } from "@/lib/access-control";

export const dynamic = "force-dynamic";

type SlideItem = { label?: string; inicio?: string; fim?: string; abertura?: string; reset?: string };
type SlideJson = {
  unidade?: string;
  tubes?: SlideItem[];
  arcos?: SlideItem[];
  overpressure?: {
    tubes?: SlideItem[];
    arcos?: SlideItem[];
    superior?: { abertura?: string; reset?: string };
    inferior?: { abertura?: string; reset?: string };
  };
};
type Cyl = {
  serial?: string;
  co2?: string;
  n2?: string;
  tara?: string;
  pesoBruto?: string;
  dataTeste?: string;
  dataProxTeste?: string;
};

function parseJson<T>(v: string | null | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? (p as T) : fallback;
  } catch {
    return fallback;
  }
}

function fmtDate(v?: string | null): string {
  if (!v) return "";
  const iso = v.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  return v;
}

function fmtMonth(v?: string | null): string {
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})$/.exec(v.slice(0, 7));
  if (m) return `${m[2]}/${m[1]}`;
  return v;
}

function drop(a?: string, b?: string): string {
  const n1 = Number(a);
  const n2 = Number(b);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return "";
  return (Math.round((n2 - n1) * 100) / 100).toString();
}

function testMark(v?: string | null): "YES" | "NO" | "" {
  const s = (v || "").trim().toUpperCase();
  if (s === "PASSOU" || s === "OK" || s === "SIM") return "YES";
  if (s === "REPROVOU" || s === "FAIL" || s === "NÃO" || s === "NAO") return "NO";
  return "";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const jangada = await prisma.jangada.findUnique({
      where: { id },
      include: { serviceStation: true },
    });
    if (!jangada) {
      return NextResponse.json({ error: "Jangada não encontrada." }, { status: 404 });
    }

    const navio = jangada.shipId
      ? await prisma.navio.findUnique({ where: { id: jangada.shipId }, include: { cliente: true } })
      : null;

    const camaras = parseJson<SlideJson>(jangada.testeCamarasJson, {});
    const unit = jangada.testeWPUnidadePressao || camaras.unidade || "mbar";
    const valves = camaras.overpressure?.arcos?.length ? camaras.overpressure.arcos : [];
    const wpTubes = camaras.arcos?.length ? camaras.arcos : camaras.tubes || [];
    const labels = (wpTubes.length ? wpTubes : valves).map((t) => t.label || "");
    const cylinders = parseJson<Cyl[]>(jangada.cylindersJson, []);
    const tWP = testMark(jangada.testeWP);

    const certNo = jangada.ultimoCertificadoNumero || jangada.certificadoExternoNumero || "";
    const stationNo = jangada.serviceStation?.codigo || "";
    const shipName = navio?.nome || jangada.shipNameManual || "";
    const owner = navio?.proprietario || navio?.cliente?.nome || jangada.owner || "";
    const typeOfSlide = jangada.model || jangada.launchType || "MES MIS Slide";

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Orey Técnica Açores";
    const ws = workbook.addWorksheet("MES MIS Slide");

    const tubeCols = Math.max(labels.length, 9);
    const lastCol = 1 + tubeCols;
    const colLetter = (n: number) => ws.getColumn(n).letter;
    const endCol = colLetter(Math.max(lastCol, 7));

    ws.columns = [{ width: 30 }].concat(Array.from({ length: tubeCols }, () => ({ width: 11 })));

    const title = ws.addRow([`MES MIS SLIDE — TEST AND SURVEY REPORT`]);
    ws.mergeCells(`A1:${endCol}1`);
    title.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFF" } };
    title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E3A8A" } };
    title.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    title.height = 24;

    const ident: Array<[string, string]> = [
      ["Type of slide", typeOfSlide],
      ["Ship name", shipName],
      ["Capacity", jangada.capacity != null ? String(jangada.capacity) : ""],
      ["Owner", owner],
      ["Serial n°", jangada.serial || ""],
      ["Flag state", navio?.bandeira || ""],
      ["Pack", jangada.packType || ""],
      ["IMO N°", navio?.imo || ""],
      ["Date of Manufacture", fmtDate(jangada.dataFabrico) || jangada.dataFabrico || ""],
      ["Date of inspection", fmtDate(jangada.dataInspecao)],
      ["Reinspection certificate n°", certNo],
      ["Station n°", stationNo],
    ];
    ident.forEach(([label, value]) => {
      const r = ws.addRow([label, value]);
      ws.mergeCells(`${colLetter(2)}${r.number}:${endCol}${r.number}`);
      r.getCell(1).font = { bold: true };
    });

    const sectionRow = (text: string) => {
      const r = ws.addRow([text]);
      ws.mergeCells(`A${r.number}:${endCol}${r.number}`);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DBEAFE" } };
      return r;
    };

    // Section 4 — relief valves
    sectionRow(`4. INFLATION AND CONTROL OF RELIEF VALVES (${unit})`);
    const valveHead = ws.addRow(["Tubes"].concat(labels.length ? labels : Array.from({ length: 9 }, () => "")));
    valveHead.eachCell((c) => { c.font = { bold: true }; });
    ws.addRow(["Pressure at opening"].concat(valves.map((t) => t.abertura || "")));
    ws.addRow(["Pressure at closing"].concat(valves.map((t) => t.reset || "")));
    ws.addRow(["Result"].concat(valves.map(() => "OK")));
    const overSup = camaras.overpressure?.superior;
    const overInf = camaras.overpressure?.inferior;
    if (overSup || overInf) {
      const r = ws.addRow([
        "Aspirator overpressure valves",
        `Upper open ${overSup?.abertura || "—"} / reset ${overSup?.reset || "—"}`,
        `Lower open ${overInf?.abertura || "—"} / reset ${overInf?.reset || "—"}`,
      ]);
      ws.mergeCells(`${colLetter(2)}${r.number}:${endCol}${r.number}`);
      r.getCell(1).font = { bold: true };
    }

    // Section 5 — WP test
    sectionRow(`5. PRESSURE TEST (WP TEST) — tolerance 5% of start pressure (${unit})`);
    const wpHead = ws.addRow(["Tubes"].concat(labels.length ? labels : Array.from({ length: 9 }, () => "")));
    wpHead.eachCell((c) => { c.font = { bold: true }; });
    ws.addRow(["Pressure at beginning"].concat(wpTubes.map((t) => t.inicio || "")));
    ws.addRow(["Pressure at end"].concat(wpTubes.map((t) => t.fim || "")));
    ws.addRow(["Result (drop)"].concat(wpTubes.map((t) => drop(t.inicio, t.fim))));
    ws.addRow(["Valid test"].concat(wpTubes.map(() => tWP)));
    const wpInfo = ws.addRow([
      "Conditions",
      `Time ${jangada.testeWPHoraInicio || "—"}–${jangada.testeWPHoraFim || "—"}`,
      `T1 ${jangada.testeWPTemperaturaInicial || "—"} / T2 ${jangada.testeWPTemperaturaFinal || "—"}`,
      `P1 ${jangada.testeWPPressaoAtmosfericaInicial || "—"} / P2 ${jangada.testeWPPressaoAtmosfericaFinal || "—"}`,
    ]);
    ws.mergeCells(`${colLetter(2)}${wpInfo.number}:${endCol}${wpInfo.number}`);
    wpInfo.getCell(1).font = { bold: true };

    // Section 8 — cylinders
    sectionRow("8. INFORMATION ABOUT THE INFLATION SYSTEM — CYLINDERS");
    if (cylinders.length === 0) {
      ws.addRow(["Cylinder n°", jangada.cylinderSerial || "—"]);
      ws.addRow(["CO² / N²", `${jangada.cylinderCo2 || "—"} / ${jangada.cylinderN2 || "—"} Kg`]);
      ws.addRow(["Next hydro test", fmtMonth(jangada.cylinderDataProxTeste) || jangada.cylinderDataProxTeste || "—"]);
      ws.addRow(["Firing head", `${jangada.cylinderCabecaDisparoRef || "—"} ${jangada.cylinderCabecaDisparoSerial || ""}`.trim()]);
    } else {
      const head = ws.addRow(["Cylinder n°", "CO² weight", "N² weight", "Tare", "Full weight", "Hydro test", "Next test"]);
      head.eachCell((c) => { c.font = { bold: true }; });
      cylinders.forEach((cyl) => {
        ws.addRow([
          cyl.serial || "",
          cyl.co2 || "",
          cyl.n2 || "",
          cyl.tara || "",
          cyl.pesoBruto || "",
          fmtMonth(cyl.dataTeste) || cyl.dataTeste || "",
          fmtMonth(cyl.dataProxTeste) || cyl.dataProxTeste || "",
        ]);
      });
    }

    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.border) {
          cell.border = {
            top: { style: "thin", color: { argb: "E5E7EB" } },
            left: { style: "thin", color: { argb: "E5E7EB" } },
            bottom: { style: "thin", color: { argb: "E5E7EB" } },
            right: { style: "thin", color: { argb: "E5E7EB" } },
          };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const safeSerial = (jangada.serial || String(id)).replace(/[^A-Za-z0-9_-]/g, "");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename=ficha-slide-${safeSerial}.xlsx`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error: unknown) {
    console.error("Erro ao gerar ficha de slide Excel:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar a ficha de slide Excel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
