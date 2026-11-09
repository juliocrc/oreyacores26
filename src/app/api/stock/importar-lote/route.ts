import { NextRequest, NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access-control";
import { canEditStock, stockStationWhere, stockTransaction, StockWriteError, stockWriteStatus } from "@/lib/stock-utils";
import { resolveActiveServiceStationId } from "@/lib/station-selection";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const access = await getAccessContext();
    if (!access) return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
    if (!canEditStock(access)) return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
    const body = await req.json();
    const mode = String(body.mode || "increment");
    if (!["increment", "absolute"].includes(mode)) throw new StockWriteError("Modo invalido.", 400);
    const lines = String(body.text || "").trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [code, raw] = line.split(/[;\t,]/).map(value => value.trim().replace(/^["']|["']$/g, ""));
      const quantidade = Number(raw);
      if (!code || !raw || !Number.isSafeInteger(quantidade) || quantidade < 0) throw new StockWriteError("Linha/quantidade invalida.", 400);
      return { code, quantidade };
    });
    if (!lines.length) throw new StockWriteError("Nenhum dado fornecido.", 400);
    const scope = stockStationWhere(access, resolveActiveServiceStationId(req, access));
    const results = await stockTransaction(async tx => {
      const results = [];
      const seen = new Set<number>();
      for (const { code, quantidade } of lines) {
        const matches = await tx.stock.findMany({ where: { AND: [scope, { estadoArtigo: { not: "INATIVO" } }, { OR: [{ codigoBarras: code }, { referencia: code }] }] } });
        if (matches.length !== 1) throw new StockWriteError(`Codigo ${code}: ${matches.length ? "ambiguo, use codigo do lote" : "nao encontrado"}.`);
        const row = matches[0];
        if (seen.has(row.id)) throw new StockWriteError(`Lote repetido no ficheiro: ${code}.`);
        seen.add(row.id);
        const after = mode === "absolute" ? quantidade : row.quantidade + quantidade;
        if (after < row.quantidadeReservada) throw new StockWriteError("Quantidade inferior a reserva.");
        await tx.stock.update({ where: { id: row.id }, data: { quantidade: after } });
        await tx.movimentacaoStock.create({ data: {
          stockId: row.id, tipo: "ajuste", quantidade: Math.abs(after - row.quantidade),
          quantidadeAntes: row.quantidade, quantidadeDepois: after, motivo: `Importacao de leitor (${mode})`,
        } });
        results.push({ referenciaOrBarcode: code, quantidade, stockId: row.id, descricao: row.descricao, status: "Atualizado com sucesso" });
      }
      return results;
    });
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao importar." }, { status: stockWriteStatus(error) || 500 });
  }
}
