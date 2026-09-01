import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAccessContext } from "@/lib/access-control";
import { formatValidityDisplay } from "@/lib/date-display";
import { getCanonicalNavioLocationLabel } from "@/lib/navios-page-helpers";

function toCsv(rows: Record<string, unknown>[], headerLabels?: Record<string, string>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const displayHeaders = headers.map((header) => headerLabels?.[header] || header);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const body = rows.map((row) => headers.map((h) => escape(row[h])).join(",")).join("\n");
  return `${displayHeaders.join(",")}\n${body}`;
}

export async function GET(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tipo = (searchParams.get("tipo") || "").toLowerCase();

    let filename = "relatorio.csv";
    let rows: Record<string, unknown>[] = [];
    let headerLabels: Record<string, string> = {};

    if (tipo === "clientes") {
      const clientes = await prisma.cliente.findMany({
        include: { navios: { select: { id: true } } },
        orderBy: { nome: "asc" },
      });

      filename = "clientes.csv";
      headerLabels = {
        id: "ID",
        nome: "Nome",
        numeroCliente: "Nº Cliente",
        nif: "NIF",
        email: "Email",
        telefone: "Telefone",
        telmovel: "Telemóvel",
        ilha: "Ilha",
        totalNavios: "Total de Navios",
      };
      rows = clientes.map((c) => ({
        id: c.id,
        nome: c.nome,
        numeroCliente: c.numeroCliente || "",
        nif: c.nif || "",
        email: c.email || "",
        telefone: c.telefone || "",
        telmovel: c.telmovel || "",
        ilha: (getCanonicalNavioLocationLabel(c.ilha) || c.ilha) || "",
        totalNavios: c.navios.length,
      }));
    } else if (tipo === "navios") {
      const navios = await prisma.navio.findMany({
        include: { cliente: { select: { nome: true } } },
        orderBy: { nome: "asc" },
      });

      filename = "navios.csv";
      headerLabels = {
        id: "ID",
        nome: "Nome",
        matricula: "Matrícula",
        ilha: "Ilha",
        tipoPesca: "Tipo de Pesca",
        portoRegisto: "Porto de Registo",
        mmsi: "MMSI",
        imo: "IMO",
        callSignal: "Sinal de Chamada",
        cliente: "Cliente",
      };
      rows = navios.map((n) => ({
        id: n.id,
        nome: n.nome,
        matricula: n.matricula,
        ilha: (getCanonicalNavioLocationLabel(n.ilha) || n.ilha) || "",
        tipoPesca: n.tipoPesca,
        portoRegisto: n.portoRegisto || "",
        mmsi: n.mmsi || "",
        imo: n.imo || "",
        callSignal: n.callSignal || "",
        cliente: n.cliente?.nome || "",
      }));
    } else if (tipo === "jangadas") {
      const jangadas = await prisma.jangada.findMany({
        include: { certificadoAtivo: true },
        orderBy: { serial: "asc" },
      });

      filename = "jangadas.csv";
      headerLabels = {
        id: "ID",
        serial: "Nº Série",
        brand: "Marca",
        model: "Modelo",
        capacity: "Lotação",
        owner: "Proprietário",
        shipId: "ID Navio",
        shipNameManual: "Navio",
        dataInspecao: "Data Inspeção",
        dataInspecaoIso: "Data Inspeção (ISO)",
        dataProxInspecao: "Próx. Inspeção",
        dataProxInspecaoIso: "Próx. Inspeção (ISO)",
        certificadoAtivo: "Certificado Ativo",
      };
      rows = jangadas.map((j) => ({
        id: j.id,
        serial: j.serial,
        brand: j.brand,
        model: j.model,
        capacity: j.capacity,
        owner: j.owner,
        shipId: j.shipId || "",
        shipNameManual: j.shipNameManual || "",
        dataInspecao: formatValidityDisplay(j.dataInspecao),
        dataInspecaoIso: j.dataInspecao || "",
        dataProxInspecao: formatValidityDisplay(j.dataProxInspecao),
        dataProxInspecaoIso: j.dataProxInspecao || "",
        certificadoAtivo: j.certificadoAtivo?.certificadoNumero || "",
      }));
    } else {
      return NextResponse.json(
        { error: "Tipo inválido. Use: clientes, navios ou jangadas." },
        { status: 400 }
      );
    }

    const csv = `\uFEFF${toCsv(rows, headerLabels)}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
      },
    });
  } catch (error) {
    console.error("Erro ao exportar relatório:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
